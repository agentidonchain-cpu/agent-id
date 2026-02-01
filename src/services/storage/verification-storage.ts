/**
 * Agent007 - Verification Storage Service
 *
 * Abstracts verification storage with database persistence and in-memory fallback.
 */

import { v4 as uuidv4 } from 'uuid';
import { checkConnection } from '../../config/database.js';
import {
  getVerificationRepository,
  type VerificationResultRow,
  type AlertRow,
} from '../../repositories/verification.js';
import { getAuditLogRepository } from '../../repositories/audit.js';
import { logger } from '../../utils/logger.js';
import {
  AlertSeverity,
  VerificationCheckType,
  type VerificationResult,
  type VerificationAlert,
  type BehavioralFingerprint,
} from '../../types/identity.js';

// =============================================================================
// VERIFICATION STORAGE SERVICE
// =============================================================================

export class VerificationStorageService {
  private verificationHistory = new Map<string, VerificationResult[]>();
  private alerts = new Map<string, VerificationAlert[]>();
  private fingerprints = new Map<string, BehavioralFingerprint>();
  private dbAvailable = false;

  constructor() {
    this.checkDatabaseConnection();
  }

  /**
   * Check if database is available
   */
  private async checkDatabaseConnection(): Promise<void> {
    try {
      this.dbAvailable = await checkConnection();
    } catch {
      this.dbAvailable = false;
    }
  }

  /**
   * Refresh database connection status
   */
  async refreshConnection(): Promise<boolean> {
    await this.checkDatabaseConnection();
    return this.dbAvailable;
  }

  /**
   * Check if using database
   */
  isUsingDatabase(): boolean {
    return this.dbAvailable;
  }

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
    // Store in memory
    const history = this.verificationHistory.get(identityHash) || [];
    history.unshift(result);

    // Keep only last 100 results in memory
    if (history.length > 100) {
      history.pop();
    }
    this.verificationHistory.set(identityHash, history);

    // Persist to database if available
    if (this.dbAvailable) {
      try {
        const verificationRepo = getVerificationRepository();
        const dbId = await verificationRepo.saveResult(agentId, identityHash, result);
        logger.debug({ identityHash, dbId }, 'Verification result persisted to database');
        return dbId;
      } catch (error) {
        logger.error({ error, identityHash },
          'Failed to persist verification result - using memory only');
      }
    }

