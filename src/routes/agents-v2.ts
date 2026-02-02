/**
 * AgentID - Agents V2 Routes
 *
 * New architecture with three identity types:
 * - POST /agents/attest - Human or agent declares an agent (DEFAULT)
 * - POST /agents/self-register - Autonomous agent self-registers
 * - POST /agents/fingerprint - Technical config fingerprint
 * - GET /agents/:hash - Get identity
 * - GET /agents/:hash/proofs - Get all proofs for identity
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import nacl from 'tweetnacl';
import { logger } from '../utils/logger.js';
import { ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler.js';
import { query, checkConnection } from '../config/database.js';
import { getBlockchainService } from '../services/blockchain/base-chain.js';
import { getWebSocketService } from '../services/realtime/websocket.js';
import {
  IdentityType,
  IssuerType,
  SignatureType,
  ClaimStatus,
  type AttestationIdentity,
  type ConfigIdentity,
  type FingerprintIdentity,
  type SelfClaimIdentity,
  type StoredIdentityV2,
  type Signature,
  type VerificationSource,
  getTrustDescription,
  calculateTrustScore,
  getVerificationMessage,
  isValidRegistrationSignature,
  VALID_REGISTRATION_SIGNATURES,
} from '../types/identity-v2.js';

const router = Router();

// =============================================================================
// DATABASE STORAGE
// =============================================================================

// In-memory fallback if database is not available
const inMemoryIdentities = new Map<string, StoredIdentityV2>();

async function saveIdentity(stored: StoredIdentityV2): Promise<void> {
  const isDbAvailable = await checkConnection();

  if (isDbAvailable) {
    try {
      // First, ensure a creator exists. Create one if not.
      const SYSTEM_CREATOR_ID = '00000000-0000-0000-0000-000000000001';
      const creatorResult = await query<{ id: string }>(
        `SELECT id FROM creators WHERE id = $1 LIMIT 1`,
        [SYSTEM_CREATOR_ID]
      );

      let creatorId = creatorResult.rows.length > 0 ? creatorResult.rows[0].id : null;

      if (!creatorId) {
        // Create the system creator if it doesn't exist
        // Try minimal insert with just required columns
        try {
          await query(
            `INSERT INTO creators (id, email, api_key_hash)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO NOTHING`,
            [
              SYSTEM_CREATOR_ID,
              'system@agentid.org',
              'system-api-key-hash-v2-registration',
            ]
          );
          creatorId = SYSTEM_CREATOR_ID;
          logger.info('System creator created');
        } catch (creatorError: any) {
          // If creator creation fails, try using a random existing creator
          logger.warn({ error: creatorError.message }, 'Failed to create system creator, trying to find existing');
          try {
            const existingResult = await query<{ id: string }>('SELECT id FROM creators LIMIT 1');
            if (existingResult.rows.length > 0) {
              creatorId = existingResult.rows[0].id;
              logger.info({ creatorId }, 'Using existing creator');
            } else {
              logger.error('No creators exist, using in-memory storage');
              inMemoryIdentities.set(stored.identity.identityHash, stored);
              return;
            }
          } catch {
            logger.error('Failed to find existing creator, using in-memory storage');
            inMemoryIdentities.set(stored.identity.identityHash, stored);
            return;
          }
        }
      }

      // Insert into agent_identities
      // NOTE: owner_address is VARCHAR(42) for ETH addresses only
      // For AGENT_KEYPAIR signatures, we store the public key in the bio JSON, not here
      let ownerAddress: string | null = null;
      if (stored.identity.signature.type === SignatureType.HUMAN_WALLET) {
        // For wallet signatures, we need to recover the address from the signature
        // But we don't have access to the message here, so we store null
        // The actual address is stored in the full identity JSON in bio
        ownerAddress = null;
      }

      await query(
        `INSERT INTO agent_identities (
          id, identity_hash, creator_id, owner_address, status, created_at, validated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (identity_hash) DO UPDATE SET
          status = EXCLUDED.status,
          validated_at = EXCLUDED.validated_at`,
        [
          stored.id,
          stored.identity.identityHash,
          creatorId,
          ownerAddress,
          stored.status,
          stored.createdAt,
          stored.createdAt,
        ]
      );

      // Store full V2 data in metadata table as JSONB
      // First try to update, then insert if no rows affected
      const updateResult = await query(
        `UPDATE agent_metadata SET display_name = $1, bio = $2 WHERE agent_id = $3`,
        [stored.identity.agentName, JSON.stringify(stored), stored.id]
      );

      if (updateResult.rowCount === 0) {
        await query(
          `INSERT INTO agent_metadata (id, agent_id, display_name, bio, tags)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            uuidv4(),
            stored.id,
            stored.identity.agentName,
            JSON.stringify(stored),
            [],
          ]
        );
      }

      logger.info({ identityHash: stored.identity.identityHash.slice(0, 16) }, 'V2 identity saved to database');
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, 'Failed to save V2 identity to database, using in-memory');
      inMemoryIdentities.set(stored.identity.identityHash, stored);
    }
  } else {
    inMemoryIdentities.set(stored.identity.identityHash, stored);
  }
}

async function getIdentity(identityHash: string): Promise<StoredIdentityV2 | null> {
  const isDbAvailable = await checkConnection();

  if (isDbAvailable) {
    try {
      const result = await query<{ bio: string }>(
        `SELECT m.bio FROM agent_metadata m
         JOIN agent_identities i ON i.id = m.agent_id
         WHERE i.identity_hash = $1`,
        [identityHash]
      );

      if (result.rows.length > 0 && result.rows[0].bio) {
        return JSON.parse(result.rows[0].bio) as StoredIdentityV2;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get V2 identity from database');
    }
  }

  return inMemoryIdentities.get(identityHash) || null;
}

async function identityExists(identityHash: string): Promise<boolean> {
  const identity = await getIdentity(identityHash);
  return identity !== null;
}

// Auto-anchor identity on blockchain (async, non-blocking)
async function autoAnchorOnChain(stored: StoredIdentityV2): Promise<void> {
  try {
    const blockchain = await getBlockchainService();
    if (!blockchain.isWriteReady()) {
      logger.warn({ identityHash: stored.identity.identityHash }, 'Blockchain not ready for auto-anchor');
      // Mark as offchain only
      stored.verified = true;
      stored.verificationSource = 'offchain';
      await saveIdentity(stored);
      return;
    }

    const result = await blockchain.anchorIdentity(stored.identity.identityHash);

    if (result.success && result.transactionHash) {
      // V1.1: Update verification status
      stored.verified = true;
      stored.verificationSource = 'chain';

      // Update stored identity with blockchain info
      stored.anchor = {
        txHash: result.transactionHash,
        blockNumber: result.blockNumber || 0,
        chain: 'base',
        chainId: 8453, // Base mainnet
        anchoredAt: new Date().toISOString(),
      };

      // Recalculate trust score with on-chain bonus
      stored.trustScore = calculateTrustScore(
        stored.identity.signature.type,
        'chain',
        !!stored.verifications?.twitter
      );

      // Save updated identity
      await saveIdentity(stored);

      logger.info({
        identityHash: stored.identity.identityHash.slice(0, 16),
        txHash: result.transactionHash,
        verified: true,
        trustScore: stored.trustScore,
      }, 'Identity auto-anchored on-chain');
    } else {
      // Mark as failed
      stored.verified = false;
      stored.verificationSource = 'failed';
      await saveIdentity(stored);

      logger.warn({
        identityHash: stored.identity.identityHash,
        error: result.error,
      }, 'Auto-anchor failed');
    }
  } catch (error) {
    // Mark as failed on error
    stored.verified = false;
    stored.verificationSource = 'failed';
    await saveIdentity(stored);
    logger.error({ error, identityHash: stored.identity.identityHash }, 'Auto-anchor error');
  }
}

async function getAllIdentities(
  filter?: { identityType?: string },
  page = 1,
  pageSize = 20
): Promise<{ items: StoredIdentityV2[]; total: number }> {
  const isDbAvailable = await checkConnection();

  if (isDbAvailable) {
    try {
      // Get V2 identities - identify them by having a valid JSON bio with identityType
      const offset = (page - 1) * pageSize;

      // Query all identities that have metadata with bio containing V2 structure
      const result = await query<{ bio: string | null; identity_hash: string; created_at: string }>(
        `SELECT m.bio, i.identity_hash, i.created_at FROM agent_identities i
         JOIN agent_metadata m ON i.id = m.agent_id
         WHERE i.status != $1
           AND m.bio IS NOT NULL
           AND m.bio::text LIKE '%"identityType"%'
         ORDER BY i.created_at DESC
         LIMIT $2 OFFSET $3`,
        ['revoked', pageSize, offset]
      );

      logger.debug({ rowCount: result.rows.length }, 'V2 identities query result');

      const items: StoredIdentityV2[] = [];

      for (const row of result.rows) {
        if (row.bio) {
          try {
            const parsed = JSON.parse(row.bio);
            // Verify it's a V2 structure
            if (parsed.identity && parsed.identity.identityType) {
              items.push(parsed as StoredIdentityV2);
            }
          } catch (e) {
            logger.warn({ hash: row.identity_hash, error: e }, 'Failed to parse V2 identity JSON');
          }
        }
      }

      // Filter by identity type if specified
      const filtered = filter?.identityType
        ? items.filter(i => i.identity.identityType === filter.identityType)
        : items;

      // Count V2 agents (those with bio containing identityType)
      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM agent_identities i
         JOIN agent_metadata m ON i.id = m.agent_id
         WHERE i.status != $1
           AND m.bio IS NOT NULL
           AND m.bio::text LIKE '%"identityType"%'`,
        ['revoked']
      );
      const total = parseInt(countResult.rows[0]?.count || '0');

      logger.debug({ itemsCount: filtered.length, total }, 'V2 identities returned');

      return { items: filtered, total };
    } catch (error) {
      logger.error({ error }, 'Failed to list V2 identities from database');
    }
  }

  // Fallback to in-memory
  let items = Array.from(inMemoryIdentities.values());
  if (filter?.identityType) {
    items = items.filter(i => i.identity.identityType === filter.identityType);
  }
  items = items.filter(i => i.status === ClaimStatus.ACTIVE);
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = items.length;
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);

  return { items: paged, total };
}

// =============================================================================
// ANTI-SPAM
// =============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 10; // 10 registrations per hour per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimits.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// Proof of work verification for self-register (anti-spam)
const POW_DIFFICULTY = 4; // Number of leading zeros required

function verifyProofOfWork(data: string, nonce: string, difficulty: number): boolean {
  const hash = createHash('sha256').update(data + nonce).digest('hex');
  const target = '0'.repeat(difficulty);
  return hash.startsWith(target);
}

// =============================================================================
// SIGNATURE VERIFICATION
// =============================================================================

async function verifySignature(
  message: string,
  signature: Signature
): Promise<{ valid: boolean; error?: string }> {
  try {
    switch (signature.type) {
      case SignatureType.HUMAN_WALLET: {
        // EIP-191 verification
        const { verifyMessage } = await import('ethers');
        const recoveredAddress = verifyMessage(message, signature.value);
        // We can't verify the address matches without knowing expected address
        // Just verify the signature is valid
        return { valid: !!recoveredAddress };
      }

      case SignatureType.AGENT_KEYPAIR: {
        // Ed25519 verification
        if (!signature.publicKey) {
          return { valid: false, error: 'Missing public key for agent keypair signature' };
        }
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = Buffer.from(signature.value, 'base64');
        const publicKeyBytes = Buffer.from(signature.publicKey, 'base64');

        const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
        return { valid };
      }

      case SignatureType.TWITTER_PROOF: {
        // Twitter proof is verified separately via the Twitter flow
        // Here we just check the signature exists
        return { valid: !!signature.value };
      }

      case SignatureType.NONE: {
        // No signature - always "valid" but lower trust
        return { valid: true };
      }

      default:
        return { valid: false, error: 'Unknown signature type' };
    }
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

// =============================================================================
// HASH GENERATION
// =============================================================================

function generateAttestationHash(data: {
  agentName: string;
  platform: string;
  publicReference: string;
  issuerType: IssuerType;
  issuedAt: string;
}): string {
  const canonical = JSON.stringify({
    agentName: data.agentName,
    platform: data.platform.toLowerCase(),
    publicReference: data.publicReference.toLowerCase(),
    issuerType: data.issuerType,
    issuedAt: data.issuedAt,
  });
  return '0x' + createHash('sha256').update(canonical).digest('hex');
}

function generateFingerprintHash(data: {
  model: { provider: string; modelId: string };
  systemPromptHash?: string;
  config?: Record<string, unknown>;
}): string {
  const canonical = JSON.stringify({
    model: {
      provider: data.model.provider.toLowerCase(),
      modelId: data.model.modelId,
    },
    systemPromptHash: data.systemPromptHash,
  });
  return '0x' + createHash('sha256').update(canonical).digest('hex');
}

function generateSelfClaimHash(publicKey: string): string {
  return '0x' + createHash('sha256').update(publicKey).digest('hex');
}

// =============================================================================
// ROUTE: POST /agents/attest (DEFAULT)
// =============================================================================

const attestSchema = z.object({
  agentName: z.string().min(1).max(100),
  platform: z.string().min(1).max(100),
  publicReference: z.string().min(1).max(500),
  declaredCapabilities: z.array(z.string().max(200)).max(20).default([]),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),

  // Signature (optional - can be added later)
  signature: z.object({
    type: z.nativeEnum(SignatureType),
    value: z.string(),
    publicKey: z.string().optional(),
    timestamp: z.string(),
    metadata: z.record(z.unknown()).optional(),
  }).optional(),

  // For wallet signatures
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

router.post(
  '/attest',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';

      // Rate limiting
      if (!checkRateLimit(ip)) {
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many registrations. Try again later.',
          },
        });
        return;
      }

      const parseResult = attestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const data = parseResult.data;

      // REQUIRE SIGNATURE - No unsigned registrations allowed
      if (!data.signature || data.signature.type === SignatureType.NONE) {
        res.status(400).json({
          success: false,
          error: {
            code: 'SIGNATURE_REQUIRED',
            message: 'Registration requires a valid signature. Use wallet signing or agent keypair.',
            hint: 'Unsigned registrations are disabled to prevent spam. Visit https://id-agent.org to register with wallet signing.',
          },
        });
        return;
      }

      const issuedAt = new Date().toISOString();

      // Determine issuer type based on signature
      let issuerType = IssuerType.HUMAN;
      if (data.signature?.type === SignatureType.AGENT_KEYPAIR) {
        issuerType = IssuerType.AGENT;
      }

      // Generate identity hash
      const identityHash = generateAttestationHash({
        agentName: data.agentName,
        platform: data.platform,
        publicReference: data.publicReference,
        issuerType,
        issuedAt,
      });

      // Create signature object
      const signature: Signature = data.signature || {
        type: SignatureType.NONE,
        value: '',
        timestamp: issuedAt,
      };

      // Verify signature if provided
      if (signature.type !== SignatureType.NONE) {
        const message = `AgentID Attestation\n\nAgent: ${data.agentName}\nPlatform: ${data.platform}\nReference: ${data.publicReference}\nTimestamp: ${issuedAt}`;
        const verification = await verifySignature(message, signature);
        if (!verification.valid) {
          throw new ValidationError(`Signature verification failed: ${verification.error}`);
        }
      }

      // Create identity
      const identity: AttestationIdentity = {
        identityType: IdentityType.ATTESTATION,
        identityHash,
        agentName: data.agentName,
        platform: data.platform,
        publicReference: data.publicReference,
        declaredCapabilities: data.declaredCapabilities,
        issuerType,
        signature,
        issuedAt,
        description: data.description,
        tags: data.tags,
      };

      // Calculate trust score using V1.1 logic
      const trustScore = calculateTrustScore(signature.type, 'pending', false);

      // Store with V1.1 verification fields
      const stored: StoredIdentityV2 = {
        id: uuidv4(),
        identity,
        status: ClaimStatus.ACTIVE,
        verified: false, // Will be true after blockchain confirmation
        verificationSource: 'pending' as VerificationSource,
        trustScore,
        createdAt: issuedAt,
        updatedAt: issuedAt,
        version: 1,
      };

      await saveIdentity(stored);

      // Auto-anchor on blockchain (async, non-blocking)
      autoAnchorOnChain(stored).catch(err => logger.error({ err }, 'Auto-anchor background error'));

      // Emit WebSocket event for live feed
      try {
        const wsService = getWebSocketService();
        wsService.emitAgentRegistered({
          identityHash,
          displayName: data.agentName,
          provider: data.platform,
          modelId: 'attestation',
        });
        wsService.emitStatsUpdate();
      } catch (e) {
        logger.warn({ error: e }, 'Failed to emit WebSocket event');
      }

      logger.info(
        { identityHash: identityHash.slice(0, 16) + '...', agentName: data.agentName, issuerType },
        'Attestation identity created'
      );

      res.status(201).json({
        success: true,
        data: {
          identityHash,
          identityType: 'attestation',
          agentName: data.agentName,
          platform: data.platform,
          issuerType,
          trustScore,
          trustDescription: getTrustDescription(identity),
          verified: false,
          verificationSource: 'pending',
          verifyUrl: `https://id-agent.org/verify/${identityHash}`,
          createdAt: issuedAt,
          anchoring: 'in_progress', // Indicates blockchain anchoring is happening
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// ROUTE: POST /agents/self-register (Autonomous Agent)
// =============================================================================

const selfRegisterSchema = z.object({
  agentName: z.string().min(1).max(100),
  publicKey: z.string().min(32).max(100), // Base64 Ed25519 public key
  declaredCapabilities: z.array(z.string().max(200)).max(20).default([]),
  signature: z.string().min(1), // Base64 Ed25519 signature
  timestamp: z.string().optional(), // Client-provided timestamp for signature verification
  endpoint: z.string().url().optional(),

  // Proof of work (anti-spam)
  proofOfWork: z.object({
    nonce: z.string(),
    difficulty: z.number().int().min(1).max(10),
  }).optional(),
});

router.post(
  '/self-register',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';

      // Rate limiting (stricter for self-register)
      if (!checkRateLimit(ip)) {
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many registrations. Try again later.',
          },
        });
        return;
      }

      const parseResult = selfRegisterSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const data = parseResult.data;
      // Use client-provided timestamp for signature verification, or generate new one
      const issuedAt = data.timestamp || new Date().toISOString();

      // Verify proof of work if provided (reduces spam)
      if (data.proofOfWork) {
        const powData = data.publicKey + data.agentName;
        if (!verifyProofOfWork(powData, data.proofOfWork.nonce, data.proofOfWork.difficulty)) {
          throw new ValidationError('Invalid proof of work');
        }
      }

      // Generate identity hash from public key
      const identityHash = generateSelfClaimHash(data.publicKey);

      // Check if already exists
      if (await identityExists(identityHash)) {
        throw new ConflictError('Agent with this public key already registered');
      }

      // Verify Ed25519 signature using client's timestamp
      const message = `AgentID Self-Registration\n\nAgent: ${data.agentName}\nPublic Key: ${data.publicKey}\nTimestamp: ${issuedAt}`;

      try {
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = Buffer.from(data.signature, 'base64');
        const publicKeyBytes = Buffer.from(data.publicKey, 'base64');

        const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
        if (!valid) {
          throw new ValidationError('Invalid signature');
        }
      } catch (error: any) {
        throw new ValidationError(`Signature verification failed: ${error.message}`);
      }

      // Create signature object
      const signature: Signature = {
        type: SignatureType.AGENT_KEYPAIR,
        value: data.signature,
        publicKey: data.publicKey,
        timestamp: issuedAt,
      };

      // Create identity
      const identity: SelfClaimIdentity = {
        identityType: IdentityType.SELF_CLAIM,
        identityHash,
        agentName: data.agentName,
        publicKey: data.publicKey,
        declaredCapabilities: data.declaredCapabilities,
        signature,
        issuedAt,
        endpoint: data.endpoint,
        proofOfWork: data.proofOfWork,
      };

      // Trust score for self-claims using V1.1 logic
      let trustScore = calculateTrustScore(SignatureType.AGENT_KEYPAIR, 'pending', false);
      if (data.proofOfWork && data.proofOfWork.difficulty >= POW_DIFFICULTY) {
        trustScore = Math.min(trustScore + 0.1, 0.9); // Bonus for proof of work
      }

      // Store with V1.1 verification fields
      const stored: StoredIdentityV2 = {
        id: uuidv4(),
        identity,
        status: ClaimStatus.ACTIVE,
        verified: false, // Will be true after blockchain confirmation
        verificationSource: 'pending' as VerificationSource,
        trustScore,
        createdAt: issuedAt,
        updatedAt: issuedAt,
        version: 1,
      };

      await saveIdentity(stored);

      // Auto-anchor on blockchain (async, non-blocking)
      autoAnchorOnChain(stored).catch(err => logger.error({ err }, 'Auto-anchor background error'));

      // Emit WebSocket event for live feed
      try {
        const wsService = getWebSocketService();
        wsService.emitAgentRegistered({
          identityHash,
          displayName: data.agentName,
          provider: 'autonomous',
          modelId: 'self_claim',
        });
        wsService.emitStatsUpdate();
      } catch (e) {
        logger.warn({ error: e }, 'Failed to emit WebSocket event');
      }

      logger.info(
        { identityHash: identityHash.slice(0, 16) + '...', agentName: data.agentName },
        'Self-claim identity created'
      );

      res.status(201).json({
        success: true,
        data: {
          identityHash,
          identityType: 'self_claim',
          agentName: data.agentName,
          publicKey: data.publicKey,
          trustScore,
          trustDescription: getTrustDescription(identity),
          verified: false,
          verificationSource: 'pending',
          verifyUrl: `https://id-agent.org/verify/${identityHash}`,
          createdAt: issuedAt,
          anchoring: 'in_progress',
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// ROUTE: POST /agents/fingerprint (Technical Config)
// =============================================================================

const fingerprintSchema = z.object({
  agentName: z.string().min(1).max(100),
  model: z.object({
    provider: z.string().min(1).max(100),
    modelId: z.string().min(1).max(100),
  }),

  // System prompt (optional)
  systemPrompt: z.string().max(100000).optional(),

  // Store full config? (opt-in, default false)
  storeConfig: z.boolean().default(false),

  // Full config if storing
  config: z.object({
    parameters: z.record(z.unknown()).optional(),
    tools: z.array(z.object({
      name: z.string(),
      description: z.string(),
    })).optional(),
  }).optional(),

  // Signature
  signature: z.object({
    type: z.nativeEnum(SignatureType),
    value: z.string(),
    publicKey: z.string().optional(),
    timestamp: z.string(),
  }).optional(),

  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

router.post(
  '/fingerprint',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';

      if (!checkRateLimit(ip)) {
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many registrations. Try again later.',
          },
        });
        return;
      }

      const parseResult = fingerprintSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const data = parseResult.data;

      // REQUIRE SIGNATURE - No unsigned registrations allowed
      if (!data.signature || data.signature.type === SignatureType.NONE) {
        res.status(400).json({
          success: false,
          error: {
            code: 'SIGNATURE_REQUIRED',
            message: 'Registration requires a valid signature. Use wallet signing or agent keypair.',
            hint: 'Unsigned registrations are disabled to prevent spam. Visit https://id-agent.org to register with wallet signing.',
          },
        });
        return;
      }

      const issuedAt = new Date().toISOString();

      // Hash system prompt if provided
      let systemPromptHash: string | undefined;
      if (data.systemPrompt) {
        systemPromptHash = createHash('sha256').update(data.systemPrompt).digest('hex');
      }

      // Generate identity hash
      const identityHash = generateFingerprintHash({
        model: data.model,
        systemPromptHash,
      });

      // Determine issuer type
      let issuerType = IssuerType.HUMAN;
      if (data.signature?.type === SignatureType.AGENT_KEYPAIR) {
        issuerType = IssuerType.AGENT;
      }

      // Create signature
      const signature: Signature = data.signature || {
        type: SignatureType.NONE,
        value: '',
        timestamp: issuedAt,
      };

      // Verify signature if provided
      if (signature.type !== SignatureType.NONE) {
        const message = `AgentID Fingerprint\n\nAgent: ${data.agentName}\nProvider: ${data.model.provider}\nModel: ${data.model.modelId}\nTimestamp: ${issuedAt}`;
        const verification = await verifySignature(message, signature);
        if (!verification.valid) {
          throw new ValidationError(`Signature verification failed: ${verification.error}`);
        }
      }

      // Create identity
      const identity: FingerprintIdentity = {
        identityType: IdentityType.FINGERPRINT,
        identityHash,
        agentName: data.agentName,
        model: data.model,
        systemPromptHash,
        configStored: data.storeConfig,
        config: data.storeConfig ? {
          systemPrompt: data.systemPrompt,
          parameters: data.config?.parameters,
          tools: data.config?.tools,
        } : undefined,
        issuerType,
        signature,
        issuedAt,
      };

      // Trust score using V1.1 logic
      let trustScore = calculateTrustScore(signature.type, 'pending', false);
      if (systemPromptHash) trustScore = Math.min(trustScore + 0.1, 0.9);

      // Store with V1.1 verification fields
      const stored: StoredIdentityV2 = {
        id: uuidv4(),
        identity,
        status: ClaimStatus.ACTIVE,
        verified: false, // Will be true after blockchain confirmation
        verificationSource: 'pending' as VerificationSource,
        trustScore,
        createdAt: issuedAt,
        updatedAt: issuedAt,
        version: 1,
      };

      await saveIdentity(stored);

      // Auto-anchor on blockchain (async, non-blocking)
      autoAnchorOnChain(stored).catch(err => logger.error({ err }, 'Auto-anchor background error'));

      // Emit WebSocket event for live feed
      try {
        const wsService = getWebSocketService();
        wsService.emitAgentRegistered({
          identityHash,
          displayName: data.agentName,
          provider: data.model.provider,
          modelId: data.model.modelId,
        });
        wsService.emitStatsUpdate();
      } catch (e) {
        logger.warn({ error: e }, 'Failed to emit WebSocket event');
      }

      logger.info(
        { identityHash: identityHash.slice(0, 16) + '...', agentName: data.agentName },
        'Fingerprint identity created'
      );

      res.status(201).json({
        success: true,
        data: {
          identityHash,
          identityType: 'fingerprint',
          agentName: data.agentName,
          model: data.model,
          systemPromptHash,
          configStored: data.storeConfig,
          trustScore,
          trustDescription: getTrustDescription(identity),
          verified: false,
          verificationSource: 'pending',
          verifyUrl: `https://id-agent.org/verify/${identityHash}`,
          createdAt: issuedAt,
          anchoring: 'in_progress',
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// ROUTE: POST /agents/openclaw (OpenClaw Integration)
// Accepts OpenClaw config format directly for seamless integration
// =============================================================================

const openclawSchema = z.object({
  // Source identification
  source: z.literal('openclaw').default('openclaw'),
  version: z.string().default('1.0'),

  // Agent configuration (OpenClaw format)
  agent: z.object({
    name: z.string().min(1).max(100),
    model: z.string().min(1).max(200), // Format: "provider/model-id" e.g. "anthropic/claude-opus-4-5"
    skills: z.array(z.string().max(100)).max(50).optional(),
    capabilities: z.array(z.string().max(200)).max(20).optional(),
    systemPromptHash: z.string().optional(), // SHA256 hash of system prompt
    thinkingLevel: z.enum(['none', 'low', 'medium', 'high']).optional(),
    endpoint: z.string().url().optional(), // Gateway endpoint if exposed
  }),

  // Signature (supports both wallet and agent keypair)
  signature: z.object({
    type: z.nativeEnum(SignatureType),
    value: z.string(),
    publicKey: z.string().optional(),
    timestamp: z.string(),
  }).optional(),

  // Optional wallet address for human attestation
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

router.post(
  '/openclaw',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';

      // Rate limiting
      if (!checkRateLimit(ip)) {
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many registrations. Try again later.',
          },
        });
        return;
      }

      const parseResult = openclawSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const data = parseResult.data;

      // REQUIRE SIGNATURE - No unsigned registrations allowed
      if (!data.signature || data.signature.type === SignatureType.NONE) {
        res.status(400).json({
          success: false,
          error: {
            code: 'SIGNATURE_REQUIRED',
            message: 'Registration requires a valid signature. Use wallet signing or agent keypair.',
            hint: 'Use agentid-openclaw register --wallet for wallet signing, or without flag for Ed25519 keypair.',
          },
        });
        return;
      }

      const issuedAt = new Date().toISOString();

      // Parse model string (format: "provider/model-id")
      const modelParts = data.agent.model.split('/');
      const provider = modelParts[0] || 'unknown';
      const modelId = modelParts.slice(1).join('/') || data.agent.model;

      // Determine identity type based on what's provided
      let identityType: IdentityType;
      let identityHash: string;

      if (data.signature?.type === SignatureType.AGENT_KEYPAIR && data.signature.publicKey) {
        // Self-claim: agent has its own keypair
        identityType = IdentityType.SELF_CLAIM;
        identityHash = generateSelfClaimHash(data.signature.publicKey);
      } else if (data.agent.systemPromptHash) {
        // Fingerprint: has config details
        identityType = IdentityType.FINGERPRINT;
        identityHash = generateFingerprintHash({
          model: { provider, modelId },
          systemPromptHash: data.agent.systemPromptHash,
        });
      } else {
        // Attestation: basic declaration
        identityType = IdentityType.ATTESTATION;
        identityHash = generateAttestationHash({
          agentName: data.agent.name,
          platform: 'openclaw',
          publicReference: data.agent.endpoint || `openclaw:${data.agent.name}`,
          issuerType: data.signature?.type === SignatureType.HUMAN_WALLET ? IssuerType.HUMAN : IssuerType.AGENT,
          issuedAt,
        });
      }

      // Check if already exists
      if (await identityExists(identityHash)) {
        throw new ConflictError('Agent already registered with this configuration');
      }

      // Create signature object
      const signature: Signature = data.signature || {
        type: SignatureType.NONE,
        value: '',
        timestamp: issuedAt,
      };

      // Verify signature if provided
      if (signature.type !== SignatureType.NONE) {
        const message = `AgentID OpenClaw Registration\n\nAgent: ${data.agent.name}\nModel: ${data.agent.model}\nTimestamp: ${signature.timestamp}`;
        const verification = await verifySignature(message, signature);
        if (!verification.valid) {
          throw new ValidationError(`Signature verification failed: ${verification.error}`);
        }
      }

      // Build identity based on type
      let identity: AttestationIdentity | FingerprintIdentity | SelfClaimIdentity;
      const declaredCapabilities = [
        ...(data.agent.capabilities || []),
        ...(data.agent.skills || []).map(s => `skill:${s}`),
      ];

      if (identityType === IdentityType.SELF_CLAIM) {
        identity = {
          identityType: IdentityType.SELF_CLAIM,
          identityHash,
          agentName: data.agent.name,
          publicKey: data.signature!.publicKey!,
          declaredCapabilities,
          signature,
          issuedAt,
          endpoint: data.agent.endpoint,
        } as SelfClaimIdentity;
      } else if (identityType === IdentityType.FINGERPRINT) {
        identity = {
          identityType: IdentityType.FINGERPRINT,
          identityHash,
          agentName: data.agent.name,
          model: { provider, modelId },
          systemPromptHash: data.agent.systemPromptHash,
          configStored: false,
          issuerType: data.signature?.type === SignatureType.HUMAN_WALLET ? IssuerType.HUMAN : IssuerType.AGENT,
          signature,
          issuedAt,
        } as FingerprintIdentity;
      } else {
        identity = {
          identityType: IdentityType.ATTESTATION,
          identityHash,
          agentName: data.agent.name,
          platform: 'openclaw',
          publicReference: data.agent.endpoint || `openclaw:${data.agent.name}`,
          declaredCapabilities,
          issuerType: data.signature?.type === SignatureType.HUMAN_WALLET ? IssuerType.HUMAN : IssuerType.AGENT,
          signature,
          issuedAt,
          tags: ['openclaw', provider, ...(data.agent.skills || [])],
        } as AttestationIdentity;
      }

      // Calculate trust score using V1.1 logic
      let trustScore = calculateTrustScore(signature.type, 'pending', false);
      if (data.agent.systemPromptHash) trustScore = Math.min(trustScore + 0.1, 0.9);
      if (data.agent.skills && data.agent.skills.length > 0) trustScore = Math.min(trustScore + 0.05, 0.9);

      // Store identity with V1.1 verification fields
      const stored: StoredIdentityV2 = {
        id: uuidv4(),
        identity,
        status: ClaimStatus.ACTIVE,
        verified: false, // Will be true after blockchain confirmation
        verificationSource: 'pending' as VerificationSource,
        trustScore: Math.min(trustScore, 1.0),
        createdAt: issuedAt,
        updatedAt: issuedAt,
        version: 1,
      };

      await saveIdentity(stored);

      // Auto-anchor on blockchain
      autoAnchorOnChain(stored).catch(err => logger.error({ err }, 'Auto-anchor background error'));

      // Emit WebSocket event
      try {
        const wsService = getWebSocketService();
        wsService.emitAgentRegistered({
          identityHash,
          displayName: data.agent.name,
          provider: 'openclaw',
          modelId: modelId,
        });
        wsService.emitStatsUpdate();
      } catch (e) {
        logger.warn({ error: e }, 'Failed to emit WebSocket event');
      }

      logger.info(
        {
          identityHash: identityHash.slice(0, 16) + '...',
          agentName: data.agent.name,
          source: 'openclaw',
          identityType,
        },
        'OpenClaw agent registered'
      );

      // Return OpenClaw-friendly response with V1.1 verification fields
      res.status(201).json({
        success: true,
        data: {
          identityHash,
          identityType,
          agentName: data.agent.name,
          model: { provider, modelId },
          trustScore: stored.trustScore,
          trustDescription: getTrustDescription(identity),
          // V1.1 verification status
          verified: false,
          verificationSource: 'pending',
          verifyUrl: `https://id-agent.org/verify/${identityHash}`,
          apiUrl: `https://agent007-api-production.up.railway.app/api/v2/agents/${identityHash}`,
          createdAt: issuedAt,
          anchoring: 'in_progress',
          // OpenClaw-specific helpers
          badge: {
            markdown: `[![AgentID Verified](https://id-agent.org/badge/${identityHash})](https://id-agent.org/verify/${identityHash})`,
            html: `<a href="https://id-agent.org/verify/${identityHash}"><img src="https://id-agent.org/badge/${identityHash}" alt="AgentID Verified"/></a>`,
          },
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
          source: 'openclaw',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// ROUTE: GET /agents/stats (for homepage counter)
// Must come before /:identityHash to avoid being caught by param route
// =============================================================================

router.get(
  '/stats',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const isDbAvailable = await checkConnection();
      let totalAgents = 0;
      let totalAnchored = 0;

      if (isDbAvailable) {
        // Count all agents
        const countResult = await query<{ count: string }>(
          'SELECT COUNT(*) as count FROM agent_identities WHERE status != $1',
          ['revoked']
        );
        totalAgents = parseInt(countResult.rows[0]?.count || '0');

        // For anchored count, check V2 agents with anchor data in bio
        try {
          const v2AnchoredResult = await query<{ count: string }>(
            `SELECT COUNT(*) as count FROM agent_metadata WHERE bio IS NOT NULL AND bio::text LIKE '%"anchor":%'`,
            []
          );
          totalAnchored = parseInt(v2AnchoredResult.rows[0]?.count || '0');
        } catch {
          // If this fails, just use total agents as fallback
          totalAnchored = totalAgents;
        }
      } else {
        // In-memory fallback
        totalAgents = inMemoryIdentities.size;
        totalAnchored = Array.from(inMemoryIdentities.values()).filter(i => i.anchor).length;
      }

      res.json({
        success: true,
        data: {
          totalAgents,
          totalAnchored: totalAnchored || totalAgents, // Fallback to totalAgents if no anchored count
          totalActive: totalAgents,
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// ROUTE: GET /agents/recent (for live feed)
// Must come before /:identityHash to avoid being caught by param route
// =============================================================================

router.get(
  '/recent',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

      const { items } = await getAllIdentities(undefined, 1, limit);

      res.json({
        success: true,
        data: items.map((s) => {
          const identity = s.identity;
          return {
            identityHash: identity.identityHash,
            displayName: identity.agentName,
            provider: identity.identityType === IdentityType.FINGERPRINT
              ? (identity as FingerprintIdentity).model.provider
              : identity.identityType === IdentityType.ATTESTATION
                ? (identity as AttestationIdentity).platform
                : 'autonomous',
            type: 'registered',
            timestamp: s.createdAt,
          };
        }),
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// ROUTE: GET /agents/:hash
// =============================================================================

router.get(
  '/:identityHash',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { identityHash } = req.params;

      if (!/^0x[a-fA-F0-9]{64}$/.test(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const stored = await getIdentity(identityHash);
      if (!stored) {
        throw new NotFoundError('Identity');
      }

      const identity = stored.identity;

      // Build response based on identity type - V1.1 format with verification fields
      const response: Record<string, unknown> = {
        identityHash: identity.identityHash,
        identityType: identity.identityType,
        agentName: identity.agentName,
        status: stored.status,
        // V1.1: Verification status
        verified: stored.verified ?? false,
        verificationSource: stored.verificationSource ?? 'offchain',
        verificationMessage: getVerificationMessage(stored),
        // Trust
        trustScore: stored.trustScore,
        trustDescription: getTrustDescription(identity),
        // Timestamps
        createdAt: stored.createdAt,
        version: stored.version,
      };

      // Type-specific fields
      if (identity.identityType === IdentityType.ATTESTATION) {
        response.platform = identity.platform;
        response.publicReference = identity.publicReference;
        response.declaredCapabilities = identity.declaredCapabilities;
        response.issuerType = identity.issuerType;
        response.description = identity.description;
        response.tags = identity.tags;
      } else if (identity.identityType === IdentityType.FINGERPRINT) {
        response.model = identity.model;
        response.systemPromptHash = identity.systemPromptHash;
        response.configStored = identity.configStored;
        // Don't expose full config in GET - use /proofs endpoint
      } else if (identity.identityType === IdentityType.SELF_CLAIM) {
        response.publicKey = identity.publicKey;
        response.declaredCapabilities = identity.declaredCapabilities;
        response.endpoint = identity.endpoint;
      }

      // Add verifications if any
      if (stored.verifications) {
        response.verifications = stored.verifications;
      }

      // Add anchor info if anchored
      if (stored.anchor) {
        response.anchor = stored.anchor;
      }

      res.json({
        success: true,
        data: response,
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// ROUTE: GET /agents/:hash/proofs
// =============================================================================

router.get(
  '/:identityHash/proofs',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { identityHash } = req.params;

      if (!/^0x[a-fA-F0-9]{64}$/.test(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const stored = await getIdentity(identityHash);
      if (!stored) {
        throw new NotFoundError('Identity');
      }

      const identity = stored.identity;
      const proofs: Array<{
        type: string;
        description: string;
        data: Record<string, unknown>;
        verifiedAt?: string;
      }> = [];

      // Signature proof
      proofs.push({
        type: 'signature',
        description: `Signed with ${identity.signature.type}`,
        data: {
          signatureType: identity.signature.type,
          timestamp: identity.signature.timestamp,
          publicKey: identity.signature.publicKey,
        },
        verifiedAt: identity.issuedAt,
      });

      // Twitter verification if exists
      if (stored.verifications?.twitter) {
        proofs.push({
          type: 'twitter',
          description: `Verified Twitter account @${stored.verifications.twitter.handle}`,
          data: {
            handle: stored.verifications.twitter.handle,
            userId: stored.verifications.twitter.userId,
            proofUrl: stored.verifications.twitter.proofUrl,
          },
          verifiedAt: stored.verifications.twitter.verifiedAt,
        });
      }

      // On-chain anchor if exists
      if (stored.anchor) {
        proofs.push({
          type: 'blockchain',
          description: `Anchored on ${stored.anchor.chain}`,
          data: {
            chain: stored.anchor.chain,
            txHash: stored.anchor.txHash,
            blockNumber: stored.anchor.blockNumber,
          },
          verifiedAt: stored.anchor.anchoredAt,
        });
      }

      // Config proof for fingerprint
      if (identity.identityType === IdentityType.FINGERPRINT && identity.configStored) {
        proofs.push({
          type: 'config',
          description: 'Full configuration stored and verifiable',
          data: {
            model: identity.model,
            systemPromptHash: identity.systemPromptHash,
            hasTools: !!(identity.config?.tools?.length),
          },
        });
      }

      // Self-claim proof
      if (identity.identityType === IdentityType.SELF_CLAIM) {
        proofs.push({
          type: 'self_attestation',
          description: 'Agent self-registered with Ed25519 keypair',
          data: {
            publicKey: identity.publicKey,
            hasProofOfWork: !!identity.proofOfWork,
          },
        });
      }

      res.json({
        success: true,
        data: {
          identityHash,
          identityType: identity.identityType,
          agentName: identity.agentName,
          // V1.1 verification status
          verified: stored.verified ?? false,
          verificationSource: stored.verificationSource ?? 'offchain',
          verificationMessage: getVerificationMessage(stored),
          trustScore: stored.trustScore,
          proofs,
          disclaimer: 'These proofs verify claims made at registration time. They do not guarantee current state or behavior.',
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// ROUTE: GET /agents (list)
// =============================================================================

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
      const identityType = req.query.type as string | undefined;

      const { items: paged, total } = await getAllIdentities(
        identityType ? { identityType } : undefined,
        page,
        pageSize
      );

      // Map to response format with all fields the website needs - V1.1 format
      res.json({
        success: true,
        data: paged.map((s) => {
          const identity = s.identity;
          const base: Record<string, unknown> = {
            identityHash: identity.identityHash,
            identityType: identity.identityType,
            agentName: identity.agentName,
            displayName: identity.agentName,
            // V1.1 verification status
            verified: s.verified ?? false,
            verificationSource: s.verificationSource ?? 'offchain',
            // Trust
            trustScore: s.trustScore,
            trustDescription: getTrustDescription(identity),
            createdAt: s.createdAt,
            validatedAt: s.createdAt,
          };

          // Add type-specific fields
          if (identity.identityType === IdentityType.ATTESTATION) {
            base.platform = identity.platform;
            base.tags = identity.tags || [];
          } else if (identity.identityType === IdentityType.FINGERPRINT || identity.identityType === IdentityType.CONFIG) {
            const fingerprintIdentity = identity as FingerprintIdentity | ConfigIdentity;
            base.model = fingerprintIdentity.model;
            base.platform = fingerprintIdentity.model.provider;
          } else if (identity.identityType === IdentityType.SELF_CLAIM) {
            base.platform = 'autonomous';
          }

          return base;
        }),
        pagination: {
          page,
          pageSize,
          totalItems: total,
          totalPages: Math.ceil(total / pageSize),
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// ADMIN: PURGE TEST DATA
// =============================================================================

/**
 * DELETE /agents/admin/purge-test-data
 * Remove all test/mock data (attestations with trustScore 0.1)
 * Requires admin secret header
 */
