/**
 * Agent007 - Verification Repository
 *
 * Database operations for verification results, fingerprints, and autonomy analyses.
 */

import { query, transaction } from '../config/database.js';
import {
  VerificationCheckType,
  AlertSeverity,
  AutonomyClassification,
  type VerificationResult,
  type VerificationAlert,
  type BehavioralFingerprint,
} from '../types/identity.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface VerificationResultRow {
  id: string;
  agent_id: string;
  identity_hash: string;
  passed: boolean;
  overall_score: number;
  checks: any[];
  alerts: any[];
  verified_at: Date;
  duration_ms: number;
}

export interface BehavioralFingerprintRow {
  id: string;
  agent_id: string;
  latency_mean: number;
  latency_std_dev: number;
  latency_p50: number;
  latency_p95: number;
  latency_p99: number;
  unique_word_count?: number;
  avg_sentence_length?: number;
  readability_score?: number;
  type_token_ratio?: number;
  top_ngrams?: any;
  emoji_usage?: number;
  punctuation_pattern?: string;
  capitalization_style?: string;
  formatting_preferences?: string[];
  avg_paragraph_length?: number;
  topic_vector?: number[];
  consistency_score: number;
  sample_size: number;
  is_baseline: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AutonomyAnalysisRow {
  id: string;
  agent_id: string;
  autonomy_score: number;
  confidence: number;
  classification: AutonomyClassification;
  timing_score: number;
  language_score: number;
  behavior_score: number;
  patterns: any[];
  alerts: any[];
  period_start: Date;
  period_end: Date;
  messages_analyzed: number;
  analyzed_at: Date;
}

export interface AlertRow {
  id: string;
  agent_id: string;
  alert_type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  triggered_by: VerificationCheckType;
  data?: any;
  acknowledged: boolean;
  acknowledged_at?: Date;
  acknowledged_by?: string;
  created_at: Date;
}

// =============================================================================
// VERIFICATION REPOSITORY
// =============================================================================

export class VerificationRepository {
  // ===========================================================================
  // VERIFICATION RESULTS
  // ===========================================================================

