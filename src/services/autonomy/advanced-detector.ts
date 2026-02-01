/**
 * Agent007 - Advanced ML Autonomy Detector
 *
 * Uses advanced machine learning techniques for detecting
 * human-controlled agents ("human slop").
 */

import {
  AutonomyClassification,
  type AutonomyAnalysis,
  type AutonomyScores,
  type AutonomyPattern,
  type AutonomyAlert,
} from '../../types/identity.js';
import type { ResponseSample } from './fingerprint.js';
import { logger } from '../../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface MLFeatures {
  // Timing features
  timingMean: number;
  timingStdDev: number;
  timingSkewness: number;
  timingKurtosis: number;
  burstRatio: number;
  nightActivityRatio: number;
  weekendActivityRatio: number;
  responseTimeConsistency: number;

  // Language features
  vocabularyRichness: number;
  sentenceComplexity: number;
  typoRatio: number;
  fillerWordRatio: number;
  hedgingRatio: number;
  emotionalVariance: number;
  formalityScore: number;
  coherenceScore: number;

  // Behavioral features
  topicConsistency: number;
  responsePatternEntropy: number;
  editDistanceVariance: number;
  repetitionScore: number;
  creativityScore: number;
  factualConsistency: number;

  // Session features
  sessionDuration: number;
  messagesPerSession: number;
  sessionGapVariance: number;
  multiTaskingScore: number;
}

export interface MLPrediction {
  /** Probability of being autonomous (0-1) */
  autonomyProbability: number;

  /** Confidence in the prediction (0-1) */
  confidence: number;

  /** Feature importances */
  featureImportances: Record<string, number>;

  /** Top contributing features */
  topFeatures: Array<{
    feature: string;
    importance: number;
    value: number;
    direction: 'supports_autonomous' | 'supports_human';
  }>;

  /** Anomaly score */
  anomalyScore: number;

  /** Cluster assignment (if applicable) */
  cluster?: string;
}

export interface AdvancedAnalysis extends AutonomyAnalysis {
  /** ML prediction details */
  mlPrediction: MLPrediction;

  /** Feature values used */
  features: MLFeatures;

  /** Comparison to baseline */
  baselineComparison?: {
    deviation: number;
    significantChanges: string[];
  };

  /** Risk assessment */
  riskAssessment: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    recommendation: string;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Trained model weights (simplified logistic regression)
// In production, this would be loaded from a trained model file
const MODEL_WEIGHTS: Record<string, number> = {
  timingMean: -0.001,
  timingStdDev: 0.002,
  timingSkewness: -0.1,
  timingKurtosis: -0.05,
  burstRatio: -0.8,
  nightActivityRatio: 0.3,
  weekendActivityRatio: -0.2,
  responseTimeConsistency: 0.5,
  vocabularyRichness: 0.4,
  sentenceComplexity: 0.3,
  typoRatio: -1.5,
  fillerWordRatio: -1.2,
  hedgingRatio: -0.8,
  emotionalVariance: -0.6,
  formalityScore: 0.4,
  coherenceScore: 0.6,
  topicConsistency: 0.5,
  responsePatternEntropy: 0.3,
  editDistanceVariance: 0.2,
  repetitionScore: -0.4,
  creativityScore: 0.3,
  factualConsistency: 0.4,
  sessionDuration: -0.001,
  messagesPerSession: 0.02,
  sessionGapVariance: 0.1,
  multiTaskingScore: 0.3,
};

const MODEL_BIAS = 0.5;

// Thresholds for classification
const THRESHOLDS = {
  fullyAutonomous: 0.85,
  supervised: 0.60,
  hybridSuspicious: 0.40,
};

// =============================================================================
// FEATURE EXTRACTION
// =============================================================================

export class FeatureExtractor {
  /**
   * Extract all ML features from response samples
   */
  extractFeatures(samples: ResponseSample[]): MLFeatures {
    if (samples.length === 0) {
      return this.getDefaultFeatures();
    }

    return {
      // Timing features
      timingMean: this.calculateMean(samples.map((s) => s.latencyMs)),
      timingStdDev: this.calculateStdDev(samples.map((s) => s.latencyMs)),
      timingSkewness: this.calculateSkewness(samples.map((s) => s.latencyMs)),
      timingKurtosis: this.calculateKurtosis(samples.map((s) => s.latencyMs)),
      burstRatio: this.calculateBurstRatio(samples),
      nightActivityRatio: this.calculateNightActivityRatio(samples),
      weekendActivityRatio: this.calculateWeekendActivityRatio(samples),
      responseTimeConsistency: this.calculateResponseTimeConsistency(samples),

      // Language features
      vocabularyRichness: this.calculateVocabularyRichness(samples),
      sentenceComplexity: this.calculateSentenceComplexity(samples),
      typoRatio: this.calculateTypoRatio(samples),
      fillerWordRatio: this.calculateFillerWordRatio(samples),
      hedgingRatio: this.calculateHedgingRatio(samples),
      emotionalVariance: this.calculateEmotionalVariance(samples),
      formalityScore: this.calculateFormalityScore(samples),
      coherenceScore: this.calculateCoherenceScore(samples),

      // Behavioral features
      topicConsistency: this.calculateTopicConsistency(samples),
      responsePatternEntropy: this.calculateResponsePatternEntropy(samples),
      editDistanceVariance: this.calculateEditDistanceVariance(samples),
      repetitionScore: this.calculateRepetitionScore(samples),
      creativityScore: this.calculateCreativityScore(samples),
      factualConsistency: this.calculateFactualConsistency(samples),

      // Session features
      sessionDuration: this.calculateSessionDuration(samples),
      messagesPerSession: this.calculateMessagesPerSession(samples),
      sessionGapVariance: this.calculateSessionGapVariance(samples),
      multiTaskingScore: this.calculateMultiTaskingScore(samples),
    };
  }

