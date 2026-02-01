/**
 * Agent007 - Multi-Agent Verification Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MultiAgentVerificationService,
  resetMultiAgentVerificationService,
  type MultiAgentVerificationRequest,
} from '../../src/services/verification/multi-agent.js';
import { IdentityStatus, AlertSeverity, AutonomyClassification } from '../../src/types/identity.js';

// Mock the continuous verification service
vi.mock('../../src/services/verification/continuous.js', () => ({
  getContinuousVerificationService: vi.fn(() => ({
    runVerification: vi.fn(async () => ({
      passed: true,
      overallScore: 0.85,
      alerts: [],
      checks: [],
      timestamp: new Date().toISOString(),
    })),
  })),
}));

// Mock the advanced autonomy detector
vi.mock('../../src/services/autonomy/advanced-detector.js', () => ({
  getAdvancedAutonomyDetector: vi.fn(() => ({
    analyze: vi.fn(() => ({
      autonomyScore: 0.75,
      classification: 'fully_autonomous',
    })),
  })),
}));

describe('MultiAgentVerificationService', () => {
  let service: MultiAgentVerificationService;
  let mockSamples: Map<string, any[]>;
  let mockIdentities: Map<string, any>;

  beforeEach(() => {
    resetMultiAgentVerificationService();

    // Setup mock data stores
    mockSamples = new Map();
    mockIdentities = new Map();

    // Add test agents with samples
    mockIdentities.set('agent-001', {
      status: IdentityStatus.VALIDATED,
      metadata: { displayName: 'Q' },
      agentCore: { model: { provider: 'anthropic', modelId: 'claude-3-sonnet' } },
    });
    mockSamples.set('agent-001', Array(10).fill(null).map((_, i) => ({
      content: `Response ${i}`,
      latencyMs: 100 + i * 10,
      timestamp: new Date(),
    })));

    mockIdentities.set('agent-002', {
      status: IdentityStatus.VALIDATED,
      metadata: { displayName: 'M' },
      agentCore: { model: { provider: 'openai', modelId: 'gpt-4' } },
    });
    mockSamples.set('agent-002', Array(10).fill(null).map((_, i) => ({
      content: `Response ${i}`,
      latencyMs: 120 + i * 5,
      timestamp: new Date(),
    })));

    mockIdentities.set('agent-003', {
      status: IdentityStatus.VALIDATED,
      metadata: { displayName: 'Moneypenny' },
      agentCore: { model: { provider: 'google', modelId: 'gemini-1.5-flash' } },
    });
    mockSamples.set('agent-003', Array(10).fill(null).map((_, i) => ({
      content: `Response ${i}`,
      latencyMs: 90 + i * 8,
      timestamp: new Date(),
    })));

    service = new MultiAgentVerificationService(mockSamples, mockIdentities);

    vi.clearAllMocks();
  });

  // ===========================================================================
  // BATCH VERIFICATION
  // ===========================================================================

  describe('verifyMultiple', () => {
    it('should verify multiple agents in batch', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-002', 'agent-003'],
      };

      const result = await service.verifyMultiple(request);

      expect(result).toBeDefined();
      expect(result.batchId).toBeDefined();
      expect(result.totalRequested).toBe(3);
      expect(result.results).toHaveLength(3);
    });

    it('should return individual results for each agent', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-002'],
      };

      const result = await service.verifyMultiple(request);

      expect(result.results[0].identityHash).toBe('agent-001');
      expect(result.results[1].identityHash).toBe('agent-002');
    });

    it('should handle unknown agents', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['unknown-agent'],
      };

      const result = await service.verifyMultiple(request);

      expect(result.failedCount).toBe(1);
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].reason).toContain('not found');
    });

    it('should run verifications in parallel by default', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-002', 'agent-003'],
        options: { parallel: true },
      };

      const result = await service.verifyMultiple(request);

      expect(result.durationMs).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should run verifications sequentially when parallel is false', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-002'],
        options: { parallel: false },
      };

      const result = await service.verifyMultiple(request);

      expect(result.totalRequested).toBe(2);
    });

    it('should skip agents without samples when skipNoSamples is true', async () => {
      // Add agent with insufficient samples
      mockIdentities.set('agent-no-samples', {
        status: IdentityStatus.VALIDATED,
        metadata: { displayName: 'NoSamples' },
        agentCore: { model: { provider: 'anthropic', modelId: 'claude-3-sonnet' } },
      });
      mockSamples.set('agent-no-samples', []);

      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-no-samples'],
        options: { skipNoSamples: true },
      };

      const result = await service.verifyMultiple(request);

      expect(result.skippedCount).toBe(1);
      expect(result.results.find((r) => r.identityHash === 'agent-no-samples')?.status).toBe('skipped');
    });
  });

  // ===========================================================================
  // COMPARISON ANALYSIS
  // ===========================================================================

  describe('comparison analysis', () => {
    it('should include comparison analysis when requested', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-002'],
        options: { includeComparison: true },
      };

      const result = await service.verifyMultiple(request);

      expect(result.comparison).toBeDefined();
      expect(result.comparison?.ranking).toBeDefined();
      expect(result.comparison?.scoreDistribution).toBeDefined();
    });

    it('should rank agents by score', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-002', 'agent-003'],
        options: { includeComparison: true },
      };

      const result = await service.verifyMultiple(request);

      expect(result.comparison?.ranking).toHaveLength(3);
      expect(result.comparison?.ranking[0].rank).toBe(1);
    });

    it('should calculate score distribution', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-002'],
        options: { includeComparison: true },
      };

      const result = await service.verifyMultiple(request);

      expect(result.comparison?.scoreDistribution.min).toBeDefined();
      expect(result.comparison?.scoreDistribution.max).toBeDefined();
      expect(result.comparison?.scoreDistribution.mean).toBeDefined();
    });
  });

  // ===========================================================================
  // CORRELATION ANALYSIS
  // ===========================================================================

  describe('correlation analysis', () => {
    it('should include correlation analysis when requested', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-002'],
        options: { includeCorrelation: true },
      };

      const result = await service.verifyMultiple(request);

      expect(result.correlation).toBeDefined();
      expect(result.correlation?.similarGroups).toBeDefined();
      expect(result.correlation?.clusters).toBeDefined();
    });

    it('should detect timing correlations', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-002', 'agent-003'],
        options: { includeCorrelation: true },
      };

      const result = await service.verifyMultiple(request);

      expect(result.correlation?.timingCorrelations).toBeDefined();
    });
  });

  // ===========================================================================
  // AGGREGATED ALERTS
  // ===========================================================================

  describe('aggregated alerts', () => {
    it('should aggregate alerts from multiple verifications', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-002'],
      };

      const result = await service.verifyMultiple(request);

      expect(result.aggregatedAlerts).toBeDefined();
      expect(result.aggregatedAlerts.total).toBeGreaterThanOrEqual(0);
      expect(result.aggregatedAlerts.bySeverity).toBeDefined();
    });

    it('should categorize alerts by severity', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001'],
      };

      const result = await service.verifyMultiple(request);

      expect(result.aggregatedAlerts.bySeverity[AlertSeverity.INFO]).toBeGreaterThanOrEqual(0);
      expect(result.aggregatedAlerts.bySeverity[AlertSeverity.WARNING]).toBeGreaterThanOrEqual(0);
      expect(result.aggregatedAlerts.bySeverity[AlertSeverity.CRITICAL]).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // BATCH STATS
  // ===========================================================================

  describe('batch statistics', () => {
    it('should calculate batch statistics', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-002'],
      };

      const result = await service.verifyMultiple(request);

      expect(result.stats).toBeDefined();
      expect(result.stats.avgDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.stats.passRate).toBeGreaterThanOrEqual(0);
    });

    it('should track pass rate', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-002'],
      };

      const result = await service.verifyMultiple(request);

      expect(result.stats.passRate).toBeGreaterThanOrEqual(0);
      expect(result.stats.passRate).toBeLessThanOrEqual(1);
    });
  });

  // ===========================================================================
  // TIMING
  // ===========================================================================

  describe('timing', () => {
    it('should track total duration', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001', 'agent-002'],
      };

      const result = await service.verifyMultiple(request);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
    });

    it('should track individual agent durations', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001'],
      };

      const result = await service.verifyMultiple(request);

      expect(result.results[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle single agent verification', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001'],
      };

      const result = await service.verifyMultiple(request);

      expect(result.totalRequested).toBe(1);
      expect(result.results).toHaveLength(1);
    });

    it('should not include comparison for single agent', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['agent-001'],
        options: { includeComparison: true },
      };

      const result = await service.verifyMultiple(request);

      // Comparison requires at least 2 agents
      expect(result.comparison).toBeUndefined();
    });

    it('should handle all agents failing', async () => {
      const request: MultiAgentVerificationRequest = {
        identityHashes: ['unknown-1', 'unknown-2'],
      };

      const result = await service.verifyMultiple(request);

      expect(result.failedCount).toBe(2);
      expect(result.successfulCount).toBe(0);
    });
  });
});
