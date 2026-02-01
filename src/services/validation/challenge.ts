/**
 * Agent007 - Challenge Service
 *
 * Generates and validates challenges for agent identity verification.
 * Challenges test that the agent is configured exactly as declared.
 */

import { randomBytes, createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  getEncryptionService,
  type EncryptedData,
} from '../security/encryption.js';
import type {
  ValidationChallenge,
  AgentCoreIdentity,
  ModelProvider,
} from '../../types/identity.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ChallengePrompt {
  /** Unique prompt ID */
  id: string;

  /** The prompt to send to the agent */
  prompt: string;

  /** Expected characteristics in the response */
  expectedCharacteristics: {
    /** Keywords that should appear based on system prompt */
    keywords?: string[];

    /** Style markers to look for */
    styleMarkers?: string[];

    /** Approximate expected length range */
    lengthRange?: { min: number; max: number };
  };

  /** Weight of this challenge in the overall score */
  weight: number;
}

export interface ChallengeSet {
  /** Challenge set ID */
  id: string;

  /** Registration ID this challenge belongs to */
  registrationId: string;

  /** Individual challenge prompts */
  prompts: ChallengePrompt[];

  /** When the challenge expires */
  expiresAt: Date;

  /** Public key for response encryption (future use) */
  publicKey?: string;
}

export interface ChallengeResponse {
  /** Challenge ID */
  challengeId: string;

  /** Prompt ID */
  promptId: string;

  /** Agent's response content */
  content: string;

  /** Response latency in milliseconds */
  latencyMs: number;

  /** Provider attestation if available */
  providerAttestation?: {
    signature: string;
    timestamp: string;
    requestId: string;
  };
}

export interface ChallengeValidationResult {
  /** Overall pass/fail */
  passed: boolean;

  /** Overall score (0.0 - 1.0) */
  score: number;

  /** Individual prompt results */
  promptResults: Array<{
    promptId: string;
    passed: boolean;
    score: number;
    details: string;
  }>;

  /** Behavioral metrics collected */
  behavioralMetrics: {
    avgLatencyMs: number;
    latencyStdDev: number;
    responseConsistency: number;
  };

  /** Reasons for failure (if any) */
  failureReasons: string[];
}

// =============================================================================
// CHALLENGE TEMPLATES
// =============================================================================

const CHALLENGE_TEMPLATES = {
  // Identity verification prompts
  identity: [
    {
      template: 'Describe yourself in exactly three sentences.',
      purpose: 'Verify system prompt personality is applied',
      weight: 0.3,
    },
    {
      template: 'What is your primary purpose or function?',
      purpose: 'Verify agent understands its role',
      weight: 0.2,
    },
  ],

  // Capability verification prompts
  capability: [
    {
      template: 'List exactly 5 things you can help with.',
      purpose: 'Verify capabilities match declaration',
      weight: 0.2,
    },
  ],

  // Behavioral consistency prompts
  behavioral: [
    {
      template: 'Respond to this with a greeting in your typical style: "Hello!"',
      purpose: 'Establish behavioral baseline',
      weight: 0.15,
    },
    {
      template: 'How would you describe your communication style?',
      purpose: 'Verify style consistency',
      weight: 0.15,
    },
  ],
};

// =============================================================================
// CHALLENGE SERVICE
// =============================================================================

export class ChallengeService {
  private _encryptionService: ReturnType<typeof getEncryptionService> | null = null;

  private get encryptionService() {
    if (!this._encryptionService) {
      this._encryptionService = getEncryptionService();
    }
    return this._encryptionService;
  }

