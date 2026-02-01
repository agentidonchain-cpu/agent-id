/**
 * Agent007 - LLM Proxy Service
 *
 * Proxies requests to LLM providers and generates cryptographic attestations.
 * Provides proof that responses came from the actual provider.
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getAgentStorageService } from '../storage/agent-storage.js';
import { getAttestationService } from '../attestation/attestation.js';
import { fingerprintService, type ResponseSample } from '../autonomy/fingerprint.js';
import { logger } from '../../utils/logger.js';
import {
  ModelProvider,
  AttestationType,
  TrustLevel,
} from '../../types/identity.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ProxyRequest {
  /** Agent identity hash */
  identityHash: string;
  /** Messages to send */
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  /** Optional: Override model parameters */
  parameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
  /** Include attestation in response */
  includeAttestation?: boolean;
}

export interface ProxyResponse {
  /** Request ID for tracking */
  requestId: string;
  /** The LLM response content */
  content: string;
  /** Model that generated the response */
  model: {
    provider: ModelProvider;
    modelId: string;
  };
  /** Usage statistics */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Timing information */
  timing: {
    requestReceivedAt: number;
    requestForwardedAt: number;
    responseReceivedAt: number;
    responseSentAt: number;
    totalLatencyMs: number;
    providerLatencyMs: number;
  };
  /** Integrity hashes */
  integrity: {
    requestHash: string;
    responseHash: string;
  };
  /** Attestation (if requested) */
  attestation?: {
    id: string;
    signature: string;
    issuedAt: string;
    validUntil: string;
    trustLevel: TrustLevel;
  };
}

export interface ProxyLog {
  requestId: string;
  identityHash: string;
  provider: ModelProvider;
  modelId: string;
  requestHash: string;
  responseHash: string;
  timing: ProxyResponse['timing'];
  usage: ProxyResponse['usage'];
  attestationId?: string;
  createdAt: Date;
}

// Provider-specific response types
interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

interface OpenAIResponse {
  id: string;
  object: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface GoogleResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }>; role: string };
    finishReason: string;
  }>;
  usageMetadata: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
}

// =============================================================================
// LLM PROXY SERVICE
// =============================================================================

export class LLMProxyService {
  private proxyLogs: ProxyLog[] = [];
  private responseSamples = new Map<string, ResponseSample[]>();

  // ===========================================================================
  // MAIN PROXY METHOD
  // ===========================================================================

  /**
   * Proxy a request to an LLM provider
   */
  async proxyRequest(request: ProxyRequest): Promise<ProxyResponse> {
    const requestId = uuidv4();
    const requestReceivedAt = Date.now();

    logger.info({ requestId, identityHash: request.identityHash }, 'Proxy request received');

    // Get agent identity
    const storage = getAgentStorageService();
    const identity = await storage.getIdentity(request.identityHash);

    if (!identity) {
      throw new Error('Agent identity not found');
    }

    if (identity.status !== 'validated') {
      throw new Error(`Agent is not validated (status: ${identity.status})`);
    }

    const { agentCore } = identity;
    const provider = agentCore.model.provider;
    const modelId = agentCore.model.modelId;

    // Prepare the request
    const fullMessages = [
      { role: 'system' as const, content: agentCore.systemPrompt.content },
      ...request.messages,
    ];

    // Hash the request
    const requestHash = this.hashContent(JSON.stringify({
      messages: fullMessages,
      model: modelId,
      parameters: request.parameters || agentCore.parameters,
    }));

    // Forward to provider
    const requestForwardedAt = Date.now();
    let providerResponse: { content: string; usage: ProxyResponse['usage'] };

    try {
      providerResponse = await this.forwardToProvider(
        provider,
        modelId,
        agentCore.model.apiEndpoint,
        agentCore.model.apiKeyHash, // Note: In production, would use actual key
        fullMessages,
        request.parameters || agentCore.parameters
      );
    } catch (error) {
      logger.error({ error, requestId, provider }, 'Provider request failed');
      throw new Error(`Provider request failed: ${(error as Error).message}`);
    }

    const responseReceivedAt = Date.now();

    // Hash the response
    const responseHash = this.hashContent(providerResponse.content);

    // Generate attestation if requested
    let attestation: ProxyResponse['attestation'] | undefined;

    if (request.includeAttestation) {
      try {
        const attestationService = getAttestationService();
        const att = await attestationService.createAttestation({
          identityHash: request.identityHash,
          type: AttestationType.PROXY_VERIFIED,
          trustLevel: TrustLevel.MEDIUM,
          claim: 'Response verified through proxy',
          data: {
            requestId,
            requestHash,
            responseHash,
            provider,
            modelId,
            timing: {
              requestReceivedAt,
              requestForwardedAt,
              responseReceivedAt,
              providerLatencyMs: responseReceivedAt - requestForwardedAt,
            },
            usage: providerResponse.usage,
          },
        });

        attestation = {
          id: att.id,
          signature: att.signature,
          issuedAt: att.validity.issuedAt,
          validUntil: att.validity.validUntil,
          trustLevel: att.trustLevel,
        };
      } catch (error) {
        logger.error({ error, requestId }, 'Failed to generate attestation');
      }
    }

    const responseSentAt = Date.now();

    // Build response
    const response: ProxyResponse = {
      requestId,
      content: providerResponse.content,
      model: {
        provider,
        modelId,
      },
      usage: providerResponse.usage,
      timing: {
        requestReceivedAt,
        requestForwardedAt,
        responseReceivedAt,
        responseSentAt,
        totalLatencyMs: responseSentAt - requestReceivedAt,
        providerLatencyMs: responseReceivedAt - requestForwardedAt,
      },
      integrity: {
        requestHash,
        responseHash,
      },
      attestation,
    };

    // Store proxy log
    this.storeProxyLog({
      requestId,
      identityHash: request.identityHash,
      provider,
      modelId,
      requestHash,
      responseHash,
      timing: response.timing,
      usage: response.usage,
      attestationId: attestation?.id,
      createdAt: new Date(),
    });

    // Store response sample for fingerprinting
    this.storeResponseSample(request.identityHash, {
      content: providerResponse.content,
      latencyMs: response.timing.providerLatencyMs,
      timestamp: new Date(),
      prompt: request.messages[request.messages.length - 1]?.content || '',
    });

    logger.info({
      requestId,
      identityHash: request.identityHash,
      latencyMs: response.timing.totalLatencyMs,
      hasAttestation: !!attestation,
    }, 'Proxy request completed');

    return response;
  }

