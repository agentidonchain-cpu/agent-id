/**
 * Agent007 - Admin Dashboard Service
 *
 * Provides administrative functions for managing the Agent007 system.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  IdentityStatus,
  VerificationStatus,
  AlertSeverity,
  type AgentIdentity,
  type VerificationSchedule,
  type VerificationAlert,
} from '../../types/identity.js';
import { logger } from '../../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface SystemStats {
  /** Total registered agents */
  totalAgents: number;

  /** Agents by status */
  agentsByStatus: Record<IdentityStatus, number>;

  /** Total verifications run */
  totalVerifications: number;

  /** Active verification schedules */
  activeSchedules: number;

  /** Total alerts */
  totalAlerts: number;

  /** Unacknowledged alerts */
  unacknowledgedAlerts: number;

  /** Alerts by severity */
  alertsBySeverity: Record<AlertSeverity, number>;

  /** System uptime in ms */
  uptimeMs: number;

  /** Last stats update */
  updatedAt: string;
}

export interface AgentSummary {
  identityHash: string;
  displayName: string;
  status: IdentityStatus;
  provider: string;
  modelId: string;
  createdAt: string;
  validatedAt?: string;
  lastVerifiedAt?: string;
  verificationStatus?: VerificationStatus;
  autonomyScore?: number;
  alertCount: number;
}

export interface AdminAction {
  id: string;
  action: AdminActionType;
  targetType: 'agent' | 'schedule' | 'system';
  targetId?: string;
  performedBy: string;
  performedAt: string;
  details: Record<string, unknown>;
  result: 'success' | 'failure';
  error?: string;
}

export type AdminActionType =
  | 'suspend_agent'
  | 'revoke_agent'
  | 'restore_agent'
  | 'archive_agent'
  | 'force_verify'
  | 'stop_verification'
  | 'clear_alerts'
  | 'update_config'
  | 'bulk_action'
  | 'export_data'
  | 'system_maintenance';

export interface BulkActionRequest {
  action: AdminActionType;
  targetIds: string[];
  options?: Record<string, unknown>;
}

export interface BulkActionResult {
  totalTargets: number;
  successful: number;
  failed: number;
  results: Array<{
    targetId: string;
    success: boolean;
    error?: string;
  }>;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: AdminActionType;
  actor: string;
  targetType: string;
  targetId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    api: ComponentHealth;
    database: ComponentHealth;
    redis: ComponentHealth;
    providers: ComponentHealth;
  };
  lastCheckAt: string;
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// ADMIN DASHBOARD SERVICE
// =============================================================================

export class AdminDashboardService {
  private startTime: Date;
  private actionLog: AdminAction[] = [];
  private auditLog: AuditLogEntry[] = [];

  // References to data stores (injected)
  private identities: Map<string, any>;
  private schedules: Map<string, any>;
  private alerts: Map<string, any[]>;
  private samples: Map<string, any[]>;

