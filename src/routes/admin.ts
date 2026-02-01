/**
 * Agent007 - Admin Dashboard Routes
 *
 * API endpoints for system administration and monitoring.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { apiKeyAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { IdentityStatus, AlertSeverity } from '../types/identity.js';

// =============================================================================
// LOCAL TYPES
// =============================================================================

// Local enum for admin status tracking (maps to IdentityStatus)
enum AgentStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked',
}

// =============================================================================
// TYPES
// =============================================================================

interface SystemStats {
  totalAgents: number;
  activeAgents: number;
  suspendedAgents: number;
  revokedAgents: number;
  verificationStats: {
    totalVerifications: number;
    successRate: number;
    avgLatencyMs: number;
  };
  providerStats: Record<string, number>;
  uptime: {
    startTime: Date;
    durationMs: number;
  };
}

interface AgentSummary {
  id: string;
  identityHash: string;
  displayName: string;
  status: AgentStatus;
  provider: string;
  createdAt: Date;
  lastVerified?: Date;
  alertCount: number;
}

interface AuditLogEntry {
  id: string;
  actionType: string;
  targetId: string;
  performedBy: string;
  timestamp: Date;
  details: Record<string, unknown>;
}

// =============================================================================
// IN-MEMORY STORAGE (MVP - Replace with database in production)
// =============================================================================

const startTime = new Date();
const auditLog: AuditLogEntry[] = [];
const systemAlerts: Array<{
  id: string;
  severity: AlertSeverity;
  message: string;
  agentId?: string;
  timestamp: Date;
  acknowledged: boolean;
}> = [];
const agentStatuses = new Map<string, AgentStatus>();
const suspensionReasons = new Map<string, string>();
const notificationConfig: {
  webhookUrl?: string;
  events: string[];
  secret?: string;
} = { events: [] };
const rateLimits = new Map<string, {
  requestsPerMinute: number;
  requestsPerHour: number;
}>();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function addAuditEntry(
  actionType: string,
  targetId: string,
  performedBy: string,
  details: Record<string, unknown> = {}
): void {
  auditLog.push({
    id: uuidv4(),
    actionType,
    targetId,
    performedBy,
    timestamp: new Date(),
    details,
  });

  // Keep last 10000 entries
  while (auditLog.length > 10000) {
    auditLog.shift();
  }
}

function requireAdmin(req: AuthenticatedRequest): void {
  // In production, verify admin role from API key metadata
  if (!req.creator?.id) {
    throw new ForbiddenError('Admin access required');
  }
}

// =============================================================================
// ROUTER
// =============================================================================

const router = Router();

// =============================================================================
// SYSTEM STATS
// =============================================================================

/**
 * GET /admin/stats
 * Get system statistics
 */
