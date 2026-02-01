/**
 * Agent007 - Advanced Autonomy Detector Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FeatureExtractor,
  type MLFeatures,
} from '../../src/services/autonomy/advanced-detector.js';
import type { ResponseSample } from '../../src/services/autonomy/fingerprint.js';

// Helper to create response samples
function createSamples(count: number, options: {
  baseLatency?: number;
  latencyVariance?: number;
  content?: string | ((i: number) => string);
  timestampGapMs?: number;
} = {}): ResponseSample[] {
  const {
    baseLatency = 150,
    latencyVariance = 50,
    content = (i: number) => `Response number ${i} with some varied content.`,
    timestampGapMs = 60000,
  } = options;

  const samples: ResponseSample[] = [];
  const baseTime = Date.now() - count * timestampGapMs;

  for (let i = 0; i < count; i++) {
    samples.push({
      content: typeof content === 'function' ? content(i) : content,
      latencyMs: baseLatency + (Math.random() * latencyVariance - latencyVariance / 2),
      timestamp: new Date(baseTime + i * timestampGapMs),
    });
  }

  return samples;
}

describe('FeatureExtractor', () => {
  let extractor: FeatureExtractor;

  beforeEach(() => {
    extractor = new FeatureExtractor();
  });

  // ===========================================================================
  // FEATURE EXTRACTION
  // ===========================================================================

  describe('extractFeatures', () => {
    it('should extract features from response samples', () => {
      const samples = createSamples(10);
      const features = extractor.extractFeatures(samples);

      expect(features).toBeDefined();
      expect(features.timingMean).toBeGreaterThan(0);
      expect(features.vocabularyRichness).toBeGreaterThan(0);
      expect(features.formalityScore).toBeGreaterThanOrEqual(0);
    });

    it('should calculate vocabulary richness correctly', () => {
      const lowDiversitySamples = createSamples(5, {
        content: 'the the the the the',
      });

      const highDiversitySamples = createSamples(5, {
        content: 'The quick brown fox jumps over the lazy dog today',
      });

      const lowFeatures = extractor.extractFeatures(lowDiversitySamples);
      const highFeatures = extractor.extractFeatures(highDiversitySamples);

      // High diversity should have higher vocabulary richness
      expect(highFeatures.vocabularyRichness).toBeGreaterThan(lowFeatures.vocabularyRichness);
    });

    it('should calculate sentence complexity', () => {
      const simpleSamples = createSamples(5, {
        content: 'Hi. Yes. No. Ok.',
      });

      const complexSamples = createSamples(5, {
        content: 'This is a much more complex sentence with multiple clauses and detailed explanations.',
      });

      const simpleFeatures = extractor.extractFeatures(simpleSamples);
      const complexFeatures = extractor.extractFeatures(complexSamples);

      expect(complexFeatures.sentenceComplexity).toBeGreaterThan(simpleFeatures.sentenceComplexity);
    });

    it('should detect hedging language', () => {
      const hedgingSamples = createSamples(5, {
        content: 'I think maybe perhaps this could possibly be correct, but I am not sure.',
      });

      const directSamples = createSamples(5, {
        content: 'The answer is definitely correct. This is the solution.',
      });

      const hedgingFeatures = extractor.extractFeatures(hedgingSamples);
      const directFeatures = extractor.extractFeatures(directSamples);

      expect(hedgingFeatures.hedgingRatio).toBeGreaterThan(directFeatures.hedgingRatio);
    });

    it('should detect filler words', () => {
      const fillerSamples = createSamples(5, {
        content: 'Like, you know, basically I actually think, um, this is literally obvious.',
      });

      const cleanSamples = createSamples(5, {
        content: 'The analysis shows clear results. The data supports the conclusion.',
      });

      const fillerFeatures = extractor.extractFeatures(fillerSamples);
      const cleanFeatures = extractor.extractFeatures(cleanSamples);

      expect(fillerFeatures.fillerWordRatio).toBeGreaterThan(cleanFeatures.fillerWordRatio);
    });

    it('should handle empty samples gracefully', () => {
      const features = extractor.extractFeatures([]);

      expect(features).toBeDefined();
      expect(features.timingMean).toBe(1500); // Default value
    });

    it('should calculate response time consistency', () => {
      const consistentSamples = createSamples(10, {
        baseLatency: 100,
        latencyVariance: 10, // Low variance
      });

      const inconsistentSamples = createSamples(10, {
        baseLatency: 100,
        latencyVariance: 200, // High variance
      });

      const consistentFeatures = extractor.extractFeatures(consistentSamples);
      const inconsistentFeatures = extractor.extractFeatures(inconsistentSamples);

      expect(consistentFeatures.responseTimeConsistency).toBeGreaterThan(
        inconsistentFeatures.responseTimeConsistency
      );
    });

    it('should calculate formality score', () => {
      const formalSamples = createSamples(5, {
        content: 'Therefore, furthermore, and consequently, regarding this matter, we conclude.',
      });

      const informalSamples = createSamples(5, {
        content: 'gonna wanna gotta lol haha!!!! kinda cool',
      });

      const formalFeatures = extractor.extractFeatures(formalSamples);
      const informalFeatures = extractor.extractFeatures(informalSamples);

      expect(formalFeatures.formalityScore).toBeGreaterThan(informalFeatures.formalityScore);
    });

    it('should detect repetition', () => {
      const repetitiveSamples = createSamples(10, {
        content: 'This is the response. This is the response. This is the response.',
      });

      const variedSamples = createSamples(10, {
        content: (i) => `This is response ${i} with unique content about topic ${i * 2}.`,
      });

      const repetitiveFeatures = extractor.extractFeatures(repetitiveSamples);
      const variedFeatures = extractor.extractFeatures(variedSamples);

      expect(repetitiveFeatures.repetitionScore).toBeGreaterThan(variedFeatures.repetitionScore);
    });

    it('should calculate timing statistics', () => {
      const samples = createSamples(20);
      const features = extractor.extractFeatures(samples);

      expect(features.timingMean).toBeGreaterThan(0);
      expect(features.timingStdDev).toBeGreaterThanOrEqual(0);
      expect(typeof features.timingSkewness).toBe('number');
      expect(typeof features.timingKurtosis).toBe('number');
    });

    it('should calculate session features', () => {
      const samples = createSamples(15, {
        timestampGapMs: 120000, // 2 minute gaps
      });

      const features = extractor.extractFeatures(samples);

      expect(features.sessionDuration).toBeGreaterThan(0);
      expect(features.messagesPerSession).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle single sample', () => {
      const samples = createSamples(1);
      const features = extractor.extractFeatures(samples);

      expect(features).toBeDefined();
      expect(features.timingMean).toBeGreaterThan(0);
    });

    it('should handle samples with empty content', () => {
      const samples: ResponseSample[] = [
        { content: '', latencyMs: 100, timestamp: new Date() },
        { content: '', latencyMs: 120, timestamp: new Date() },
      ];

      const features = extractor.extractFeatures(samples);

      expect(features).toBeDefined();
      expect(features.vocabularyRichness).toBe(0);
    });

    it('should handle very long content', () => {
      const longContent = 'word '.repeat(10000);
      const samples = createSamples(3, { content: longContent });

      const features = extractor.extractFeatures(samples);

      expect(features).toBeDefined();
      expect(features.vocabularyRichness).toBeLessThan(0.01); // Very repetitive
    });

    it('should handle special characters', () => {
      const samples = createSamples(5, {
        content: '!@#$%^&*()_+-=[]{}|;:,.<>?',
      });

      const features = extractor.extractFeatures(samples);

      expect(features).toBeDefined();
    });
  });

  // ===========================================================================
  // FEATURE RANGES
  // ===========================================================================

  describe('feature ranges', () => {
    it('should return features in valid ranges', () => {
      const samples = createSamples(20);
      const features = extractor.extractFeatures(samples);

      // Ratios should be between 0 and 1
      expect(features.vocabularyRichness).toBeGreaterThanOrEqual(0);
      expect(features.vocabularyRichness).toBeLessThanOrEqual(1);

      expect(features.formalityScore).toBeGreaterThanOrEqual(0);
      expect(features.formalityScore).toBeLessThanOrEqual(1);

      expect(features.coherenceScore).toBeGreaterThanOrEqual(0);
      expect(features.coherenceScore).toBeLessThanOrEqual(1);

      // Timing should be positive
      expect(features.timingMean).toBeGreaterThan(0);
      expect(features.timingStdDev).toBeGreaterThanOrEqual(0);
    });
  });
});
