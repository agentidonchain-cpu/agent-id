/**
 * Agent007 - Blockchain Routes
 *
 * API endpoints for blockchain anchoring and verification.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getBlockchainService } from '../services/blockchain/base-chain.js';
import { getAgentStorageService } from '../services/storage/agent-storage.js';
import { apiKeyAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// ROUTER
// =============================================================================

const router = Router();

/**
 * GET /blockchain/status
 * Get blockchain connection status
 */
router.get(
  '/status',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const blockchain = await getBlockchainService();
      const status = await blockchain.getStatus();

      res.json({
        success: true,
        data: status,
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

/**
 * GET /blockchain/stats
 * Get registration statistics for website counter
 * Returns: total anchored, total revoked, total active
 */
router.get(
  '/stats',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const blockchain = await getBlockchainService();
      const status = await blockchain.getStatus();

      // Also get count from database for pending/validating agents
      const storage = getAgentStorageService();
      const dbStats = await storage.getStats();

      // Calculate validated count from byStatus
      const validatedCount = dbStats?.byStatus?.validated || 0;
      const pendingCount = (dbStats?.byStatus?.pending || 0) + (dbStats?.byStatus?.validating || 0);

      res.json({
        success: true,
        data: {
          // ON-CHAIN FIRST: Only on-chain counts are "registered"
          onChain: {
            totalRegistered: status.totalAnchored || 0,
            totalRevoked: status.totalRevoked || 0,
            totalActive: (status.totalAnchored || 0) - (status.totalRevoked || 0),
          },
          // Off-chain counts (drafts, not registered)
          offChain: {
            totalDrafts: dbStats?.identities || 0,
            totalPending: pendingCount,
            byStatus: dbStats?.byStatus || {},
            note: 'Off-chain entries are drafts, not registered agents',
          },
          // Combined for display (website counter) - ON-CHAIN ONLY
          display: {
            totalAgents: status.totalAnchored || 0, // Only on-chain counts
            chain: status.chainName,
            contractAddress: status.contractAddress,
          },
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

/**
 * POST /blockchain/anchor/:identityHash
 * Anchor an identity hash on-chain
 */
router.post(
  '/anchor/:identityHash',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (identityHash.length !== 64) {
        throw new ValidationError('Invalid identity hash format');
      }

      // Verify agent exists and is validated
      const storage = getAgentStorageService();
      const identity = await storage.getIdentity(identityHash);

      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      if (identity.status !== 'validated') {
        throw new ValidationError('Agent must be validated before anchoring');
      }

      // Anchor on blockchain
      const blockchain = await getBlockchainService();
      const result = await blockchain.anchorIdentity(identityHash);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'ANCHOR_FAILED',
            message: result.error,
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      logger.info({
        identityHash,
        txHash: result.transactionHash,
      }, 'Identity anchored on blockchain');

      res.json({
        success: true,
        data: {
          identityHash,
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          gasUsed: result.gasUsed,
          explorerUrl: result.explorerUrl,
          anchoredAt: new Date().toISOString(),
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

/**
 * POST /blockchain/anchor-batch
 * Anchor multiple identities in one transaction
 */
router.post(
  '/anchor-batch',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        identityHashes: z.array(z.string().length(64)).min(1).max(50),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { identityHashes } = parseResult.data;

      // Verify all agents exist and are validated
      const storage = getAgentStorageService();
      const validHashes: string[] = [];

      for (const hash of identityHashes) {
        const identity = await storage.getIdentity(hash);
        if (identity && identity.status === 'validated') {
          validHashes.push(hash);
        }
      }

      if (validHashes.length === 0) {
        throw new ValidationError('No valid identities to anchor');
      }

      // Batch anchor
      const blockchain = await getBlockchainService();
      const result = await blockchain.batchAnchor(validHashes);

      res.json({
        success: result.success,
        data: {
          transactionHash: result.transactionHash,
          anchored: result.anchored,
          skipped: result.skipped,
          invalidIdentities: identityHashes.length - validHashes.length,
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

/**
 * GET /blockchain/verify/:identityHash
 * Verify an identity on-chain
 */
router.get(
  '/verify/:identityHash',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (identityHash.length !== 64) {
        throw new ValidationError('Invalid identity hash format');
      }

      const blockchain = await getBlockchainService();
      const result = await blockchain.verifyIdentity(identityHash);

      res.json({
        success: true,
        data: {
          identityHash,
          onChain: result.exists,
          valid: result.valid,
          creator: result.creator,
          anchoredAt: result.anchoredAt
            ? new Date(result.anchoredAt * 1000).toISOString()
            : undefined,
          revokedAt: result.revokedAt
            ? new Date(result.revokedAt * 1000).toISOString()
            : undefined,
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

/**
 * GET /blockchain/proof/:identityHash
 * Get blockchain proof for an identity
 */
router.get(
  '/proof/:identityHash',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (identityHash.length !== 64) {
        throw new ValidationError('Invalid identity hash format');
      }

      const blockchain = await getBlockchainService();
      const status = await blockchain.getStatus();
      const verification = await blockchain.verifyIdentity(identityHash);

      if (!verification.exists) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_ANCHORED',
            message: 'Identity not found on blockchain',
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          identityHash,
          blockchain: {
            chain: status.chainName,
            chainId: status.chainId,
            contractAddress: status.contractAddress,
          },
          proof: {
            exists: verification.exists,
            valid: verification.valid,
            creator: verification.creator,
            anchoredAt: verification.anchoredAt
              ? new Date(verification.anchoredAt * 1000).toISOString()
              : undefined,
            anchoredAtTimestamp: verification.anchoredAt,
            revokedAt: verification.revokedAt
              ? new Date(verification.revokedAt * 1000).toISOString()
              : undefined,
          },
          verification: {
            explorerUrl: status.contractAddress
              ? `${blockchain.getAddressUrl(status.contractAddress)}`
              : undefined,
            verifyCommand: `cast call ${status.contractAddress} "verifyIdentity(bytes32)" 0x${identityHash} --rpc-url https://mainnet.base.org`,
          },
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

/**
 * POST /blockchain/revoke/:identityHash
 * Revoke an identity on-chain
 */
router.post(
  '/revoke/:identityHash',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (identityHash.length !== 64) {
        throw new ValidationError('Invalid identity hash format');
      }

      const blockchain = await getBlockchainService();
      const result = await blockchain.revokeIdentity(identityHash);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'REVOKE_FAILED',
            message: result.error,
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          identityHash,
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          explorerUrl: result.explorerUrl,
          revokedAt: new Date().toISOString(),
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

/**
 * GET /blockchain/estimate/:identityHash
 * Estimate gas cost for anchoring
 */
router.get(
  '/estimate/:identityHash',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (identityHash.length !== 64) {
        throw new ValidationError('Invalid identity hash format');
      }

      const blockchain = await getBlockchainService();
      const estimate = await blockchain.estimateAnchorGas(identityHash);

      if (!estimate) {
        res.status(503).json({
          success: false,
          error: {
            code: 'ESTIMATE_UNAVAILABLE',
            message: 'Gas estimation not available - blockchain service not configured',
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          identityHash,
          estimate: {
            gasLimit: estimate.gasLimit,
            gasPriceGwei: estimate.gasPriceGwei,
            estimatedCostEth: estimate.estimatedCostEth,
          },
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
// V2 ROUTES (with agentId and versioning)
// EXPERIMENTAL - Hidden by default, enable with ENABLE_V2_EXPERIMENTAL=true
// =============================================================================

const v2Guard = (_req: Request, res: Response, next: NextFunction) => {
  if (process.env.ENABLE_V2_EXPERIMENTAL !== 'true') {
    res.status(404).end();
    return;
  }
  next();
};

/**
 * POST /blockchain/anchor-v2
 * Anchor an identity with agentId (V2)
 */
router.post(
  '/anchor-v2',
  v2Guard,
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        identityHash: z.string().length(64),
        agentId: z.string().uuid(),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { identityHash, agentId } = parseResult.data;

      // Verify agent exists and is validated
      const storage = getAgentStorageService();
      const identity = await storage.getIdentity(identityHash);

      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      if (identity.status !== 'validated') {
        throw new ValidationError('Agent must be validated before anchoring');
      }

      // Convert UUID to bytes32 format
      const agentIdBytes32 = agentId.replace(/-/g, '').padStart(64, '0');

      // Anchor on blockchain V2
      const blockchain = await getBlockchainService();
      const result = await blockchain.anchorIdentityWithAgentId(identityHash, agentIdBytes32);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'ANCHOR_V2_FAILED',
            message: result.error,
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      logger.info({
        identityHash,
        agentId,
        txHash: result.transactionHash,
      }, 'Identity anchored on blockchain V2');

      res.json({
        success: true,
        data: {
          identityHash,
          agentId,
          versionNumber: 1,
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          gasUsed: result.gasUsed,
          explorerUrl: result.explorerUrl,
          anchoredAt: new Date().toISOString(),
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

/**
 * POST /blockchain/update-version
 * Update agent to a new version (V2)
 */
router.post(
  '/update-version',
  v2Guard,
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        agentId: z.string().uuid(),
        newIdentityHash: z.string().length(64),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { agentId, newIdentityHash } = parseResult.data;

      // Verify new identity exists and is validated
      const storage = getAgentStorageService();
      const identity = await storage.getIdentity(newIdentityHash);

      if (!identity) {
        throw new NotFoundError('New agent identity');
      }

      if (identity.status !== 'validated') {
        throw new ValidationError('New identity must be validated before anchoring');
      }

      // Convert UUID to bytes32 format
      const agentIdBytes32 = agentId.replace(/-/g, '').padStart(64, '0');

      // Update version on blockchain
      const blockchain = await getBlockchainService();
      const result = await blockchain.updateAgentVersion(agentIdBytes32, newIdentityHash);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VERSION_UPDATE_FAILED',
            message: result.error,
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      logger.info({
        agentId,
        newIdentityHash,
        txHash: result.transactionHash,
      }, 'Agent version updated on blockchain');

      res.json({
        success: true,
        data: {
          agentId,
          newIdentityHash,
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          gasUsed: result.gasUsed,
          explorerUrl: result.explorerUrl,
          updatedAt: new Date().toISOString(),
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

/**
 * GET /blockchain/versions/:agentId
 * Get version history for an agent (V2)
 */
router.get(
  '/versions/:agentId',
  v2Guard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { agentId } = req.params;
      const limit = parseInt(req.query.limit as string) || 0;

      // Validate UUID format
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)) {
        throw new ValidationError('Invalid agentId format - must be UUID');
      }

      // Convert UUID to bytes32 format
      const agentIdBytes32 = agentId.replace(/-/g, '').padStart(64, '0');

      const blockchain = await getBlockchainService();
      const history = await blockchain.getVersionHistory(agentIdBytes32, limit);
      const currentVersion = await blockchain.getCurrentVersionV2(agentIdBytes32);

      res.json({
        success: true,
        data: {
          agentId,
          currentVersion: currentVersion ? currentVersion.slice(2) : null, // Remove 0x prefix
          versionCount: history.length,
          versions: history.map((hash: string) => hash.slice(2)), // Remove 0x prefix
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

/**
 * GET /blockchain/current-version/:agentId
 * Get current version for an agent (V2)
 */
router.get(
  '/current-version/:agentId',
  v2Guard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { agentId } = req.params;

      // Validate UUID format
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)) {
        throw new ValidationError('Invalid agentId format - must be UUID');
      }

      // Convert UUID to bytes32 format
      const agentIdBytes32 = agentId.replace(/-/g, '').padStart(64, '0');

      const blockchain = await getBlockchainService();
      const currentHash = await blockchain.getCurrentVersionV2(agentIdBytes32);

      if (!currentHash) {
        res.status(404).json({
          success: false,
          error: {
            code: 'AGENT_NOT_FOUND',
            message: 'Agent not found on blockchain',
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Get full identity details
      const verification = await blockchain.verifyIdentityV2(currentHash);

      res.json({
        success: true,
        data: {
          agentId,
          currentIdentityHash: currentHash.slice(2), // Remove 0x prefix
          versionNumber: verification.versionNumber,
          owner: verification.owner,
          operator: verification.operator,
          anchoredAt: verification.anchoredAt
            ? new Date(verification.anchoredAt * 1000).toISOString()
            : undefined,
          valid: verification.valid,
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

/**
 * GET /blockchain/verify-v2/:identityHash
 * Verify an identity with full V2 details
 */
router.get(
  '/verify-v2/:identityHash',
  v2Guard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (identityHash.length !== 64) {
        throw new ValidationError('Invalid identity hash format');
      }

      const blockchain = await getBlockchainService();
      const result = await blockchain.verifyIdentityV2(identityHash);

      res.json({
        success: true,
        data: {
          identityHash,
          onChain: result.exists,
          valid: result.valid,
          agentId: result.agentId ? result.agentId.slice(2) : undefined,
          previousVersion: result.previousVersion ? result.previousVersion.slice(2) : undefined,
          versionNumber: result.versionNumber,
          creator: result.creator,
          owner: result.owner,
          operator: result.operator,
          anchoredAt: result.anchoredAt
            ? new Date(result.anchoredAt * 1000).toISOString()
            : undefined,
          revokedAt: result.revokedAt
            ? new Date(result.revokedAt * 1000).toISOString()
            : undefined,
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
