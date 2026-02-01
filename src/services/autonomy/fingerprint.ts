/**
 * Agent007 - Behavioral Fingerprint Service
 *
 * Analyzes agent responses to create a behavioral fingerprint.
 * Used to detect changes in agent behavior and identify "human slop".
 */

import { createHash } from 'crypto';
import type {
  BehavioralFingerprint,
  LatencyStatistics,
  VocabularyAnalysis,
  StyleMarkers,
} from '../../types/identity.js';

// Ed25519 signature functions - lazy loaded to handle optional dependency
let ed25519: typeof import('@noble/ed25519') | null = null;
async function getEd25519() {
  if (!ed25519) {
    try {
      ed25519 = await import('@noble/ed25519');
    } catch {
      throw new Error('@noble/ed25519 not installed. Run: npm install @noble/ed25519');
    }
  }
  return ed25519;
}

// =============================================================================
// TYPES
// =============================================================================

export interface ResponseSample {
  /** Response content */
  content: string;

  /** Response latency in milliseconds */
  latencyMs: number;

  /** Timestamp of the response */
  timestamp: Date;

  /** Optional: prompt that generated this response */
  prompt?: string;
}

export interface FingerprintComparisonResult {
  /** Overall similarity score (0.0 - 1.0) */
  similarity: number;

  /** Whether the fingerprints match (above threshold) */
  matches: boolean;

  /** Individual component similarities */
  components: {
    latency: number;
    vocabulary: number;
    style: number;
  };

  /** Detected anomalies */
  anomalies: string[];

  /** Confidence in the comparison */
  confidence: number;
}

/**
 * A behavioral fingerprint with cryptographic signature
 * Provides attestation that the fingerprint was created by a specific identity
 */
export interface SignedFingerprint {
  /** The behavioral fingerprint data */
  fingerprint: BehavioralFingerprint;

  /** Ed25519 signature of the fingerprint (hex encoded) */
  signature: string;

  /** Public key used to sign (hex encoded) */
  publicKey: string;

  /** ISO timestamp when signed */
  signedAt: string;

  /** Identity hash this fingerprint belongs to */
  identityHash: string;

  /** Attestation schema version */
  attestationVersion: '1.0';
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MIN_SAMPLES_FOR_FINGERPRINT = 5;
const SIMILARITY_THRESHOLD = 0.75;

// Common English stop words for vocabulary analysis
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
  'we', 'they', 'my', 'your', 'his', 'her', 'our', 'their', 'what', 'which',
  'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
  'only', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now',
]);

// =============================================================================
// FINGERPRINT SERVICE CLASS
// =============================================================================

