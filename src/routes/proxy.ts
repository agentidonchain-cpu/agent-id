/**
 * Agent007 - LLM Proxy Routes
 *
 * API endpoints for proxied LLM requests with attestation.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getLLMProxyService } from '../services/proxy/llm-proxy.js';
import { apiKeyAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const proxyRequestSchema = z.object({
  identityHash: z.string().length(64),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().min(1),
  })).min(1),
  parameters: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(1).max(128000).optional(),
    topP: z.number().min(0).max(1).optional(),
  }).optional(),
  includeAttestation: z.boolean().default(true),
});

const verifyAttestationSchema = z.object({
  attestationId: z.string().min(1),
});

const verifyIntegritySchema = z.object({
  content: z.string().min(1),
  expectedHash: z.string().length(64),
});

// =============================================================================
// ROUTER
// =============================================================================

const router = Router();

/**
 * POST /proxy/chat
 * Proxy a chat request to the LLM provider
 */
router.post(
  '/chat',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parseResult = proxyRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { identityHash, messages, parameters, includeAttestation } = parseResult.data;

      logger.info({ identityHash, messageCount: messages.length }, 'Proxy chat request');

      const proxyService = getLLMProxyService();
      const response = await proxyService.proxyRequest({
        identityHash,
        messages,
        parameters,
        includeAttestation,
      });

      res.json({
        success: true,
        data: response,
        meta: {
          requestId: response.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /proxy/complete
 * Proxy a completion request (single message)
 */
router.post(
  '/complete',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        identityHash: z.string().length(64),
        prompt: z.string().min(1),
        parameters: proxyRequestSchema.shape.parameters,
        includeAttestation: z.boolean().default(true),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { identityHash, prompt, parameters, includeAttestation } = parseResult.data;

      const proxyService = getLLMProxyService();
      const response = await proxyService.proxyRequest({
        identityHash,
        messages: [{ role: 'user', content: prompt }],
        parameters,
        includeAttestation,
      });

      res.json({
        success: true,
        data: {
          requestId: response.requestId,
          completion: response.content,
          model: response.model,
          usage: response.usage,
          timing: response.timing,
          integrity: response.integrity,
          attestation: response.attestation,
        },
        meta: {
          requestId: response.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /proxy/verify-attestation
 * Verify an attestation from a previous request
 */
router.post(
  '/verify-attestation',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parseResult = verifyAttestationSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { attestationId } = parseResult.data;

      const proxyService = getLLMProxyService();
      const result = await proxyService.verifyAttestation(attestationId);

      res.json({
        success: true,
        data: result,
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
 * POST /proxy/verify-integrity
 * Verify response integrity using hash
 */
router.post(
  '/verify-integrity',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parseResult = verifyIntegritySchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { content, expectedHash } = parseResult.data;

      const proxyService = getLLMProxyService();
      const valid = proxyService.verifyIntegrity(content, expectedHash);

      res.json({
        success: true,
        data: {
          valid,
          contentLength: content.length,
          expectedHash,
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
 * GET /proxy/logs/:identityHash
 * Get proxy logs for an agent
 */
router.get(
  '/logs/:identityHash',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      if (identityHash.length !== 64) {
        throw new ValidationError('Invalid identity hash format');
      }

      const proxyService = getLLMProxyService();
      const logs = proxyService.getProxyLogs(identityHash, limit);

      res.json({
        success: true,
        data: logs.map(log => ({
          requestId: log.requestId,
          provider: log.provider,
          modelId: log.modelId,
          timing: log.timing,
          usage: log.usage,
          hasAttestation: !!log.attestationId,
          createdAt: log.createdAt.toISOString(),
        })),
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
          count: logs.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /proxy/logs/request/:requestId
 * Get a specific proxy log by request ID
 */
router.get(
  '/logs/request/:requestId',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { requestId } = req.params;

      const proxyService = getLLMProxyService();
      const log = proxyService.getProxyLog(requestId);

      if (!log) {
        throw new NotFoundError('Proxy log');
      }

      res.json({
        success: true,
        data: {
          requestId: log.requestId,
          identityHash: log.identityHash,
          provider: log.provider,
          modelId: log.modelId,
          requestHash: log.requestHash,
          responseHash: log.responseHash,
          timing: log.timing,
          usage: log.usage,
          attestationId: log.attestationId,
          createdAt: log.createdAt.toISOString(),
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
 * GET /proxy/stats
 * Get proxy statistics
 */
router.get(
  '/stats',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const proxyService = getLLMProxyService();
      const stats = proxyService.getStats();

      res.json({
        success: true,
        data: stats,
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
 * GET /proxy/samples/:identityHash
 * Get response samples for fingerprinting
 */
router.get(
  '/samples/:identityHash',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (identityHash.length !== 64) {
        throw new ValidationError('Invalid identity hash format');
      }

      const proxyService = getLLMProxyService();
      const samples = proxyService.getResponseSamples(identityHash);

      res.json({
        success: true,
        data: samples.map(s => ({
          content: s.content.substring(0, 200) + (s.content.length > 200 ? '...' : ''),
          latencyMs: s.latencyMs,
          timestamp: s.timestamp.toISOString(),
        })),
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
          count: samples.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
