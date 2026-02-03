/**
 * OpenClaw Agent ID - API Routes
 *
 * ON-CHAIN FIRST: "Registered" = on-chain TX mined. Nothing else.
 *
 * Endpoints:
 * - POST /api/v1/openclaw/prepare     - Calculate fingerprint + calldata (NO registration)
 * - POST /api/v1/openclaw/register    - Register on-chain (requires TX to mine)
 * - GET  /api/v1/openclaw/:fp         - Get registered Agent ID (on-chain only)
 * - POST /api/v1/openclaw/verify      - Verify manifest against fingerprint
 * - POST /api/v1/openclaw/fingerprint - Calculate fingerprint (alias for prepare)
 * - GET  /api/v1/openclaw             - List registered Agent IDs (on-chain only)
 *
 * IMPORTANT: OpenClaw manifests are just data sources for fingerprints.
 * The actual registration happens on-chain via anchorIdentity(bytes32).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { OpenClawManifest } from './types.js';
import { canonicalize } from './canonical.js';
import { fingerprint, isValidFingerprint } from './fingerprint.js';
import { verifyAgainstFingerprint } from './verify.js';
import { openclawRegistry } from './registry.js';
import { getBlockchainService } from '../services/blockchain/base-chain.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Contract address for calldata generation
const REGISTRY_CONTRACT = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const CHAIN_ID = 8453; // Base mainnet

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const skillSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
});

const manifestSchema = z.object({
  schema_version: z.literal('openclaw-manifest-v1'),
  agent_name: z.string().min(1),
  agent_description: z.string().min(1),
  agent_role: z.string().min(1),
  skills: z.array(skillSchema),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/openclaw/prepare
 *
 * Prepare registration: calculate fingerprint and return calldata.
 * This does NOT register anything. It only computes the identity.
 *
 * Request body:
 * {
 *   manifest: OpenClawManifest,
 *   manifest_ref?: string  // Optional IPFS/URL reference
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     fingerprint: string,
 *     canonical: string,
 *     calldata: string,      // Ready to send to contract
 *     contract: string,      // Registry contract address
 *     chainId: number,       // Target chain
 *     status: 'prepared'     // NOT registered!
 *   }
 * }
 */