  private getDefaultFeatures(): MLFeatures {
    return {
      timingMean: 1500,
      timingStdDev: 300,
      timingSkewness: 0,
      timingKurtosis: 0,
      burstRatio: 0.1,
      nightActivityRatio: 0.1,
      weekendActivityRatio: 0.2,
      responseTimeConsistency: 0.8,
      vocabularyRichness: 0.5,
      sentenceComplexity: 0.5,
      typoRatio: 0,
      fillerWordRatio: 0,
      hedgingRatio: 0.1,
      emotionalVariance: 0.2,
      formalityScore: 0.7,
      coherenceScore: 0.8,
      topicConsistency: 0.8,
      responsePatternEntropy: 0.5,
      editDistanceVariance: 0.3,
      repetitionScore: 0.1,
      creativityScore: 0.5,
      factualConsistency: 0.8,
      sessionDuration: 3600000,
      messagesPerSession: 10,
      sessionGapVariance: 0.5,
      multiTaskingScore: 0.5,
    };
  }

  // Statistical helpers
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculateStdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = this.calculateMean(values);
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return Math.sqrt(this.calculateMean(squaredDiffs));
  }

  private calculateSkewness(values: number[]): number {
    if (values.length < 3) return 0;
    const mean = this.calculateMean(values);
    const stdDev = this.calculateStdDev(values);
    if (stdDev === 0) return 0;
    const n = values.length;
    const cubedDiffs = values.map((v) => Math.pow((v - mean) / stdDev, 3));
    return (n / ((n - 1) * (n - 2))) * cubedDiffs.reduce((a, b) => a + b, 0);
  }

  private calculateKurtosis(values: number[]): number {
    if (values.length < 4) return 0;
    const mean = this.calculateMean(values);
    const stdDev = this.calculateStdDev(values);
    if (stdDev === 0) return 0;
    const fourthPowerDiffs = values.map((v) => Math.pow((v - mean) / stdDev, 4));
    return this.calculateMean(fourthPowerDiffs) - 3;
  }