  constructor(
    identities: Map<string, any>,
    schedules: Map<string, any>,
    alerts: Map<string, any[]>,
    samples: Map<string, any[]>
  ) {
    this.startTime = new Date();
    this.identities = identities;
    this.schedules = schedules;
    this.alerts = alerts;
    this.samples = samples;
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get system-wide statistics
   */
  getSystemStats(): SystemStats {
    const agentsByStatus: Record<IdentityStatus, number> = {
      [IdentityStatus.PENDING]: 0,
      [IdentityStatus.VALIDATING]: 0,
      [IdentityStatus.VALIDATED]: 0,
      [IdentityStatus.SUSPENDED]: 0,
      [IdentityStatus.REVOKED]: 0,
      [IdentityStatus.ARCHIVED]: 0,
    };

    for (const identity of this.identities.values()) {
      const status = identity.status as IdentityStatus;
      if (status in agentsByStatus) {
        agentsByStatus[status]++;
      }
    }

    const alertsBySeverity: Record<AlertSeverity, number> = {
      [AlertSeverity.INFO]: 0,
      [AlertSeverity.WARNING]: 0,
      [AlertSeverity.CRITICAL]: 0,
    };

    let totalAlerts = 0;
    let unacknowledgedAlerts = 0;

    for (const agentAlerts of this.alerts.values()) {
      for (const alert of agentAlerts) {
        totalAlerts++;
        if (!alert.acknowledged) unacknowledgedAlerts++;
        const severity = alert.severity as AlertSeverity;
        if (severity in alertsBySeverity) {
          alertsBySeverity[severity]++;
        }
      }
    }

    let activeSchedules = 0;
    for (const schedule of this.schedules.values()) {
      if (schedule.schedule?.status === VerificationStatus.ACTIVE) {
        activeSchedules++;
      }
    }

    return {
      totalAgents: this.identities.size,
      agentsByStatus,
      totalVerifications: this.getTotalVerifications(),
      activeSchedules,
      totalAlerts,
      unacknowledgedAlerts,
      alertsBySeverity,
      uptimeMs: Date.now() - this.startTime.getTime(),
      updatedAt: new Date().toISOString(),
    };
  }

  private getTotalVerifications(): number {
    let total = 0;
    for (const schedule of this.schedules.values()) {
      total += schedule.schedule?.totalVerifications || 0;
    }
    return total;
  }

  // ===========================================================================
  // AGENT MANAGEMENT
  // ===========================================================================

  /**
   * Get all agents with summary info
   */
  getAgentSummaries(options: {
    status?: IdentityStatus;
    page?: number;
    pageSize?: number;
    sortBy?: 'createdAt' | 'displayName' | 'status' | 'alertCount';
    sortOrder?: 'asc' | 'desc';
  } = {}): { agents: AgentSummary[]; total: number } {
    const { status, page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc' } = options;

    let agents: AgentSummary[] = [];

    for (const [hash, identity] of this.identities) {
      if (status && identity.status !== status) continue;

      const schedule = this.schedules.get(hash);
      const agentAlerts = this.alerts.get(hash) || [];

      agents.push({
        identityHash: hash,
        displayName: identity.metadata?.displayName || 'Unknown',
        status: identity.status,
        provider: identity.agentCore?.model?.provider || 'unknown',
        modelId: identity.agentCore?.model?.modelId || 'unknown',
        createdAt: identity.createdAt?.toISOString?.() || new Date().toISOString(),
        validatedAt: identity.validatedAt?.toISOString?.(),
        lastVerifiedAt: schedule?.schedule?.lastVerificationAt,
        verificationStatus: schedule?.schedule?.status,
        autonomyScore: undefined, // Would come from analysis
        alertCount: agentAlerts.length,
      });
    }

    // Sort
    agents.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'displayName':
          comparison = a.displayName.localeCompare(b.displayName);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'alertCount':
          comparison = a.alertCount - b.alertCount;
          break;
        case 'createdAt':
        default:
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    const total = agents.length;
    const start = (page - 1) * pageSize;
    agents = agents.slice(start, start + pageSize);

    return { agents, total };
  }

  /**
   * Suspend an agent
   */
  suspendAgent(identityHash: string, reason: string, performedBy: string): AdminAction {
    const identity = this.identities.get(identityHash);
    if (!identity) {
      return this.recordAction('suspend_agent', 'agent', identityHash, performedBy, { reason }, 'failure', 'Agent not found');
    }

    const previousStatus = identity.status;
    identity.status = IdentityStatus.SUSPENDED;
    identity.suspendedAt = new Date();

    logger.info({ identityHash, reason, performedBy }, 'Agent suspended');

    return this.recordAction('suspend_agent', 'agent', identityHash, performedBy, {
      reason,
      previousStatus,
    }, 'success');
  }

  /**
   * Revoke an agent
   */
  revokeAgent(identityHash: string, reason: string, performedBy: string): AdminAction {
    const identity = this.identities.get(identityHash);
    if (!identity) {
      return this.recordAction('revoke_agent', 'agent', identityHash, performedBy, { reason }, 'failure', 'Agent not found');
    }

    const previousStatus = identity.status;
    identity.status = IdentityStatus.REVOKED;
    identity.revokedAt = new Date();

    // Stop any active verification
    const schedule = this.schedules.get(identityHash);
    if (schedule?.timerId) {
      clearInterval(schedule.timerId);
      schedule.schedule.status = VerificationStatus.STOPPED;
    }

    logger.warn({ identityHash, reason, performedBy }, 'Agent revoked');

    return this.recordAction('revoke_agent', 'agent', identityHash, performedBy, {
      reason,
      previousStatus,
    }, 'success');
  }

  /**
   * Restore a suspended/revoked agent
   */
  restoreAgent(identityHash: string, performedBy: string): AdminAction {
    const identity = this.identities.get(identityHash);
    if (!identity) {
      return this.recordAction('restore_agent', 'agent', identityHash, performedBy, {}, 'failure', 'Agent not found');
    }

    if (identity.status !== IdentityStatus.SUSPENDED && identity.status !== IdentityStatus.REVOKED) {
      return this.recordAction('restore_agent', 'agent', identityHash, performedBy, {}, 'failure', 'Agent is not suspended or revoked');
    }

    const previousStatus = identity.status;
    identity.status = IdentityStatus.VALIDATED;
    identity.suspendedAt = undefined;
    identity.revokedAt = undefined;

    logger.info({ identityHash, performedBy }, 'Agent restored');

    return this.recordAction('restore_agent', 'agent', identityHash, performedBy, {
      previousStatus,
    }, 'success');
  }

  /**
   * Archive an agent
   */
  archiveAgent(identityHash: string, performedBy: string): AdminAction {
    const identity = this.identities.get(identityHash);
    if (!identity) {
      return this.recordAction('archive_agent', 'agent', identityHash, performedBy, {}, 'failure', 'Agent not found');
    }

    const previousStatus = identity.status;
    identity.status = IdentityStatus.ARCHIVED;
    identity.archivedAt = new Date();

    // Stop any active verification
    const schedule = this.schedules.get(identityHash);
    if (schedule?.timerId) {
      clearInterval(schedule.timerId);
      schedule.schedule.status = VerificationStatus.STOPPED;
    }

    logger.info({ identityHash, performedBy }, 'Agent archived');

    return this.recordAction('archive_agent', 'agent', identityHash, performedBy, {
      previousStatus,
    }, 'success');
  }

  // ===========================================================================
  // BULK ACTIONS
  // ===========================================================================

  /**
   * Perform bulk action on multiple agents
   */
  performBulkAction(request: BulkActionRequest, performedBy: string): BulkActionResult {
    const results: BulkActionResult['results'] = [];

    for (const targetId of request.targetIds) {
      try {
        let action: AdminAction;

        switch (request.action) {
          case 'suspend_agent':
            action = this.suspendAgent(targetId, request.options?.reason as string || 'Bulk action', performedBy);
            break;
          case 'revoke_agent':
            action = this.revokeAgent(targetId, request.options?.reason as string || 'Bulk action', performedBy);
            break;
          case 'restore_agent':
            action = this.restoreAgent(targetId, performedBy);
            break;
          case 'archive_agent':
            action = this.archiveAgent(targetId, performedBy);
            break;
          case 'clear_alerts':
            action = this.clearAlerts(targetId, performedBy);
            break;
          default:
            throw new Error(`Unsupported bulk action: ${request.action}`);
        }

        results.push({
          targetId,
          success: action.result === 'success',
          error: action.error,
        });
      } catch (error) {
        results.push({
          targetId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successful = results.filter((r) => r.success).length;

    logger.info(
      { action: request.action, total: request.targetIds.length, successful, performedBy },
      'Bulk action completed'
    );

    return {
      totalTargets: request.targetIds.length,
      successful,
      failed: request.targetIds.length - successful,
      results,
    };
  }

  // ===========================================================================
  // ALERTS
  // ===========================================================================

  /**
   * Get all alerts across all agents
   */
  getAllAlerts(options: {
    severity?: AlertSeverity;
    unacknowledgedOnly?: boolean;
    limit?: number;
  } = {}): { alerts: Array<VerificationAlert & { identityHash: string }>; total: number } {
    const { severity, unacknowledgedOnly = false, limit = 100 } = options;

    let allAlerts: Array<VerificationAlert & { identityHash: string }> = [];

    for (const [hash, agentAlerts] of this.alerts) {
      for (const alert of agentAlerts) {
        if (severity && alert.severity !== severity) continue;
        if (unacknowledgedOnly && alert.acknowledged) continue;

        allAlerts.push({ ...alert, identityHash: hash });
      }
    }

    // Sort by creation time (newest first)
    allAlerts.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = allAlerts.length;
    allAlerts = allAlerts.slice(0, limit);

    return { alerts: allAlerts, total };
  }

  /**
   * Clear all alerts for an agent
   */
  clearAlerts(identityHash: string, performedBy: string): AdminAction {
    const agentAlerts = this.alerts.get(identityHash);
    if (!agentAlerts || agentAlerts.length === 0) {
      return this.recordAction('clear_alerts', 'agent', identityHash, performedBy, {}, 'failure', 'No alerts found');
    }

    const clearedCount = agentAlerts.length;
    this.alerts.set(identityHash, []);

    logger.info({ identityHash, clearedCount, performedBy }, 'Alerts cleared');

    return this.recordAction('clear_alerts', 'agent', identityHash, performedBy, {
      clearedCount,
    }, 'success');
  }

  /**
   * Acknowledge all alerts for an agent
   */
  acknowledgeAllAlerts(identityHash: string, performedBy: string): number {
    const agentAlerts = this.alerts.get(identityHash);
    if (!agentAlerts) return 0;

    let count = 0;
    for (const alert of agentAlerts) {
      if (!alert.acknowledged) {
        alert.acknowledged = true;
        count++;
      }
    }

    if (count > 0) {
      logger.info({ identityHash, count, performedBy }, 'Alerts acknowledged');
    }

    return count;
  }

  // ===========================================================================
  // AUDIT LOG
  // ===========================================================================

  /**
   * Get audit log entries
   */
  getAuditLog(options: {
    action?: AdminActionType;
    actor?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}): AuditLogEntry[] {
    const { action, actor, startDate, endDate, limit = 100 } = options;

    let entries = [...this.auditLog];

    if (action) {
      entries = entries.filter((e) => e.action === action);
    }

    if (actor) {
      entries = entries.filter((e) => e.actor === actor);
    }

    if (startDate) {
      entries = entries.filter((e) => new Date(e.timestamp) >= startDate);
    }

    if (endDate) {
      entries = entries.filter((e) => new Date(e.timestamp) <= endDate);
    }

    // Sort by timestamp (newest first)
    entries.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return entries.slice(0, limit);
  }

  /**
   * Record an admin action
   */
  private recordAction(
    action: AdminActionType,
    targetType: 'agent' | 'schedule' | 'system',
    targetId: string | undefined,
    performedBy: string,
    details: Record<string, unknown>,
    result: 'success' | 'failure',
    error?: string
  ): AdminAction {
    const adminAction: AdminAction = {
      id: uuidv4(),
      action,
      targetType,
      targetId,
      performedBy,
      performedAt: new Date().toISOString(),
      details,
      result,
      error,
    };

    this.actionLog.push(adminAction);

    // Also add to audit log
    this.auditLog.push({
      id: uuidv4(),
      timestamp: adminAction.performedAt,
      action,
      actor: performedBy,
      targetType,
      targetId,
      details: { ...details, result, error },
    });

    // Keep logs bounded
    if (this.actionLog.length > 1000) this.actionLog.shift();
    if (this.auditLog.length > 5000) this.auditLog.shift();

    return adminAction;
  }

  // ===========================================================================
  // SYSTEM HEALTH
  // ===========================================================================

  /**
   * Check system health
   */
  async checkHealth(): Promise<SystemHealth> {
    const apiHealth: ComponentHealth = {
      status: 'healthy',
      latencyMs: 0,
    };

    // Database check (simplified - in production would actually check DB)
    const dbHealth: ComponentHealth = {
      status: this.identities.size >= 0 ? 'healthy' : 'unhealthy',
      latencyMs: 5,
    };

    // Redis check (simplified)
    const redisHealth: ComponentHealth = {
      status: 'healthy',
      latencyMs: 2,
    };

    // Providers check
    const providersHealth: ComponentHealth = {
      status: 'healthy',
      details: { configuredProviders: 0 },
    };

    // Determine overall status
    const components = [apiHealth, dbHealth, redisHealth, providersHealth];
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (components.some((c) => c.status === 'unhealthy')) {
      status = 'unhealthy';
    } else if (components.some((c) => c.status === 'degraded')) {
      status = 'degraded';
    }

    return {
      status,
      components: {
        api: apiHealth,
        database: dbHealth,
        redis: redisHealth,
        providers: providersHealth,
      },
      lastCheckAt: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // DATA EXPORT
  // ===========================================================================

  /**
   * Export agent data
   */
  exportAgentData(identityHash: string): Record<string, unknown> | null {
    const identity = this.identities.get(identityHash);
    if (!identity) return null;

    const schedule = this.schedules.get(identityHash);
    const agentAlerts = this.alerts.get(identityHash) || [];
    const agentSamples = this.samples.get(identityHash) || [];

    return {
      identity: {
        hash: identityHash,
        status: identity.status,
        metadata: identity.metadata,
        createdAt: identity.createdAt,
        validatedAt: identity.validatedAt,
      },
      verification: schedule?.schedule || null,
      alerts: agentAlerts,
      sampleCount: agentSamples.length,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Export system-wide statistics
   */
  exportSystemStats(): Record<string, unknown> {
    return {
      stats: this.getSystemStats(),
      recentActions: this.actionLog.slice(-50),
      exportedAt: new Date().toISOString(),
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let adminDashboardInstance: AdminDashboardService | null = null;

export function getAdminDashboardService(
  identities: Map<string, any>,
  schedules: Map<string, any>,
  alerts: Map<string, any[]>,
  samples: Map<string, any[]>
): AdminDashboardService {
  if (!adminDashboardInstance) {
    adminDashboardInstance = new AdminDashboardService(identities, schedules, alerts, samples);
  }
  return adminDashboardInstance;
}

export function resetAdminDashboardService(): void {
  adminDashboardInstance = null;
}
