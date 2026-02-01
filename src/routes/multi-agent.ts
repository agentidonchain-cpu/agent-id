/**
 * Agent007 - Multi-Agent Verification Routes
 *
 * API endpoints for batch verification and multi-agent analysis.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { apiKeyAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { ModelProvider, AlertSeverity } from '../types/identity.js';

// =============================================================================
// TYPES
// =============================================================================

interface AgentVerificationInput {
  agentId: string;
  identityHash: string;
  provider: ModelProvider;
  modelId: string;
}

interface VerificationResult {
  agentId: string;
  verified: boolean;
  score: number;
  timestamp: Date;
  error?: { code: string; message: string };
  fromCache?: boolean;
}

interface BatchVerificationResult {
  totalAgents: number;
  verified: number;
  failed: number;
  results: VerificationResult[];
  executionTimeMs: number;
  correlations?: {
    providerCorrelation: number;
    modelCorrelation: number;
    byProvider: Record<string, { verified: number; failed: number }>;
  };
  aggregatedAlerts?: {
    total: number;
    bySeverity: {
      info: number;
      warning: number;
      critical: number;
    };
    grouped?: Array<{ type: string; count: number; agentIds: string[] }>;
  };
  overallRisk?: {
    score: number;
    level: 'low' | 'medium' | 'high' | 'critical';
  };
  highRiskAgents?: string[];
  report?: {
    summary: {
      totalVerified: number;
      successRate: number;
      avgVerificationTime: number;
    };
    details: Record<string, unknown>;
    recommendations: string[];
  };
  errors?: Array<{ agentId: string; error: string }>;
}

interface ScheduledVerification {
  id: string;
  agents: AgentVerificationInput[];
  cronExpression: string;
  name: string;
  nextRun: Date;
  active: boolean;
}

// =============================================================================
// IN-MEMORY STORAGE (MVP)
// =============================================================================

const verificationCache = new Map<string, { result: VerificationResult; expiresAt: number }>();
const scheduledVerifications = new Map<string, ScheduledVerification>();
const batchStats = {
  totalBatches: 0,
  totalAgentsVerified: 0,
  totalExecutionTimeMs: 0,
  successfulVerifications: 0,
};
const batchCompleteCallbacks: Array<(result: BatchVerificationResult) => void> = [];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function verifyAgent(
  agent: AgentVerificationInput,
  useCache: boolean,
  cacheTtlMs: number
): Promise<VerificationResult> {
  const cacheKey = `${agent.agentId}:${agent.identityHash}`;

  // Check cache
  if (useCache) {
    const cached = verificationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, fromCache: true };
    }
  }

  // Simulate verification (in production, would call actual verification service)
  const startTime = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 50));

  const verified = Math.random() > 0.1; // 90% success rate for demo
  const score = verified ? 0.8 + Math.random() * 0.2 : Math.random() * 0.5;

  const result: VerificationResult = {
    agentId: agent.agentId,
    verified,
    score,
    timestamp: new Date(),
    fromCache: false,
  };

  // Cache result
  verificationCache.set(cacheKey, {
    result,
    expiresAt: Date.now() + cacheTtlMs,
  });

  return result;
}

function calculateRisk(results: VerificationResult[]): { score: number; level: 'low' | 'medium' | 'high' | 'critical' } {
  const failedCount = results.filter((r) => !r.verified).length;
  const failureRate = failedCount / results.length;

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  // Calculate risk score (0-100)
  const riskScore = (failureRate * 50) + ((1 - avgScore) * 50);

  let level: 'low' | 'medium' | 'high' | 'critical';
  if (riskScore < 20) level = 'low';
  else if (riskScore < 50) level = 'medium';
  else if (riskScore < 80) level = 'high';
  else level = 'critical';

  return { score: Math.round(riskScore), level };
}

// =============================================================================
// ROUTER
// =============================================================================

const router = Router();

// =============================================================================
// BATCH VERIFICATION
// =============================================================================

/**
 * POST /multi-agent/verify
 * Verify multiple agents in batch
 */