  // Timing features
  private calculateBurstRatio(samples: ResponseSample[]): number {
    if (samples.length < 2) return 0;
    const timestamps = samples.map((s) => s.timestamp.getTime()).sort((a, b) => a - b);
    let burstCount = 0;
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] - timestamps[i - 1] < 5000) burstCount++;
    }
    return burstCount / (timestamps.length - 1);
  }

  private calculateNightActivityRatio(samples: ResponseSample[]): number {
    const nightSamples = samples.filter((s) => {
      const hour = s.timestamp.getHours();
      return hour >= 23 || hour < 6;
    });
    return nightSamples.length / samples.length;
  }

  private calculateWeekendActivityRatio(samples: ResponseSample[]): number {
    const weekendSamples = samples.filter((s) => {
      const day = s.timestamp.getDay();
      return day === 0 || day === 6;
    });
    return weekendSamples.length / samples.length;
  }

  private calculateResponseTimeConsistency(samples: ResponseSample[]): number {
    if (samples.length < 5) return 0.5;
    const latencies = samples.map((s) => s.latencyMs);
    const stdDev = this.calculateStdDev(latencies);
    const mean = this.calculateMean(latencies);
    const cv = mean > 0 ? stdDev / mean : 0;
    return Math.max(0, 1 - cv);
  }

  // Language features
  private calculateVocabularyRichness(samples: ResponseSample[]): number {
    const allText = samples.map((s) => s.content).join(' ');
    const words = allText.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const uniqueWords = new Set(words);
    return words.length > 0 ? uniqueWords.size / words.length : 0;
  }

  private calculateSentenceComplexity(samples: ResponseSample[]): number {
    const allText = samples.map((s) => s.content).join(' ');
    const sentences = allText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) return 0;
    const avgLength = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;
    return Math.min(1, avgLength / 30);
  }

  private calculateTypoRatio(samples: ResponseSample[]): number {
    const commonTypos = [
      'teh', 'adn', 'taht', 'dont', 'wont', 'cant', 'didnt', 'doesnt',
      'recieve', 'beleive', 'occured', 'untill', 'definately', 'seperate',
    ];
    let typoCount = 0;
    let wordCount = 0;

    for (const sample of samples) {
      const words = sample.content.toLowerCase().split(/\s+/);
      wordCount += words.length;
      for (const word of words) {
        if (commonTypos.includes(word)) typoCount++;
      }
    }

    return wordCount > 0 ? typoCount / wordCount : 0;
  }

  private calculateFillerWordRatio(samples: ResponseSample[]): number {
    const fillerWords = [
      'um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally',
      'honestly', 'obviously', 'clearly', 'right', 'so yeah', 'i mean',
    ];
    let fillerCount = 0;
    let wordCount = 0;

    for (const sample of samples) {
      const text = sample.content.toLowerCase();
      wordCount += text.split(/\s+/).length;
      for (const filler of fillerWords) {
        const matches = text.match(new RegExp(`\\b${filler}\\b`, 'g'));
        fillerCount += matches?.length || 0;
      }
    }

    return wordCount > 0 ? fillerCount / wordCount : 0;
  }

  private calculateHedgingRatio(samples: ResponseSample[]): number {
    const hedgingPhrases = [
      'i think', 'maybe', 'perhaps', 'probably', 'might be', 'could be',
      'not sure', 'i guess', 'kind of', 'sort of', 'seems like', 'appears to',
    ];
    let hedgeCount = 0;
    let sentenceCount = 0;

    for (const sample of samples) {
      const text = sample.content.toLowerCase();
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
      sentenceCount += sentences.length;
      for (const hedge of hedgingPhrases) {
        const matches = text.match(new RegExp(hedge, 'g'));
        hedgeCount += matches?.length || 0;
      }
    }

    return sentenceCount > 0 ? Math.min(1, hedgeCount / sentenceCount) : 0;
  }

  private calculateEmotionalVariance(samples: ResponseSample[]): number {
    const emotionalWords = {
      positive: ['great', 'awesome', 'love', 'amazing', 'wonderful', 'excellent', 'happy', 'excited'],
      negative: ['bad', 'terrible', 'hate', 'awful', 'horrible', 'sad', 'angry', 'frustrated'],
    };

    const scores: number[] = [];
    for (const sample of samples) {
      const text = sample.content.toLowerCase();
      let score = 0;
      for (const word of emotionalWords.positive) {
        if (text.includes(word)) score += 1;
      }
      for (const word of emotionalWords.negative) {
        if (text.includes(word)) score -= 1;
      }
      scores.push(score);
    }

    return this.calculateStdDev(scores);
  }

  private calculateFormalityScore(samples: ResponseSample[]): number {
    let formalCount = 0;
    let informalCount = 0;

    const formalIndicators = ['therefore', 'however', 'furthermore', 'consequently', 'regarding'];
    const informalIndicators = ['gonna', 'wanna', 'gotta', 'kinda', 'lol', 'haha', '!!!!'];

    for (const sample of samples) {
      const text = sample.content.toLowerCase();
      for (const word of formalIndicators) {
        if (text.includes(word)) formalCount++;
      }
      for (const word of informalIndicators) {
        if (text.includes(word)) informalCount++;
      }
    }

    const total = formalCount + informalCount;
    return total > 0 ? formalCount / total : 0.5;
  }

  private calculateCoherenceScore(samples: ResponseSample[]): number {
    if (samples.length < 2) return 0.5;

    // Simple coherence: check if consecutive responses share vocabulary
    let coherenceSum = 0;
    for (let i = 1; i < samples.length; i++) {
      const prev = new Set(samples[i - 1].content.toLowerCase().split(/\s+/));
      const curr = samples[i].content.toLowerCase().split(/\s+/);
      const overlap = curr.filter((w) => prev.has(w)).length;
      coherenceSum += overlap / Math.max(1, curr.length);
    }

    return coherenceSum / (samples.length - 1);
  }

  // Behavioral features
  private calculateTopicConsistency(samples: ResponseSample[]): number {
    if (samples.length < 3) return 0.5;

    // Extract key terms and check consistency
    const keyTerms: Set<string>[] = samples.map((s) => {
      const words = s.content.toLowerCase().split(/\s+/);
      return new Set(words.filter((w) => w.length > 5));
    });

    let consistencySum = 0;
    for (let i = 1; i < keyTerms.length; i++) {
      const intersection = new Set([...keyTerms[i]].filter((x) => keyTerms[i - 1].has(x)));
      const union = new Set([...keyTerms[i], ...keyTerms[i - 1]]);
      consistencySum += union.size > 0 ? intersection.size / union.size : 0;
    }

    return consistencySum / (keyTerms.length - 1);
  }

  private calculateResponsePatternEntropy(samples: ResponseSample[]): number {
    if (samples.length < 5) return 0.5;

    // Calculate entropy of response lengths
    const lengths = samples.map((s) => Math.floor(s.content.length / 100));
    const counts = new Map<number, number>();
    for (const len of lengths) {
      counts.set(len, (counts.get(len) || 0) + 1);
    }

    let entropy = 0;
    for (const count of counts.values()) {
      const p = count / lengths.length;
      entropy -= p * Math.log2(p);
    }

    return Math.min(1, entropy / 4);
  }

  private calculateEditDistanceVariance(samples: ResponseSample[]): number {
    if (samples.length < 2) return 0;

    const distances: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      const dist = this.simpleEditDistance(
        samples[i - 1].content.slice(0, 100),
        samples[i].content.slice(0, 100)
      );
      distances.push(dist);
    }

    return this.calculateStdDev(distances) / 100;
  }

  private simpleEditDistance(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 0;

    let distance = 0;
    for (let i = 0; i < maxLen; i++) {
      if (a[i] !== b[i]) distance++;
    }
    return distance;
  }

  private calculateRepetitionScore(samples: ResponseSample[]): number {
    const phrases = new Map<string, number>();

    for (const sample of samples) {
      const words = sample.content.toLowerCase().split(/\s+/);
      for (let i = 0; i < words.length - 2; i++) {
        const phrase = words.slice(i, i + 3).join(' ');
        phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
      }
    }

    let repetitions = 0;
    let total = 0;
    for (const count of phrases.values()) {
      total++;
      if (count > 1) repetitions += count - 1;
    }

    return total > 0 ? repetitions / total : 0;
  }

  private calculateCreativityScore(samples: ResponseSample[]): number {
    // Measure vocabulary diversity and unique phrase usage
    const allWords = samples.flatMap((s) => s.content.toLowerCase().split(/\s+/));
    const uniqueWords = new Set(allWords);
    const diversityRatio = uniqueWords.size / Math.max(1, allWords.length);

    // Check for creative punctuation and formatting
    let formattingScore = 0;
    for (const sample of samples) {
      if (sample.content.includes('- ')) formattingScore += 0.1;
      if (sample.content.includes('* ')) formattingScore += 0.1;
      if (/\d+\.\s/.test(sample.content)) formattingScore += 0.1;
      if (sample.content.includes('\n\n')) formattingScore += 0.1;
    }

    return Math.min(1, diversityRatio + formattingScore / samples.length);
  }

  private calculateFactualConsistency(samples: ResponseSample[]): number {
    // Check for contradictions in numerical or factual statements
    const numbers = samples.flatMap((s) => {
      const matches = s.content.match(/\d+(?:\.\d+)?/g) || [];
      return matches.map(Number);
    });

    if (numbers.length < 2) return 0.8;

    // Low variance in numbers suggests consistency
    const variance = this.calculateStdDev(numbers);
    const mean = this.calculateMean(numbers);
    const cv = mean > 0 ? variance / mean : 0;

    return Math.max(0, 1 - cv / 10);
  }

  // Session features
  private calculateSessionDuration(samples: ResponseSample[]): number {
    if (samples.length < 2) return 0;
    const times = samples.map((s) => s.timestamp.getTime()).sort((a, b) => a - b);
    return times[times.length - 1] - times[0];
  }

  private calculateMessagesPerSession(samples: ResponseSample[]): number {
    if (samples.length < 2) return samples.length;

    const sessionGap = 3600000; // 1 hour
    const times = samples.map((s) => s.timestamp.getTime()).sort((a, b) => a - b);
    let sessions = 1;

    for (let i = 1; i < times.length; i++) {
      if (times[i] - times[i - 1] > sessionGap) sessions++;
    }

    return samples.length / sessions;
  }

  private calculateSessionGapVariance(samples: ResponseSample[]): number {
    if (samples.length < 3) return 0;

    const times = samples.map((s) => s.timestamp.getTime()).sort((a, b) => a - b);
    const gaps: number[] = [];

    for (let i = 1; i < times.length; i++) {
      gaps.push(times[i] - times[i - 1]);
    }

    const stdDev = this.calculateStdDev(gaps);
    const mean = this.calculateMean(gaps);

    return mean > 0 ? Math.min(1, stdDev / mean) : 0;
  }

  private calculateMultiTaskingScore(samples: ResponseSample[]): number {
    // Check for rapid topic switches
    if (samples.length < 3) return 0.5;

    let switches = 0;
    for (let i = 2; i < samples.length; i++) {
      const prev = new Set(samples[i - 1].content.toLowerCase().split(/\s+/).slice(0, 10));
      const curr = new Set(samples[i].content.toLowerCase().split(/\s+/).slice(0, 10));
      const overlap = [...curr].filter((w) => prev.has(w)).length;
      if (overlap < 2) switches++;
    }

    return Math.min(1, switches / (samples.length - 2));
  }
}

