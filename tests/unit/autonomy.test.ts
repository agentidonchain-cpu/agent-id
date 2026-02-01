/**
 * Tests for Autonomy Detector
 */

import { describe, it, expect } from 'vitest';
import {
  AutonomyDetector,
  autonomyDetector,
} from '../../src/services/autonomy/detector.js';
import type { ResponseSample } from '../../src/services/autonomy/fingerprint.js';

describe('AutonomyDetector', () => {
  const createAISamples = (count: number): ResponseSample[] => {
    const samples: ResponseSample[] = [];
    const baseTime = new Date();

    for (let i = 0; i < count; i++) {
      // AI-like: consistent latency, no typos, proper formatting
      samples.push({
        content: `This is a well-structured response that demonstrates clear thinking. The content is coherent and follows proper grammar rules. Each sentence is properly punctuated. Response number ${i + 1}.`,
        latencyMs: 1200 + Math.random() * 300, // 1200-1500ms, consistent
        timestamp: new Date(baseTime.getTime() + i * 7200000), // Every 2 hours
        prompt: 'What can you help with?',
      });
    }

    return samples;
  };

  const createHumanSamples = (count: number): ResponseSample[] => {
    const samples: ResponseSample[] = [];
    const baseTime = new Date();
    baseTime.setHours(10); // Human work hours

    for (let i = 0; i < count; i++) {
      // Human-like: very variable latency (some very fast typing, some very slow thinking)
      // Mix of <200ms (quick copy-paste) and >15s (slow typing/thinking)
      const latencyOptions = [
        150, 180, 120, // Very fast - copy-paste behavior
        15000, 18000, 22000, 25000, 30000, // Very slow - human typing
        8000, 12000, // Medium slow
      ];
      const latency = latencyOptions[i % latencyOptions.length]!;

      // Human-like: variable latency, typos, filler words
      samples.push({
        content: `um, well, i think this is basically what you need... like, the answer is definately somewhere in here. teh main point is that we should probably look at this more carefully, you know?`,
        latencyMs: latency,
        timestamp: new Date(baseTime.getTime() + i * 1800000), // Every 30 min, clustered
        prompt: 'What can you help with?',
      });
    }

    return samples;
  };

  const createMixedSamples = (count: number): ResponseSample[] => {
    const samples: ResponseSample[] = [];
    const baseTime = new Date();

    for (let i = 0; i < count; i++) {
      if (i % 2 === 0) {
        // AI-like
        samples.push({
          content: 'This is a well-structured response with proper grammar.',
          latencyMs: 1300 + Math.random() * 200,
          timestamp: new Date(baseTime.getTime() + i * 3600000),
        });
      } else {
        // Human-like
        samples.push({
          content: 'um yeah so like, i think maybe this is the answer?',
          latencyMs: 5000 + Math.random() * 10000,
          timestamp: new Date(baseTime.getTime() + i * 3600000),
        });
      }
    }

    return samples;
  };

  describe('Autonomy Analysis', () => {
    it('should return insufficient data result for few samples', () => {
      const samples = createAISamples(3);
      const result = autonomyDetector.analyze(
        'test-hash',
        samples,
        new Date(Date.now() - 86400000),
        new Date()
      );

      expect(result.confidence).toBeLessThan(0.2);
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0]!.level).toBe('info');
    });

    it('should classify AI-like responses as autonomous', () => {
      const samples = createAISamples(20);
      const result = autonomyDetector.analyze(
        'test-hash',
        samples,
        new Date(Date.now() - 86400000),
        new Date()
      );

      expect(result.autonomyScore).toBeGreaterThan(0.6);
      expect(result.classification).toMatch(/fully_autonomous|supervised/);
    });

    it('should classify human-like responses as controlled', () => {
      const samples = createHumanSamples(20);
      const result = autonomyDetector.analyze(
        'test-hash',
        samples,
        new Date(Date.now() - 86400000),
        new Date()
      );

      expect(result.autonomyScore).toBeLessThan(0.6);
      expect(result.classification).toMatch(/human_controlled|hybrid_suspicious/);
    });

    it('should classify mixed responses as suspicious', () => {
      const samples = createMixedSamples(20);
      const result = autonomyDetector.analyze(
        'test-hash',
        samples,
        new Date(Date.now() - 86400000),
        new Date()
      );

      expect(result.classification).toMatch(/supervised|hybrid_suspicious/);
    });
  });

  describe('Timing Features', () => {
    it('should detect API-range latency for AI', () => {
      const detector = new AutonomyDetector();
      const samples = createAISamples(10);
      const features = detector.extractTimingFeatures(samples);

      expect(features.apiRangeRatio).toBeGreaterThan(0.8);
      expect(features.humanTimingRatio).toBeLessThan(0.2);
    });

    it('should detect human timing patterns', () => {
      const detector = new AutonomyDetector();
      const samples = createHumanSamples(10);
      const features = detector.extractTimingFeatures(samples);

      expect(features.latencyCV).toBeGreaterThan(0.3); // High variance
    });

    it('should calculate timing score correctly', () => {
      const detector = new AutonomyDetector();

      const aiSamples = createAISamples(10);
      const humanSamples = createHumanSamples(10);

      const aiResult = detector.analyze('ai', aiSamples, new Date(), new Date());
      const humanResult = detector.analyze('human', humanSamples, new Date(), new Date());

      expect(aiResult.scores.timing).toBeGreaterThan(humanResult.scores.timing);
    });
  });

  describe('Language Features', () => {
    it('should detect typos', () => {
      const detector = new AutonomyDetector();
      const samples: ResponseSample[] = [];

      for (let i = 0; i < 10; i++) {
        samples.push({
          content: 'teh quick brown fox definately jumped over teh lazy dog. Occured yesterday.',
          latencyMs: 1500,
          timestamp: new Date(),
        });
      }

      const features = detector.extractLanguageFeatures(samples);

      expect(features.typoRate).toBeGreaterThan(0);
    });

    it('should detect filler words', () => {
      const detector = new AutonomyDetector();
      const samples: ResponseSample[] = [];

      for (let i = 0; i < 10; i++) {
        samples.push({
          content: 'Well, um, I think, like, basically this is, you know, the answer. Actually, honestly, it just seems right.',
          latencyMs: 1500,
          timestamp: new Date(),
        });
      }

      const features = detector.extractLanguageFeatures(samples);

      expect(features.fillerWordRate).toBeGreaterThan(0.02);
    });

    it('should calculate language score correctly', () => {
      const detector = new AutonomyDetector();

      const aiSamples = createAISamples(10);
      const humanSamples = createHumanSamples(10);

      const aiResult = detector.analyze('ai', aiSamples, new Date(), new Date());
      const humanResult = detector.analyze('human', humanSamples, new Date(), new Date());

      expect(aiResult.scores.language).toBeGreaterThan(humanResult.scores.language);
    });
  });

  describe('Pattern Detection', () => {
    it('should detect suspicious timing or have low timing score for human samples', () => {
      const samples = createHumanSamples(20);
      const result = autonomyDetector.analyze(
        'test-hash',
        samples,
        new Date(Date.now() - 86400000),
        new Date()
      );

      const timingPatterns = result.patterns.filter(
        (p) => p.type === 'suspicious_timing' || p.type === 'time_clustering'
      );

      // Either detect patterns OR have a lower timing score (below 0.7)
      const hasPatterns = timingPatterns.length > 0;
      const hasLowTimingScore = result.scores.timing < 0.7;

      expect(hasPatterns || hasLowTimingScore).toBe(true);
    });

    it('should detect typo presence pattern', () => {
      const samples: ResponseSample[] = [];
      for (let i = 0; i < 10; i++) {
        samples.push({
          content: 'teh recieve seperate definately occured untill tommorow wiht thier knowlege',
          latencyMs: 1500,
          timestamp: new Date(Date.now() + i * 3600000),
        });
      }

      const result = autonomyDetector.analyze(
        'test-hash',
        samples,
        new Date(Date.now() - 86400000),
        new Date()
      );

      const typoPattern = result.patterns.find((p) => p.type === 'typo_presence');
      expect(typoPattern).toBeDefined();
      expect(typoPattern!.severity).toBe('high');
    });

    it('should detect filler word patterns', () => {
      const samples: ResponseSample[] = [];
      for (let i = 0; i < 10; i++) {
        samples.push({
          content: 'Um, like, you know, basically, I mean, honestly, well, so, um, right, actually, like, um.',
          latencyMs: 1500,
          timestamp: new Date(Date.now() + i * 3600000),
        });
      }

      const result = autonomyDetector.analyze(
        'test-hash',
        samples,
        new Date(Date.now() - 86400000),
        new Date()
      );

      const fillerPattern = result.patterns.find((p) => p.type === 'filler_words');
      expect(fillerPattern).toBeDefined();
    });
  });

  describe('Alert Generation', () => {
    it('should generate critical alert for human-controlled', () => {
      const samples = createHumanSamples(20);
      const result = autonomyDetector.analyze(
        'test-hash',
        samples,
        new Date(Date.now() - 86400000),
        new Date()
      );

      if (result.classification === 'human_controlled') {
        const criticalAlert = result.alerts.find((a) => a.level === 'critical');
        expect(criticalAlert).toBeDefined();
      }
    });

    it('should include recommendations in alerts', () => {
      const samples = createHumanSamples(20);
      const result = autonomyDetector.analyze(
        'test-hash',
        samples,
        new Date(Date.now() - 86400000),
        new Date()
      );

      const alertsWithRecommendations = result.alerts.filter((a) => a.recommendation);

      if (result.autonomyScore < 0.6) {
        expect(alertsWithRecommendations.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Classification', () => {
    it('should correctly classify based on score thresholds', () => {
      // We test the classification by creating samples that should
      // produce different scores

      const highAutonomySamples = createAISamples(30);
      const lowAutonomySamples = createHumanSamples(30);

      const highResult = autonomyDetector.analyze(
        'high',
        highAutonomySamples,
        new Date(),
        new Date()
      );

      const lowResult = autonomyDetector.analyze(
        'low',
        lowAutonomySamples,
        new Date(),
        new Date()
      );

      // High autonomy should be fully_autonomous or supervised
      expect(['fully_autonomous', 'supervised']).toContain(highResult.classification);

      // Low autonomy should be hybrid_suspicious or human_controlled
      expect(['hybrid_suspicious', 'human_controlled']).toContain(lowResult.classification);
    });
  });

  describe('Confidence Calculation', () => {
    it('should increase confidence with more samples', () => {
      const smallSamples = createAISamples(5);
      const largeSamples = createAISamples(50);

      const smallResult = autonomyDetector.analyze(
        'small',
        smallSamples,
        new Date(),
        new Date()
      );

      const largeResult = autonomyDetector.analyze(
        'large',
        largeSamples,
        new Date(),
        new Date()
      );

      expect(largeResult.confidence).toBeGreaterThan(smallResult.confidence);
    });
  });

  describe('Period Tracking', () => {
    it('should include correct period information', () => {
      const samples = createAISamples(10);
      const periodStart = new Date('2026-01-01');
      const periodEnd = new Date('2026-01-31');

      const result = autonomyDetector.analyze(
        'test-hash',
        samples,
        periodStart,
        periodEnd
      );

      expect(result.period.start).toBe(periodStart.toISOString());
      expect(result.period.end).toBe(periodEnd.toISOString());
      expect(result.period.messagesAnalyzed).toBe(10);
    });
  });
});