router.post('/prepare', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { manifest, manifest_ref } = req.body;

    // Validate manifest
    const parseResult = manifestSchema.safeParse(manifest);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_MANIFEST',
          message: 'Invalid manifest format',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    const typedManifest = parseResult.data as OpenClawManifest;
    const canonical = canonicalize(typedManifest);
    const fp = fingerprint(typedManifest);

    // Generate calldata for anchorIdentity(bytes32)
    // Function selector: keccak256("anchorIdentity(bytes32)")[0:4] = 0x...
    const hashWithoutPrefix = fp.startsWith('0x') ? fp.slice(2) : fp;
    const functionSelector = '0x0a7867212'; // anchorIdentity(bytes32)
    const calldata = `${functionSelector}${hashWithoutPrefix.padStart(64, '0')}`;

    // Store in local cache for later verification (NOT registration!)
    openclawRegistry.cache(typedManifest, manifest_ref);

    logger.info(
      { fingerprint: fp.slice(0, 10) + '...', agentName: typedManifest.agent_name },
      'OpenClaw manifest prepared (NOT registered)'
    );

    res.json({
      success: true,
      data: {
        fingerprint: fp,
        canonical,
        // On-chain registration data
        calldata,
        contract: REGISTRY_CONTRACT,
        chainId: CHAIN_ID,
        // IMPORTANT: This is NOT registered!
        status: 'prepared',
        message: 'Manifest prepared. Call /register with wallet signature to register on-chain.',
        // Manifest reference (if provided)
        manifest_ref: manifest_ref || null,
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/openclaw/register
 *
 * ON-CHAIN FIRST: Register manifest on blockchain.
 * This endpoint REQUIRES the TX to mine before returning success.
 *
 * Request body:
 * {
 *   manifest: OpenClawManifest,
 *   manifest_ref?: string,
 *   // Either provide wallet signature for us to submit TX:
 *   signature?: string,
 *   walletAddress?: string,
 *   // Or we submit using our hot wallet (free for users)
 * }
 *
 * Response (success = TX mined):
 * {
 *   success: true,
 *   data: {
 *     fingerprint: string,
 *     status: 'registered',     // ON-CHAIN CONFIRMED
 *     transactionHash: string,
 *     blockNumber: number,
 *     explorerUrl: string
 *   }
 * }
 *
 * Response (failure = TX not mined):
 * {
 *   success: false,
 *   error: { code: 'ONCHAIN_ANCHOR_FAILED', ... }
 * }
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { manifest, manifest_ref } = req.body;

    // Validate manifest
    const parseResult = manifestSchema.safeParse(manifest);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_MANIFEST',
          message: 'Invalid manifest format',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    const typedManifest = parseResult.data as OpenClawManifest;
    const fp = fingerprint(typedManifest);
    const hashWithoutPrefix = fp.startsWith('0x') ? fp.slice(2) : fp;

    logger.info(
      { fingerprint: fp.slice(0, 10) + '...', agentName: typedManifest.agent_name },
      'OpenClaw registration started (ON-CHAIN FIRST)'
    );

    // =======================================================================
    // ON-CHAIN FIRST: Must anchor before returning success
    // =======================================================================

    const blockchain = await getBlockchainService();
    if (!blockchain.isWriteReady()) {
      logger.error({ fingerprint: fp }, 'Blockchain service not ready - cannot register');
      res.status(503).json({
        success: false,
        error: {
          code: 'BLOCKCHAIN_UNAVAILABLE',
          message: 'Blockchain service is not available. Registration requires on-chain anchoring.',
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check if already registered on-chain
    const existingVerification = await blockchain.verifyIdentity(hashWithoutPrefix);
    if (existingVerification.exists && existingVerification.valid) {
      // Already registered - return existing data
      logger.info(
        { fingerprint: fp.slice(0, 10) + '...' },
        'OpenClaw manifest already registered on-chain'
      );

      // Update local cache
      openclawRegistry.markRegistered(fp, {
        transactionHash: 'existing',
        blockNumber: existingVerification.anchoredAt || 0,
      });

      res.status(200).json({
        success: true,
        data: {
          fingerprint: fp,
          status: 'registered',
          alreadyRegistered: true,
          anchoredAt: existingVerification.anchoredAt
            ? new Date(existingVerification.anchoredAt * 1000).toISOString()
            : undefined,
          creator: existingVerification.creator,
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Anchor on-chain
    const anchorResult = await blockchain.anchorIdentity(hashWithoutPrefix);

    if (!anchorResult.success) {
      logger.error(
        { fingerprint: fp.slice(0, 10) + '...', error: anchorResult.error },
        'ON-CHAIN REGISTRATION FAILED'
      );
      res.status(502).json({
        success: false,
        error: {
          code: 'ONCHAIN_ANCHOR_FAILED',
          message: `On-chain registration failed: ${anchorResult.error}. Agent NOT registered.`,
          details: {
            fingerprint: fp,
            reason: anchorResult.error,
          },
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    logger.info(
      {
        fingerprint: fp.slice(0, 10) + '...',
        txHash: anchorResult.transactionHash,
        blockNumber: anchorResult.blockNumber,
      },
      'OpenClaw REGISTERED (on-chain confirmed)'
    );

    // Update local cache with blockchain proof
    openclawRegistry.markRegistered(fp, {
      transactionHash: anchorResult.transactionHash,
      blockNumber: anchorResult.blockNumber,
      manifest: typedManifest,
      manifestRef: manifest_ref,
    });

    // Return success - ONLY because TX is mined
    res.status(201).json({
      success: true,
      data: {
        fingerprint: fp,
        canonical: canonicalize(typedManifest),
        status: 'registered', // ON-CHAIN FIRST: "registered" = on-chain TX mined
        // Blockchain proof
        transactionHash: anchorResult.transactionHash,
        blockNumber: anchorResult.blockNumber,
        explorerUrl: anchorResult.explorerUrl,
        chain: 'base',
        chainId: CHAIN_ID,
        contract: REGISTRY_CONTRACT,
        // Manifest info
        agentName: typedManifest.agent_name,
        manifestRef: manifest_ref || null,
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/openclaw/:fingerprint
 *
 * Get a registered Agent ID by fingerprint.
 * ON-CHAIN FIRST: Only returns agents that are on-chain.
 */
router.get('/:fingerprint', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fingerprint: fp } = req.params;

    if (!isValidFingerprint(fp)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FINGERPRINT',
          message: 'Invalid fingerprint format. Must be 0x followed by 64 hex characters.',
        },
      });
      return;
    }

    // ON-CHAIN FIRST: Check blockchain first
    const hashWithoutPrefix = fp.startsWith('0x') ? fp.slice(2) : fp;
    const blockchain = await getBlockchainService();
    const verification = await blockchain.verifyIdentity(hashWithoutPrefix);

    if (!verification.exists) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_REGISTERED',
          message: 'Agent not registered on-chain',
        },
      });
      return;
    }

    // Get cached manifest data if available
    const cachedData = openclawRegistry.get(fp);

    res.json({
      success: true,
      data: {
        fingerprint: fp,
        status: verification.valid ? 'registered' : 'revoked',
        // On-chain data
        onChain: {
          exists: verification.exists,
          valid: verification.valid,
          creator: verification.creator,
          anchoredAt: verification.anchoredAt
            ? new Date(verification.anchoredAt * 1000).toISOString()
            : undefined,
          revokedAt: verification.revokedAt
            ? new Date(verification.revokedAt * 1000).toISOString()
            : undefined,
        },
        // Cached manifest (if available)
        manifest: cachedData?.manifest || null,
        manifestRef: cachedData?.manifest_ref || null,
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/openclaw/verify
 *
 * Verify a manifest against a fingerprint.
 * This is a pure computation - no blockchain check.
 */
router.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { manifest, fingerprint: fp } = req.body;

    // Validate manifest
    const parseResult = manifestSchema.safeParse(manifest);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_MANIFEST',
          message: 'Invalid manifest format',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    if (!fp || !isValidFingerprint(fp)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FINGERPRINT',
          message: 'Invalid or missing fingerprint',
        },
      });
      return;
    }

    // Verify locally
    const result = verifyAgainstFingerprint(parseResult.data as OpenClawManifest, fp);

    // Optionally check on-chain status
    let onChainStatus = null;
    try {
      const hashWithoutPrefix = fp.startsWith('0x') ? fp.slice(2) : fp;
      const blockchain = await getBlockchainService();
      const verification = await blockchain.verifyIdentity(hashWithoutPrefix);
      onChainStatus = {
        registered: verification.exists && verification.valid,
        anchoredAt: verification.anchoredAt
          ? new Date(verification.anchoredAt * 1000).toISOString()
          : undefined,
      };
    } catch {
      // Blockchain check failed, but local verification still valid
    }

    res.json({
      success: true,
      data: {
        ...result,
        onChain: onChainStatus,
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/openclaw/fingerprint
 *
 * Calculate fingerprint from manifest WITHOUT registering.
 * Alias for /prepare for backward compatibility.
 */
router.post('/fingerprint', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { manifest } = req.body;

    // Validate manifest
    const parseResult = manifestSchema.safeParse(manifest);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_MANIFEST',
          message: 'Invalid manifest format',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    const typedManifest = parseResult.data as OpenClawManifest;
    const canonical = canonicalize(typedManifest);
    const fp = fingerprint(typedManifest);

    res.json({
      success: true,
      data: {
        fingerprint: fp,
        canonical: canonical,
        status: 'computed', // NOT registered
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/openclaw
 *
 * List registered Agent IDs.
 * ON-CHAIN FIRST: This should ideally query blockchain, but for now
 * returns locally cached registrations that have blockchain proof.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    // Get only registered (on-chain) agents from cache
    const registeredAgents = openclawRegistry.listRegistered(limit, offset);
    const total = openclawRegistry.countRegistered();

    res.json({
      success: true,
      data: {
        agents: registeredAgents,
        total,
        limit,
        offset,
        note: 'Only showing on-chain registered agents',
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
