/**
 * Agent007 - Continuous Verification Service
 *
 * Provides continuous monitoring and verification of agent identities.
 * Detects behavioral drift, identity tampering, and autonomy changes.
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import {
  VerificationCheckType,
  VerificationStatus,
  AlertSeverity,
  type VerificationCheckResult,
  type VerificationResult,
  type VerificationAlert,
  type VerificationSchedule,
  type VerificationConfig,
  type AgentCoreIdentity,
  type BehavioralFingerprint,
  IdentityStatus,
} from '../../types/identity.js';
import { identityHashService } from '../identity/hash.js';
import { fingerprintService, type ResponseSample } from '../autonomy/fingerprint.js';
import { autonomyDetector } from '../autonomy/detector.js';
import { logger } from '../../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

interface ScheduledVerification {
  schedule: VerificationSchedule;
  config: VerificationConfig;
  timerId?: NodeJS.Timeout;
  agentCore: AgentCoreIdentity;
  baselineFingerprint?: BehavioralFingerprint;
}

interface WebhookPayload {
  event: 'verification_completed' | 'alert_triggered' | 'status_changed';
  timestamp: string;
  identityHash: string;
  data: VerificationResult | VerificationAlert | { status: VerificationStatus };
  signature: string;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: VerificationConfig = {
  checks: [
    VerificationCheckType.IDENTITY_INTEGRITY,
    VerificationCheckType.BEHAVIORAL_DRIFT,
    VerificationCheckType.AUTONOMY_CHECK,
    VerificationCheckType.ANOMALY_DETECTION,
  ],
  thresholds: {
    identityIntegrity: 1.0, // Must be 100% match
    behavioralDrift: 0.7, // 70% similarity minimum
    autonomyScore: 0.6, // 60% autonomy minimum
    anomalyScore: 0.8, // 80% normal behavior
  },
  alerts: {
    enabled: true,
    minSeverity: AlertSeverity.WARNING,
  },
  autoSuspend: true,
  maxConsecutiveFailures: 3,
};

const DEFAULT_INTERVAL_MS = 3600000; // 1 hour
const MIN_INTERVAL_MS = 60000; // 1 minute minimum
const MAX_INTERVAL_MS = 86400000; // 24 hours maximum

// =============================================================================
// CONTINUOUS VERIFICATION SERVICE
// =============================================================================

export class ContinuousVerificationService {
  private schedules: Map<string, ScheduledVerification> = new Map();
  private verificationHistory: Map<string, VerificationResult[]> = new Map();
  private alertHistory: Map<string, VerificationAlert[]> = new Map();
  private responseSamplesRef: Map<string, ResponseSample[]>;

  constructor(responseSamples: Map<string, ResponseSample[]>) {
    this.responseSamplesRef = responseSamples;
  }

  // ===========================================================================
  // SCHEDULE MANAGEMENT
  // ===========================================================================

  /**
   * Schedule continuous verification for an agent
   */
  scheduleVerification(
    identityHash: string,
    agentCore: AgentCoreIdentity,
    options: {
      intervalMs?: number;
      config?: Partial<VerificationConfig>;
      webhookUrl?: string;
      webhookSecret?: string;
      baselineFingerprint?: BehavioralFingerprint;
    } = {}
  ): VerificationSchedule {
    // Validate interval
    const intervalMs = Math.max(
      MIN_INTERVAL_MS,
      Math.min(options.intervalMs || DEFAULT_INTERVAL_MS, MAX_INTERVAL_MS)
    );

    // Merge config with defaults
    const config: VerificationConfig = {
      ...DEFAULT_CONFIG,
      ...options.config,
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        ...options.config?.thresholds,
      },
      alerts: {
        ...DEFAULT_CONFIG.alerts,
        ...options.config?.alerts,
        webhookUrl: options.webhookUrl,
        webhookSecret: options.webhookSecret,
      },
    };

    // Create schedule
    const schedule: VerificationSchedule = {
      identityHash,
      status: VerificationStatus.ACTIVE,
      intervalMs,
      createdAt: new Date().toISOString(),
      nextVerificationAt: new Date(Date.now() + intervalMs).toISOString(),
      totalVerifications: 0,
      failedVerifications: 0,
      consecutiveFailures: 0,
      webhookUrl: options.webhookUrl,
      webhookSecret: options.webhookSecret,
    };

    // Store scheduled verification
    const scheduled: ScheduledVerification = {
      schedule,
      config,
      agentCore,
      baselineFingerprint: options.baselineFingerprint,
    };

    // Clear existing timer if any
    const existing = this.schedules.get(identityHash);
    if (existing?.timerId) {
      clearInterval(existing.timerId);
    }

    // Start verification timer
    scheduled.timerId = setInterval(() => {
      this.runScheduledVerification(identityHash);
    }, intervalMs);

    this.schedules.set(identityHash, scheduled);

    logger.info(
      { identityHash, intervalMs, checksEnabled: config.checks },
      'Continuous verification scheduled'
    );

    return schedule;
  }

  /**
   * Stop continuous verification for an agent
   */
  stopVerification(identityHash: string): boolean {
    const scheduled = this.schedules.get(identityHash);
    if (!scheduled) {
      return false;
    }

    if (scheduled.timerId) {
      clearInterval(scheduled.timerId);
    }

    scheduled.schedule.status = VerificationStatus.STOPPED;
    scheduled.schedule.nextVerificationAt = undefined;

    logger.info({ identityHash }, 'Continuous verification stopped');

    return true;
  }

  /**
   * Pause continuous verification
   */
  pauseVerification(identityHash: string): boolean {
    const scheduled = this.schedules.get(identityHash);
    if (!scheduled) {
      return false;
    }

    if (scheduled.timerId) {
      clearInterval(scheduled.timerId);
      scheduled.timerId = undefined;
    }

    scheduled.schedule.status = VerificationStatus.PAUSED;
    scheduled.schedule.nextVerificationAt = undefined;

    logger.info({ identityHash }, 'Continuous verification paused');

    return true;
  }

  /**
   * Resume paused verification
   */
  resumeVerification(identityHash: string): boolean {
    const scheduled = this.schedules.get(identityHash);
    if (!scheduled || scheduled.schedule.status !== VerificationStatus.PAUSED) {
      return false;
    }

    scheduled.schedule.status = VerificationStatus.ACTIVE;
    scheduled.schedule.nextVerificationAt = new Date(
      Date.now() + scheduled.schedule.intervalMs
    ).toISOString();

    scheduled.timerId = setInterval(() => {
      this.runScheduledVerification(identityHash);
    }, scheduled.schedule.intervalMs);

    logger.info({ identityHash }, 'Continuous verification resumed');

    return true;
  }

  /**
   * Get verification schedule status
   */
  getScheduleStatus(identityHash: string): VerificationSchedule | null {
    const scheduled = this.schedules.get(identityHash);
    return scheduled?.schedule || null;
  }

  /**
   * Update verification configuration
   */
  updateConfig(
    identityHash: string,
    config: Partial<VerificationConfig>
  ): boolean {
    const scheduled = this.schedules.get(identityHash);
    if (!scheduled) {
      return false;
    }

    scheduled.config = {
      ...scheduled.config,
      ...config,
      thresholds: {
        ...scheduled.config.thresholds,
        ...config.thresholds,
      },
      alerts: {
        ...scheduled.config.alerts,
        ...config.alerts,
      },
    };

    return true;
  }

  /**
   * Update baseline fingerprint
   */
  updateBaseline(
    identityHash: string,
    fingerprint: BehavioralFingerprint
  ): boolean {
    const scheduled = this.schedules.get(identityHash);
    if (!scheduled) {
      return false;
    }

    scheduled.baselineFingerprint = fingerprint;
    return true;
  }

  // ===========================================================================
  // VERIFICATION EXECUTION
  // ===========================================================================

  /**
   * Run a single verification (can be called manually or by scheduler)
   */
  async runVerification(
    identityHash: string,
    agentCore?: AgentCoreIdentity,
    config?: VerificationConfig
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    // Get scheduled config if exists
    const scheduled = this.schedules.get(identityHash);
    const effectiveConfig = config || scheduled?.config || DEFAULT_CONFIG;
    const effectiveAgentCore = agentCore || scheduled?.agentCore;

    if (!effectiveAgentCore) {
      throw new Error('Agent core identity not provided and not scheduled');
    }

    const checks: VerificationCheckResult[] = [];
    const alerts: VerificationAlert[] = [];

    // Run each configured check
    for (const checkType of effectiveConfig.checks) {
      try {
        const checkResult = await this.performCheck(
          checkType,
          identityHash,
          effectiveAgentCore,
          effectiveConfig,
          scheduled?.baselineFingerprint
        );

        checks.push(checkResult);

        // Generate alerts if check failed
        if (!checkResult.passed) {
          const alert = this.createAlert(checkResult, identityHash);
          if (
            effectiveConfig.alerts.enabled &&
            this.shouldTriggerAlert(alert, effectiveConfig)
          ) {
            alerts.push(alert);
          }
        }
      } catch (error) {
        logger.error({ identityHash, checkType, error }, 'Check failed with error');

        checks.push({
          checkType,
          passed: false,
          score: 0,
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
          issues: ['Check execution failed'],
          performedAt: new Date().toISOString(),
        });
      }
    }

    // Calculate overall result
    const passedChecks = checks.filter((c) => c.passed).length;
    const overallScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;
    const passed = passedChecks === checks.length;

    const result: VerificationResult = {
      id: uuidv4(),
      identityHash,
      passed,
      overallScore,
      checks,
      alerts,
      verifiedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };

    // Store in history
    this.addToHistory(identityHash, result);

    // Store alerts
    for (const alert of alerts) {
      this.addAlert(identityHash, alert);
    }

    // Send webhooks for alerts
    if (scheduled?.schedule.webhookUrl) {
      for (const alert of alerts) {
        await this.sendWebhook(
          scheduled.schedule.webhookUrl,
          scheduled.schedule.webhookSecret,
          'alert_triggered',
          identityHash,
          alert
        );
      }
    }

    logger.info(
      {
        identityHash,
        passed,
        overallScore: overallScore.toFixed(3),
        checksRun: checks.length,
        alertsGenerated: alerts.length,
        durationMs: result.durationMs,
      },
      'Verification completed'
    );

    return result;
  }

  /**
   * Run scheduled verification (called by timer)
   */
  private async runScheduledVerification(identityHash: string): Promise<void> {
    const scheduled = this.schedules.get(identityHash);
    if (!scheduled || scheduled.schedule.status !== VerificationStatus.ACTIVE) {
      return;
    }

    try {
      const result = await this.runVerification(identityHash);

      // Update schedule stats
      scheduled.schedule.lastVerificationAt = result.verifiedAt;
      scheduled.schedule.nextVerificationAt = new Date(
        Date.now() + scheduled.schedule.intervalMs
      ).toISOString();
      scheduled.schedule.totalVerifications++;

      if (!result.passed) {
        scheduled.schedule.failedVerifications++;
        scheduled.schedule.consecutiveFailures++;

        // Check for auto-suspend
        if (
          scheduled.config.autoSuspend &&
          scheduled.schedule.consecutiveFailures >= scheduled.config.maxConsecutiveFailures
        ) {
          this.handleAutoSuspend(identityHash, scheduled);
        }
      } else {
        scheduled.schedule.consecutiveFailures = 0;
      }

      // Send webhook for verification result
      if (scheduled.schedule.webhookUrl) {
        await this.sendWebhook(
          scheduled.schedule.webhookUrl,
          scheduled.schedule.webhookSecret,
          'verification_completed',
          identityHash,
          result
        );
      }
    } catch (error) {
      logger.error({ identityHash, error }, 'Scheduled verification failed');
      scheduled.schedule.consecutiveFailures++;
      scheduled.schedule.failedVerifications++;
    }
  }

  // ===========================================================================
  // CHECK IMPLEMENTATIONS
  // ===========================================================================

  /**
   * Perform a specific verification check
   */
  private async performCheck(
    checkType: VerificationCheckType,
    identityHash: string,
    agentCore: AgentCoreIdentity,
    config: VerificationConfig,
    baselineFingerprint?: BehavioralFingerprint
  ): Promise<VerificationCheckResult> {
    switch (checkType) {
      case VerificationCheckType.IDENTITY_INTEGRITY:
        return this.checkIdentityIntegrity(identityHash, agentCore, config);

      case VerificationCheckType.BEHAVIORAL_DRIFT:
        return this.checkBehavioralDrift(
          identityHash,
          config,
          baselineFingerprint
        );

      case VerificationCheckType.AUTONOMY_CHECK:
        return this.checkAutonomy(identityHash, config);

      case VerificationCheckType.ANOMALY_DETECTION:
        return this.checkAnomalies(identityHash, config, baselineFingerprint);

      default:
        throw new Error(`Unknown check type: ${checkType}`);
    }
  }

  /**
   * Check identity hash integrity
   */
  private checkIdentityIntegrity(
    identityHash: string,
    agentCore: AgentCoreIdentity,
    config: VerificationConfig
  ): VerificationCheckResult {
    const recomputed = identityHashService.computeIdentityHash(agentCore);
    const match = recomputed.identityHash === identityHash;

    return {
      checkType: VerificationCheckType.IDENTITY_INTEGRITY,
      passed: match,
      score: match ? 1.0 : 0.0,
      details: {
        expectedHash: identityHash,
        computedHash: recomputed.identityHash,
        componentHashes: recomputed.componentHashes,
      },
      issues: match ? [] : ['Identity hash mismatch - configuration may have been modified'],
      performedAt: new Date().toISOString(),
    };
  }

  /**
   * Check for behavioral drift from baseline
   */
  private checkBehavioralDrift(
    identityHash: string,
    config: VerificationConfig,
    baselineFingerprint?: BehavioralFingerprint
  ): VerificationCheckResult {
    const samples = this.responseSamplesRef.get(identityHash) || [];
    const issues: string[] = [];

    if (samples.length < 10) {
      return {
        checkType: VerificationCheckType.BEHAVIORAL_DRIFT,
        passed: true,
        score: 1.0,
        details: { reason: 'Insufficient samples for drift analysis', sampleCount: samples.length },
        issues: [],
        performedAt: new Date().toISOString(),
      };
    }

    // Create current fingerprint
    const currentFingerprint = fingerprintService.createFingerprint(samples, false);

    if (!baselineFingerprint) {
      return {
        checkType: VerificationCheckType.BEHAVIORAL_DRIFT,
        passed: true,
        score: 1.0,
        details: { reason: 'No baseline fingerprint established' },
        issues: [],
        performedAt: new Date().toISOString(),
      };
    }

    // Compare fingerprints
    const comparison = fingerprintService.compareFingerprints(
      baselineFingerprint,
      currentFingerprint
    );

    const score = comparison.overallSimilarity;
    const passed = score >= config.thresholds.behavioralDrift;

    if (!passed) {
      issues.push(`Behavioral drift detected: ${((1 - score) * 100).toFixed(1)}% deviation from baseline`);

      if (comparison.latencySimilarity < 0.7) {
        issues.push('Response timing patterns have changed significantly');
      }
      if (comparison.vocabularySimilarity < 0.7) {
        issues.push('Vocabulary usage has changed significantly');
      }
      if (comparison.styleSimilarity < 0.7) {
        issues.push('Writing style has changed significantly');
      }
    }

    return {
      checkType: VerificationCheckType.BEHAVIORAL_DRIFT,
      passed,
      score,
      details: {
        overallSimilarity: comparison.overallSimilarity,
        latencySimilarity: comparison.latencySimilarity,
        vocabularySimilarity: comparison.vocabularySimilarity,
        styleSimilarity: comparison.styleSimilarity,
        driftPercentage: ((1 - score) * 100).toFixed(2),
      },
      issues,
      performedAt: new Date().toISOString(),
    };
  }

  /**
   * Check autonomy level
   */
  private checkAutonomy(
    identityHash: string,
    config: VerificationConfig
  ): VerificationCheckResult {
    const samples = this.responseSamplesRef.get(identityHash) || [];
    const issues: string[] = [];

    if (samples.length < 10) {
      return {
        checkType: VerificationCheckType.AUTONOMY_CHECK,
        passed: true,
        score: 1.0,
        details: { reason: 'Insufficient samples for autonomy analysis', sampleCount: samples.length },
        issues: [],
        performedAt: new Date().toISOString(),
      };
    }

    // Run autonomy analysis
    const periodStart = new Date(Date.now() - 86400000); // Last 24 hours
    const periodEnd = new Date();
    const recentSamples = samples.filter((s) => s.timestamp >= periodStart);

    if (recentSamples.length < 5) {
      return {
        checkType: VerificationCheckType.AUTONOMY_CHECK,
        passed: true,
        score: 1.0,
        details: { reason: 'Insufficient recent samples', recentSampleCount: recentSamples.length },
        issues: [],
        performedAt: new Date().toISOString(),
      };
    }

    const analysis = autonomyDetector.analyze(
      identityHash,
      recentSamples,
      periodStart,
      periodEnd
    );

    const score = analysis.autonomyScore;
    const passed = score >= config.thresholds.autonomyScore;

    if (!passed) {
      issues.push(`Low autonomy score: ${(score * 100).toFixed(1)}% (threshold: ${config.thresholds.autonomyScore * 100}%)`);
      issues.push(`Classification: ${analysis.classification}`);

      for (const alert of analysis.alerts) {
        if (alert.level === 'critical' || alert.level === 'warning') {
          issues.push(alert.message);
        }
      }
    }

    return {
      checkType: VerificationCheckType.AUTONOMY_CHECK,
      passed,
      score,
      details: {
        autonomyScore: analysis.autonomyScore,
        classification: analysis.classification,
        confidence: analysis.confidence,
        scores: analysis.scores,
        patterns: analysis.patterns,
        alertCount: analysis.alerts.length,
      },
      issues,
      performedAt: new Date().toISOString(),
    };
  }

  /**
   * Check for anomalies in behavior
   */
  private checkAnomalies(
    identityHash: string,
    config: VerificationConfig,
    baselineFingerprint?: BehavioralFingerprint
  ): VerificationCheckResult {
    const samples = this.responseSamplesRef.get(identityHash) || [];
    const issues: string[] = [];

    if (samples.length < 20) {
      return {
        checkType: VerificationCheckType.ANOMALY_DETECTION,
        passed: true,
        score: 1.0,
        details: { reason: 'Insufficient samples for anomaly detection', sampleCount: samples.length },
        issues: [],
        performedAt: new Date().toISOString(),
      };
    }

    // Get recent samples (last 24 hours)
    const recentSamples = samples.filter(
      (s) => s.timestamp >= new Date(Date.now() - 86400000)
    );

    if (recentSamples.length < 5) {
      return {
        checkType: VerificationCheckType.ANOMALY_DETECTION,
        passed: true,
        score: 1.0,
        details: { reason: 'Insufficient recent samples', recentSampleCount: recentSamples.length },
        issues: [],
        performedAt: new Date().toISOString(),
      };
    }

    const anomalies: Record<string, unknown>[] = [];
    let anomalyScore = 1.0;

    // Check for latency anomalies
    const currentFingerprint = fingerprintService.createFingerprint(recentSamples, false);

    if (baselineFingerprint) {
      // Sudden latency changes
      const latencyRatio = currentFingerprint.latency.mean / baselineFingerprint.latency.mean;
      if (latencyRatio > 2.0 || latencyRatio < 0.5) {
        anomalies.push({
          type: 'latency_anomaly',
          description: 'Significant change in response timing',
          baseline: baselineFingerprint.latency.mean,
          current: currentFingerprint.latency.mean,
          ratio: latencyRatio,
        });
        anomalyScore -= 0.2;
      }

      // Vocabulary changes
      const vocabRatio =
        currentFingerprint.vocabulary.uniqueWordCount /
        baselineFingerprint.vocabulary.uniqueWordCount;
      if (vocabRatio > 1.5 || vocabRatio < 0.5) {
        anomalies.push({
          type: 'vocabulary_anomaly',
          description: 'Significant change in vocabulary size',
          baseline: baselineFingerprint.vocabulary.uniqueWordCount,
          current: currentFingerprint.vocabulary.uniqueWordCount,
          ratio: vocabRatio,
        });
        anomalyScore -= 0.15;
      }
    }

    // Check for unusual response patterns
    const latencies = recentSamples.map((s) => s.latencyMs);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const stdDev = Math.sqrt(
      latencies.reduce((sum, l) => sum + Math.pow(l - avgLatency, 2), 0) / latencies.length
    );

    // Check for suspiciously consistent latencies (might indicate caching/automation)
    if (stdDev < 10 && avgLatency < 100) {
      anomalies.push({
        type: 'consistency_anomaly',
        description: 'Suspiciously consistent response times (possible automation)',
        stdDev,
        avgLatency,
      });
      anomalyScore -= 0.25;
    }

    // Check for burst patterns (many responses in short time)
    const timestamps = recentSamples.map((s) => s.timestamp.getTime()).sort((a, b) => a - b);
    let burstCount = 0;
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] - timestamps[i - 1] < 1000) {
        burstCount++;
      }
    }
    const burstRatio = burstCount / timestamps.length;
    if (burstRatio > 0.5) {
      anomalies.push({
        type: 'burst_anomaly',
        description: 'High frequency of rapid successive responses',
        burstRatio,
      });
      anomalyScore -= 0.2;
    }

    anomalyScore = Math.max(0, anomalyScore);
    const passed = anomalyScore >= config.thresholds.anomalyScore;

    if (!passed) {
      issues.push(`Anomaly score: ${(anomalyScore * 100).toFixed(1)}% (threshold: ${config.thresholds.anomalyScore * 100}%)`);
      for (const anomaly of anomalies) {
        issues.push(`${anomaly.type}: ${anomaly.description}`);
      }
    }

    return {
      checkType: VerificationCheckType.ANOMALY_DETECTION,
      passed,
      score: anomalyScore,
      details: {
        anomaliesDetected: anomalies.length,
        anomalies,
        recentSampleCount: recentSamples.length,
      },
      issues,
      performedAt: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // ALERT MANAGEMENT
  // ===========================================================================

  /**
   * Create an alert from a failed check
   */
  private createAlert(
    check: VerificationCheckResult,
    identityHash: string
  ): VerificationAlert {
    let severity: AlertSeverity;
    let title: string;
    let recommendation: string | undefined;

    switch (check.checkType) {
      case VerificationCheckType.IDENTITY_INTEGRITY:
        severity = AlertSeverity.CRITICAL;
        title = 'Identity Integrity Violation';
        recommendation = 'Immediately review agent configuration. Identity may have been tampered with.';
        break;

      case VerificationCheckType.BEHAVIORAL_DRIFT:
        severity = check.score < 0.5 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
        title = 'Behavioral Drift Detected';
        recommendation = 'Review recent agent responses for unusual patterns. Consider updating baseline if changes are expected.';
        break;

      case VerificationCheckType.AUTONOMY_CHECK:
        severity = check.score < 0.4 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
        title = 'Low Autonomy Score';
        recommendation = 'Agent may be under human control. Investigate response patterns and timing.';
        break;

      case VerificationCheckType.ANOMALY_DETECTION:
        severity = check.score < 0.5 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
        title = 'Behavioral Anomalies Detected';
        recommendation = 'Unusual patterns detected in agent behavior. Review for potential issues.';
        break;

      default:
        severity = AlertSeverity.INFO;
        title = 'Verification Check Failed';
    }

    return {
      id: uuidv4(),
      severity,
      title,
      message: check.issues.join('; ') || 'Check failed without specific issues',
      triggeredBy: check.checkType,
      recommendation,
      createdAt: new Date().toISOString(),
      acknowledged: false,
    };
  }

  /**
   * Check if alert should be triggered based on config
   */
  private shouldTriggerAlert(
    alert: VerificationAlert,
    config: VerificationConfig
  ): boolean {
    const severityOrder = [AlertSeverity.INFO, AlertSeverity.WARNING, AlertSeverity.CRITICAL];
    const alertLevel = severityOrder.indexOf(alert.severity);
    const minLevel = severityOrder.indexOf(config.alerts.minSeverity);
    return alertLevel >= minLevel;
  }

  /**
   * Get alerts for an agent
   */
  getAlerts(
    identityHash: string,
    options: { unacknowledgedOnly?: boolean; severity?: AlertSeverity } = {}
  ): VerificationAlert[] {
    let alerts = this.alertHistory.get(identityHash) || [];

    if (options.unacknowledgedOnly) {
      alerts = alerts.filter((a) => !a.acknowledged);
    }

    if (options.severity) {
      alerts = alerts.filter((a) => a.severity === options.severity);
    }

    return alerts.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(identityHash: string, alertId: string): boolean {
    const alerts = this.alertHistory.get(identityHash);
    if (!alerts) return false;

    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    return true;
  }

  /**
   * Add alert to history
   */
  private addAlert(identityHash: string, alert: VerificationAlert): void {
    const alerts = this.alertHistory.get(identityHash) || [];
    alerts.unshift(alert);

    // Keep only last 100 alerts
    if (alerts.length > 100) {
      alerts.pop();
    }

    this.alertHistory.set(identityHash, alerts);
  }

  // ===========================================================================
  // HISTORY
  // ===========================================================================

  /**
   * Get verification history for an agent
   */
  getVerificationHistory(
    identityHash: string,
    limit: number = 50
  ): VerificationResult[] {
    const history = this.verificationHistory.get(identityHash) || [];
    return history.slice(0, limit);
  }

  /**
   * Add verification result to history
   */
  private addToHistory(identityHash: string, result: VerificationResult): void {
    const history = this.verificationHistory.get(identityHash) || [];
    history.unshift(result);

    // Keep only last 100 results
    if (history.length > 100) {
      history.pop();
    }

    this.verificationHistory.set(identityHash, history);
  }

  // ===========================================================================
  // AUTO-SUSPEND
  // ===========================================================================

  /**
   * Handle automatic suspension after consecutive failures
   */
  private handleAutoSuspend(
    identityHash: string,
    scheduled: ScheduledVerification
  ): void {
    logger.warn(
      {
        identityHash,
        consecutiveFailures: scheduled.schedule.consecutiveFailures,
        maxFailures: scheduled.config.maxConsecutiveFailures,
      },
      'Auto-suspending agent due to consecutive verification failures'
    );

    // Stop verification
    this.pauseVerification(identityHash);
    scheduled.schedule.status = VerificationStatus.FAILED;

    // Create critical alert
    const alert: VerificationAlert = {
      id: uuidv4(),
      severity: AlertSeverity.CRITICAL,
      title: 'Agent Auto-Suspended',
      message: `Agent suspended after ${scheduled.schedule.consecutiveFailures} consecutive verification failures`,
      triggeredBy: VerificationCheckType.IDENTITY_INTEGRITY,
      recommendation: 'Manual review required. Investigate verification failures before resuming.',
      createdAt: new Date().toISOString(),
      acknowledged: false,
    };

    this.addAlert(identityHash, alert);

    // Send webhook
    if (scheduled.schedule.webhookUrl) {
      this.sendWebhook(
        scheduled.schedule.webhookUrl,
        scheduled.schedule.webhookSecret,
        'status_changed',
        identityHash,
        { status: VerificationStatus.FAILED }
      );
    }
  }

  // ===========================================================================
  // WEBHOOKS
  // ===========================================================================

  /**
   * Send webhook notification
   */
  private async sendWebhook(
    url: string,
    secret: string | undefined,
    event: WebhookPayload['event'],
    identityHash: string,
    data: VerificationResult | VerificationAlert | { status: VerificationStatus }
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString();

      // Create signature
      const payloadString = JSON.stringify({ event, timestamp, identityHash, data });
      const signature = secret
        ? createHash('sha256')
            .update(`${timestamp}.${payloadString}.${secret}`)
            .digest('hex')
        : '';

      const payload: WebhookPayload = {
        event,
        timestamp,
        identityHash,
        data,
        signature,
      };

      // Send webhook (in production, use proper HTTP client with retries)
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent007-Signature': signature,
          'X-Agent007-Timestamp': timestamp,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        logger.warn(
          { url, status: response.status, event },
          'Webhook delivery failed'
        );
      } else {
        logger.debug({ url, event }, 'Webhook delivered successfully');
      }
    } catch (error) {
      logger.error({ url, event, error }, 'Webhook delivery error');
    }
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /**
   * Stop all scheduled verifications (for graceful shutdown)
   */
  stopAll(): void {
    for (const [identityHash, scheduled] of this.schedules) {
      if (scheduled.timerId) {
        clearInterval(scheduled.timerId);
      }
      scheduled.schedule.status = VerificationStatus.STOPPED;
    }

    logger.info(
      { schedulesCleared: this.schedules.size },
      'All continuous verifications stopped'
    );
  }

  /**
   * Get all active schedules
   */
  getAllSchedules(): VerificationSchedule[] {
    return Array.from(this.schedules.values()).map((s) => s.schedule);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let continuousVerificationInstance: ContinuousVerificationService | null = null;

export function getContinuousVerificationService(
  responseSamples: Map<string, ResponseSample[]>
): ContinuousVerificationService {
  if (!continuousVerificationInstance) {
    continuousVerificationInstance = new ContinuousVerificationService(responseSamples);
  }
  return continuousVerificationInstance;
}

export function resetContinuousVerificationService(): void {
  if (continuousVerificationInstance) {
    continuousVerificationInstance.stopAll();
    continuousVerificationInstance = null;
  }
}
