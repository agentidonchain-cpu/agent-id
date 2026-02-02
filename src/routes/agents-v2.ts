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
import {
  IdentityType,
  IssuerType,
  SignatureType,
  ClaimStatus,
  type AttestationIdentity,
  type FingerprintIdentity,
  type SelfClaimIdentity,
  type StoredIdentityV2,
  type Signature,
  getTrustDescription,
} from '../types/identity-v2.js';

const router = Router();

// =============================================================================
// IN-MEMORY STORAGE (replace with DB)
// =============================================================================

const identities = new Map<string, StoredIdentityV2>();

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

      // Calculate trust score
      let trustScore = 0.1; // Base score for any registration
      if (signature.type === SignatureType.HUMAN_WALLET) trustScore = 0.5;
      if (signature.type === SignatureType.TWITTER_PROOF) trustScore = 0.4;
      if (signature.type === SignatureType.AGENT_KEYPAIR) trustScore = 0.3;

      // Store
      const stored: StoredIdentityV2 = {
        id: uuidv4(),
        identity,
        status: ClaimStatus.ACTIVE,
        trustScore,
        createdAt: issuedAt,
        updatedAt: issuedAt,
        version: 1,
      };

      identities.set(identityHash, stored);

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
          verifyUrl: `https://id-agent.org/verify/${identityHash}`,
          createdAt: issuedAt,
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
      const issuedAt = new Date().toISOString();

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
      if (identities.has(identityHash)) {
        throw new ConflictError('Agent with this public key already registered');
      }

      // Verify Ed25519 signature
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

      // Trust score for self-claims
      let trustScore = 0.2;
      if (data.proofOfWork && data.proofOfWork.difficulty >= POW_DIFFICULTY) {
        trustScore = 0.3; // Higher trust with proof of work
      }

      // Store
      const stored: StoredIdentityV2 = {
        id: uuidv4(),
        identity,
        status: ClaimStatus.ACTIVE,
        trustScore,
        createdAt: issuedAt,
        updatedAt: issuedAt,
        version: 1,
      };

      identities.set(identityHash, stored);

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
          verifyUrl: `https://id-agent.org/verify/${identityHash}`,
          createdAt: issuedAt,
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

      // Trust score
      let trustScore = 0.3;
      if (signature.type === SignatureType.HUMAN_WALLET) trustScore = 0.6;
      if (systemPromptHash) trustScore += 0.1;

      // Store
      const stored: StoredIdentityV2 = {
        id: uuidv4(),
        identity,
        status: ClaimStatus.ACTIVE,
        trustScore,
        createdAt: issuedAt,
        updatedAt: issuedAt,
        version: 1,
      };

      identities.set(identityHash, stored);

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
          verifyUrl: `https://id-agent.org/verify/${identityHash}`,
          createdAt: issuedAt,
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

      const stored = identities.get(identityHash);
      if (!stored) {
        throw new NotFoundError('Identity');
      }

      const identity = stored.identity;

      // Build response based on identity type
      const response: Record<string, unknown> = {
        identityHash: identity.identityHash,
        identityType: identity.identityType,
        agentName: identity.agentName,
        status: stored.status,
        trustScore: stored.trustScore,
        trustDescription: getTrustDescription(identity),
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

      const stored = identities.get(identityHash);
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

      let allIdentities = Array.from(identities.values());

      // Filter by type if specified
      if (identityType) {
        allIdentities = allIdentities.filter(
          (s) => s.identity.identityType === identityType
        );
      }

      // Filter active only
      allIdentities = allIdentities.filter((s) => s.status === ClaimStatus.ACTIVE);

      // Sort by creation date (newest first)
      allIdentities.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const total = allIdentities.length;
      const start = (page - 1) * pageSize;
      const paged = allIdentities.slice(start, start + pageSize);

      res.json({
        success: true,
        data: paged.map((s) => ({
          identityHash: s.identity.identityHash,
          identityType: s.identity.identityType,
          agentName: s.identity.agentName,
          trustScore: s.trustScore,
          trustDescription: getTrustDescription(s.identity),
          createdAt: s.createdAt,
        })),
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

export default router;
