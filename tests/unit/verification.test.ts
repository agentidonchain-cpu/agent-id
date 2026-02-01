/**
 * Agent007 - Continuous Verification Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ContinuousVerificationService,
  getContinuousVerificationService,
  resetContinuousVerificationService,
} from '../../src/services/verification/continuous.js';
import {
  VerificationCheckType,
  VerificationStatus,
  AlertSeverity,
  ModelProvider,
  type AgentCoreIdentity,
  type BehavioralFingerprint,
} from '../../src/types/identity.js';
import type { ResponseSample } from '../../src/services/autonomy/fingerprint.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createMockAgentCore = (): AgentCoreIdentity => ({
  systemPrompt: {
    content: 'You are Q, a brilliant tech specialist AI assistant.',
    hash: 'abc123def456',
    version: '1.0',
    createdAt: new Date().toISOString(),
  },
  model: {
    provider: ModelProvider.ANTHROPIC,
    modelId: 'claude-3-sonnet-20240229',
    apiKeyHash: 'hashed_key_123',
    apiEndpoint: 'https://api.anthropic.com/v1/messages',
    authMethod: 'bearer',
  },
  parameters: {
    temperature: 0.7,
    maxTokens: 4096,
  },
  tools: [],
});

const createMockSamples = (count: number, baseLatency: number = 1500): ResponseSample[] => {
  const samples: ResponseSample[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    samples.push({
      content: `This is response ${i}. I am Q, your tech specialist. Let me help you with that gadget.`,
      latencyMs: baseLatency + Math.random() * 500 - 250,
      timestamp: new Date(now - i * 3600000), // 1 hour apart
      prompt: `Question ${i}`,
    });
  }

  return samples;
};

const createMockFingerprint = (): BehavioralFingerprint => ({
  latency: {
    mean: 1500,
    stdDev: 200,
    p50: 1400,
    p95: 1900,
    p99: 2100,
    sampleCount: 50,
  },
  vocabulary: {
    uniqueWordCount: 500,
    avgSentenceLength: 15,
    readabilityScore: 60,
    topNgrams: [
      { ngram: 'tech specialist', frequency: 10 },
      { ngram: 'gadget', frequency: 8 },
    ],
    typeTokenRatio: 0.65,
  },
  style: {
    emojiUsage: 0.02,
    punctuationPattern: 'standard',
    capitalizationStyle: 'standard',
    formattingPreferences: ['paragraphs', 'lists'],
    avgParagraphLength: 50,
  },
  consistencyScore: 0.85,
  sampleSize: 50,
  isBaseline: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// =============================================================================
// TESTS
// =============================================================================

describe('ContinuousVerificationService', () => {
  let service: ContinuousVerificationService;
  let responseSamples: Map<string, ResponseSample[]>;
  const testIdentityHash = 'a'.repeat(64);

  beforeEach(() => {
    responseSamples = new Map();
    service = new ContinuousVerificationService(responseSamples);
    vi.useFakeTimers();
  });

  afterEach(() => {
    service.stopAll();
    vi.useRealTimers();
    resetContinuousVerificationService();
  });

  // ===========================================================================
  // SCHEDULE MANAGEMENT
  // ===========================================================================

  describe('scheduleVerification', () => {
    it('should create a verification schedule', () => {
      const agentCore = createMockAgentCore();

      const schedule = service.scheduleVerification(testIdentityHash, agentCore, {
        intervalMs: 3600000,
      });

      expect(schedule.identityHash).toBe(testIdentityHash);
      expect(schedule.status).toBe(VerificationStatus.ACTIVE);
      expect(schedule.intervalMs).toBe(3600000);
      expect(schedule.totalVerifications).toBe(0);
      expect(schedule.nextVerificationAt).toBeDefined();
    });

    it('should enforce minimum interval', () => {
      const agentCore = createMockAgentCore();

      const schedule = service.scheduleVerification(testIdentityHash, agentCore, {
        intervalMs: 1000, // Too short
      });

      expect(schedule.intervalMs).toBe(60000); // Minimum
    });

    it('should enforce maximum interval', () => {
      const agentCore = createMockAgentCore();

      const schedule = service.scheduleVerification(testIdentityHash, agentCore, {
        intervalMs: 999999999, // Too long
      });

      expect(schedule.intervalMs).toBe(86400000); // Maximum (24h)
    });

    it('should store webhook configuration', () => {
      const agentCore = createMockAgentCore();

      const schedule = service.scheduleVerification(testIdentityHash, agentCore, {
        webhookUrl: 'https://example.com/webhook',
        webhookSecret: 'supersecretkey123',
      });

      expect(schedule.webhookUrl).toBe('https://example.com/webhook');
      expect(schedule.webhookSecret).toBe('supersecretkey123');
    });
  });

  describe('stopVerification', () => {
    it('should stop a scheduled verification', () => {
      const agentCore = createMockAgentCore();
      service.scheduleVerification(testIdentityHash, agentCore);

      const stopped = service.stopVerification(testIdentityHash);

      expect(stopped).toBe(true);
      const status = service.getScheduleStatus(testIdentityHash);
      expect(status?.status).toBe(VerificationStatus.STOPPED);
    });

    it('should return false for non-existent schedule', () => {
      const stopped = service.stopVerification('nonexistent');
      expect(stopped).toBe(false);
    });
  });

  describe('pauseVerification', () => {
    it('should pause a scheduled verification', () => {
      const agentCore = createMockAgentCore();
      service.scheduleVerification(testIdentityHash, agentCore);

      const paused = service.pauseVerification(testIdentityHash);

      expect(paused).toBe(true);
      const status = service.getScheduleStatus(testIdentityHash);
      expect(status?.status).toBe(VerificationStatus.PAUSED);
    });
  });

  describe('resumeVerification', () => {
    it('should resume a paused verification', () => {
      const agentCore = createMockAgentCore();
      service.scheduleVerification(testIdentityHash, agentCore);
      service.pauseVerification(testIdentityHash);

      const resumed = service.resumeVerification(testIdentityHash);

      expect(resumed).toBe(true);
      const status = service.getScheduleStatus(testIdentityHash);
      expect(status?.status).toBe(VerificationStatus.ACTIVE);
    });

    it('should not resume non-paused verification', () => {
      const agentCore = createMockAgentCore();
      service.scheduleVerification(testIdentityHash, agentCore);

      const resumed = service.resumeVerification(testIdentityHash);
      expect(resumed).toBe(false);
    });
  });

  // ===========================================================================
  // VERIFICATION EXECUTION
  // ===========================================================================

  describe('runVerification', () => {
    it('should run all verification checks', async () => {
      const agentCore = createMockAgentCore();
      responseSamples.set(testIdentityHash, createMockSamples(50));

      const result = await service.runVerification(testIdentityHash, agentCore);

      expect(result.identityHash).toBe(testIdentityHash);
      expect(result.checks).toHaveLength(4); // All 4 check types
      expect(result.verifiedAt).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should detect identity hash mismatch', async () => {
      const agentCore = createMockAgentCore();
      const wrongHash = 'b'.repeat(64);

      const result = await service.runVerification(wrongHash, agentCore);

      const integrityCheck = result.checks.find(
        (c) => c.checkType === VerificationCheckType.IDENTITY_INTEGRITY
      );

      expect(integrityCheck?.passed).toBe(false);
      expect(integrityCheck?.score).toBe(0);
    });

    it('should pass with insufficient samples', async () => {
      const agentCore = createMockAgentCore();
      responseSamples.set(testIdentityHash, createMockSamples(3)); // Too few

      const result = await service.runVerification(testIdentityHash, agentCore);

      // Behavioral checks should pass due to insufficient data
      const behavioralCheck = result.checks.find(
        (c) => c.checkType === VerificationCheckType.BEHAVIORAL_DRIFT
      );
      expect(behavioralCheck?.passed).toBe(true);
    });

    it('should generate alerts for failed checks', async () => {
      const agentCore = createMockAgentCore();
      const wrongHash = 'c'.repeat(64);

      const result = await service.runVerification(wrongHash, agentCore);

      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.alerts[0].severity).toBe(AlertSeverity.CRITICAL);
    });
  });

  // ===========================================================================
  // BEHAVIORAL DRIFT DETECTION
  // ===========================================================================

  describe('behavioral drift detection', () => {
    it('should include behavioral drift check in results', async () => {
      const agentCore = createMockAgentCore();

      // Create samples
      responseSamples.set(testIdentityHash, createMockSamples(50));

      const result = await service.runVerification(testIdentityHash, agentCore);

      // Should have all 4 check types
      expect(result.checks.length).toBe(4);

      // All checks should have scores
      result.checks.forEach((check) => {
        expect(check.score).toBeGreaterThanOrEqual(0);
        expect(check.score).toBeLessThanOrEqual(1);
      });
    });
  });

  // ===========================================================================
  // ALERT MANAGEMENT
  // ===========================================================================

  describe('getAlerts', () => {
    it('should return alerts for an agent', async () => {
      const agentCore = createMockAgentCore();
      const wrongHash = 'd'.repeat(64);

      await service.runVerification(wrongHash, agentCore);

      const alerts = service.getAlerts(wrongHash);
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should filter unacknowledged alerts', async () => {
      const agentCore = createMockAgentCore();
      const wrongHash = 'e'.repeat(64);

      await service.runVerification(wrongHash, agentCore);

      const alerts = service.getAlerts(wrongHash);
      const alertId = alerts[0]?.id;

      if (alertId) {
        service.acknowledgeAlert(wrongHash, alertId);
      }

      const unacknowledged = service.getAlerts(wrongHash, { unacknowledgedOnly: true });
      expect(unacknowledged.length).toBe(alerts.length - 1);
    });

    it('should filter by severity', async () => {
      const agentCore = createMockAgentCore();
      const wrongHash = 'f'.repeat(64);

      await service.runVerification(wrongHash, agentCore);

      const criticalAlerts = service.getAlerts(wrongHash, {
        severity: AlertSeverity.CRITICAL,
      });

      criticalAlerts.forEach((alert) => {
        expect(alert.severity).toBe(AlertSeverity.CRITICAL);
      });
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge an alert', async () => {
      const agentCore = createMockAgentCore();
      const wrongHash = 'g'.repeat(64);

      await service.runVerification(wrongHash, agentCore);

      const alerts = service.getAlerts(wrongHash);
      const alertId = alerts[0]?.id;

      expect(alertId).toBeDefined();
      const acknowledged = service.acknowledgeAlert(wrongHash, alertId!);
      expect(acknowledged).toBe(true);
    });

    it('should return false for non-existent alert', () => {
      const acknowledged = service.acknowledgeAlert(testIdentityHash, 'nonexistent');
      expect(acknowledged).toBe(false);
    });
  });

  // ===========================================================================
  // HISTORY
  // ===========================================================================

  describe('getVerificationHistory', () => {
    it('should return verification history', async () => {
      const agentCore = createMockAgentCore();
      responseSamples.set(testIdentityHash, createMockSamples(50));

      await service.runVerification(testIdentityHash, agentCore);
      await service.runVerification(testIdentityHash, agentCore);
      await service.runVerification(testIdentityHash, agentCore);

      const history = service.getVerificationHistory(testIdentityHash);

      expect(history.length).toBe(3);
      // All entries should have valid timestamps
      history.forEach((entry) => {
        expect(entry.verifiedAt).toBeDefined();
      });
    });

    it('should respect limit parameter', async () => {
      const agentCore = createMockAgentCore();
      responseSamples.set(testIdentityHash, createMockSamples(50));

      for (let i = 0; i < 5; i++) {
        await service.runVerification(testIdentityHash, agentCore);
      }

      const history = service.getVerificationHistory(testIdentityHash, 2);
      expect(history.length).toBe(2);
    });
  });

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  describe('updateConfig', () => {
    it('should update verification configuration', () => {
      const agentCore = createMockAgentCore();
      service.scheduleVerification(testIdentityHash, agentCore);

      const updated = service.updateConfig(testIdentityHash, {
        autoSuspend: false,
        thresholds: {
          autonomyScore: 0.8,
        },
      });

      expect(updated).toBe(true);
    });

    it('should return false for non-existent schedule', () => {
      const updated = service.updateConfig('nonexistent', {});
      expect(updated).toBe(false);
    });
  });

  describe('updateBaseline', () => {
    it('should update behavioral baseline', () => {
      const agentCore = createMockAgentCore();
      service.scheduleVerification(testIdentityHash, agentCore);

      const newBaseline = createMockFingerprint();
      const updated = service.updateBaseline(testIdentityHash, newBaseline);

      expect(updated).toBe(true);
    });
  });

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  describe('stopAll', () => {
    it('should stop all scheduled verifications', () => {
      const agentCore = createMockAgentCore();

      service.scheduleVerification('hash1'.padEnd(64, '0'), agentCore);
      service.scheduleVerification('hash2'.padEnd(64, '0'), agentCore);
      service.scheduleVerification('hash3'.padEnd(64, '0'), agentCore);

      service.stopAll();

      const schedules = service.getAllSchedules();
      schedules.forEach((schedule) => {
        expect(schedule.status).toBe(VerificationStatus.STOPPED);
      });
    });
  });

  describe('getAllSchedules', () => {
    it('should return all schedules', () => {
      const agentCore = createMockAgentCore();

      service.scheduleVerification('hash1'.padEnd(64, '0'), agentCore);
      service.scheduleVerification('hash2'.padEnd(64, '0'), agentCore);

      const schedules = service.getAllSchedules();
      expect(schedules.length).toBe(2);
    });
  });
});

// =============================================================================
// SINGLETON TESTS
// =============================================================================

describe('getContinuousVerificationService', () => {
  afterEach(() => {
    resetContinuousVerificationService();
  });

  it('should return singleton instance', () => {
    const samples = new Map<string, ResponseSample[]>();

    const service1 = getContinuousVerificationService(samples);
    const service2 = getContinuousVerificationService(samples);

    expect(service1).toBe(service2);
  });
});
