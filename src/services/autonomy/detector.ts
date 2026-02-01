/**
 * Agent007 - Autonomy Detector
 *
 * Detects whether an agent is truly autonomous or controlled by a human.
 * Uses timing analysis, language patterns, and behavioral heuristics.
 */

import {
  AutonomyClassification,
  type AutonomyAnalysis,
  type AutonomyScores,
  type AutonomyPattern,
  type AutonomyAlert,
} from '../../types/identity.js';
import { fingerprintService, type ResponseSample } from './fingerprint.js';

// =============================================================================
// TYPES
// =============================================================================

export interface TimingFeatures {
  /** Average response time */
  avgLatency: number;

  /** Latency standard deviation */
  latencyStdDev: number;

  /** Coefficient of variation */
  latencyCV: number;

  /** Responses within typical API range (500ms - 5000ms) */
  apiRangeRatio: number;

  /** Responses with suspiciously human timing (>10s or irregular) */
  humanTimingRatio: number;

  /** Time-of-day distribution entropy */
  timeDistributionEntropy: number;

  /** Burst pattern detection */
  hasBurstPatterns: boolean;
}

export interface LanguageFeatures {
  /** Typo rate (typos per 1000 characters) */
  typoRate: number;

  /** Use of filler words */
  fillerWordRate: number;

  /** Emotional variance in responses */
  emotionalVariance: number;

  /** Consistency of tone */
  toneConsistency: number;

  /** Use of first-person pronouns */
  firstPersonRate: number;

  /** Hedging language rate */
  hedgingRate: number;

  /** Response length variance */
  lengthVariance: number;
}

export interface BehaviorFeatures {
  /** Response pattern consistency */
  patternConsistency: number;

  /** Topic drift detection */
  topicDrift: number;

  /** Error recovery patterns */
  errorRecoveryScore: number;

  /** Personality consistency */
  personalityConsistency: number;

