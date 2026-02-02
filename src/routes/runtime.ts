/**
 * AgentID - Runtime Attestation Protocol (RAP) Routes
 *
 * API endpoints for the challenge-response protocol that allows agents
 * to prove their current configuration matches their registered identity.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import {
  createChallenge,
  getChallenge,
  getChallengeStats,
  verifyAttestation,
  getAttestationStatus,
  getAttestationHistory,
  generateRuntimeHashes,
} from '../services/runtime/index.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import type {
  RuntimeAttestation,
  ChallengeRequest,
} from '../types/runtime.js';

const router = Router();

// =============================================================================
// SCHEMAS
// =============================================================================

const challengeRequestSchema = z.object({
  targetIdentityHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid identity hash'),
  callbackUrl: z.string().url().optional(),
  challengerIdentityHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
});

const attestationRequestSchema = z.object({
  challengeId: z.string().min(1),
  attestation: z.object({
    registeredIdentityHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    runtime: z.object({
      hashes: z.object({
        configHash: z.string(),
        systemPromptHash: z.string(),
        toolsHash: z.string(),
        modelFingerprint: z.string(),
        pluginsHash: z.string().optional(),
        contextHash: z.string().optional(),
      }),
      timestamp: z.string(),
      agentVersion: z.string().optional(),
      platform: z.string().optional(),
      uptimeSeconds: z.number().optional(),
    }),
    challenge: z.object({
      challengeId: z.string(),
      nonce: z.string(),
      challengedAt: z.string(),
      respondedAt: z.string(),
    }),
    proof: z.object({
      type: z.enum(['ed25519', 'secp256k1', 'tee', 'zkp']),
      signature: z.string(),
      publicKey: z.string(),
      certificate: z.string().optional(),
      zkProof: z.string().optional(),
    }),
    selfReportedDrift: z.object({
      configMatch: z.boolean(),
      systemPromptMatch: z.boolean(),
      toolsMatch: z.boolean(),
      modelMatch: z.boolean(),
      overallMatch: z.boolean(),
      driftScore: z.number(),
      mismatches: z.array(z.any()),
    }).optional(),
  }),
});

const verifyRequestSchema = z.object({
  attestation: attestationRequestSchema.shape.attestation,
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/runtime/challenge
 * Create a challenge for an agent to prove its runtime configuration
 */
router.post(
  '/challenge',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = challengeRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const request: ChallengeRequest = parseResult.data;

      logger.info(
        { targetIdentityHash: request.targetIdentityHash.slice(0, 10) + '...' },
        'Runtime challenge requested'
      );

      const response = await createChallenge(request);

      res.status(201).json({
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

/**
 * GET /api/v1/runtime/challenge/:challengeId
 * Get challenge details
 */
router.get(
  '/challenge/:challengeId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { challengeId } = req.params;
      const challenge = getChallenge(challengeId);

      if (!challenge) {
        throw new NotFoundError('Challenge');
      }

      res.json({
        success: true,
        data: {
          challengeId: challenge.id,
          targetIdentityHash: challenge.targetIdentityHash,
          nonce: challenge.nonce,
          status: challenge.status,
          createdAt: challenge.createdAt.toISOString(),
          expiresAt: challenge.expiresAt.toISOString(),
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
 * POST /api/v1/runtime/attest
 * Submit a runtime attestation in response to a challenge
 */
router.post(
  '/attest',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = attestationRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid attestation', parseResult.error.flatten());
      }

      const { attestation } = parseResult.data;

      logger.info(
        {
          challengeId: attestation.challenge.challengeId,
          identityHash: attestation.registeredIdentityHash.slice(0, 10) + '...',
        },
        'Runtime attestation submitted'
      );

      // Verify the attestation
      const verification = await verifyAttestation(attestation as RuntimeAttestation);

      if (!verification.valid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'ATTESTATION_FAILED',
            message: 'Attestation verification failed',
            details: verification.warnings,
          },
          data: {
            signatureValid: verification.signatureValid,
            challengeValid: verification.challengeValid,
            drift: verification.drift,
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
          verified: true,
          drift: verification.drift,
          warnings: verification.warnings,
          verifiedAt: verification.verifiedAt,
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
 * GET /api/v1/runtime/status/:identityHash
 * Get attestation status for an agent
 */
router.get(
  '/status/:identityHash',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { identityHash } = req.params;

      if (!/^0x[a-fA-F0-9]{64}$/.test(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const status = await getAttestationStatus(identityHash);

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
 * GET /api/v1/runtime/history/:identityHash
 * Get attestation history for an agent
 */
router.get(
  '/history/:identityHash',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { identityHash } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

      if (!/^0x[a-fA-F0-9]{64}$/.test(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const history = getAttestationHistory(identityHash, limit);

      res.json({
        success: true,
        data: history.map((h) => ({
          id: h.id,
          challengeId: h.challengeId,
          driftScore: h.verification.drift.driftScore,
          overallMatch: h.verification.drift.overallMatch,
          valid: h.verification.valid,
          createdAt: h.createdAt.toISOString(),
        })),
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
          total: history.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/runtime/verify
 * Verify an attestation without a prior challenge (third-party verification)
 */
router.post(
  '/verify',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = verifyRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid attestation', parseResult.error.flatten());
      }

      const { attestation } = parseResult.data;

      // Note: This endpoint is for verifying attestations that were
      // already submitted. It checks signature and drift but doesn't
      // validate the challenge (it may have already been used).

      const verification = await verifyAttestation(attestation as RuntimeAttestation);

      res.json({
        success: true,
        data: {
          valid: verification.valid,
          signatureValid: verification.signatureValid,
          drift: verification.drift,
          warnings: verification.warnings,
          verifiedAt: verification.verifiedAt,
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
 * GET /api/v1/runtime/stats
 * Get global attestation statistics
 */
router.get(
  '/stats',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const challengeStats = getChallengeStats();

      res.json({
        success: true,
        data: {
          challenges: challengeStats,
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
 * POST /api/v1/runtime/hash
 * Helper endpoint: Generate runtime hashes from configuration
 * Useful for agents to compute hashes before attestation
 */
router.post(
  '/hash',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { config, systemPrompt, tools, model } = req.body;

      if (!config) {
        throw new ValidationError('config is required');
      }

      const hashes = generateRuntimeHashes({
        fullConfig: config,
        systemPrompt,
        tools,
        model,
      });

      res.json({
        success: true,
        data: hashes,
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
