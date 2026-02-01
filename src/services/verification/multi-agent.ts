/**
 * Agent007 - Multi-Agent Verification Service
 *
 * Handles batch verification of multiple agents simultaneously.
 * Provides comparison and correlation analysis across agents.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  VerificationCheckType,
  VerificationStatus,
  AlertSeverity,
  AutonomyClassification,
  type VerificationResult,
  type VerificationAlert,
  type AgentCoreIdentity,
} from '../../types/identity.js';
import { getContinuousVerificationService } from './continuous.js';
import { getAdvancedAutonomyDetector } from '../autonomy/advanced-detector.js';
import type { ResponseSample } from '../autonomy/fingerprint.js';
import { logger } from '../../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface MultiAgentVerificationRequest {
  /** List of agent identity hashes to verify */
  identityHashes: string[];

  /** Verification options */
  options?: {
    /** Run verifications in parallel (default: true) */
    parallel?: boolean;

    /** Maximum concurrent verifications */
    maxConcurrent?: number;

    /** Skip agents without samples */
    skipNoSamples?: boolean;

    /** Include comparison analysis */
    includeComparison?: boolean;

    /** Include correlation analysis */
    includeCorrelation?: boolean;
  };
}

export interface MultiAgentVerificationResult {
  /** Unique batch ID */
  batchId: string;

  /** Total agents requested */
  totalRequested: number;

  /** Successfully verified */
  successfulCount: number;

  /** Failed verifications */
  failedCount: number;

  /** Skipped (no samples, etc.) */
  skippedCount: number;

  /** Individual results */
  results: AgentVerificationSummary[];

  /** Comparison analysis (if requested) */
  comparison?: ComparisonAnalysis;

  /** Correlation analysis (if requested) */
  correlation?: CorrelationAnalysis;

  /** Aggregated alerts across all agents */
  aggregatedAlerts: AggregatedAlerts;

  /** Batch statistics */
  stats: BatchStats;

  /** When batch started */
  startedAt: string;

  /** When batch completed */
  completedAt: string;

  /** Total duration in ms */
  durationMs: number;
}

export interface AgentVerificationSummary {
  /** Agent identity hash */
  identityHash: string;

  /** Agent display name */
  displayName?: string;

  /** Verification status */
  status: 'success' | 'failed' | 'skipped';

  /** Skip/failure reason */
  reason?: string;

  /** Verification result (if successful) */
  result?: VerificationResult;

  /** Autonomy classification */
  autonomyClassification?: AutonomyClassification;

  /** Autonomy score */
  autonomyScore?: number;

  /** Alert count */
  alertCount: number;

  /** Duration in ms */
  durationMs: number;
}

export interface ComparisonAnalysis {
  /** Ranking by overall score */
  ranking: Array<{
    identityHash: string;
    displayName?: string;
    overallScore: number;
    rank: number;
  }>;

  /** Score distribution */
  scoreDistribution: {
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
  };

  /** Classification distribution */
  classificationDistribution: Record<AutonomyClassification, number>;

  /** Outliers (scores significantly different from mean) */
  outliers: Array<{
    identityHash: string;
    score: number;
    deviation: number;
    direction: 'above' | 'below';
  }>;

  /** Best performing agents */
  topPerformers: string[];

  /** Agents needing attention */
  needsAttention: string[];
}

export interface CorrelationAnalysis {
  /** Agents with similar behavioral patterns */
  similarGroups: Array<{
    groupId: string;
    members: string[];
    similarity: number;
    commonPatterns: string[];
  }>;

  /** Potential shared-control indicators */
  sharedControlIndicators: Array<{
    agents: string[];
    indicator: string;
    confidence: number;
    evidence: Record<string, unknown>;
  }>;

  /** Timing correlations */
  timingCorrelations: Array<{
    agent1: string;
    agent2: string;
    correlation: number;
    significance: 'low' | 'medium' | 'high';
  }>;

  /** Behavioral clusters */
  clusters: Array<{
    clusterId: string;
    members: string[];
    centroidFeatures: Record<string, number>;
  }>;
}

export interface AggregatedAlerts {
  /** Total alerts across all agents */
  total: number;

  /** By severity */
  bySeverity: Record<AlertSeverity, number>;

  /** By check type */
  byCheckType: Record<VerificationCheckType, number>;

  /** Critical alerts requiring immediate attention */
  criticalAlerts: Array<VerificationAlert & { identityHash: string }>;

  /** Most common alert types */
  mostCommon: Array<{ type: string; count: number }>;
}

export interface BatchStats {
  /** Average verification duration */
  avgDurationMs: number;

  /** Average overall score */
  avgOverallScore: number;

  /** Average autonomy score */
  avgAutonomyScore: number;

  /** Pass rate */
  passRate: number;