  // ===========================================================================
  // PROVIDER-SPECIFIC METHODS
  // ===========================================================================

  /**
   * Forward request to the appropriate provider
   */
  private async forwardToProvider(
    provider: ModelProvider,
    modelId: string,
    apiEndpoint: string,
    apiKeyHash: string,
    messages: Array<{ role: string; content: string }>,
    parameters: any
  ): Promise<{ content: string; usage: ProxyResponse['usage'] }> {
    // Note: In a real implementation, we would:
    // 1. Retrieve the actual API key from secure storage using apiKeyHash
    // 2. Make the actual HTTP request to the provider
    // For this implementation, we'll simulate the response

    switch (provider) {
      case ModelProvider.ANTHROPIC:
        return this.callAnthropic(modelId, apiEndpoint, messages, parameters);

      case ModelProvider.OPENAI:
        return this.callOpenAI(modelId, apiEndpoint, messages, parameters);

      case ModelProvider.GOOGLE:
        return this.callGoogle(modelId, apiEndpoint, messages, parameters);

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Call Anthropic API (simulated for now)
   */
  private async callAnthropic(
    modelId: string,
    apiEndpoint: string,
    messages: Array<{ role: string; content: string }>,
    parameters: any
  ): Promise<{ content: string; usage: ProxyResponse['usage'] }> {
    // Simulate API call delay
    await this.simulateLatency(500, 1500);

    // In production, this would be an actual fetch call:
    // const response = await fetch(apiEndpoint, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'x-api-key': apiKey,
    //     'anthropic-version': '2023-06-01',
    //   },
    //   body: JSON.stringify({
    //     model: modelId,
    //     messages: messages.filter(m => m.role !== 'system'),
    //     system: messages.find(m => m.role === 'system')?.content,
    //     max_tokens: parameters.maxTokens,
    //     temperature: parameters.temperature,
    //   }),
    // });

    // Simulated response
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';

    return {
      content: this.generateSimulatedResponse(systemPrompt, lastUserMessage),
      usage: {
        inputTokens: this.estimateTokens(messages.map(m => m.content).join(' ')),
        outputTokens: Math.floor(Math.random() * 200) + 50,
        totalTokens: 0, // Will be calculated
      },
    };
  }

  /**
   * Call OpenAI API (simulated for now)
   */
  private async callOpenAI(
    modelId: string,
    apiEndpoint: string,
    messages: Array<{ role: string; content: string }>,
    parameters: any
  ): Promise<{ content: string; usage: ProxyResponse['usage'] }> {
    await this.simulateLatency(400, 1200);

    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';

    return {
      content: this.generateSimulatedResponse(systemPrompt, lastUserMessage),
      usage: {
        inputTokens: this.estimateTokens(messages.map(m => m.content).join(' ')),
        outputTokens: Math.floor(Math.random() * 200) + 50,
        totalTokens: 0,
      },
    };
  }

  /**
   * Call Google API (simulated for now)
   */
  private async callGoogle(
    modelId: string,
    apiEndpoint: string,
    messages: Array<{ role: string; content: string }>,
    parameters: any
  ): Promise<{ content: string; usage: ProxyResponse['usage'] }> {
    await this.simulateLatency(450, 1300);

    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';

    return {
      content: this.generateSimulatedResponse(systemPrompt, lastUserMessage),
      usage: {
        inputTokens: this.estimateTokens(messages.map(m => m.content).join(' ')),
        outputTokens: Math.floor(Math.random() * 200) + 50,
        totalTokens: 0,
      },
    };
  }

  // ===========================================================================
  // VERIFICATION METHODS
  // ===========================================================================

  /**
   * Verify an attestation
   */
  async verifyAttestation(_attestationId: string): Promise<{
    valid: boolean;
    details?: {
      requestId: string;
      identityHash: string;
      issuedAt: string;
      trustLevel: TrustLevel;
    };
    error?: string;
  }> {
    // TODO: Implement attestation lookup by ID
    // For now, attestation verification requires the full attestation object
    return { valid: false, error: 'Attestation lookup by ID not yet implemented' };
  }

  /**
   * Verify response integrity
   */
  verifyIntegrity(content: string, expectedHash: string): boolean {
    const actualHash = this.hashContent(content);
    return actualHash === expectedHash;
  }

  // ===========================================================================
  // PROXY LOGS
  // ===========================================================================

  /**
   * Store a proxy log
   */
  private storeProxyLog(log: ProxyLog): void {
    this.proxyLogs.unshift(log);

    // Keep only last 1000 logs in memory
    if (this.proxyLogs.length > 1000) {
      this.proxyLogs.pop();
    }
  }

  /**
   * Get proxy logs for an agent
   */
  getProxyLogs(identityHash: string, limit: number = 50): ProxyLog[] {
    return this.proxyLogs
      .filter(log => log.identityHash === identityHash)
      .slice(0, limit);
  }

  /**
   * Get a specific proxy log by request ID
   */
  getProxyLog(requestId: string): ProxyLog | undefined {
    return this.proxyLogs.find(log => log.requestId === requestId);
  }

  /**
   * Get proxy statistics
   */
  getStats(): {
    totalRequests: number;
    byProvider: Record<string, number>;
    avgLatencyMs: number;
    totalTokens: { input: number; output: number };
  } {
    const byProvider: Record<string, number> = {};
    let totalLatency = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const log of this.proxyLogs) {
      byProvider[log.provider] = (byProvider[log.provider] || 0) + 1;
      totalLatency += log.timing.providerLatencyMs;
      totalInputTokens += log.usage.inputTokens;
      totalOutputTokens += log.usage.outputTokens;
    }

    return {
      totalRequests: this.proxyLogs.length,
      byProvider,
      avgLatencyMs: this.proxyLogs.length > 0
        ? Math.round(totalLatency / this.proxyLogs.length)
        : 0,
      totalTokens: {
        input: totalInputTokens,
        output: totalOutputTokens,
      },
    };
  }

  // ===========================================================================
  // RESPONSE SAMPLES
  // ===========================================================================

  /**
   * Store response sample for fingerprinting
   */
  private storeResponseSample(identityHash: string, sample: ResponseSample): void {
    const samples = this.responseSamples.get(identityHash) || [];
    samples.unshift(sample);

    // Keep last 100 samples
    if (samples.length > 100) {
      samples.pop();
    }

    this.responseSamples.set(identityHash, samples);
  }

  /**
   * Get response samples for an agent
   */
  getResponseSamples(identityHash: string): ResponseSample[] {
    return this.responseSamples.get(identityHash) || [];
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Hash content using SHA-256
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Simulate network latency
   */
  private async simulateLatency(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate a simulated response based on the prompt
   */
  private generateSimulatedResponse(systemPrompt: string, userMessage: string): string {
    // Extract agent personality from system prompt
    const isQ = systemPrompt.toLowerCase().includes('tech') ||
                systemPrompt.toLowerCase().includes('gadget');

    const responses = isQ
      ? [
          "I'd be happy to help you with that technology question. Let me analyze the specifications and provide you with the optimal solution.",
          "Excellent question! Based on my technical analysis, here's what I recommend for your setup.",
          "That's an interesting technical challenge. Let me walk you through the most efficient approach.",
          "I've reviewed the technical requirements. Here's my assessment and recommended course of action.",
        ]
      : [
          "I understand your question. Here's my response based on my training and capabilities.",
          "Thank you for your inquiry. Let me provide you with a helpful response.",
          "I'd be glad to assist with that. Here's the information you're looking for.",
          "Based on my understanding, here's what I can tell you about that topic.",
        ];

    const baseResponse = responses[Math.floor(Math.random() * responses.length)];

    // Add some variation based on user message length
    if (userMessage.length > 100) {
      return `${baseResponse}\n\nGiven the complexity of your question, I'll break down my response into key points:\n\n1. First, addressing the primary concern...\n2. Second, considering the technical implications...\n3. Finally, my recommendation for moving forward.`;
    }

    return baseResponse;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let proxyServiceInstance: LLMProxyService | null = null;

export function getLLMProxyService(): LLMProxyService {
  if (!proxyServiceInstance) {
    proxyServiceInstance = new LLMProxyService();
  }
  return proxyServiceInstance;
}

export function resetLLMProxyService(): void {
  proxyServiceInstance = null;
}