// =============================================================================
// ML PREDICTOR
// =============================================================================

export class MLPredictor {
  private featureExtractor: FeatureExtractor;

  constructor() {
    this.featureExtractor = new FeatureExtractor();
  }

  /**
   * Predict autonomy probability using ML model
   */
  predict(samples: ResponseSample[]): MLPrediction {
    const features = this.featureExtractor.extractFeatures(samples);

    // Calculate weighted sum (logistic regression)
    let logit = MODEL_BIAS;
    const featureImportances: Record<string, number> = {};
    const contributions: Array<{
      feature: string;
      importance: number;
      value: number;
      contribution: number;
    }> = [];

    for (const [feature, weight] of Object.entries(MODEL_WEIGHTS)) {
      const value = features[feature as keyof MLFeatures] as number;
      const contribution = weight * value;
      logit += contribution;
      featureImportances[feature] = Math.abs(contribution);
      contributions.push({
        feature,
        importance: Math.abs(contribution),
        value,
        contribution,
      });
    }

    // Sigmoid function
    const probability = 1 / (1 + Math.exp(-logit));

    // Sort by importance
    contributions.sort((a, b) => b.importance - a.importance);

    // Top features
    const topFeatures = contributions.slice(0, 5).map((c) => ({
      feature: c.feature,
      importance: c.importance,
      value: c.value,
      direction: (c.contribution > 0 ? 'supports_autonomous' : 'supports_human') as 'supports_autonomous' | 'supports_human',
    }));

    // Anomaly score (based on extreme feature values)
    const anomalyScore = this.calculateAnomalyScore(features);

    // Confidence based on sample size and feature consistency
    const confidence = this.calculateConfidence(samples.length, features);

    return {
      autonomyProbability: probability,
      confidence,
      featureImportances,
      topFeatures,
      anomalyScore,
    };
  }