export class FingerprintService {
  /**
   * Creates a behavioral fingerprint from response samples
   */
  createFingerprint(
    samples: ResponseSample[],
    isBaseline: boolean = false
  ): BehavioralFingerprint | null {
    if (samples.length < MIN_SAMPLES_FOR_FINGERPRINT) {
      return null;
    }

    const latency = this.analyzeLatency(samples);
    const vocabulary = this.analyzeVocabulary(samples);
    const style = this.analyzeStyle(samples);

    // Calculate overall consistency score
    const consistencyScore = this.calculateConsistency(samples);

    const now = new Date().toISOString();

    return {
      latency,
      vocabulary,
      style,
      consistencyScore,
      sampleSize: samples.length,
      isBaseline,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Compares two fingerprints for similarity
   */
  compareFingerprints(
    baseline: BehavioralFingerprint,
    current: BehavioralFingerprint
  ): FingerprintComparisonResult {
    const anomalies: string[] = [];

    // Compare latency patterns
    const latencySimilarity = this.compareLatency(baseline.latency, current.latency);
    if (latencySimilarity < 0.6) {
      anomalies.push('Significant latency pattern change detected');
    }

    // Compare vocabulary
    const vocabularySimilarity = this.compareVocabulary(baseline.vocabulary, current.vocabulary);
    if (vocabularySimilarity < 0.6) {
      anomalies.push('Vocabulary usage has changed significantly');
    }

    // Compare style
    const styleSimilarity = this.compareStyle(baseline.style, current.style);
    if (styleSimilarity < 0.6) {
      anomalies.push('Writing style has changed significantly');
    }

    // Calculate weighted overall similarity
    const similarity =
      latencySimilarity * 0.3 +
      vocabularySimilarity * 0.35 +
      styleSimilarity * 0.35;

    // Confidence based on sample sizes
    const confidence = Math.min(
      baseline.sampleSize / 20,
      current.sampleSize / 10,
      1.0
    );

    return {
      similarity,
      matches: similarity >= SIMILARITY_THRESHOLD,
      components: {
        latency: latencySimilarity,
        vocabulary: vocabularySimilarity,
        style: styleSimilarity,
      },
      anomalies,
      confidence,
    };
  }

  /**
   * Analyzes latency statistics from samples
   */
  analyzeLatency(samples: ResponseSample[]): LatencyStatistics {
    const latencies = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const n = latencies.length;

    // Mean
    const mean = latencies.reduce((a, b) => a + b, 0) / n;

    // Standard deviation
    const variance = latencies.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    // Percentiles
    const p50 = this.percentile(latencies, 50);
    const p95 = this.percentile(latencies, 95);
    const p99 = this.percentile(latencies, 99);

    return {
      mean,
      stdDev,
      p50,
      p95,
      p99,
      sampleCount: n,
    };
  }

  /**
   * Analyzes vocabulary usage from samples
   */
  analyzeVocabulary(samples: ResponseSample[]): VocabularyAnalysis {
    const allWords: string[] = [];
    const sentences: string[] = [];

    for (const sample of samples) {
      const words = this.tokenize(sample.content);
      allWords.push(...words);

      const sampleSentences = sample.content.split(/[.!?]+/).filter((s) => s.trim());
      sentences.push(...sampleSentences);
    }

    // Unique word count (excluding stop words)
    const uniqueWords = new Set(
      allWords.filter((w) => !STOP_WORDS.has(w.toLowerCase()))
    );
    const uniqueWordCount = uniqueWords.size;

    // Average sentence length
    const avgSentenceLength =
      sentences.length > 0
        ? sentences.reduce((sum, s) => sum + this.tokenize(s).length, 0) / sentences.length
        : 0;

    // Type-token ratio (vocabulary richness)
    const typeTokenRatio = allWords.length > 0 ? uniqueWords.size / allWords.length : 0;

    // Readability score (Flesch-Kincaid Grade Level approximation)
    const readabilityScore = this.calculateReadability(samples);

    // Top n-grams
    const topNgrams = this.extractTopNgrams(allWords, 2, 10);

    return {
      uniqueWordCount,
      avgSentenceLength,
      readabilityScore,
      typeTokenRatio,
      topNgrams,
    };
  }

  /**
   * Analyzes writing style from samples
   */
  analyzeStyle(samples: ResponseSample[]): StyleMarkers {
    const allContent = samples.map((s) => s.content).join(' ');
    const paragraphs = samples.map((s) => s.content.split(/\n\n+/).length);

    // Emoji usage
    const emojiCount = (allContent.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    const emojiUsage = emojiCount / Math.max(1, allContent.length) * 100;

    // Punctuation pattern
    const punctuationPattern = this.analyzePunctuation(allContent);

    // Capitalization style
    const capitalizationStyle = this.analyzeCapitalization(samples);

    // Formatting preferences
    const formattingPreferences = this.analyzeFormatting(samples);

    // Average paragraph length
    const avgParagraphLength =
      paragraphs.length > 0
        ? paragraphs.reduce((a, b) => a + b, 0) / paragraphs.length
        : 1;

    return {
      emojiUsage,
      punctuationPattern,
      capitalizationStyle,
      formattingPreferences,
      avgParagraphLength,
    };
  }

  /**
   * Calculates overall response consistency
   */
  private calculateConsistency(samples: ResponseSample[]): number {
    if (samples.length < 2) return 1.0;

    // Consistency based on latency variance
    const latencies = samples.map((s) => s.latencyMs);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const latencyVariance = latencies.reduce((sum, l) => sum + Math.pow(l - avgLatency, 2), 0) / latencies.length;
    const latencyCV = Math.sqrt(latencyVariance) / avgLatency; // Coefficient of variation

    // Lower CV = higher consistency
    const latencyConsistency = Math.max(0, 1 - latencyCV);

    // Consistency based on response length variance
    const lengths = samples.map((s) => s.content.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const lengthVariance = lengths.reduce((sum, l) => sum + Math.pow(l - avgLength, 2), 0) / lengths.length;
    const lengthCV = Math.sqrt(lengthVariance) / avgLength;

    const lengthConsistency = Math.max(0, 1 - lengthCV);

    return (latencyConsistency * 0.5 + lengthConsistency * 0.5);
  }

  /**
   * Compares latency statistics
   */
  private compareLatency(baseline: LatencyStatistics, current: LatencyStatistics): number {
    // Compare means with tolerance
    const meanDiff = Math.abs(baseline.mean - current.mean) / baseline.mean;
    const meanSimilarity = Math.max(0, 1 - meanDiff);

    // Compare standard deviations
    const stdDevDiff = Math.abs(baseline.stdDev - current.stdDev) / Math.max(baseline.stdDev, 1);
    const stdDevSimilarity = Math.max(0, 1 - stdDevDiff);

    // Compare percentiles
    const p50Diff = Math.abs(baseline.p50 - current.p50) / baseline.p50;
    const p50Similarity = Math.max(0, 1 - p50Diff);

    return (meanSimilarity * 0.4 + stdDevSimilarity * 0.3 + p50Similarity * 0.3);
  }

  /**
   * Compares vocabulary analysis
   */
  private compareVocabulary(baseline: VocabularyAnalysis, current: VocabularyAnalysis): number {
    // Compare type-token ratio
    const ttrDiff = Math.abs(baseline.typeTokenRatio - current.typeTokenRatio);
    const ttrSimilarity = Math.max(0, 1 - ttrDiff * 5);

    // Compare average sentence length
    const sentLenDiff = Math.abs(baseline.avgSentenceLength - current.avgSentenceLength) / Math.max(baseline.avgSentenceLength, 1);
    const sentLenSimilarity = Math.max(0, 1 - sentLenDiff);

    // Compare readability
    const readDiff = Math.abs(baseline.readabilityScore - current.readabilityScore) / 20;
    const readSimilarity = Math.max(0, 1 - readDiff);

    // Compare n-gram overlap
    const baselineNgrams = new Set(baseline.topNgrams.map((n) => n.ngram));
    const currentNgrams = new Set(current.topNgrams.map((n) => n.ngram));
    const ngramOverlap = this.setOverlap(baselineNgrams, currentNgrams);

    return (
      ttrSimilarity * 0.25 +
      sentLenSimilarity * 0.25 +
      readSimilarity * 0.25 +
      ngramOverlap * 0.25
    );
  }

  /**
   * Compares style markers
   */
  private compareStyle(baseline: StyleMarkers, current: StyleMarkers): number {
    // Compare emoji usage
    const emojiDiff = Math.abs(baseline.emojiUsage - current.emojiUsage);
    const emojiSimilarity = Math.max(0, 1 - emojiDiff * 10);

    // Compare capitalization
    const capSimilarity = baseline.capitalizationStyle === current.capitalizationStyle ? 1 : 0.5;

    // Compare formatting preferences overlap
    const formatOverlap = this.arrayOverlap(
      baseline.formattingPreferences,
      current.formattingPreferences
    );

    // Compare paragraph length
    const paraLenDiff = Math.abs(baseline.avgParagraphLength - current.avgParagraphLength) / Math.max(baseline.avgParagraphLength, 1);
    const paraLenSimilarity = Math.max(0, 1 - paraLenDiff);

    return (
      emojiSimilarity * 0.2 +
      capSimilarity * 0.3 +
      formatOverlap * 0.25 +
      paraLenSimilarity * 0.25
    );
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);
  }

  private percentile(sortedArray: number[], p: number): number {
    const index = (p / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1]!;
    return sortedArray[lower]! * (1 - weight) + sortedArray[upper]! * weight;
  }

  private calculateReadability(samples: ResponseSample[]): number {
    const allContent = samples.map((s) => s.content).join(' ');
    const words = this.tokenize(allContent);
    const sentences = allContent.split(/[.!?]+/).filter((s) => s.trim());
    const syllables = words.reduce((sum, w) => sum + this.countSyllables(w), 0);

    if (words.length === 0 || sentences.length === 0) return 0;

    // Flesch-Kincaid Grade Level
    const fkgl =
      0.39 * (words.length / sentences.length) +
      11.8 * (syllables / words.length) -
      15.59;

    return Math.max(0, Math.min(20, fkgl));
  }

  private countSyllables(word: string): number {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;

    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');

    const syllables = word.match(/[aeiouy]{1,2}/g);
    return syllables ? syllables.length : 1;
  }

  private extractTopNgrams(
    words: string[],
    n: number,
    top: number
  ): Array<{ ngram: string; frequency: number }> {
    const ngrams = new Map<string, number>();

    for (let i = 0; i <= words.length - n; i++) {
      const ngram = words.slice(i, i + n).join(' ');
      ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
    }

    return Array.from(ngrams.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([ngram, frequency]) => ({ ngram, frequency }));
  }

  private analyzePunctuation(text: string): string {
    const patterns: string[] = [];

    if (/!{2,}/.test(text)) patterns.push('multiple_exclamation');
    if (/\?{2,}/.test(text)) patterns.push('multiple_question');
    if (/\.{3,}/.test(text)) patterns.push('ellipsis');
    if (/[,;:]/.test(text)) patterns.push('uses_complex_punctuation');
    if (/—|--/.test(text)) patterns.push('uses_dashes');

    return patterns.join(',') || 'standard';
  }

  private analyzeCapitalization(
    samples: ResponseSample[]
  ): 'standard' | 'all_lower' | 'all_upper' | 'mixed' {
    let lowerCount = 0;
    let upperCount = 0;
    let standardCount = 0;

    for (const sample of samples) {
      const text = sample.content;
      if (text === text.toLowerCase()) lowerCount++;
      else if (text === text.toUpperCase()) upperCount++;
      else standardCount++;
    }

    if (lowerCount > standardCount && lowerCount > upperCount) return 'all_lower';
    if (upperCount > standardCount && upperCount > lowerCount) return 'all_upper';
    if (standardCount > samples.length * 0.7) return 'standard';
    return 'mixed';
  }

  private analyzeFormatting(samples: ResponseSample[]): string[] {
    const patterns: string[] = [];
    const allContent = samples.map((s) => s.content).join('\n');

    if (/^[-*]\s/m.test(allContent)) patterns.push('bullet_lists');
    if (/^\d+\.\s/m.test(allContent)) patterns.push('numbered_lists');
    if (/\*\*[^*]+\*\*/.test(allContent)) patterns.push('bold_text');
    if (/\*[^*]+\*/.test(allContent)) patterns.push('italic_text');
    if (/`[^`]+`/.test(allContent)) patterns.push('code_inline');
    if (/```[\s\S]+```/.test(allContent)) patterns.push('code_blocks');
    if (/^#+\s/m.test(allContent)) patterns.push('headers');

    return patterns;
  }

  private setOverlap(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;

    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) intersection++;
    }

    return (2 * intersection) / (a.size + b.size);
  }

  private arrayOverlap(a: string[], b: string[]): number {
    return this.setOverlap(new Set(a), new Set(b));
  }

  // ===========================================================================
  // SIGNATURE OPERATIONS
  // ===========================================================================

  /**
   * Signs a behavioral fingerprint with Ed25519
   *
   * @param fingerprint - The fingerprint to sign
   * @param identityHash - The identity hash this fingerprint belongs to
   * @param privateKey - Ed25519 private key (hex or Uint8Array)
   * @returns SignedFingerprint with cryptographic attestation
   */
  async signFingerprint(
    fingerprint: BehavioralFingerprint,
    identityHash: string,
    privateKey: string | Uint8Array
  ): Promise<SignedFingerprint> {
    const ed = await getEd25519();

    // Convert private key to Uint8Array if hex string
    const privKeyBytes = typeof privateKey === 'string'
      ? hexToBytes(privateKey)
      : privateKey;

    // Create deterministic message to sign
    const message = this.createSignatureMessage(fingerprint, identityHash);
    const messageBytes = new TextEncoder().encode(message);

    // Sign with Ed25519
    const signature = await ed.signAsync(messageBytes, privKeyBytes);

    // Derive public key from private key
    const publicKey = await ed.getPublicKeyAsync(privKeyBytes);

    return {
      fingerprint,
      signature: bytesToHex(signature),
      publicKey: bytesToHex(publicKey),
      signedAt: new Date().toISOString(),
      identityHash,
      attestationVersion: '1.0',
    };
  }

  /**
   * Verifies a signed fingerprint
   *
   * @param signedFingerprint - The signed fingerprint to verify
   * @returns true if signature is valid, false otherwise
   */
  async verifySignedFingerprint(signedFingerprint: SignedFingerprint): Promise<boolean> {
    try {
      const ed = await getEd25519();

      // Recreate the message that was signed
      const message = this.createSignatureMessage(
        signedFingerprint.fingerprint,
        signedFingerprint.identityHash
      );
      const messageBytes = new TextEncoder().encode(message);

      // Convert hex strings to Uint8Array
      const signature = hexToBytes(signedFingerprint.signature);
      const publicKey = hexToBytes(signedFingerprint.publicKey);

      // Verify signature
      return await ed.verifyAsync(signature, messageBytes, publicKey);
    } catch (error) {
      return false;
    }
  }

  /**
   * Creates a deterministic message for signing
   * Includes fingerprint hash and identity hash for binding
   */
  private createSignatureMessage(
    fingerprint: BehavioralFingerprint,
    identityHash: string
  ): string {
    // Create deterministic JSON representation
    const fingerprintData = {
      latency: fingerprint.latency,
      vocabulary: {
        uniqueWordCount: fingerprint.vocabulary.uniqueWordCount,
        avgSentenceLength: fingerprint.vocabulary.avgSentenceLength,
        readabilityScore: fingerprint.vocabulary.readabilityScore,
        typeTokenRatio: fingerprint.vocabulary.typeTokenRatio,
      },
      style: {
        emojiUsage: fingerprint.style.emojiUsage,
        punctuationPattern: fingerprint.style.punctuationPattern,
        capitalizationStyle: fingerprint.style.capitalizationStyle,
        avgParagraphLength: fingerprint.style.avgParagraphLength,
      },
      consistencyScore: fingerprint.consistencyScore,
      sampleSize: fingerprint.sampleSize,
      isBaseline: fingerprint.isBaseline,
      createdAt: fingerprint.createdAt,
    };

    // Hash the fingerprint data for a fixed-length component
    const fingerprintHash = createHash('sha256')
      .update(JSON.stringify(fingerprintData))
      .digest('hex');

    // Create the message format
    return `agent007:fingerprint:v1:${identityHash}:${fingerprintHash}`;
  }

  /**
   * Generates a new Ed25519 key pair for fingerprint signing
   * @returns { privateKey: hex, publicKey: hex }
   */
  async generateSigningKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
    const ed = await getEd25519();

    // Generate random private key (32 bytes)
    const privateKey = ed.utils.randomPrivateKey();
    const publicKey = await ed.getPublicKeyAsync(privateKey);

    return {
      privateKey: bytesToHex(privateKey),
      publicKey: bytesToHex(publicKey),
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Export singleton
export const fingerprintService = new FingerprintService();