  /**
   * Generates a challenge set for a new registration
   */
  async generateChallenge(
    registrationId: string,
    _agentCore: AgentCoreIdentity,
    expiresInMinutes: number = 30
  ): Promise<{ challenge: ChallengeSet; encrypted: EncryptedData }> {
    const challengeId = uuidv4();
    const prompts: ChallengePrompt[] = [];

    // Generate identity challenges
    for (const template of CHALLENGE_TEMPLATES.identity) {
      prompts.push({
        id: uuidv4(),
        prompt: template.template,
        expectedCharacteristics: {},
        weight: template.weight,
      });
    }

    // Generate capability challenges
    for (const template of CHALLENGE_TEMPLATES.capability) {
      prompts.push({
        id: uuidv4(),
        prompt: template.template,
        expectedCharacteristics: {},
        weight: template.weight,
      });
    }

    // Generate behavioral challenges
    for (const template of CHALLENGE_TEMPLATES.behavioral) {
      prompts.push({
        id: uuidv4(),
        prompt: template.template,
        expectedCharacteristics: {},
        weight: template.weight,
      });
    }

    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const challenge: ChallengeSet = {
      id: challengeId,
      registrationId,
      prompts,
      expiresAt,
    };

    // Encrypt the challenge set
    const encrypted = await this.encryptionService.encrypt(
      JSON.stringify(challenge)
    );

    return { challenge, encrypted };
  }

  /**
   * Decrypts and retrieves a challenge set
   */
  async decryptChallenge(encrypted: EncryptedData): Promise<ChallengeSet | null> {
    const decrypted = await this.encryptionService.decrypt(encrypted);

    if (!decrypted.success) {
      return null;
    }

    try {
      return JSON.parse(decrypted.plaintext) as ChallengeSet;
    } catch {
      return null;
    }
  }

  /**
   * Validates challenge responses
   */
  async validateResponses(
    challenge: ChallengeSet,
    responses: ChallengeResponse[],
    agentCore: AgentCoreIdentity
  ): Promise<ChallengeValidationResult> {
    const promptResults: ChallengeValidationResult['promptResults'] = [];
    const failureReasons: string[] = [];
    const latencies: number[] = [];

    // Check if challenge has expired
    if (new Date() > new Date(challenge.expiresAt)) {
      return {
        passed: false,
        score: 0,
        promptResults: [],
        behavioralMetrics: {
          avgLatencyMs: 0,
          latencyStdDev: 0,
          responseConsistency: 0,
        },
        failureReasons: ['Challenge has expired'],
      };
    }

    // Validate each response
    for (const prompt of challenge.prompts) {
      const response = responses.find((r) => r.promptId === prompt.id);

      if (!response) {
        promptResults.push({
          promptId: prompt.id,
          passed: false,
          score: 0,
          details: 'No response provided',
        });
        failureReasons.push(`Missing response for prompt ${prompt.id}`);
        continue;
      }

      latencies.push(response.latencyMs);

      // Validate response content
      const validation = this.validateSingleResponse(
        prompt,
        response,
        agentCore
      );

      promptResults.push({
        promptId: prompt.id,
        passed: validation.passed,
        score: validation.score,
        details: validation.details,
      });

      if (!validation.passed) {
        failureReasons.push(validation.details);
      }
    }

    // Calculate overall score
    const totalWeight = challenge.prompts.reduce((sum, p) => sum + p.weight, 0);
    const weightedScore = promptResults.reduce((sum, result, index) => {
      const prompt = challenge.prompts[index];
      return sum + (result.score * (prompt?.weight || 0));
    }, 0);
    const score = weightedScore / totalWeight;

    // Calculate behavioral metrics
    const avgLatencyMs =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;

    const latencyVariance =
      latencies.length > 0
        ? latencies.reduce((sum, l) => sum + Math.pow(l - avgLatencyMs, 2), 0) /
          latencies.length
        : 0;
    const latencyStdDev = Math.sqrt(latencyVariance);

    // Response consistency based on latency distribution
    const responseConsistency =
      avgLatencyMs > 0 ? Math.max(0, 1 - latencyStdDev / avgLatencyMs) : 0;

    // Determine pass/fail (threshold: 0.7)
    const passed = score >= 0.7 && failureReasons.length === 0;

    return {
      passed,
      score,
      promptResults,
      behavioralMetrics: {
        avgLatencyMs,
        latencyStdDev,
        responseConsistency,
      },
      failureReasons,
    };
  }