    return result.id;
  }

  /**
   * Get verification history for an agent
   */
  async getHistory(identityHash: string, limit: number = 20): Promise<VerificationResult[]> {
    // Try database first
    if (this.dbAvailable) {
      try {
        const verificationRepo = getVerificationRepository();
        const results = await verificationRepo.getHistory(identityHash, limit);

        // Cache in memory
        if (results.length > 0) {
          this.verificationHistory.set(identityHash, results);
        }

        return results;
      } catch (error) {
        logger.error({ error, identityHash },
          'Failed to fetch verification history from database');
      }
    }

    // Fallback to memory
    const history = this.verificationHistory.get(identityHash) || [];
    return history.slice(0, limit);
  }

  /**
   * Get latest verification result
   */
  async getLatest(identityHash: string): Promise<VerificationResult | null> {
    const history = await this.getHistory(identityHash, 1);
    return history[0] || null;
  }

  // ===========================================================================
  // ALERTS
  // ===========================================================================

  /**
   * Save an alert
   */
  async saveAlert(
    agentId: string,
    identityHash: string,
    alert: VerificationAlert
  ): Promise<string> {
    // Store in memory
    const agentAlerts = this.alerts.get(identityHash) || [];
    agentAlerts.unshift(alert);

    // Keep only last 100 alerts in memory
    if (agentAlerts.length > 100) {
      agentAlerts.pop();
    }
    this.alerts.set(identityHash, agentAlerts);

    // Persist to database if available
    if (this.dbAvailable) {
      try {
        const verificationRepo = getVerificationRepository();
        const dbId = await verificationRepo.saveAlert(agentId, alert);
        logger.debug({ identityHash, dbId }, 'Alert persisted to database');
        return dbId;
      } catch (error) {
        logger.error({ error, identityHash },
          'Failed to persist alert - using memory only');
      }
    }

    return alert.id;
  }

  /**
   * Get alerts for an agent
   */
  async getAlerts(
    identityHash: string,
    options: {
      unacknowledgedOnly?: boolean;
      severity?: AlertSeverity;
      limit?: number;
    } = {}
  ): Promise<VerificationAlert[]> {
    const { unacknowledgedOnly = false, severity, limit = 100 } = options;

    // For now, use memory (database requires agentId lookup)
    let alerts = this.alerts.get(identityHash) || [];

    if (unacknowledgedOnly) {
      alerts = alerts.filter((a) => !a.acknowledged);
    }

    if (severity) {
      alerts = alerts.filter((a) => a.severity === severity);
    }

    return alerts.slice(0, limit);
  }

  /**
   * Get all alerts across all agents
   */
  async getAllAlerts(options: {
    severity?: AlertSeverity;
    unacknowledgedOnly?: boolean;
    limit?: number;
  } = {}): Promise<(VerificationAlert & { identityHash: string })[]> {
    const { severity, unacknowledgedOnly = false, limit = 100 } = options;

    // Try database first
    if (this.dbAvailable) {
      try {
        const verificationRepo = getVerificationRepository();
        const dbAlerts = await verificationRepo.getAllAlerts({
          severity,
          unacknowledgedOnly,
          limit,
        });

        return dbAlerts.map((a) => ({
          id: a.id,
          severity: a.severity,
          title: a.title,
          message: a.message,
          triggeredBy: a.triggered_by,
          createdAt: a.created_at.toISOString(),
          acknowledged: a.acknowledged,
          identityHash: a.identity_hash,
        }));
      } catch (error) {
        logger.error({ error }, 'Failed to fetch all alerts from database');
      }
    }

    // Fallback to memory
    const allAlerts: (VerificationAlert & { identityHash: string })[] = [];

    for (const [identityHash, alerts] of this.alerts) {
      for (const alert of alerts) {
        if (severity && alert.severity !== severity) continue;
        if (unacknowledgedOnly && alert.acknowledged) continue;

        allAlerts.push({ ...alert, identityHash });
      }
    }

    // Sort by creation time descending
    allAlerts.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return allAlerts.slice(0, limit);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(
    identityHash: string,
    alertId: string,
    acknowledgedBy?: string
  ): Promise<boolean> {
    // Update memory
    const alerts = this.alerts.get(identityHash);
    if (alerts) {
      const alert = alerts.find((a) => a.id === alertId);
      if (alert) {
        alert.acknowledged = true;
      }
    }

    // Update database if available
    if (this.dbAvailable) {
      try {
        const verificationRepo = getVerificationRepository();
        return await verificationRepo.acknowledgeAlert(
          alertId,
          acknowledgedBy || 'system'
        );
      } catch (error) {
        logger.error({ error, alertId }, 'Failed to acknowledge alert in database');
      }
    }

    return true;
  }

  /**
   * Clear alerts for an agent
   */
  async clearAlerts(identityHash: string): Promise<number> {
    const alerts = this.alerts.get(identityHash) || [];
    const count = alerts.length;

    this.alerts.delete(identityHash);

    return count;
  }

  // ===========================================================================
  // FINGERPRINTS
  // ===========================================================================

  /**
   * Save behavioral fingerprint
   */
  async saveFingerprint(
    agentId: string,
    identityHash: string,
    fingerprint: BehavioralFingerprint,
    isBaseline: boolean = false
  ): Promise<string> {
    // Store in memory
    if (isBaseline) {
      this.fingerprints.set(identityHash, fingerprint);
    }

    // Persist to database if available
    if (this.dbAvailable) {
      try {
        const verificationRepo = getVerificationRepository();
        const dbId = await verificationRepo.saveFingerprint(agentId, fingerprint, isBaseline);
        logger.debug({ identityHash, dbId, isBaseline }, 'Fingerprint persisted to database');
        return dbId;
      } catch (error) {
        logger.error({ error, identityHash },
          'Failed to persist fingerprint - using memory only');
      }
    }

    return uuidv4();
  }

  /**
   * Get baseline fingerprint
   */
  async getBaseline(identityHash: string, agentId?: string): Promise<BehavioralFingerprint | null> {
    // Check memory first
    const cached = this.fingerprints.get(identityHash);
    if (cached) {
      return cached;
    }

    // Try database if we have agentId
    if (this.dbAvailable && agentId) {
      try {
        const verificationRepo = getVerificationRepository();
        const dbFingerprint = await verificationRepo.getBaseline(agentId);

        if (dbFingerprint) {
          const fingerprint: BehavioralFingerprint = {
            latency: {
              mean: Number(dbFingerprint.latency_mean),
              stdDev: Number(dbFingerprint.latency_std_dev),
              p50: Number(dbFingerprint.latency_p50),
              p95: Number(dbFingerprint.latency_p95),
              p99: Number(dbFingerprint.latency_p99),
              sampleCount: dbFingerprint.sample_size,
            },
            vocabulary: dbFingerprint.unique_word_count
              ? ({
                  uniqueWordCount: dbFingerprint.unique_word_count,
                  avgSentenceLength: dbFingerprint.avg_sentence_length || 0,
                  readabilityScore: dbFingerprint.readability_score || 0,
                  typeTokenRatio: dbFingerprint.type_token_ratio || 0,
                  topNgrams: dbFingerprint.top_ngrams || [],
                } as any)
              : ({ uniqueWordCount: 0, avgSentenceLength: 0, readabilityScore: 0, typeTokenRatio: 0, topNgrams: [] } as any),
            style: {
              emojiUsage: dbFingerprint.emoji_usage || 0,
              punctuationPattern: dbFingerprint.punctuation_pattern || '',
              capitalizationStyle: (dbFingerprint.capitalization_style as 'standard' | 'all_lower' | 'all_upper' | 'mixed') || 'standard',
              formattingPreferences: dbFingerprint.formatting_preferences || [],
              avgParagraphLength: dbFingerprint.avg_paragraph_length || 0,
            },
            consistencyScore: Number(dbFingerprint.consistency_score),
            sampleSize: dbFingerprint.sample_size,
            isBaseline: dbFingerprint.is_baseline,
            createdAt: dbFingerprint.created_at.toISOString(),
            updatedAt: dbFingerprint.updated_at.toISOString(),
          };

          // Cache in memory
          this.fingerprints.set(identityHash, fingerprint);

          return fingerprint;
        }
      } catch (error) {
        logger.error({ error, identityHash }, 'Failed to fetch baseline from database');
      }
    }

    return null;
  }

  /**
   * Update baseline fingerprint
   */
  updateBaseline(identityHash: string, fingerprint: BehavioralFingerprint): void {
    this.fingerprints.set(identityHash, fingerprint);
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
    usingDatabase: boolean;
  }> {
    // Try database first
    if (this.dbAvailable) {
      try {
        const verificationRepo = getVerificationRepository();
        const stats = await verificationRepo.getStats();

        return {
          ...stats,
          usingDatabase: true,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to get verification stats from database');
      }
    }

    // Fallback to memory
    let totalVerifications = 0;
    let passedCount = 0;
    let totalScore = 0;

    for (const history of this.verificationHistory.values()) {
      for (const result of history) {
        totalVerifications++;
        if (result.passed) passedCount++;
        totalScore += result.overallScore;
      }
    }

    let totalAlerts = 0;
    let unacknowledgedAlerts = 0;

    for (const alerts of this.alerts.values()) {
      totalAlerts += alerts.length;
      unacknowledgedAlerts += alerts.filter((a) => !a.acknowledged).length;
    }

    return {
      totalVerifications,
      passedCount,
      failedCount: totalVerifications - passedCount,
      avgScore: totalVerifications > 0 ? totalScore / totalVerifications : 0,
      totalAlerts,
      unacknowledgedAlerts,
      usingDatabase: false,
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let verificationStorageInstance: VerificationStorageService | null = null;

export function getVerificationStorageService(): VerificationStorageService {
  if (!verificationStorageInstance) {
    verificationStorageInstance = new VerificationStorageService();
  }
  return verificationStorageInstance;
}

export function resetVerificationStorageService(): void {
  verificationStorageInstance = null;
}