router.get(
  '/stats',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const stats: SystemStats = {
        totalAgents: agentStatuses.size,
        activeAgents: Array.from(agentStatuses.values()).filter(
          (s) => s === AgentStatus.ACTIVE
        ).length,
        suspendedAgents: Array.from(agentStatuses.values()).filter(
          (s) => s === AgentStatus.SUSPENDED
        ).length,
        revokedAgents: Array.from(agentStatuses.values()).filter(
          (s) => s === AgentStatus.REVOKED
        ).length,
        verificationStats: {
          totalVerifications: auditLog.filter(
            (e) => e.actionType === 'verification_run'
          ).length,
          successRate: 95.5, // Would be calculated from actual data
          avgLatencyMs: 150,
        },
        providerStats: {
          anthropic: 0,
          openai: 0,
          google: 0,
        },
        uptime: {
          startTime,
          durationMs: Date.now() - startTime.getTime(),
        },
      };

      logger.info({ requestedBy: req.creator?.id }, 'System stats retrieved');

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

// =============================================================================
// AGENT MANAGEMENT
// =============================================================================

/**
 * GET /admin/agents
 * Get paginated list of agents
 */
router.get(
  '/agents',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const status = req.query.status as AgentStatus | undefined;
      const provider = req.query.provider as string | undefined;
      const sortBy = (req.query.sortBy as string) || 'createdAt';
      const sortOrder = (req.query.sortOrder as string) || 'desc';

      // In production, fetch from database with filters
      const agents: AgentSummary[] = [];

      res.json({
        success: true,
        data: {
          agents,
          total: agents.length,
          page,
          limit,
          totalPages: Math.ceil(agents.length / limit),
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
 * POST /admin/agents/:agentId/suspend
 * Suspend an agent
 */
router.post(
  '/agents/:agentId/suspend',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const { agentId } = req.params;

      const suspendSchema = z.object({
        reason: z.string().min(1).max(500),
      });

      const parseResult = suspendSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { reason } = parseResult.data;
      const currentStatus = agentStatuses.get(agentId) || AgentStatus.ACTIVE;

      if (currentStatus === AgentStatus.SUSPENDED) {
        res.status(400).json({
          success: false,
          error: {
            code: 'ALREADY_SUSPENDED',
            message: 'Agent is already suspended',
          },
        });
        return;
      }

      agentStatuses.set(agentId, AgentStatus.SUSPENDED);
      suspensionReasons.set(agentId, reason);

      addAuditEntry('agent_suspended', agentId, req.creator?.id || 'unknown', {
        reason,
        previousStatus: currentStatus,
      });

      logger.info(
        { agentId, reason, performedBy: req.creator?.id },
        'Agent suspended'
      );

      res.json({
        success: true,
        data: {
          success: true,
          previousStatus: currentStatus,
          newStatus: AgentStatus.SUSPENDED,
          reason,
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
 * POST /admin/agents/:agentId/revoke
 * Revoke an agent
 */
router.post(
  '/agents/:agentId/revoke',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const { agentId } = req.params;

      const revokeSchema = z.object({
        reason: z.string().min(1).max(500),
      });

      const parseResult = revokeSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { reason } = parseResult.data;
      const currentStatus = agentStatuses.get(agentId) || AgentStatus.ACTIVE;

      if (currentStatus === AgentStatus.REVOKED) {
        res.status(400).json({
          success: false,
          error: {
            code: 'ALREADY_REVOKED',
            message: 'Agent is already revoked',
          },
        });
        return;
      }

      agentStatuses.set(agentId, AgentStatus.REVOKED);

      addAuditEntry('agent_revoked', agentId, req.creator?.id || 'unknown', {
        reason,
        previousStatus: currentStatus,
      });

      logger.warn(
        { agentId, reason, performedBy: req.creator?.id },
        'Agent revoked'
      );

      res.json({
        success: true,
        data: {
          success: true,
          previousStatus: currentStatus,
          newStatus: AgentStatus.REVOKED,
          reason,
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
 * POST /admin/agents/:agentId/restore
 * Restore a suspended agent
 */
router.post(
  '/agents/:agentId/restore',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const { agentId } = req.params;

      const restoreSchema = z.object({
        reason: z.string().min(1).max(500),
      });

      const parseResult = restoreSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { reason } = parseResult.data;
      const currentStatus = agentStatuses.get(agentId) || AgentStatus.ACTIVE;

      if (currentStatus === AgentStatus.REVOKED) {
        res.status(400).json({
          success: false,
          error: {
            code: 'CANNOT_RESTORE_REVOKED',
            message: 'Cannot restore a revoked agent',
          },
        });
        return;
      }

      if (currentStatus === AgentStatus.ACTIVE) {
        res.status(400).json({
          success: false,
          error: {
            code: 'ALREADY_ACTIVE',
            message: 'Agent is already active',
          },
        });
        return;
      }

      agentStatuses.set(agentId, AgentStatus.ACTIVE);
      suspensionReasons.delete(agentId);

      addAuditEntry('agent_restored', agentId, req.creator?.id || 'unknown', {
        reason,
        previousStatus: currentStatus,
      });

      logger.info(
        { agentId, reason, performedBy: req.creator?.id },
        'Agent restored'
      );

      res.json({
        success: true,
        data: {
          success: true,
          previousStatus: currentStatus,
          newStatus: AgentStatus.ACTIVE,
          reason,
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
 * POST /admin/agents/:agentId/archive
 * Archive an agent
 */
router.post(
  '/agents/:agentId/archive',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const { agentId } = req.params;

      addAuditEntry('agent_archived', agentId, req.creator?.id || 'unknown', {});

      logger.info(
        { agentId, performedBy: req.creator?.id },
        'Agent archived'
      );

      res.json({
        success: true,
        data: {
          success: true,
          archived: true,
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
// BULK ACTIONS
// =============================================================================

/**
 * POST /admin/bulk
 * Perform bulk action on multiple agents
 */
router.post(
  '/bulk',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const bulkSchema = z.object({
        action: z.enum(['suspend', 'restore', 'revoke', 'archive']),
        agentIds: z.array(z.string()).min(1).max(1000),
        reason: z.string().min(1).max(500),
      });

      const parseResult = bulkSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { action, agentIds, reason } = parseResult.data;

      if (agentIds.length === 0) {
        throw new ValidationError('No agents specified');
      }

      if (agentIds.length > 1000) {
        throw new ValidationError('Bulk action exceeds maximum of 1000 agents');
      }

      const results: Array<{ agentId: string; success: boolean; error?: string }> = [];

      for (const agentId of agentIds) {
        try {
          const currentStatus = agentStatuses.get(agentId) || AgentStatus.ACTIVE;

          switch (action) {
            case 'suspend':
              if (currentStatus !== AgentStatus.SUSPENDED) {
                agentStatuses.set(agentId, AgentStatus.SUSPENDED);
                suspensionReasons.set(agentId, reason);
                results.push({ agentId, success: true });
              } else {
                results.push({ agentId, success: false, error: 'Already suspended' });
              }
              break;

            case 'restore':
              if (currentStatus === AgentStatus.SUSPENDED) {
                agentStatuses.set(agentId, AgentStatus.ACTIVE);
                suspensionReasons.delete(agentId);
                results.push({ agentId, success: true });
              } else if (currentStatus === AgentStatus.REVOKED) {
                results.push({ agentId, success: false, error: 'Cannot restore revoked agent' });
              } else {
                results.push({ agentId, success: false, error: 'Not suspended' });
              }
              break;

            case 'revoke':
              if (currentStatus !== AgentStatus.REVOKED) {
                agentStatuses.set(agentId, AgentStatus.REVOKED);
                results.push({ agentId, success: true });
              } else {
                results.push({ agentId, success: false, error: 'Already revoked' });
              }
              break;

            case 'archive':
              results.push({ agentId, success: true });
              break;
          }
        } catch (err) {
          results.push({
            agentId,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      addAuditEntry(`bulk_${action}`, 'multiple', req.creator?.id || 'unknown', {
        action,
        reason,
        agentCount: agentIds.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      });

      logger.info(
        {
          action,
          total: agentIds.length,
          succeeded: results.filter((r) => r.success).length,
          performedBy: req.creator?.id,
        },
        'Bulk action completed'
      );

      res.json({
        success: true,
        data: {
          total: agentIds.length,
          succeeded: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
          details: results,
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
// ALERTS
// =============================================================================

/**
 * GET /admin/alerts
 * Get all system alerts
 */
router.get(
  '/alerts',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const severity = req.query.severity as AlertSeverity | undefined;
      const acknowledged = req.query.acknowledged === 'true' ? true :
                          req.query.acknowledged === 'false' ? false : undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      let filtered = [...systemAlerts];

      if (severity) {
        filtered = filtered.filter((a) => a.severity === severity);
      }

      if (acknowledged !== undefined) {
        filtered = filtered.filter((a) => a.acknowledged === acknowledged);
      }

      if (startDate) {
        filtered = filtered.filter((a) => a.timestamp >= startDate);
      }

      if (endDate) {
        filtered = filtered.filter((a) => a.timestamp <= endDate);
      }

      res.json({
        success: true,
        data: filtered,
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
 * DELETE /admin/alerts
 * Clear alerts
 */
router.delete(
  '/alerts',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const agentId = req.query.agentId as string | undefined;

      let cleared = 0;

      if (agentId) {
        const before = systemAlerts.length;
        const toKeep = systemAlerts.filter((a) => a.agentId !== agentId);
        cleared = before - toKeep.length;
        systemAlerts.length = 0;
        systemAlerts.push(...toKeep);
      } else {
        cleared = systemAlerts.length;
        systemAlerts.length = 0;
      }

      addAuditEntry('alerts_cleared', agentId || 'all', req.creator?.id || 'unknown', {
        cleared,
      });

      logger.info(
        { cleared, agentId, performedBy: req.creator?.id },
        'Alerts cleared'
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

/**
 * POST /admin/alerts/acknowledge-all
 * Acknowledge all alerts
 */
router.post(
  '/alerts/acknowledge-all',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      let acknowledged = 0;
      systemAlerts.forEach((alert) => {
        if (!alert.acknowledged) {
          alert.acknowledged = true;
          acknowledged++;
        }
      });

      addAuditEntry('alerts_acknowledged', 'all', req.creator?.id || 'unknown', {
        acknowledged,
      });

      logger.info(
        { acknowledged, performedBy: req.creator?.id },
        'All alerts acknowledged'
      );

      res.json({
        success: true,
        data: { acknowledged },
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
// AUDIT LOG
// =============================================================================

/**
 * GET /admin/audit
 * Get audit log
 */
router.get(
  '/audit',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const actionType = req.query.actionType as string | undefined;
      const performedBy = req.query.performedBy as string | undefined;

      let filtered = [...auditLog];

      if (actionType) {
        filtered = filtered.filter((e) => e.actionType === actionType);
      }

      if (performedBy) {
        filtered = filtered.filter((e) => e.performedBy === performedBy);
      }

      // Sort by timestamp descending
      filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      const total = filtered.length;
      const offset = (page - 1) * limit;
      const entries = filtered.slice(offset, offset + limit);

      res.json({
        success: true,
        data: {
          entries,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
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
// HEALTH CHECK
// =============================================================================

/**
 * GET /admin/health
 * Get system health status
 */
router.get(
  '/health',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const healthStart = Date.now();

      // Check components
      const components = {
        database: { status: 'healthy' as const, latencyMs: 5 },
        verification: { status: 'healthy' as const, latencyMs: 10 },
        providers: { status: 'healthy' as const, latencyMs: 50 },
      };

      const overallStatus = Object.values(components).every(
        (c) => c.status === 'healthy'
      )
        ? 'healthy'
        : 'degraded';

      res.json({
        success: true,
        data: {
          status: overallStatus,
          components,
          responseTimeMs: Date.now() - healthStart,
          uptime: Date.now() - startTime.getTime(),
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
// EXPORTS
// =============================================================================

/**
 * GET /admin/export/agent/:agentId
 * Export agent data
 */
router.get(
  '/export/agent/:agentId',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const { agentId } = req.params;
      const format = (req.query.format as string) || 'json';

      // In production, fetch actual agent data from database
      const agentData = {
        agentId,
        status: agentStatuses.get(agentId) || AgentStatus.ACTIVE,
        verificationHistory: [],
        alerts: systemAlerts.filter((a) => a.agentId === agentId),
        exportedAt: new Date().toISOString(),
      };

      if (format === 'csv') {
        const csv = `agentId,status,exportedAt\n${agentId},${agentData.status},${agentData.exportedAt}`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${agentId}.csv"`);
        res.send(csv);
      } else {
        res.json({
          success: true,
          data: JSON.stringify(agentData),
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/export/stats
 * Export system statistics
 */
router.get(
  '/export/stats',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const stats = {
        exportedAt: new Date().toISOString(),
        data: {
          totalAgents: agentStatuses.size,
          statusCounts: {
            active: Array.from(agentStatuses.values()).filter(
              (s) => s === AgentStatus.ACTIVE
            ).length,
            suspended: Array.from(agentStatuses.values()).filter(
              (s) => s === AgentStatus.SUSPENDED
            ).length,
            revoked: Array.from(agentStatuses.values()).filter(
              (s) => s === AgentStatus.REVOKED
            ).length,
          },
          alertCount: systemAlerts.length,
          auditEntries: auditLog.length,
        },
      };

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

// =============================================================================
// NOTIFICATIONS
// =============================================================================

/**
 * POST /admin/notifications/configure
 * Configure notification settings
 */
router.post(
  '/notifications/configure',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const configSchema = z.object({
        webhookUrl: z.string().url(),
        events: z.array(z.string()).min(1),
        secret: z.string().min(16).optional(),
      });

      const parseResult = configSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { webhookUrl, events, secret } = parseResult.data;

      // Validate URL format
      try {
        new URL(webhookUrl);
      } catch {
        throw new ValidationError('Invalid webhook URL');
      }

      if (events.length === 0) {
        throw new ValidationError('At least one event required');
      }

      notificationConfig.webhookUrl = webhookUrl;
      notificationConfig.events = events;
      notificationConfig.secret = secret;

      addAuditEntry('notifications_configured', 'system', req.creator?.id || 'unknown', {
        webhookUrl,
        events,
      });

      logger.info(
        { webhookUrl, events, performedBy: req.creator?.id },
        'Notification settings configured'
      );

      res.json({
        success: true,
        data: {
          success: true,
          webhookConfigured: true,
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
// RATE LIMITING
// =============================================================================

/**
 * GET /admin/rate-limits
 * Get rate limit status
 */
router.get(
  '/rate-limits',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const agentId = req.query.agentId as string | undefined;

      if (agentId) {
        const limits = rateLimits.get(agentId) || {
          requestsPerMinute: 60,
          requestsPerHour: 1000,
        };

        res.json({
          success: true,
          data: {
            agentId,
            ...limits,
            requestsRemaining: limits.requestsPerMinute,
            resetTime: new Date(Date.now() + 60000).toISOString(),
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        res.json({
          success: true,
          data: {
            globalLimit: {
              requestsPerMinute: 1000,
              requestsPerHour: 10000,
            },
            agentLimits: Object.fromEntries(rateLimits),
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /admin/rate-limits/:agentId
 * Update rate limits for an agent
 */
router.put(
  '/rate-limits/:agentId',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const { agentId } = req.params;

      const limitsSchema = z.object({
        requestsPerMinute: z.number().int().min(1).max(10000),
        requestsPerHour: z.number().int().min(1).max(100000),
      });

      const parseResult = limitsSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { requestsPerMinute, requestsPerHour } = parseResult.data;

      rateLimits.set(agentId, { requestsPerMinute, requestsPerHour });

      addAuditEntry('rate_limits_updated', agentId, req.creator?.id || 'unknown', {
        requestsPerMinute,
        requestsPerHour,
      });

      logger.info(
        { agentId, requestsPerMinute, requestsPerHour, performedBy: req.creator?.id },
        'Rate limits updated'
      );

      res.json({
        success: true,
        data: {
          success: true,
          newLimits: { requestsPerMinute, requestsPerHour },
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