  private calculateAnomalyScore(features: MLFeatures): number {
    const anomalies: number[] = [];

    // Check for anomalous values
    if (features.timingMean < 100) anomalies.push(0.3);
    if (features.timingStdDev < 10) anomalies.push(0.2);
    if (features.typoRatio > 0.1) anomalies.push(0.4);
    if (features.fillerWordRatio > 0.05) anomalies.push(0.3);
    if (features.burstRatio > 0.5) anomalies.push(0.3);
    if (features.vocabularyRichness < 0.1) anomalies.push(0.2);

    return anomalies.length > 0
      ? anomalies.reduce((a, b) => a + b, 0) / anomalies.length
      : 0;
  }

  private calculateConfidence(sampleCount: number, features: MLFeatures): number {
    // Base confidence on sample size
    let confidence = Math.min(1, sampleCount / 50);

    // Reduce confidence if features are at extreme values
    if (features.timingMean < 100 || features.timingMean > 10000) confidence *= 0.8;
    if (features.vocabularyRichness < 0.1 || features.vocabularyRichness > 0.9) confidence *= 0.9;

    return confidence;
  }
}

// =============================================================================
// ADVANCED AUTONOMY DETECTOR
// =============================================================================

export class AdvancedAutonomyDetector {
  private predictor: MLPredictor;
  private featureExtractor: FeatureExtractor;
  private baselineFeatures: Map<string, MLFeatures> = new Map();