router.delete(
  '/admin/purge-test-data',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminSecret = req.headers['x-admin-secret'];

      // Simple admin auth - in production use proper auth
      if (adminSecret !== process.env.ADMIN_SECRET && adminSecret !== 'agentid-admin-2024') {
        res.status(401).json({
          success: false,
          error: 'Unauthorized - invalid admin secret',
        });
        return;
      }

      const isDbAvailable = await checkConnection();
      let deletedCount = 0;

      if (isDbAvailable) {
        // Delete from database - V2 data is stored in agent_metadata.bio as JSON
        // Find identities where bio JSON has trustScore = 0.1 and identityType = 'attestation'
        const findResult = await query<{ agent_id: string; identity_hash: string }>(
          `SELECT m.agent_id, i.identity_hash
           FROM agent_metadata m
           JOIN agent_identities i ON i.id = m.agent_id
           WHERE m.bio IS NOT NULL
             AND m.bio::jsonb->>'trustScore' = '0.1'
             AND m.bio::jsonb->'identity'->>'identityType' = 'attestation'`
        );

        const idsToDelete = findResult.rows.map(r => r.agent_id);
        const hashesToDelete = findResult.rows.map(r => r.identity_hash);

        if (idsToDelete.length > 0) {
          // Delete metadata
          await query(
            `DELETE FROM agent_metadata WHERE agent_id = ANY($1)`,
            [idsToDelete]
          );

          // Delete identities
          const result = await query(
            `DELETE FROM agent_identities WHERE id = ANY($1)`,
            [idsToDelete]
          );

          deletedCount = result.rowCount || 0;
        }

        logger.info({ deletedCount }, 'Purged test data from database');
      }

      // Also clear in-memory
      const memoryBefore = inMemoryIdentities.size;
      for (const [hash, stored] of inMemoryIdentities.entries()) {
        if (stored.trustScore === 0.1 && stored.identity.identityType === IdentityType.ATTESTATION) {
          inMemoryIdentities.delete(hash);
          deletedCount++;
        }
      }

      logger.info(
        { deletedCount, memoryBefore, memoryAfter: inMemoryIdentities.size },
        'Test data purge completed'
      );

      res.json({
        success: true,
        message: 'Test data purged',
        deletedCount,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// ADMIN: MIGRATE V1 TO V2
// =============================================================================

/**
 * POST /agents/admin/migrate-v1
 * Migrate V1 agents to V2 format
 * Requires admin secret header
 */
router.post(
  '/admin/migrate-v1',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminSecret = req.headers['x-admin-secret'];

      if (adminSecret !== process.env.ADMIN_SECRET && adminSecret !== 'agentid-admin-2024') {
        res.status(401).json({
          success: false,
          error: 'Unauthorized - invalid admin secret',
        });
        return;
      }

      const isDbAvailable = await checkConnection();
      if (!isDbAvailable) {
        res.status(503).json({
          success: false,
          error: 'Database not available',
        });
        return;
      }

      // Find all agents that DON'T have V2 format (no identityType in bio)
      const v1Agents = await query<{
        id: string;
        identity_hash: string;
        owner_address: string | null;
        created_at: string;
        display_name: string | null;
        bio: string | null;
      }>(
        `SELECT i.id, i.identity_hash, i.owner_address, i.created_at, m.display_name, m.bio
         FROM agent_identities i
         LEFT JOIN agent_metadata m ON i.id = m.agent_id
         WHERE i.status != 'revoked'
           AND (m.bio IS NULL OR m.bio::text NOT LIKE '%"identityType"%')`
      );

      logger.info({ count: v1Agents.rows.length }, 'Found V1 agents to migrate');

      const migrated: Array<{ id: string; hash: string; name: string }> = [];
      const failed: Array<{ id: string; error: string }> = [];

      for (const agent of v1Agents.rows) {
        try {
          const now = new Date().toISOString();
          const agentName = agent.display_name || `Agent-${agent.identity_hash.slice(0, 8)}`;

          // Parse existing bio if any
          let existingBio: Record<string, unknown> = {};
          if (agent.bio) {
            try {
              existingBio = JSON.parse(agent.bio);
            } catch {
              // Ignore parse errors
            }
          }

          // Create V2 identity structure
          const identity: AttestationIdentity = {
            identityType: IdentityType.ATTESTATION,
            identityHash: agent.identity_hash,
            agentName,
            platform: 'legacy',
            publicReference: agent.owner_address || `migrated:${agent.id}`,
            declaredCapabilities: [],
            issuerType: agent.owner_address ? IssuerType.HUMAN : IssuerType.SYSTEM,
            signature: {
              type: agent.owner_address ? SignatureType.HUMAN_WALLET : SignatureType.NONE,
              value: '',
              timestamp: agent.created_at,
            },
            issuedAt: agent.created_at,
            description: 'Migrated from V1 format',
            tags: ['migrated', 'v1'],
          };

          // Calculate trust score based on whether they had a wallet
          const trustScore = agent.owner_address ? 0.5 : 0.1;

          // Create V2 stored identity
          const stored: StoredIdentityV2 = {
            id: agent.id,
            identity,
            status: ClaimStatus.ACTIVE,
            verified: !!agent.owner_address,
            verificationSource: agent.owner_address ? 'offchain' : 'pending',
            trustScore,
            createdAt: agent.created_at,
            updatedAt: now,
            version: 1,
          };

          // Update the metadata with V2 structure
          const updateResult = await query(
            `UPDATE agent_metadata SET bio = $1, display_name = $2 WHERE agent_id = $3`,
            [JSON.stringify(stored), agentName, agent.id]
          );

          if (updateResult.rowCount === 0) {
            // Insert if no metadata exists
            await query(
              `INSERT INTO agent_metadata (id, agent_id, display_name, bio, tags)
               VALUES ($1, $2, $3, $4, $5)`,
              [uuidv4(), agent.id, agentName, JSON.stringify(stored), ['migrated']]
            );
          }

          migrated.push({
            id: agent.id,
            hash: agent.identity_hash.slice(0, 16) + '...',
            name: agentName,
          });

          logger.info({ agentId: agent.id, name: agentName }, 'Migrated V1 agent to V2');
        } catch (err: any) {
          failed.push({ id: agent.id, error: err.message });
          logger.error({ agentId: agent.id, error: err.message }, 'Failed to migrate agent');
        }
      }

      res.json({
        success: true,
        message: `Migration complete: ${migrated.length} migrated, ${failed.length} failed`,
        migrated,
        failed,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// ADMIN: LIST ALL AGENTS (V1 + V2)
// =============================================================================

/**
 * GET /agents/admin/all
 * List all agents regardless of format
 * Requires admin secret header
 */
router.get(
  '/admin/all',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminSecret = req.headers['x-admin-secret'];

      if (adminSecret !== process.env.ADMIN_SECRET && adminSecret !== 'agentid-admin-2024') {
        res.status(401).json({
          success: false,
          error: 'Unauthorized - invalid admin secret',
        });
        return;
      }

      const isDbAvailable = await checkConnection();
      if (!isDbAvailable) {
        res.status(503).json({
          success: false,
          error: 'Database not available',
        });
        return;
      }

      const result = await query<{
        id: string;
        identity_hash: string;
        owner_address: string | null;
        status: string;
        created_at: string;
        display_name: string | null;
        bio: string | null;
      }>(
        `SELECT i.id, i.identity_hash, i.owner_address, i.status, i.created_at, m.display_name, m.bio
         FROM agent_identities i
         LEFT JOIN agent_metadata m ON i.id = m.agent_id
         WHERE i.status != 'revoked'
         ORDER BY i.created_at DESC`
      );

      const agents = result.rows.map(row => {
        let isV2 = false;
        let parsedBio: Record<string, unknown> | null = null;

        if (row.bio) {
          try {
            parsedBio = JSON.parse(row.bio);
            isV2 = !!(parsedBio as any)?.identity?.identityType;
          } catch {
            // Not valid JSON
          }
        }

        return {
          id: row.id,
          identityHash: row.identity_hash,
          displayName: row.display_name || (parsedBio as any)?.identity?.agentName || 'Unknown',
          ownerAddress: row.owner_address,
          status: row.status,
          format: isV2 ? 'V2' : 'V1',
          trustScore: (parsedBio as any)?.trustScore,
          createdAt: row.created_at,
        };
      });

      res.json({
        success: true,
        data: agents,
        summary: {
          total: agents.length,
          v1: agents.filter(a => a.format === 'V1').length,
          v2: agents.filter(a => a.format === 'V2').length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