  /**
   * Validates a single response against expected characteristics
   */
  private validateSingleResponse(
    prompt: ChallengePrompt,
    response: ChallengeResponse,
    _agentCore: AgentCoreIdentity
  ): { passed: boolean; score: number; details: string } {
    let score = 0;
    const checks: string[] = [];

    // Check response is not empty
    if (!response.content || response.content.trim().length === 0) {
      return {
        passed: false,
        score: 0,
        details: 'Empty response',
      };
    }

    // Basic length check
    const contentLength = response.content.length;
    if (contentLength >= 10 && contentLength <= 10000) {
      score += 0.3;
      checks.push('Valid length');
    } else {
      checks.push('Invalid length');
    }

    // Check for expected keywords if specified
    if (prompt.expectedCharacteristics.keywords) {
      const foundKeywords = prompt.expectedCharacteristics.keywords.filter(
        (kw) => response.content.toLowerCase().includes(kw.toLowerCase())
      );
      const keywordScore =
        foundKeywords.length / prompt.expectedCharacteristics.keywords.length;
      score += keywordScore * 0.3;
      checks.push(
        `Keywords: ${foundKeywords.length}/${prompt.expectedCharacteristics.keywords.length}`
      );
    } else {
      score += 0.3; // No keywords to check
    }

    // Check latency is reasonable (100ms - 30s)
    if (response.latencyMs >= 100 && response.latencyMs <= 30000) {
      score += 0.2;
      checks.push('Valid latency');
    } else {
      checks.push(`Suspicious latency: ${response.latencyMs}ms`);
    }

    // Check response looks AI-generated (basic heuristics)
    const aiScore = this.scoreAiLikelihood(response.content);
    score += aiScore * 0.2;
    checks.push(`AI likelihood: ${(aiScore * 100).toFixed(0)}%`);

    const passed = score >= 0.6;

    return {
      passed,
      score,
      details: checks.join('; '),
    };
  }

  /**
   * Scores how likely a response is AI-generated (basic heuristics)
   */
  private scoreAiLikelihood(content: string): number {
    let score = 0.5; // Start neutral

    // AI responses tend to be well-structured
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length >= 2) {
      score += 0.1;
    }

    // AI responses rarely have typos in common words
    const commonTypos = ['teh', 'adn', 'taht', 'wiht', 'hte'];
    const hasTypos = commonTypos.some((typo) =>
      content.toLowerCase().includes(typo)
    );
    if (!hasTypos) {
      score += 0.1;
    }

    // AI responses tend to use proper punctuation
    const properPunctuation = /[.!?]$/.test(content.trim());
    if (properPunctuation) {
      score += 0.1;
    }

    // AI responses are usually coherent (basic check: not random characters)
    const wordLikeTokens = content.split(/\s+/).filter((t) => /^[a-zA-Z]+$/.test(t));
    const wordRatio = wordLikeTokens.length / Math.max(1, content.split(/\s+/).length);
    if (wordRatio > 0.7) {
      score += 0.1;
    }

    // Cap at 1.0
    return Math.min(1.0, score);
  }

  /**
   * Generates a verification code for human confirmation
   */
  generateVerificationCode(): string {
    return this.encryptionService.generateVerificationCode();
  }

  /**
   * Creates a challenge record for database storage
   */
  createChallengeRecord(
    registrationId: string,
    challenge: ChallengeSet,
    encrypted: EncryptedData
  ): Omit<ValidationChallenge, 'id' | 'createdAt'> {
    return {
      registrationId,
      encryptedPrompts: encrypted.data,
      expiresAt: challenge.expiresAt.toISOString(),
      status: 'pending',
    };
  }

  /**
   * Checks if a provider supports native attestation
   */
  supportsNativeAttestation(provider: ModelProvider): boolean {
    // Currently no providers support native attestation
    // This will be updated as providers add support
    const supportedProviders: ModelProvider[] = [];
    return supportedProviders.includes(provider);
  }

  /**
   * Generates a unique challenge nonce
   */
  generateNonce(): string {
    return this.encryptionService.generateNonce();
  }

  /**
   * Hashes a challenge response for integrity verification
   */
  hashResponse(response: ChallengeResponse): string {
    const data = JSON.stringify({
      challengeId: response.challengeId,
      promptId: response.promptId,
      content: response.content,
      latencyMs: response.latencyMs,
    });

    return createHash('sha256').update(data).digest('hex');
  }
}

// Export singleton instance
export const challengeService = new ChallengeService();