router.post(
  '/verify',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const verifySchema = z.object({
        agents: z.array(z.object({
          agentId: z.string().min(1),
          identityHash: z.string().min(1),
          provider: z.nativeEnum(ModelProvider),
          modelId: z.string().min(1),
        })).min(1).max(100),
        options: z.object({
          parallel: z.boolean().optional(),
          includeDetails: z.boolean().optional(),
          includeCorrelations: z.boolean().optional(),
          aggregateAlerts: z.boolean().optional(),
          groupSimilarAlerts: z.boolean().optional(),
          calculateRisk: z.boolean().optional(),
          generateReport: z.boolean().optional(),
          useCache: z.boolean().optional(),
          cacheTtlMs: z.number().int().min(0).max(3600000).optional(),
          continueOnError: z.boolean().optional(),
        }).optional(),
      });

      const parseResult = verifySchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { agents, options = {} } = parseResult.data;

      if (agents.length === 0) {
        throw new ValidationError('No agents provided');
      }

      if (agents.length > 100) {
        throw new ValidationError('Batch size exceeds maximum of 100 agents');
      }

      const startTime = Date.now();
      const results: VerificationResult[] = [];
      const errors: Array<{ agentId: string; error: string }> = [];

      const parallel = options.parallel !== false;
      const useCache = options.useCache !== false;
      const cacheTtlMs = options.cacheTtlMs || 300000; // 5 min default
      const continueOnError = options.continueOnError !== false;

      if (parallel) {
        // Run all verifications in parallel
        const verificationPromises = agents.map(async (agent) => {
          try {
            return await verifyAgent(agent, useCache, cacheTtlMs);
          } catch (err) {
            if (!continueOnError) throw err;
            errors.push({
              agentId: agent.agentId,
              error: err instanceof Error ? err.message : 'Unknown error',
            });
            return {
              agentId: agent.agentId,
              verified: false,
              score: 0,
              timestamp: new Date(),
              error: { code: 'VERIFICATION_ERROR', message: String(err) },
            } as VerificationResult;
          }
        });

        results.push(...await Promise.all(verificationPromises));
      } else {
        // Run sequentially
        for (const agent of agents) {
          try {
            const result = await verifyAgent(agent, useCache, cacheTtlMs);
            results.push(result);
          } catch (err) {
            if (!continueOnError) throw err;
            errors.push({
              agentId: agent.agentId,
              error: err instanceof Error ? err.message : 'Unknown error',
            });
            results.push({
              agentId: agent.agentId,
              verified: false,
              score: 0,
              timestamp: new Date(),
              error: { code: 'VERIFICATION_ERROR', message: String(err) },
            });
          }
        }
      }

      const executionTimeMs = Date.now() - startTime;

      // Build response
      const response: BatchVerificationResult = {
        totalAgents: agents.length,
        verified: results.filter((r) => r.verified).length,
        failed: results.filter((r) => !r.verified).length,
        results,
        executionTimeMs,
      };

      // Add correlations if requested
      if (options.includeCorrelations) {
        const byProvider: Record<string, { verified: number; failed: number }> = {};
        agents.forEach((agent, i) => {
          if (!byProvider[agent.provider]) {
            byProvider[agent.provider] = { verified: 0, failed: 0 };
          }
          if (results[i].verified) {
            byProvider[agent.provider].verified++;
          } else {
            byProvider[agent.provider].failed++;
          }
        });

        response.correlations = {
          providerCorrelation: 0.85, // Would be calculated from actual data
          modelCorrelation: 0.72,
          byProvider,
        };
      }

      // Add aggregated alerts if requested
      if (options.aggregateAlerts) {
        const alertCount = results.filter((r) => !r.verified).length;
        response.aggregatedAlerts = {
          total: alertCount,
          bySeverity: {
            info: Math.floor(alertCount * 0.3),
            warning: Math.floor(alertCount * 0.5),
            critical: Math.floor(alertCount * 0.2),
          },
        };

        if (options.groupSimilarAlerts) {
          response.aggregatedAlerts.grouped = [
            {
              type: 'verification_failed',
              count: alertCount,
              agentIds: results.filter((r) => !r.verified).map((r) => r.agentId),
            },
          ];
        }
      }

      // Add risk assessment if requested
      if (options.calculateRisk) {
        response.overallRisk = calculateRisk(results);
        response.highRiskAgents = results
          .filter((r) => !r.verified || r.score < 0.5)
          .map((r) => r.agentId);
      }

      // Add report if requested
      if (options.generateReport) {
        response.report = {
          summary: {
            totalVerified: response.verified,
            successRate: (response.verified / response.totalAgents) * 100,
            avgVerificationTime: executionTimeMs / agents.length,
          },
          details: {
            verifiedAgents: results.filter((r) => r.verified).map((r) => r.agentId),
            failedAgents: results.filter((r) => !r.verified).map((r) => r.agentId),
          },
          recommendations: response.failed > 0
            ? ['Review failed verifications', 'Check agent configurations']
            : ['All agents verified successfully'],
        };
      }

      // Add errors if any
      if (errors.length > 0) {
        response.errors = errors;
      }

      // Update stats
      batchStats.totalBatches++;
      batchStats.totalAgentsVerified += agents.length;
      batchStats.totalExecutionTimeMs += executionTimeMs;
      batchStats.successfulVerifications += response.verified;

      // Notify callbacks
      batchCompleteCallbacks.forEach((cb) => cb(response));

      logger.info(
        {
          totalAgents: agents.length,
          verified: response.verified,
          failed: response.failed,
          executionTimeMs,
          requestedBy: req.creator?.id,
        },
        'Batch verification completed'
      );

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
// AGENT COMPARISON
// =============================================================================

/**
 * POST /multi-agent/compare
 * Compare behavioral patterns between agents
 */
router.post(
  '/compare',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const compareSchema = z.object({
        agentIds: z.array(z.string()).min(2).max(20),
      });

      const parseResult = compareSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { agentIds } = parseResult.data;

      if (agentIds.length < 2) {
        throw new ValidationError('At least 2 agents required for comparison');
      }

      // Simulate comparison analysis (in production, would analyze actual data)
      const comparison = {
        agentCount: agentIds.length,
        similarities: {
          responsePatterns: 0.75,
          timingPatterns: 0.82,
          vocabularyOverlap: 0.68,
        },
        differences: {
          responseLength: 0.45,
          formalityLevel: 0.38,
        },
        outliers: agentIds.length > 3 ? [agentIds[agentIds.length - 1]] : [],
        clusters: [
          { agentIds: agentIds.slice(0, Math.ceil(agentIds.length / 2)), similarity: 0.89 },
          { agentIds: agentIds.slice(Math.ceil(agentIds.length / 2)), similarity: 0.76 },
        ],
      };

      logger.info(
        { agentCount: agentIds.length, requestedBy: req.creator?.id },
        'Agent comparison completed'
      );

      res.json({
        success: true,
        data: comparison,
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
// SCHEDULED VERIFICATION
// =============================================================================

/**
 * POST /multi-agent/schedule
 * Schedule recurring batch verification
 */
router.post(
  '/schedule',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const scheduleSchema = z.object({
        agents: z.array(z.object({
          agentId: z.string().min(1),
          identityHash: z.string().min(1),
          provider: z.nativeEnum(ModelProvider),
          modelId: z.string().min(1),
        })).min(1),
        cronExpression: z.string().min(1),
        name: z.string().min(1).max(100),
      });

      const parseResult = scheduleSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { agents, cronExpression, name } = parseResult.data;

      const scheduleId = uuidv4();
      const schedule: ScheduledVerification = {
        id: scheduleId,
        agents,
        cronExpression,
        name,
        nextRun: new Date(Date.now() + 3600000), // 1 hour from now (simplified)
        active: true,
      };

      scheduledVerifications.set(scheduleId, schedule);

      logger.info(
        { scheduleId, name, agentCount: agents.length, requestedBy: req.creator?.id },
        'Batch verification scheduled'
      );

      res.status(201).json({
        success: true,
        data: schedule,
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
 * GET /multi-agent/schedules
 * List scheduled verifications
 */
router.get(
  '/schedules',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schedules = Array.from(scheduledVerifications.values());

      res.json({
        success: true,
        data: schedules,
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
 * DELETE /multi-agent/schedule/:scheduleId
 * Cancel a scheduled verification
 */
router.delete(
  '/schedule/:scheduleId',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { scheduleId } = req.params;

      const schedule = scheduledVerifications.get(scheduleId);
      if (!schedule) {
        throw new NotFoundError('Scheduled verification');
      }

      scheduledVerifications.delete(scheduleId);

      logger.info(
        { scheduleId, requestedBy: req.creator?.id },
        'Scheduled verification cancelled'
      );

      res.json({
        success: true,
        data: { cancelled: true },
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
// STATISTICS
// =============================================================================

/**
 * GET /multi-agent/stats
 * Get batch verification statistics
 */
router.get(
  '/stats',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const avgBatchSize = batchStats.totalBatches > 0
        ? batchStats.totalAgentsVerified / batchStats.totalBatches
        : 0;

      const avgVerificationTime = batchStats.totalAgentsVerified > 0
        ? batchStats.totalExecutionTimeMs / batchStats.totalAgentsVerified
        : 0;

      const successRate = batchStats.totalAgentsVerified > 0
        ? (batchStats.successfulVerifications / batchStats.totalAgentsVerified) * 100
        : 100;

      res.json({
        success: true,
        data: {
          totalBatches: batchStats.totalBatches,
          totalAgentsVerified: batchStats.totalAgentsVerified,
          avgBatchSize: Math.round(avgBatchSize * 10) / 10,
          avgVerificationTime: Math.round(avgVerificationTime * 10) / 10,
          successRate: Math.round(successRate * 10) / 10,
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
// CACHE MANAGEMENT
// =============================================================================

/**
 * DELETE /multi-agent/cache
 * Clear verification cache
 */
router.delete(
  '/cache',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const agentId = req.query.agentId as string | undefined;
      let cleared = 0;

      if (agentId) {
        // Clear cache for specific agent
        for (const [key] of verificationCache) {
          if (key.startsWith(`${agentId}:`)) {
            verificationCache.delete(key);
            cleared++;
          }
        }
      } else {
        // Clear all cache
        cleared = verificationCache.size;
        verificationCache.clear();
      }

      logger.info(
        { cleared, agentId, requestedBy: req.creator?.id },
        'Verification cache cleared'
      );

      res.json({
        success: true,
        data: { cleared },
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