  /** Agents with critical alerts */
  criticalAlertAgents: number;
}

// =============================================================================
// MULTI-AGENT VERIFICATION SERVICE
// =============================================================================

export class MultiAgentVerificationService {
  private responseSamplesRef: Map<string, ResponseSample[]>;
  private identitiesRef: Map<string, any>;

  constructor(
    responseSamples: Map<string, ResponseSample[]>,
    identities: Map<string, any>
  ) {
    this.responseSamplesRef = responseSamples;
    this.identitiesRef = identities;
  }

  /**
   * Verify multiple agents
   */
  async verifyMultiple(
    request: MultiAgentVerificationRequest
  ): Promise<MultiAgentVerificationResult> {
    const batchId = uuidv4();
    const startTime = Date.now();
    const startedAt = new Date().toISOString();

    const {
      parallel = true,
      maxConcurrent = 5,
      skipNoSamples = true,
      includeComparison = true,
      includeCorrelation = true,
    } = request.options || {};

    logger.info(
      { batchId, agentCount: request.identityHashes.length, parallel },
      'Starting multi-agent verification'
    );

    const results: AgentVerificationSummary[] = [];

    if (parallel) {
      // Parallel verification with concurrency limit
      const chunks = this.chunkArray(request.identityHashes, maxConcurrent);

      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map((hash) => this.verifySingleAgent(hash, skipNoSamples))
        );
        results.push(...chunkResults);
      }
    } else {
      // Sequential verification
      for (const hash of request.identityHashes) {
        const result = await this.verifySingleAgent(hash, skipNoSamples);
        results.push(result);
      }
    }

    // Calculate statistics
    const successfulResults = results.filter((r) => r.status === 'success');
    const stats = this.calculateStats(successfulResults);

    // Aggregate alerts
    const aggregatedAlerts = this.aggregateAlerts(results);

    // Comparison analysis
    let comparison: ComparisonAnalysis | undefined;
    if (includeComparison && successfulResults.length >= 2) {
      comparison = this.performComparisonAnalysis(successfulResults);
    }

    // Correlation analysis
    let correlation: CorrelationAnalysis | undefined;
    if (includeCorrelation && successfulResults.length >= 2) {
      correlation = this.performCorrelationAnalysis(successfulResults);
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    logger.info(
      {
        batchId,
        successful: successfulResults.length,
        failed: results.filter((r) => r.status === 'failed').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
        durationMs,
      },
      'Multi-agent verification completed'
    );

    return {
      batchId,
      totalRequested: request.identityHashes.length,
      successfulCount: successfulResults.length,
      failedCount: results.filter((r) => r.status === 'failed').length,
      skippedCount: results.filter((r) => r.status === 'skipped').length,
      results,
      comparison,
      correlation,
      aggregatedAlerts,
      stats,
      startedAt,
      completedAt,
      durationMs,
    };
  }

  /**
   * Verify a single agent
   */
  private async verifySingleAgent(
    identityHash: string,
    skipNoSamples: boolean
  ): Promise<AgentVerificationSummary> {
    const startTime = Date.now();

    // Get identity
    const identity = this.identitiesRef.get(identityHash);
    if (!identity) {
      return {
        identityHash,
        status: 'failed',
        reason: 'Agent not found',
        alertCount: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Check for samples
    const samples = this.responseSamplesRef.get(identityHash) || [];
    if (skipNoSamples && samples.length < 5) {
      return {
        identityHash,
        displayName: identity.metadata?.displayName,
        status: 'skipped',
        reason: `Insufficient samples (${samples.length}/5 minimum)`,
        alertCount: 0,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // Run verification
      const verificationService = getContinuousVerificationService(this.responseSamplesRef);
      const result = await verificationService.runVerification(
        identityHash,
        identity.agentCore
      );

      // Run advanced autonomy analysis
      let autonomyScore: number | undefined;
      let autonomyClassification: AutonomyClassification | undefined;

      if (samples.length >= 10) {
        const advancedDetector = getAdvancedAutonomyDetector();
        const analysis = advancedDetector.analyze(
          identityHash,
          samples,
          new Date(Date.now() - 604800000),
          new Date()
        );
        autonomyScore = analysis.autonomyScore;
        autonomyClassification = analysis.classification;
      }

      return {
        identityHash,
        displayName: identity.metadata?.displayName,
        status: 'success',
        result,
        autonomyClassification,
        autonomyScore,
        alertCount: result.alerts.length,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        identityHash,
        displayName: identity.metadata?.displayName,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Unknown error',
        alertCount: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Calculate batch statistics
   */
  private calculateStats(results: AgentVerificationSummary[]): BatchStats {
    if (results.length === 0) {
      return {
        avgDurationMs: 0,
        avgOverallScore: 0,
        avgAutonomyScore: 0,
        passRate: 0,
        criticalAlertAgents: 0,
      };
    }

    const durations = results.map((r) => r.durationMs);
    const overallScores = results
      .filter((r) => r.result)
      .map((r) => r.result!.overallScore);
    const autonomyScores = results
      .filter((r) => r.autonomyScore !== undefined)
      .map((r) => r.autonomyScore!);

    const passedCount = results.filter((r) => r.result?.passed).length;
    const criticalAlertAgents = results.filter((r) =>
      r.result?.alerts.some((a) => a.severity === AlertSeverity.CRITICAL)
    ).length;

    return {
      avgDurationMs: this.mean(durations),
      avgOverallScore: overallScores.length > 0 ? this.mean(overallScores) : 0,
      avgAutonomyScore: autonomyScores.length > 0 ? this.mean(autonomyScores) : 0,
      passRate: results.length > 0 ? passedCount / results.length : 0,
      criticalAlertAgents,
    };
  }

  /**
   * Aggregate alerts from all results
   */
  private aggregateAlerts(results: AgentVerificationSummary[]): AggregatedAlerts {
    const bySeverity: Record<AlertSeverity, number> = {
      [AlertSeverity.INFO]: 0,
      [AlertSeverity.WARNING]: 0,
      [AlertSeverity.CRITICAL]: 0,
    };

    const byCheckType: Record<VerificationCheckType, number> = {
      [VerificationCheckType.IDENTITY_INTEGRITY]: 0,
      [VerificationCheckType.BEHAVIORAL_DRIFT]: 0,
      [VerificationCheckType.AUTONOMY_CHECK]: 0,
      [VerificationCheckType.ANOMALY_DETECTION]: 0,
    };

    const criticalAlerts: Array<VerificationAlert & { identityHash: string }> = [];
    const alertTypeCounts = new Map<string, number>();

    let total = 0;

    for (const result of results) {
      if (!result.result) continue;

      for (const alert of result.result.alerts) {
        total++;
        bySeverity[alert.severity]++;
        byCheckType[alert.triggeredBy]++;

        if (alert.severity === AlertSeverity.CRITICAL) {
          criticalAlerts.push({ ...alert, identityHash: result.identityHash });
        }

        const typeKey = `${alert.triggeredBy}:${alert.title}`;
        alertTypeCounts.set(typeKey, (alertTypeCounts.get(typeKey) || 0) + 1);
      }
    }

    const mostCommon = Array.from(alertTypeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total,
      bySeverity,
      byCheckType,
      criticalAlerts,
      mostCommon,
    };
  }

  /**
   * Perform comparison analysis
   */
  private performComparisonAnalysis(
    results: AgentVerificationSummary[]
  ): ComparisonAnalysis {
    // Get scores
    const scores = results
      .filter((r) => r.result)
      .map((r) => ({
        identityHash: r.identityHash,
        displayName: r.displayName,
        overallScore: r.result!.overallScore,
      }));

    // Sort for ranking
    const ranked = [...scores].sort((a, b) => b.overallScore - a.overallScore);
    const ranking = ranked.map((r, i) => ({ ...r, rank: i + 1 }));

    // Score distribution
    const scoreValues = scores.map((s) => s.overallScore);
    const scoreDistribution = {
      min: Math.min(...scoreValues),
      max: Math.max(...scoreValues),
      mean: this.mean(scoreValues),
      median: this.median(scoreValues),
      stdDev: this.stdDev(scoreValues),
    };

    // Classification distribution
    const classificationDistribution: Record<AutonomyClassification, number> = {
      [AutonomyClassification.FULLY_AUTONOMOUS]: 0,
      [AutonomyClassification.SUPERVISED]: 0,
      [AutonomyClassification.HYBRID_SUSPICIOUS]: 0,
      [AutonomyClassification.HUMAN_CONTROLLED]: 0,
    };

    for (const result of results) {
      if (result.autonomyClassification) {
        classificationDistribution[result.autonomyClassification]++;
      }
    }

    // Find outliers (more than 2 std devs from mean)
    const outliers = scores
      .filter((s) => Math.abs(s.overallScore - scoreDistribution.mean) > 2 * scoreDistribution.stdDev)
      .map((s) => ({
        identityHash: s.identityHash,
        score: s.overallScore,
        deviation: Math.abs(s.overallScore - scoreDistribution.mean) / scoreDistribution.stdDev,
        direction: (s.overallScore > scoreDistribution.mean ? 'above' : 'below') as 'above' | 'below',
      }));

    // Top performers (top 20% or top 5)
    const topCount = Math.max(1, Math.min(5, Math.ceil(scores.length * 0.2)));
    const topPerformers = ranking.slice(0, topCount).map((r) => r.identityHash);

    // Needs attention (bottom 20% or those with critical alerts)
    const needsAttention = results
      .filter((r) =>
        (r.result && r.result.overallScore < scoreDistribution.mean - scoreDistribution.stdDev) ||
        r.result?.alerts.some((a) => a.severity === AlertSeverity.CRITICAL)
      )
      .map((r) => r.identityHash);

    return {
      ranking,
      scoreDistribution,
      classificationDistribution,
      outliers,
      topPerformers,
      needsAttention,
    };
  }

  /**
   * Perform correlation analysis
   */
  private performCorrelationAnalysis(
    results: AgentVerificationSummary[]
  ): CorrelationAnalysis {
    const similarGroups: CorrelationAnalysis['similarGroups'] = [];
    const sharedControlIndicators: CorrelationAnalysis['sharedControlIndicators'] = [];
    const timingCorrelations: CorrelationAnalysis['timingCorrelations'] = [];
    const clusters: CorrelationAnalysis['clusters'] = [];

    // Simple similarity grouping based on autonomy classification
    const byClassification = new Map<AutonomyClassification, string[]>();
    for (const result of results) {
      if (result.autonomyClassification) {
        const group = byClassification.get(result.autonomyClassification) || [];
        group.push(result.identityHash);
        byClassification.set(result.autonomyClassification, group);
      }
    }

    for (const [classification, members] of byClassification) {
      if (members.length >= 2) {
        similarGroups.push({
          groupId: uuidv4(),
          members,
          similarity: 0.8,
          commonPatterns: [classification],
        });
      }
    }

    // Check for shared control indicators
    // Agents with very similar autonomy scores might be controlled by same entity
    const autonomyScores = results
      .filter((r) => r.autonomyScore !== undefined)
      .map((r) => ({ hash: r.identityHash, score: r.autonomyScore! }));

    for (let i = 0; i < autonomyScores.length; i++) {
      for (let j = i + 1; j < autonomyScores.length; j++) {
        const diff = Math.abs(autonomyScores[i].score - autonomyScores[j].score);
        if (diff < 0.05 && autonomyScores[i].score < 0.5) {
          sharedControlIndicators.push({
            agents: [autonomyScores[i].hash, autonomyScores[j].hash],
            indicator: 'similar_low_autonomy',
            confidence: 1 - diff / 0.05,
            evidence: {
              score1: autonomyScores[i].score,
              score2: autonomyScores[j].score,
              difference: diff,
            },
          });
        }
      }
    }

    // Calculate timing correlations based on average latency
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const samples1 = this.responseSamplesRef.get(results[i].identityHash) || [];
        const samples2 = this.responseSamplesRef.get(results[j].identityHash) || [];

        if (samples1.length >= 5 && samples2.length >= 5) {
          const avg1 = this.mean(samples1.map((s) => s.latencyMs));
          const avg2 = this.mean(samples2.map((s) => s.latencyMs));
          const correlation = 1 - Math.abs(avg1 - avg2) / Math.max(avg1, avg2);

          if (correlation > 0.8) {
            timingCorrelations.push({
              agent1: results[i].identityHash,
              agent2: results[j].identityHash,
              correlation,
              significance: correlation > 0.95 ? 'high' : correlation > 0.9 ? 'medium' : 'low',
            });
          }
        }
      }
    }

    // Simple clustering based on overall score ranges
    const scoreRanges = [
      { min: 0, max: 0.4, id: 'low' },
      { min: 0.4, max: 0.7, id: 'medium' },
      { min: 0.7, max: 1.0, id: 'high' },
    ];

    for (const range of scoreRanges) {
      const members = results
        .filter((r) => r.result && r.result.overallScore >= range.min && r.result.overallScore < range.max)
        .map((r) => r.identityHash);

      if (members.length > 0) {
        const memberScores = results
          .filter((r) => members.includes(r.identityHash) && r.result)
          .map((r) => r.result!.overallScore);

        clusters.push({
          clusterId: `score-${range.id}`,
          members,
          centroidFeatures: {
            avgScore: this.mean(memberScores),
          },
        });
      }
    }

    return {
      similarGroups,
      sharedControlIndicators,
      timingCorrelations,
      clusters,
    };
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = this.mean(values);
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return Math.sqrt(this.mean(squaredDiffs));
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let multiAgentServiceInstance: MultiAgentVerificationService | null = null;

export function getMultiAgentVerificationService(
  responseSamples: Map<string, ResponseSample[]>,
  identities: Map<string, any>
): MultiAgentVerificationService {
  if (!multiAgentServiceInstance) {
    multiAgentServiceInstance = new MultiAgentVerificationService(responseSamples, identities);
  }
  return multiAgentServiceInstance;
}

export function resetMultiAgentVerificationService(): void {
  multiAgentServiceInstance = null;
}