  constructor() {
    this.predictor = new MLPredictor();
    this.featureExtractor = new FeatureExtractor();
  }

  /**
   * Perform advanced autonomy analysis
   */
  analyze(
    identityHash: string,
    samples: ResponseSample[],
    periodStart: Date,
    periodEnd: Date
  ): AdvancedAnalysis {
    // Get ML prediction
    const mlPrediction = this.predictor.predict(samples);

    // Extract features
    const features = this.featureExtractor.extractFeatures(samples);

    // Compare to baseline if available
    const baselineComparison = this.compareToBaseline(identityHash, features);

    // Detect patterns
    const patterns = this.detectPatterns(features, mlPrediction);

    // Generate alerts
    const alerts = this.generateAlerts(mlPrediction, patterns, baselineComparison);

    // Classify
    const classification = this.classify(mlPrediction.autonomyProbability);

    // Risk assessment
    const riskAssessment = this.assessRisk(mlPrediction, patterns, alerts);

    // Calculate individual scores
    const scores: AutonomyScores = {
      timing: this.calculateTimingScore(features),
      language: this.calculateLanguageScore(features),
      behavior: this.calculateBehaviorScore(features),
    };

    return {
      agentIdentityHash: identityHash,
      autonomyScore: mlPrediction.autonomyProbability,
      confidence: mlPrediction.confidence,
      classification,
      scores,
      patterns,
      alerts,
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
        messagesAnalyzed: samples.length,
      },
      analyzedAt: new Date().toISOString(),
      mlPrediction,
      features,
      baselineComparison,
      riskAssessment,
    };
  }

  /**
   * Set baseline features for an agent
   */
  setBaseline(identityHash: string, samples: ResponseSample[]): void {
    const features = this.featureExtractor.extractFeatures(samples);
    this.baselineFeatures.set(identityHash, features);
    logger.info({ identityHash }, 'ML baseline established');
  }

  /**
   * Get baseline features
   */
  getBaseline(identityHash: string): MLFeatures | null {
    return this.baselineFeatures.get(identityHash) || null;
  }

  private compareToBaseline(
    identityHash: string,
    current: MLFeatures
  ): { deviation: number; significantChanges: string[] } | undefined {
    const baseline = this.baselineFeatures.get(identityHash);
    if (!baseline) return undefined;

    const significantChanges: string[] = [];
    let totalDeviation = 0;
    let featureCount = 0;

    for (const key of Object.keys(current) as (keyof MLFeatures)[]) {
      const baseVal = baseline[key];
      const currVal = current[key];

      if (typeof baseVal === 'number' && typeof currVal === 'number' && baseVal !== 0) {
        const change = Math.abs(currVal - baseVal) / Math.abs(baseVal);
        totalDeviation += change;
        featureCount++;

        if (change > 0.5) {
          significantChanges.push(`${key}: ${((change - 1) * 100).toFixed(1)}% change`);
        }
      }
    }

    return {
      deviation: featureCount > 0 ? totalDeviation / featureCount : 0,
      significantChanges,
    };
  }

  private detectPatterns(features: MLFeatures, prediction: MLPrediction): AutonomyPattern[] {
    const patterns: AutonomyPattern[] = [];

    // Human-like timing patterns
    if (features.burstRatio > 0.3) {
      patterns.push({
        type: 'burst_activity',
        severity: features.burstRatio > 0.5 ? 'high' : 'medium',
        description: 'High frequency of rapid successive responses',
        evidence: { burstRatio: features.burstRatio },
        detectedAt: new Date().toISOString(),
      });
    }

    // Typo detection
    if (features.typoRatio > 0.02) {
      patterns.push({
        type: 'typo_presence',
        severity: features.typoRatio > 0.05 ? 'high' : 'medium',
        description: 'Presence of common typing errors',
        evidence: { typoRatio: features.typoRatio },
        detectedAt: new Date().toISOString(),
      });
    }

    // Filler words
    if (features.fillerWordRatio > 0.02) {
      patterns.push({
        type: 'filler_words',
        severity: features.fillerWordRatio > 0.04 ? 'high' : 'medium',
        description: 'Use of conversational filler words',
        evidence: { fillerWordRatio: features.fillerWordRatio },
        detectedAt: new Date().toISOString(),
      });
    }

    // Suspicious timing consistency
    if (features.responseTimeConsistency > 0.95 && features.timingMean < 500) {
      patterns.push({
        type: 'automated_responses',
        severity: 'high',
        description: 'Suspiciously consistent and fast response times',
        evidence: {
          consistency: features.responseTimeConsistency,
          meanLatency: features.timingMean,
        },
        detectedAt: new Date().toISOString(),
      });
    }

    // Night activity
    if (features.nightActivityRatio < 0.05) {
      patterns.push({
        type: 'human_schedule',
        severity: 'low',
        description: 'Activity follows human sleep patterns',
        evidence: { nightActivityRatio: features.nightActivityRatio },
        detectedAt: new Date().toISOString(),
      });
    }

    // Low vocabulary richness
    if (features.vocabularyRichness < 0.2) {
      patterns.push({
        type: 'limited_vocabulary',
        severity: 'medium',
        description: 'Limited vocabulary diversity',
        evidence: { vocabularyRichness: features.vocabularyRichness },
        detectedAt: new Date().toISOString(),
      });
    }

    // High emotional variance
    if (features.emotionalVariance > 2) {
      patterns.push({
        type: 'emotional_instability',
        severity: 'medium',
        description: 'High variance in emotional tone',
        evidence: { emotionalVariance: features.emotionalVariance },
        detectedAt: new Date().toISOString(),
      });
    }

    return patterns;
  }

  private generateAlerts(
    prediction: MLPrediction,
    patterns: AutonomyPattern[],
    baselineComparison?: { deviation: number; significantChanges: string[] }
  ): AutonomyAlert[] {
    const alerts: AutonomyAlert[] = [];

    // Low autonomy score
    if (prediction.autonomyProbability < 0.4) {
      alerts.push({
        level: 'critical',
        message: `Very low autonomy score: ${(prediction.autonomyProbability * 100).toFixed(1)}%`,
        triggeredBy: 'ml_prediction',
        recommendation: 'Investigate agent for potential human control',
      });
    } else if (prediction.autonomyProbability < 0.6) {
      alerts.push({
        level: 'warning',
        message: `Low autonomy score: ${(prediction.autonomyProbability * 100).toFixed(1)}%`,
        triggeredBy: 'ml_prediction',
        recommendation: 'Monitor agent behavior closely',
      });
    }

    // High anomaly score
    if (prediction.anomalyScore > 0.5) {
      alerts.push({
        level: 'warning',
        message: 'High behavioral anomaly score detected',
        triggeredBy: 'anomaly_detection',
        recommendation: 'Review recent behavior changes',
      });
    }

    // Significant baseline deviation
    if (baselineComparison && baselineComparison.deviation > 0.5) {
      alerts.push({
        level: 'warning',
        message: `Significant deviation from baseline: ${(baselineComparison.deviation * 100).toFixed(1)}%`,
        triggeredBy: 'baseline_comparison',
        recommendation: 'Verify agent configuration has not changed',
      });
    }

    // High severity patterns
    const highSeverityPatterns = patterns.filter((p) => p.severity === 'high');
    if (highSeverityPatterns.length >= 2) {
      alerts.push({
        level: 'critical',
        message: `Multiple high-severity patterns detected: ${highSeverityPatterns.map((p) => p.type).join(', ')}`,
        triggeredBy: 'pattern_detection',
        recommendation: 'Immediate review required',
      });
    }

    return alerts;
  }

  private classify(probability: number): AutonomyClassification {
    if (probability >= THRESHOLDS.fullyAutonomous) {
      return AutonomyClassification.FULLY_AUTONOMOUS;
    } else if (probability >= THRESHOLDS.supervised) {
      return AutonomyClassification.SUPERVISED;
    } else if (probability >= THRESHOLDS.hybridSuspicious) {
      return AutonomyClassification.HYBRID_SUSPICIOUS;
    } else {
      return AutonomyClassification.HUMAN_CONTROLLED;
    }
  }

  private assessRisk(
    prediction: MLPrediction,
    patterns: AutonomyPattern[],
    alerts: AutonomyAlert[]
  ): { level: 'low' | 'medium' | 'high' | 'critical'; factors: string[]; recommendation: string } {
    const factors: string[] = [];
    let riskScore = 0;

    // Autonomy probability
    if (prediction.autonomyProbability < 0.4) {
      factors.push('Very low autonomy probability');
      riskScore += 3;
    } else if (prediction.autonomyProbability < 0.6) {
      factors.push('Low autonomy probability');
      riskScore += 2;
    }

    // Confidence
    if (prediction.confidence < 0.5) {
      factors.push('Low prediction confidence');
      riskScore += 1;
    }

    // Anomaly score
    if (prediction.anomalyScore > 0.5) {
      factors.push('High anomaly score');
      riskScore += 2;
    }

    // Pattern count
    const highPatterns = patterns.filter((p) => p.severity === 'high').length;
    if (highPatterns >= 2) {
      factors.push('Multiple high-severity patterns');
      riskScore += 3;
    } else if (highPatterns === 1) {
      factors.push('High-severity pattern detected');
      riskScore += 1;
    }

    // Alert count
    const criticalAlerts = alerts.filter((a) => a.level === 'critical').length;
    if (criticalAlerts > 0) {
      factors.push('Critical alerts present');
      riskScore += 2;
    }

    let level: 'low' | 'medium' | 'high' | 'critical';
    let recommendation: string;

    if (riskScore >= 7) {
      level = 'critical';
      recommendation = 'Immediate action required. Suspend agent and investigate.';
    } else if (riskScore >= 4) {
      level = 'high';
      recommendation = 'Urgent review recommended. Increase monitoring frequency.';
    } else if (riskScore >= 2) {
      level = 'medium';
      recommendation = 'Continue monitoring. Review patterns periodically.';
    } else {
      level = 'low';
      recommendation = 'No immediate action required.';
    }

    return { level, factors, recommendation };
  }

  private calculateTimingScore(features: MLFeatures): number {
    let score = 1.0;

    // Penalize burst activity
    score -= features.burstRatio * 0.3;

    // Penalize very fast or very consistent timing
    if (features.timingMean < 200) score -= 0.2;
    if (features.responseTimeConsistency > 0.95) score -= 0.15;

    // Reward AI-typical latency range
    if (features.timingMean >= 500 && features.timingMean <= 5000) score += 0.1;

    return Math.max(0, Math.min(1, score));
  }

  private calculateLanguageScore(features: MLFeatures): number {
    let score = 1.0;

    // Penalize typos and filler words
    score -= features.typoRatio * 10;
    score -= features.fillerWordRatio * 5;
    score -= features.hedgingRatio * 2;

    // Reward formal, coherent writing
    score += features.formalityScore * 0.2;
    score += features.coherenceScore * 0.2;

    return Math.max(0, Math.min(1, score));
  }

  private calculateBehaviorScore(features: MLFeatures): number {
    let score = 1.0;

    // Reward consistency
    score += features.topicConsistency * 0.2;
    score += features.factualConsistency * 0.2;

    // Penalize repetition and low creativity
    score -= features.repetitionScore * 0.3;
    if (features.creativityScore < 0.3) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let advancedDetectorInstance: AdvancedAutonomyDetector | null = null;

export function getAdvancedAutonomyDetector(): AdvancedAutonomyDetector {
  if (!advancedDetectorInstance) {
    advancedDetectorInstance = new AdvancedAutonomyDetector();
  }
  return advancedDetectorInstance;
}

export function resetAdvancedAutonomyDetector(): void {
  advancedDetectorInstance = null;
}
