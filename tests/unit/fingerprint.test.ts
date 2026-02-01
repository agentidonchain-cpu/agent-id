/**
 * Tests for Behavioral Fingerprint Service
 */

import { describe, it, expect } from 'vitest';
import {
  FingerprintService,
  fingerprintService,
  type ResponseSample,
} from '../../src/services/autonomy/fingerprint.js';

describe('FingerprintService', () => {
  const createSamples = (count: number, options?: {
    avgLatency?: number;
    contentTemplate?: string;
  }): ResponseSample[] => {
    const samples: ResponseSample[] = [];
    const avgLatency = options?.avgLatency || 1500;
    const template = options?.contentTemplate || 'This is a test response with some content. It has multiple sentences. The writing style is consistent.';

    for (let i = 0; i < count; i++) {
      samples.push({
        content: template + ` Response number ${i + 1}.`,
        latencyMs: avgLatency + (Math.random() - 0.5) * 500,
        timestamp: new Date(Date.now() - i * 3600000), // 1 hour apart
      });
    }

    return samples;
  };

  describe('Fingerprint Creation', () => {
    it('should return null for insufficient samples', () => {
      const samples = createSamples(3);
      const fingerprint = fingerprintService.createFingerprint(samples);

      expect(fingerprint).toBeNull();
    });

    it('should create fingerprint with minimum samples', () => {
      const samples = createSamples(5);
      const fingerprint = fingerprintService.createFingerprint(samples);

      expect(fingerprint).not.toBeNull();
      expect(fingerprint!.sampleSize).toBe(5);
    });

    it('should calculate latency statistics correctly', () => {
      const samples = createSamples(10, { avgLatency: 2000 });
      const fingerprint = fingerprintService.createFingerprint(samples);

      expect(fingerprint!.latency.mean).toBeGreaterThan(1500);
      expect(fingerprint!.latency.mean).toBeLessThan(2500);
      expect(fingerprint!.latency.sampleCount).toBe(10);
    });

    it('should analyze vocabulary', () => {
      const samples = createSamples(10);
      const fingerprint = fingerprintService.createFingerprint(samples);

      expect(fingerprint!.vocabulary.uniqueWordCount).toBeGreaterThan(5);
      expect(fingerprint!.vocabulary.avgSentenceLength).toBeGreaterThan(0);
      expect(fingerprint!.vocabulary.typeTokenRatio).toBeGreaterThan(0);
      expect(fingerprint!.vocabulary.typeTokenRatio).toBeLessThanOrEqual(1);
    });

    it('should detect formatting preferences', () => {
      const samplesWithBullets: ResponseSample[] = [];
      for (let i = 0; i < 5; i++) {
        samplesWithBullets.push({
          content: `Here are some points:\n- First point\n- Second point\n- Third point`,
          latencyMs: 1500,
          timestamp: new Date(),
        });
      }

      const fingerprint = fingerprintService.createFingerprint(samplesWithBullets);

      expect(fingerprint!.style.formattingPreferences).toContain('bullet_lists');
    });

    it('should set isBaseline flag correctly', () => {
      const samples = createSamples(5);

      const baseline = fingerprintService.createFingerprint(samples, true);
      const regular = fingerprintService.createFingerprint(samples, false);

      expect(baseline!.isBaseline).toBe(true);
      expect(regular!.isBaseline).toBe(false);
    });
  });

  describe('Fingerprint Comparison', () => {
    it('should return high similarity for identical samples', () => {
      const samples = createSamples(10);
      const baseline = fingerprintService.createFingerprint(samples, true)!;
      const current = fingerprintService.createFingerprint(samples, false)!;

      const comparison = fingerprintService.compareFingerprints(baseline, current);

      expect(comparison.similarity).toBeGreaterThan(0.9);
      expect(comparison.matches).toBe(true);
      expect(comparison.anomalies).toHaveLength(0);
    });

    it('should detect latency changes', () => {
      const baselineSamples = createSamples(10, { avgLatency: 1500 });
      const changedSamples = createSamples(10, { avgLatency: 5000 });

      const baseline = fingerprintService.createFingerprint(baselineSamples, true)!;
      const current = fingerprintService.createFingerprint(changedSamples, false)!;

      const comparison = fingerprintService.compareFingerprints(baseline, current);

      expect(comparison.components.latency).toBeLessThan(0.7);
    });

    it('should detect vocabulary changes', () => {
      const technicalSamples: ResponseSample[] = [];
      const casualSamples: ResponseSample[] = [];

      for (let i = 0; i < 10; i++) {
        technicalSamples.push({
          content: 'The implementation utilizes sophisticated algorithms for optimal performance metrics.',
          latencyMs: 1500,
          timestamp: new Date(),
        });
        casualSamples.push({
          content: 'Hey! This is pretty cool stuff, you know? Like, really awesome and fun!',
          latencyMs: 1500,
          timestamp: new Date(),
        });
      }

      const baseline = fingerprintService.createFingerprint(technicalSamples, true)!;
      const current = fingerprintService.createFingerprint(casualSamples, false)!;

      const comparison = fingerprintService.compareFingerprints(baseline, current);

      expect(comparison.components.vocabulary).toBeLessThan(0.8);
    });

    it('should calculate confidence based on sample size', () => {
      const smallSamples = createSamples(5);
      const largeSamples = createSamples(30);

      const baseline = fingerprintService.createFingerprint(largeSamples, true)!;
      const smallCurrent = fingerprintService.createFingerprint(smallSamples, false)!;
      const largeCurrent = fingerprintService.createFingerprint(largeSamples, false)!;

      const smallComparison = fingerprintService.compareFingerprints(baseline, smallCurrent);
      const largeComparison = fingerprintService.compareFingerprints(baseline, largeCurrent);

      expect(largeComparison.confidence).toBeGreaterThan(smallComparison.confidence);
    });
  });

  describe('Latency Analysis', () => {
    it('should calculate percentiles correctly', () => {
      const service = new FingerprintService();
      const samples = createSamples(100);
      const latency = service.analyzeLatency(samples);

      expect(latency.p50).toBeLessThanOrEqual(latency.p95);
      expect(latency.p95).toBeLessThanOrEqual(latency.p99);
    });
  });

  describe('Style Analysis', () => {
    it('should detect emoji usage', () => {
      const samplesWithEmoji: ResponseSample[] = [];
      for (let i = 0; i < 5; i++) {
        samplesWithEmoji.push({
          content: 'This is great! 😀🎉 I love it! 🚀',
          latencyMs: 1500,
          timestamp: new Date(),
        });
      }

      const fingerprint = fingerprintService.createFingerprint(samplesWithEmoji);

      expect(fingerprint!.style.emojiUsage).toBeGreaterThan(0);
    });

    it('should detect capitalization style', () => {
      const allLowerSamples: ResponseSample[] = [];
      for (let i = 0; i < 5; i++) {
        allLowerSamples.push({
          content: 'this is all lowercase text without any capitals at all',
          latencyMs: 1500,
          timestamp: new Date(),
        });
      }

      const fingerprint = fingerprintService.createFingerprint(allLowerSamples);

      expect(fingerprint!.style.capitalizationStyle).toBe('all_lower');
    });
  });
});