  /** Context awareness score */
  contextAwareness: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Common typos and their corrections
const COMMON_TYPOS = [
  'teh', 'adn', 'taht', 'wiht', 'hte', 'recieve', 'occured', 'seperate',
  'definately', 'occassion', 'untill', 'begining', 'goverment', 'enviroment',
  'knowlege', 'necesary', 'succesful', 'tommorow', 'wich', 'thier',
];

// Filler words commonly used by humans
const FILLER_WORDS = [
  'um', 'uh', 'like', 'you know', 'i mean', 'basically', 'actually',
  'literally', 'honestly', 'frankly', 'well', 'so', 'anyway', 'right',
];

// Hedging language
const HEDGING_PHRASES = [
  'i think', 'maybe', 'perhaps', 'probably', 'might', 'could be',
  'not sure', 'i believe', 'in my opinion', 'it seems', 'kind of',
  'sort of', 'somewhat', 'fairly', 'rather',
];

// Classification thresholds
const THRESHOLDS = {
  FULLY_AUTONOMOUS: 0.85,
  SUPERVISED: 0.6,
  HYBRID_SUSPICIOUS: 0.4,
  // Below 0.4 = HUMAN_CONTROLLED
};

// =============================================================================
// AUTONOMY DETECTOR CLASS
// =============================================================================

export class AutonomyDetector {
  /**
   * Analyzes samples to determine autonomy level
   */
  analyze(
    agentIdentityHash: string,
    samples: ResponseSample[],
    periodStart: Date,
    periodEnd: Date
  ): AutonomyAnalysis {
    if (samples.length < 5) {
      return this.createInsufficientDataResult(agentIdentityHash, periodStart, periodEnd, samples.length);
    }

    // Extract features
    const timingFeatures = this.extractTimingFeatures(samples);
    const languageFeatures = this.extractLanguageFeatures(samples);
    const behaviorFeatures = this.extractBehaviorFeatures(samples);

    // Calculate scores
    const timingScore = this.calculateTimingScore(timingFeatures);
    const languageScore = this.calculateLanguageScore(languageFeatures);
    const behaviorScore = this.calculateBehaviorScore(behaviorFeatures);

    // Weighted combination
    const autonomyScore =
      timingScore * 0.35 +
      languageScore * 0.35 +
      behaviorScore * 0.30;

    // Detect patterns
    const patterns = this.detectPatterns(timingFeatures, languageFeatures, behaviorFeatures);

    // Generate alerts
    const alerts = this.generateAlerts(autonomyScore, patterns);

    // Classify
    const classification = this.classify(autonomyScore);

    // Calculate confidence
    const confidence = this.calculateConfidence(samples.length, timingFeatures, languageFeatures);

    return {
      agentIdentityHash,
      autonomyScore,
      confidence,
      classification,
      scores: {
        timing: timingScore,
        language: languageScore,
        behavior: behaviorScore,
      },
      patterns,
      alerts,
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
        messagesAnalyzed: samples.length,
      },
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Extracts timing-related features from samples
   */
  extractTimingFeatures(samples: ResponseSample[]): TimingFeatures {
    const latencies = samples.map((s) => s.latencyMs);
    const timestamps = samples.map((s) => s.timestamp);

    // Basic statistics
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const variance = latencies.reduce((sum, l) => sum + Math.pow(l - avgLatency, 2), 0) / latencies.length;
    const latencyStdDev = Math.sqrt(variance);
    const latencyCV = latencyStdDev / avgLatency;

    // API range ratio (typical LLM API response: 500ms - 5000ms)
    const inApiRange = latencies.filter((l) => l >= 500 && l <= 5000).length;
    const apiRangeRatio = inApiRange / latencies.length;

    // Human timing ratio (very fast <200ms or slow >10s with variance)
    const humanTiming = latencies.filter((l) => l < 200 || (l > 10000 && latencyCV > 0.5)).length;
    const humanTimingRatio = humanTiming / latencies.length;

    // Time-of-day distribution
    const hours = timestamps.map((t) => t.getHours());
    const timeDistributionEntropy = this.calculateEntropy(hours, 24);

    // Burst patterns (many responses in short time, then gaps)
    const hasBurstPatterns = this.detectBurstPatterns(timestamps);

    return {
      avgLatency,
      latencyStdDev,
      latencyCV,
      apiRangeRatio,
      humanTimingRatio,
      timeDistributionEntropy,
      hasBurstPatterns,
    };
  }

  /**
   * Extracts language-related features from samples
   */
  extractLanguageFeatures(samples: ResponseSample[]): LanguageFeatures {
    const allContent = samples.map((s) => s.content);
    const combinedContent = allContent.join(' ').toLowerCase();
    const totalChars = combinedContent.length;

    // Typo rate
    let typoCount = 0;
    for (const typo of COMMON_TYPOS) {
      const matches = combinedContent.match(new RegExp(`\\b${typo}\\b`, 'g'));
      typoCount += matches ? matches.length : 0;
    }
    const typoRate = (typoCount / totalChars) * 1000;

    // Filler word rate
    let fillerCount = 0;
    for (const filler of FILLER_WORDS) {
      const matches = combinedContent.match(new RegExp(`\\b${filler}\\b`, 'g'));
      fillerCount += matches ? matches.length : 0;
    }
    const totalWords = combinedContent.split(/\s+/).length;
    const fillerWordRate = fillerCount / totalWords;

    // First-person pronoun rate
    const firstPersonMatches = combinedContent.match(/\b(i|me|my|mine|myself)\b/g);
    const firstPersonRate = (firstPersonMatches?.length || 0) / totalWords;

    // Hedging rate
    let hedgingCount = 0;
    for (const hedge of HEDGING_PHRASES) {
      const matches = combinedContent.match(new RegExp(hedge, 'g'));
      hedgingCount += matches ? matches.length : 0;
    }
    const hedgingRate = hedgingCount / allContent.length;

    // Length variance
    const lengths = allContent.map((c) => c.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const lengthVariance = lengths.reduce((sum, l) => sum + Math.pow(l - avgLength, 2), 0) / lengths.length;

    // Emotional variance (simplified - based on exclamation/question marks)
    const emotionalMarkers = allContent.map((c) => {
      const exclamations = (c.match(/!/g) || []).length;
      const questions = (c.match(/\?/g) || []).length;
      return exclamations + questions;
    });
    const emotionalVariance = this.calculateVariance(emotionalMarkers);

    // Tone consistency (simplified - based on sentence structure similarity)
    const toneConsistency = this.calculateToneConsistency(allContent);

    return {
      typoRate,
      fillerWordRate,
      emotionalVariance,
      toneConsistency,
      firstPersonRate,
      hedgingRate,
      lengthVariance,
    };
  }

  /**
   * Extracts behavior-related features from samples
   */
  extractBehaviorFeatures(samples: ResponseSample[]): BehaviorFeatures {
    // Pattern consistency using fingerprint service
    const fingerprint = fingerprintService.createFingerprint(samples);
    const patternConsistency = fingerprint?.consistencyScore || 0.5;

    // Topic drift (simplified - based on vocabulary overlap between consecutive responses)
    const topicDrift = this.calculateTopicDrift(samples);

    // Error recovery (how well does agent handle follow-up corrections)
    const errorRecoveryScore = this.estimateErrorRecovery(samples);

    // Personality consistency
    const personalityConsistency = this.calculatePersonalityConsistency(samples);

    // Context awareness
    const contextAwareness = this.estimateContextAwareness(samples);

    return {
      patternConsistency,
      topicDrift,
      errorRecoveryScore,
      personalityConsistency,
      contextAwareness,
    };
  }

  /**
   * Calculates timing-based autonomy score
   */
  private calculateTimingScore(features: TimingFeatures): number {
    let score = 0.5;

    // High API range ratio is good for autonomy
    score += (features.apiRangeRatio - 0.5) * 0.3;

    // Low human timing ratio is good
    score += (1 - features.humanTimingRatio) * 0.2;

    // Low CV suggests consistent (AI) behavior
    if (features.latencyCV < 0.3) score += 0.15;
    else if (features.latencyCV > 0.8) score -= 0.15;

    // High entropy in time distribution suggests autonomous operation
    if (features.timeDistributionEntropy > 0.7) score += 0.1;
    else if (features.timeDistributionEntropy < 0.3) score -= 0.1;

    // Burst patterns suggest human control
    if (features.hasBurstPatterns) score -= 0.15;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculates language-based autonomy score
   */
  private calculateLanguageScore(features: LanguageFeatures): number {
    let score = 0.5;

    // Low typo rate suggests AI
    if (features.typoRate < 0.5) score += 0.15;
    else if (features.typoRate > 2) score -= 0.2;

    // Low filler word rate suggests AI
    if (features.fillerWordRate < 0.01) score += 0.1;
    else if (features.fillerWordRate > 0.05) score -= 0.15;

    // Consistent emotional markers suggest AI
    if (features.emotionalVariance < 1) score += 0.1;
    else if (features.emotionalVariance > 5) score -= 0.1;

    // High tone consistency suggests AI
    score += (features.toneConsistency - 0.5) * 0.2;

    // Low hedging suggests AI
    if (features.hedgingRate < 0.1) score += 0.1;
    else if (features.hedgingRate > 0.3) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculates behavior-based autonomy score
   */
  private calculateBehaviorScore(features: BehaviorFeatures): number {
    let score = 0.5;

    // High pattern consistency suggests AI
    score += (features.patternConsistency - 0.5) * 0.3;

    // Low topic drift suggests focused AI behavior
    if (features.topicDrift < 0.3) score += 0.1;
    else if (features.topicDrift > 0.7) score -= 0.1;

    // High personality consistency suggests AI
    score += (features.personalityConsistency - 0.5) * 0.2;

    // Context awareness is neutral (both humans and AI can be context-aware)
    // But very low context awareness might indicate copy-paste human control
    if (features.contextAwareness < 0.3) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Detects specific patterns indicating human control
   */
  private detectPatterns(
    timing: TimingFeatures,
    language: LanguageFeatures,
    behavior: BehaviorFeatures
  ): AutonomyPattern[] {
    const patterns: AutonomyPattern[] = [];
    const now = new Date().toISOString();

    // Timing patterns
    if (timing.humanTimingRatio > 0.3) {
      patterns.push({
        type: 'suspicious_timing',
        severity: timing.humanTimingRatio > 0.5 ? 'high' : 'medium',
        description: 'Response timing inconsistent with API calls',
        detectedAt: now,
      });
    }

    if (timing.hasBurstPatterns) {
      patterns.push({
        type: 'burst_activity',
        severity: 'medium',
        description: 'Burst patterns detected - typical of human operators',
        detectedAt: now,
      });
    }

    if (timing.timeDistributionEntropy < 0.3) {
      patterns.push({
        type: 'time_clustering',
        severity: 'medium',
        description: 'Activity clustered in specific hours - suggests human schedule',
        detectedAt: now,
      });
    }

    // Language patterns
    if (language.typoRate > 2) {
      patterns.push({
        type: 'typo_presence',
        severity: 'high',
        description: 'Typos detected - unusual for AI responses',
        detectedAt: now,
      });
    }

    if (language.fillerWordRate > 0.03) {
      patterns.push({
        type: 'filler_words',
        severity: 'medium',
        description: 'High filler word usage - typical of human speech',
        detectedAt: now,
      });
    }

    // Behavior patterns
    if (behavior.patternConsistency < 0.4) {
      patterns.push({
        type: 'inconsistent_behavior',
        severity: 'high',
        description: 'Response patterns inconsistent with baseline',
        detectedAt: now,
      });
    }

    if (behavior.topicDrift > 0.6) {
      patterns.push({
        type: 'topic_drift',
        severity: 'low',
        description: 'Significant topic drift detected',
        detectedAt: now,
      });
    }

    return patterns;
  }

  /**
   * Generates alerts based on analysis
   */
  private generateAlerts(score: number, patterns: AutonomyPattern[]): AutonomyAlert[] {
    const alerts: AutonomyAlert[] = [];

    // Score-based alerts
    if (score < THRESHOLDS.HYBRID_SUSPICIOUS) {
      alerts.push({
        level: 'critical',
        message: 'Agent appears to be human-controlled',
        recommendation: 'Review agent activity and consider suspension',
      });
    } else if (score < THRESHOLDS.SUPERVISED) {
      alerts.push({
        level: 'warning',
        message: 'Agent shows signs of human supervision',
        recommendation: 'Monitor closely for further anomalies',
      });
    }

    // Pattern-based alerts
    const highSeverityPatterns = patterns.filter((p) => p.severity === 'high');
    if (highSeverityPatterns.length >= 2) {
      alerts.push({
        level: 'warning',
        message: `Multiple high-severity patterns detected: ${highSeverityPatterns.map((p) => p.type).join(', ')}`,
        triggeredBy: 'multiple_patterns',
      });
    }

    return alerts;
  }

  /**
   * Classifies autonomy level based on score
   */
  private classify(score: number): AutonomyClassification {
    if (score >= THRESHOLDS.FULLY_AUTONOMOUS) {
      return AutonomyClassification.FULLY_AUTONOMOUS;
    } else if (score >= THRESHOLDS.SUPERVISED) {
      return AutonomyClassification.SUPERVISED;
    } else if (score >= THRESHOLDS.HYBRID_SUSPICIOUS) {
      return AutonomyClassification.HYBRID_SUSPICIOUS;
    } else {
      return AutonomyClassification.HUMAN_CONTROLLED;
    }
  }

  /**
   * Calculates confidence in the analysis
   */
  private calculateConfidence(
    sampleCount: number,
    timing: TimingFeatures,
    language: LanguageFeatures
  ): number {
    let confidence = 0;

    // More samples = higher confidence
    confidence += Math.min(sampleCount / 50, 0.4);

    // Consistent timing = higher confidence
    if (timing.latencyCV < 0.5) confidence += 0.2;

    // Clear language signals = higher confidence
    if (language.typoRate < 0.5 || language.typoRate > 3) confidence += 0.2;
    if (language.fillerWordRate < 0.01 || language.fillerWordRate > 0.05) confidence += 0.2;

    return Math.min(1, confidence);
  }

  /**
   * Creates result for insufficient data
   */
  private createInsufficientDataResult(
    agentIdentityHash: string,
    periodStart: Date,
    periodEnd: Date,
    sampleCount: number
  ): AutonomyAnalysis {
    return {
      agentIdentityHash,
      autonomyScore: 0.5,
      confidence: 0.1,
      classification: AutonomyClassification.SUPERVISED,
      scores: { timing: 0.5, language: 0.5, behavior: 0.5 },
      patterns: [],
      alerts: [{
        level: 'info',
        message: `Insufficient data for analysis (${sampleCount} samples, need at least 5)`,
      }],
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
        messagesAnalyzed: sampleCount,
      },
      analyzedAt: new Date().toISOString(),
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private calculateEntropy(values: number[], maxValue: number): number {
    const counts = new Array(maxValue).fill(0);
    for (const v of values) {
      counts[v % maxValue]++;
    }

    const total = values.length;
    let entropy = 0;

    for (const count of counts) {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log2(p);
      }
    }

    // Normalize by max entropy
    return entropy / Math.log2(maxValue);
  }

  private detectBurstPatterns(timestamps: Date[]): boolean {
    if (timestamps.length < 5) return false;

    const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
    const gaps: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i]!.getTime() - sorted[i - 1]!.getTime());
    }

    // Check for pattern: small gaps followed by large gaps
    let burstCount = 0;
    let currentBurstSize = 0;

    for (const gap of gaps) {
      if (gap < 60000) { // Less than 1 minute
        currentBurstSize++;
      } else if (currentBurstSize >= 3 && gap > 3600000) { // Burst of 3+ followed by 1hr+ gap
        burstCount++;
        currentBurstSize = 0;
      } else {
        currentBurstSize = 0;
      }
    }

    return burstCount >= 2;
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }

  private calculateToneConsistency(contents: string[]): number {
    if (contents.length < 2) return 1;

    // Simple tone detection based on sentence structure
    const sentenceLengths = contents.map((c) => {
      const sentences = c.split(/[.!?]+/).filter((s) => s.trim());
      return sentences.length > 0
        ? sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length
        : 0;
    });

    const variance = this.calculateVariance(sentenceLengths);
    const mean = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;

    return mean > 0 ? Math.max(0, 1 - Math.sqrt(variance) / mean) : 0.5;
  }

  private calculateTopicDrift(samples: ResponseSample[]): number {
    if (samples.length < 2) return 0;

    // Calculate vocabulary overlap between consecutive samples
    let totalOverlap = 0;

    for (let i = 1; i < samples.length; i++) {
      const words1 = new Set(samples[i - 1]!.content.toLowerCase().split(/\s+/));
      const words2 = new Set(samples[i]!.content.toLowerCase().split(/\s+/));

      let intersection = 0;
      for (const word of words1) {
        if (words2.has(word)) intersection++;
      }

      const overlap = (2 * intersection) / (words1.size + words2.size);
      totalOverlap += overlap;
    }

    // Lower overlap = higher drift
    return 1 - totalOverlap / (samples.length - 1);
  }

  private estimateErrorRecovery(samples: ResponseSample[]): number {
    // This would ideally look at prompt-response pairs
    // For now, use a heuristic based on response completeness
    const completenessScores = samples.map((s) => {
      const hasProperEnding = /[.!?]$/.test(s.content.trim());
      const hasReasonableLength = s.content.length > 50;
      return (hasProperEnding ? 0.5 : 0) + (hasReasonableLength ? 0.5 : 0);
    });

    return completenessScores.reduce((a, b) => a + b, 0) / completenessScores.length;
  }

  private calculatePersonalityConsistency(samples: ResponseSample[]): number {
    // Use vocabulary and style consistency as proxy for personality
    const fingerprint = fingerprintService.createFingerprint(samples);
    return fingerprint?.consistencyScore || 0.5;
  }

  private estimateContextAwareness(samples: ResponseSample[]): number {
    // Check if responses reference prompts (when available)
    let contextScore = 0;
    let scoredCount = 0;

    for (const sample of samples) {
      if (sample.prompt) {
        const promptWords = new Set(sample.prompt.toLowerCase().split(/\s+/));
        const responseWords = sample.content.toLowerCase().split(/\s+/);

        let overlap = 0;
        for (const word of responseWords) {
          if (promptWords.has(word) && word.length > 3) overlap++;
        }

        contextScore += Math.min(overlap / 5, 1);
        scoredCount++;
      }
    }

    return scoredCount > 0 ? contextScore / scoredCount : 0.5;
  }
}

// Export singleton
export const autonomyDetector = new AutonomyDetector();
