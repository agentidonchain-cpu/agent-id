/**
 * Agent007 - Admin Dashboard Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AdminDashboardService,
  resetAdminDashboardService,
} from '../../src/services/admin/dashboard.js';
import { IdentityStatus, VerificationStatus, AlertSeverity } from '../../src/types/identity.js';

describe('AdminDashboardService', () => {
  let adminService: AdminDashboardService;
  let mockIdentities: Map<string, any>;
  let mockSchedules: Map<string, any>;
  let mockAlerts: Map<string, any[]>;
  let mockSamples: Map<string, any[]>;

  beforeEach(() => {
    resetAdminDashboardService();

    // Setup mock data stores
    mockIdentities = new Map();
    mockSchedules = new Map();
    mockAlerts = new Map();
    mockSamples = new Map();

    // Add some test data
    mockIdentities.set('agent-123', {
      status: IdentityStatus.VALIDATED,
      metadata: { displayName: 'Test Agent' },
      agentCore: { model: { provider: 'anthropic', modelId: 'claude-3-sonnet' } },
      createdAt: new Date(),
      validatedAt: new Date(),
    });

    mockIdentities.set('agent-456', {
      status: IdentityStatus.SUSPENDED,
      metadata: { displayName: 'Suspended Agent' },
      agentCore: { model: { provider: 'openai', modelId: 'gpt-4' } },
      createdAt: new Date(),
    });

    mockAlerts.set('agent-123', [
      { id: 'alert-1', severity: AlertSeverity.WARNING, acknowledged: false, createdAt: new Date().toISOString() },
      { id: 'alert-2', severity: AlertSeverity.CRITICAL, acknowledged: true, createdAt: new Date().toISOString() },
    ]);

    adminService = new AdminDashboardService(
      mockIdentities,
      mockSchedules,
      mockAlerts,
      mockSamples
    );

    vi.clearAllMocks();
  });

  // ===========================================================================
  // SYSTEM STATS
  // ===========================================================================

  describe('getSystemStats', () => {
    it('should return system statistics', () => {
      const stats = adminService.getSystemStats();

      expect(stats).toBeDefined();
      expect(stats.totalAgents).toBe(2);
      expect(stats.agentsByStatus[IdentityStatus.VALIDATED]).toBe(1);
      expect(stats.agentsByStatus[IdentityStatus.SUSPENDED]).toBe(1);
    });

    it('should count alerts correctly', () => {
      const stats = adminService.getSystemStats();

      expect(stats.totalAlerts).toBe(2);
      expect(stats.unacknowledgedAlerts).toBe(1);
    });

    it('should include uptime information', () => {
      const stats = adminService.getSystemStats();

      expect(stats.uptimeMs).toBeDefined();
      expect(stats.uptimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // AGENT MANAGEMENT
  // ===========================================================================

  describe('getAgentSummaries', () => {
    it('should return paginated agent list', () => {
      const result = adminService.getAgentSummaries({
        page: 1,
        pageSize: 10,
      });

      expect(result).toBeDefined();
      expect(result.agents).toBeDefined();
      expect(Array.isArray(result.agents)).toBe(true);
      expect(result.total).toBe(2);
    });

    it('should filter by status', () => {
      const result = adminService.getAgentSummaries({
        status: IdentityStatus.VALIDATED,
      });

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].status).toBe(IdentityStatus.VALIDATED);
    });

    it('should sort by specified field', () => {
      const result = adminService.getAgentSummaries({
        sortBy: 'displayName',
        sortOrder: 'asc',
      });

      expect(result.agents).toBeDefined();
    });
  });

  describe('suspendAgent', () => {
    it('should suspend an active agent', () => {
      const result = adminService.suspendAgent(
        'agent-123',
        'Security concern',
        'admin-001'
      );

      expect(result.result).toBe('success');
      expect(mockIdentities.get('agent-123').status).toBe(IdentityStatus.SUSPENDED);
    });

    it('should record reason for suspension', () => {
      const reason = 'Suspicious behavioral drift detected';
      const result = adminService.suspendAgent(
        'agent-123',
        reason,
        'admin-001'
      );

      expect(result.details.reason).toBe(reason);
    });

    it('should fail for unknown agent', () => {
      const result = adminService.suspendAgent(
        'unknown-agent',
        'Test suspension',
        'admin-001'
      );

      expect(result.result).toBe('failure');
      expect(result.error).toContain('not found');
    });
  });

  describe('revokeAgent', () => {
    it('should revoke an agent', () => {
      const result = adminService.revokeAgent(
        'agent-123',
        'Policy violation',
        'admin-001'
      );

      expect(result.result).toBe('success');
      expect(mockIdentities.get('agent-123').status).toBe(IdentityStatus.REVOKED);
    });
  });

  describe('restoreAgent', () => {
    it('should restore a suspended agent', () => {
      const result = adminService.restoreAgent(
        'agent-456', // This one is suspended
        'admin-001'
      );

      expect(result.result).toBe('success');
      expect(mockIdentities.get('agent-456').status).toBe(IdentityStatus.VALIDATED);
    });

    it('should fail for active agents', () => {
      const result = adminService.restoreAgent(
        'agent-123', // This one is validated (active)
        'admin-001'
      );

      expect(result.result).toBe('failure');
    });
  });

  describe('archiveAgent', () => {
    it('should archive an agent', () => {
      const result = adminService.archiveAgent('agent-123', 'admin-001');

      expect(result.result).toBe('success');
      expect(mockIdentities.get('agent-123').status).toBe(IdentityStatus.ARCHIVED);
    });
  });

  // ===========================================================================
  // BULK ACTIONS
  // ===========================================================================

  describe('performBulkAction', () => {
    it('should suspend multiple agents', () => {
      // Add more agents to bulk suspend
      mockIdentities.set('agent-789', {
        status: IdentityStatus.VALIDATED,
        metadata: { displayName: 'Agent 3' },
      });

      const result = adminService.performBulkAction(
        {
          action: 'suspend_agent',
          targetIds: ['agent-123', 'agent-789'],
          options: { reason: 'Bulk security update' },
        },
        'admin-001'
      );

      expect(result.totalTargets).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should return details for failed operations', () => {
      const result = adminService.performBulkAction(
        {
          action: 'suspend_agent',
          targetIds: ['unknown-1', 'unknown-2'],
          options: { reason: 'Testing failures' },
        },
        'admin-001'
      );

      expect(result.failed).toBe(2);
      expect(result.results[0].success).toBe(false);
    });
  });

  // ===========================================================================
  // ALERTS
  // ===========================================================================

  describe('getAllAlerts', () => {
    it('should return all alerts', () => {
      const result = adminService.getAllAlerts();

      expect(result.alerts).toBeDefined();
      expect(Array.isArray(result.alerts)).toBe(true);
      expect(result.total).toBe(2);
    });

    it('should filter alerts by severity', () => {
      const result = adminService.getAllAlerts({
        severity: AlertSeverity.CRITICAL,
      });

      expect(result.alerts.length).toBe(1);
      result.alerts.forEach((alert) => {
        expect(alert.severity).toBe(AlertSeverity.CRITICAL);
      });
    });

    it('should filter unacknowledged alerts', () => {
      const result = adminService.getAllAlerts({
        unacknowledgedOnly: true,
      });

      result.alerts.forEach((alert) => {
        expect(alert.acknowledged).toBe(false);
      });
    });
  });

  describe('clearAlerts', () => {
    it('should clear alerts for specific agent', () => {
      const result = adminService.clearAlerts('agent-123', 'admin-001');

      expect(result.result).toBe('success');
      expect(mockAlerts.get('agent-123')).toHaveLength(0);
    });

    it('should fail when no alerts exist', () => {
      const result = adminService.clearAlerts('agent-no-alerts', 'admin-001');

      expect(result.result).toBe('failure');
    });
  });

  describe('acknowledgeAllAlerts', () => {
    it('should acknowledge all unacknowledged alerts', () => {
      const count = adminService.acknowledgeAllAlerts('agent-123', 'admin-001');

      expect(count).toBe(1); // Only one was unacknowledged

      const alerts = mockAlerts.get('agent-123');
      expect(alerts?.every((a) => a.acknowledged)).toBe(true);
    });
  });

  // ===========================================================================
  // AUDIT LOG
  // ===========================================================================

  describe('getAuditLog', () => {
    it('should return audit log entries after actions', () => {
      // Perform some actions first
      adminService.suspendAgent('agent-123', 'Test', 'admin-001');

      const log = adminService.getAuditLog();

      expect(log).toBeDefined();
      expect(Array.isArray(log)).toBe(true);
      expect(log.length).toBeGreaterThan(0);
    });

    it('should filter by action type', () => {
      adminService.suspendAgent('agent-123', 'Test', 'admin-001');
      adminService.clearAlerts('agent-123', 'admin-001');

      const log = adminService.getAuditLog({
        action: 'suspend_agent',
      });

      log.forEach((entry) => {
        expect(entry.action).toBe('suspend_agent');
      });
    });

    it('should filter by actor', () => {
      adminService.suspendAgent('agent-123', 'Test', 'admin-001');

      const log = adminService.getAuditLog({
        actor: 'admin-001',
      });

      log.forEach((entry) => {
        expect(entry.actor).toBe('admin-001');
      });
    });
  });

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  describe('checkHealth', () => {
    it('should return system health status', async () => {
      const health = await adminService.checkHealth();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      expect(health.components).toBeDefined();
    });

    it('should check database health', async () => {
      const health = await adminService.checkHealth();

      expect(health.components.database).toBeDefined();
      expect(health.components.database.status).toBeDefined();
    });

    it('should include timestamp', async () => {
      const health = await adminService.checkHealth();

      expect(health.lastCheckAt).toBeDefined();
    });
  });

  // ===========================================================================
  // EXPORTS
  // ===========================================================================

  describe('exportAgentData', () => {
    it('should export agent data', () => {
      const data = adminService.exportAgentData('agent-123');

      expect(data).not.toBeNull();
      expect(data?.identity).toBeDefined();
      expect(data?.exportedAt).toBeDefined();
    });

    it('should return null for unknown agent', () => {
      const data = adminService.exportAgentData('unknown-agent');

      expect(data).toBeNull();
    });

    it('should include alerts in export', () => {
      const data = adminService.exportAgentData('agent-123');

      expect(data?.alerts).toBeDefined();
      expect(Array.isArray(data?.alerts)).toBe(true);
    });
  });

  describe('exportSystemStats', () => {
    it('should export system statistics', () => {
      const exported = adminService.exportSystemStats();

      expect(exported).toBeDefined();
      expect(exported.exportedAt).toBeDefined();
      expect(exported.stats).toBeDefined();
    });
  });
});