  /**
   * Save verification result
   */
  async saveResult(
    agentId: string,
    identityHash: string,
    result: VerificationResult
  ): Promise<string> {
    const insertResult = await query<{ id: string }>(
      `INSERT INTO verification_results (
        agent_id, identity_hash, passed, overall_score, checks, alerts, verified_at, duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        agentId,
        identityHash,
        result.passed,
        result.overallScore,
        JSON.stringify(result.checks),
        JSON.stringify(result.alerts),
        result.verifiedAt,
        result.durationMs,
      ]
    );

    // Also save alerts to the alerts table for easier querying
    if (result.alerts.length > 0) {
      for (const alert of result.alerts) {
        await this.saveAlert(agentId, alert);
      }
    }

    return insertResult.rows[0].id;
  }

  /**
   * Get verification history for an agent
   */
  async getHistory(
    identityHash: string,
    limit: number = 20
  ): Promise<VerificationResult[]> {
    const result = await query<VerificationResultRow>(
      `SELECT * FROM verification_results
       WHERE identity_hash = $1
       ORDER BY verified_at DESC
       LIMIT $2`,
      [identityHash, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      identityHash: row.identity_hash,
      passed: row.passed,
      overallScore: row.overall_score,
      checks: row.checks,
      alerts: row.alerts,
      verifiedAt: row.verified_at.toISOString(),
      durationMs: row.duration_ms,
    }));
  }

  /**
   * Get latest verification result
   */
  async getLatest(identityHash: string): Promise<VerificationResult | null> {
    const history = await this.getHistory(identityHash, 1);
    return history[0] || null;
  }

  // ===========================================================================
  // BEHAVIORAL FINGERPRINTS
  // ===========================================================================

  /**
   * Save behavioral fingerprint
   */
  async saveFingerprint(
    agentId: string,
    fingerprint: BehavioralFingerprint,
    isBaseline: boolean = false
  ): Promise<string> {
    // If setting as baseline, clear previous baselines
    if (isBaseline) {
      await query(
        'UPDATE behavioral_fingerprints SET is_baseline = FALSE WHERE agent_id = $1',
        [agentId]
      );
    }

    const result = await query<{ id: string }>(
      `INSERT INTO behavioral_fingerprints (
        agent_id, latency_mean, latency_std_dev, latency_p50, latency_p95, latency_p99,
        unique_word_count, avg_sentence_length, readability_score, type_token_ratio,
        consistency_score, sample_size, is_baseline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id`,
      [
        agentId,
        fingerprint.latency.mean,
        fingerprint.latency.stdDev,
        fingerprint.latency.p50,
        fingerprint.latency.p95,
        fingerprint.latency.p99,
        fingerprint.vocabulary?.uniqueWordCount,
        fingerprint.vocabulary?.avgSentenceLength,
        fingerprint.vocabulary?.readabilityScore,
        fingerprint.vocabulary?.typeTokenRatio,
        fingerprint.consistencyScore,
        fingerprint.sampleSize,
        isBaseline,
      ]
    );

    logger.info({ agentId, isBaseline }, 'Behavioral fingerprint saved');
    return result.rows[0].id;
  }

  /**
   * Get baseline fingerprint for an agent
   */
  async getBaseline(agentId: string): Promise<BehavioralFingerprintRow | null> {
    const result = await query<BehavioralFingerprintRow>(
      `SELECT * FROM behavioral_fingerprints
       WHERE agent_id = $1 AND is_baseline = TRUE
       ORDER BY created_at DESC
       LIMIT 1`,
      [agentId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get fingerprint history
   */
  async getFingerprintHistory(
    agentId: string,
    limit: number = 10
  ): Promise<BehavioralFingerprintRow[]> {
    const result = await query<BehavioralFingerprintRow>(
      `SELECT * FROM behavioral_fingerprints
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [agentId, limit]
    );

    return result.rows;
  }

  // ===========================================================================
  // AUTONOMY ANALYSES
  // ===========================================================================

  /**
   * Save autonomy analysis
   */
  async saveAutonomyAnalysis(
    agentId: string,
    analysis: {
      autonomyScore: number;
      confidence: number;
      classification: AutonomyClassification;
      scores: { timing: number; language: number; behavior: number };
      patterns: any[];
      alerts: any[];
      period: { start: Date; end: Date; messagesAnalyzed: number };
    }
  ): Promise<string> {
    const result = await query<{ id: string }>(
      `INSERT INTO autonomy_analyses (
        agent_id, autonomy_score, confidence, classification,
        timing_score, language_score, behavior_score,
        patterns, alerts, period_start, period_end, messages_analyzed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        agentId,
        analysis.autonomyScore,
        analysis.confidence,
        analysis.classification,
        analysis.scores.timing,
        analysis.scores.language,
        analysis.scores.behavior,
        JSON.stringify(analysis.patterns),
        JSON.stringify(analysis.alerts),
        analysis.period.start,
        analysis.period.end,
        analysis.period.messagesAnalyzed,
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Get latest autonomy analysis
   */
  async getLatestAutonomy(agentId: string): Promise<AutonomyAnalysisRow | null> {
    const result = await query<AutonomyAnalysisRow>(
      `SELECT * FROM autonomy_analyses
       WHERE agent_id = $1
       ORDER BY analyzed_at DESC
       LIMIT 1`,
      [agentId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get autonomy history
   */
  async getAutonomyHistory(
    agentId: string,
    limit: number = 20
  ): Promise<AutonomyAnalysisRow[]> {
    const result = await query<AutonomyAnalysisRow>(
      `SELECT * FROM autonomy_analyses
       WHERE agent_id = $1
       ORDER BY analyzed_at DESC
       LIMIT $2`,
      [agentId, limit]
    );

    return result.rows;
  }

  // ===========================================================================
  // ALERTS
  // ===========================================================================

  /**
   * Save alert
   */
  async saveAlert(agentId: string, alert: VerificationAlert): Promise<string> {
    const result = await query<{ id: string }>(
      `INSERT INTO alerts (
        agent_id, alert_type, severity, title, message, triggered_by, data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [
        agentId,
        alert.triggeredBy, // Use triggeredBy as alert_type
        alert.severity,
        alert.title,
        alert.message,
        alert.triggeredBy,
        JSON.stringify({ recommendation: alert.recommendation }),
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Get alerts for an agent
   */
  async getAlerts(
    agentId: string,
    options: {
      unacknowledgedOnly?: boolean;
      severity?: AlertSeverity;
      limit?: number;
    } = {}
  ): Promise<AlertRow[]> {
    const { unacknowledgedOnly = false, severity, limit = 100 } = options;

    const conditions: string[] = ['agent_id = $1'];
    const params: any[] = [agentId];
    let paramIndex = 2;

    if (unacknowledgedOnly) {
      conditions.push('acknowledged = FALSE');
    }

    if (severity) {
      conditions.push(`severity = $${paramIndex++}`);
      params.push(severity);
    }

    params.push(limit);

    const result = await query<AlertRow>(
      `SELECT * FROM alerts
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${paramIndex}`,
      params
    );

    return result.rows;
  }

  /**
   * Get all alerts across all agents
   */
  async getAllAlerts(options: {
    severity?: AlertSeverity;
    unacknowledgedOnly?: boolean;
    limit?: number;
  } = {}): Promise<(AlertRow & { identity_hash: string })[]> {
    const { severity, unacknowledgedOnly = false, limit = 100 } = options;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (severity) {
      conditions.push(`a.severity = $${paramIndex++}`);
      params.push(severity);
    }

    if (unacknowledgedOnly) {
      conditions.push('a.acknowledged = FALSE');
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    params.push(limit);

    const result = await query<AlertRow & { identity_hash: string }>(
      `SELECT a.*, ai.identity_hash
       FROM alerts a
       JOIN agent_identities ai ON ai.id = a.agent_id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramIndex}`,
      params
    );

    return result.rows;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(
    alertId: string,
    acknowledgedBy: string
  ): Promise<boolean> {
    const result = await query(
      `UPDATE alerts
       SET acknowledged = TRUE, acknowledged_at = NOW(), acknowledged_by = $1
       WHERE id = $2 AND acknowledged = FALSE`,
      [acknowledgedBy, alertId]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Acknowledge all alerts for an agent
   */
  async acknowledgeAllAlerts(
    agentId: string,
    acknowledgedBy: string
  ): Promise<number> {
    const result = await query(
      `UPDATE alerts
       SET acknowledged = TRUE, acknowledged_at = NOW(), acknowledged_by = $1
       WHERE agent_id = $2 AND acknowledged = FALSE`,
      [acknowledgedBy, agentId]
    );

    return result.rowCount || 0;
  }

  /**
   * Clear alerts for an agent
   */
  async clearAlerts(agentId: string): Promise<number> {
    const result = await query(
      'DELETE FROM alerts WHERE agent_id = $1',
      [agentId]
    );

    return result.rowCount || 0;
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get verification statistics
   */
  async getStats(): Promise<{
    totalVerifications: number;
    passedCount: number;
    failedCount: number;
    avgScore: number;
    totalAlerts: number;
    unacknowledgedAlerts: number;
  }> {
    const [verificationStats, alertStats] = await Promise.all([
      query<{
        total: string;
        passed: string;
        failed: string;
        avg_score: string;
      }>(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE passed = TRUE) as passed,
          COUNT(*) FILTER (WHERE passed = FALSE) as failed,
          AVG(overall_score) as avg_score
         FROM verification_results`
      ),
      query<{ total: string; unacknowledged: string }>(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE acknowledged = FALSE) as unacknowledged
         FROM alerts`
      ),
    ]);

    const vs = verificationStats.rows[0];
    const as = alertStats.rows[0];

    return {
      totalVerifications: parseInt(vs.total),
      passedCount: parseInt(vs.passed),
      failedCount: parseInt(vs.failed),
      avgScore: parseFloat(vs.avg_score) || 0,
      totalAlerts: parseInt(as.total),
      unacknowledgedAlerts: parseInt(as.unacknowledged),
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let verificationRepositoryInstance: VerificationRepository | null = null;

export function getVerificationRepository(): VerificationRepository {
  if (!verificationRepositoryInstance) {
    verificationRepositoryInstance = new VerificationRepository();
  }
  return verificationRepositoryInstance;
}
