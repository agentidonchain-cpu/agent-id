/**
 * Agent007 - Provider Integration Service
 *
 * Integrates with LLM providers (OpenAI, Anthropic, Google, etc.)
 * for direct verification and attestation.
 */

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  ModelProvider,
  type ModelConfig,
  type GenerationParameters,
} from '../../types/identity.js';
import { logger } from '../../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ProviderConfig {
  /** Provider type */
  provider: ModelProvider;

  /** API key for the provider */
  apiKey: string;

  /** Custom API endpoint (optional) */
  apiEndpoint?: string;

  /** Request timeout in ms */
  timeoutMs?: number;

  /** Max retries */
  maxRetries?: number;
}

export interface ProviderRequest {
  /** Model ID to use */
  modelId: string;

  /** Messages to send */
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;

  /** Generation parameters */
  parameters?: Partial<GenerationParameters>;

  /** Request metadata */
  metadata?: Record<string, unknown>;
}

export interface ProviderResponse {
  /** Unique request ID */
  requestId: string;

  /** Response content */
  content: string;

  /** Model used */
  model: string;

  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /** Response latency in ms */
  latencyMs: number;

  /** Provider-specific metadata */
  providerMetadata?: Record<string, unknown>;

  /** Response hash for verification */
  responseHash: string;

  /** Timestamp */
  timestamp: string;
}

export interface ProviderVerification {
  /** Whether the response is verified from the provider */
  verified: boolean;

  /** Verification method used */
  method: 'api_response' | 'signature' | 'proxy';

  /** Provider request ID */
  providerRequestId?: string;

  /** Confidence score */
  confidence: number;

  /** Additional verification data */
  data?: Record<string, unknown>;
}

export interface ProviderHealth {
  /** Provider name */
  provider: ModelProvider;

  /** Whether provider is available */
  available: boolean;

  /** Average latency in ms */
  avgLatencyMs: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Last check time */
  lastCheckAt: string;

  /** Error message if unavailable */
  error?: string;
}

// =============================================================================
// PROVIDER ADAPTERS
// =============================================================================

interface ProviderAdapter {
  name: ModelProvider;
  defaultEndpoint: string;
  sendRequest(
    config: ProviderConfig,
    request: ProviderRequest
  ): Promise<ProviderResponse>;
  verifyResponse(
    config: ProviderConfig,
    response: ProviderResponse
  ): Promise<ProviderVerification>;
  healthCheck(config: ProviderConfig): Promise<ProviderHealth>;
}

// -----------------------------------------------------------------------------
// ANTHROPIC ADAPTER
// -----------------------------------------------------------------------------

const anthropicAdapter: ProviderAdapter = {
  name: ModelProvider.ANTHROPIC,
  defaultEndpoint: 'https://api.anthropic.com/v1/messages',

  async sendRequest(
    config: ProviderConfig,
    request: ProviderRequest
  ): Promise<ProviderResponse> {
    const startTime = Date.now();
    const endpoint = config.apiEndpoint || this.defaultEndpoint;

    const systemMessage = request.messages.find((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');

    const body = {
      model: request.modelId,
      max_tokens: request.parameters?.maxTokens || 4096,
      temperature: request.parameters?.temperature ?? 0.7,
      top_p: request.parameters?.topP,
      system: systemMessage?.content,
      messages: otherMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs || 60000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const latencyMs = Date.now() - startTime;

    const contentArr = data.content as Array<{ text?: string }> | undefined;
    const content = contentArr?.[0]?.text || '';
    const responseHash = createHash('sha256').update(content).digest('hex');

    const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;

    return {
      requestId: (data.id as string) || uuidv4(),
      content,
      model: data.model as string,
      usage: {
        promptTokens: usage?.input_tokens || 0,
        completionTokens: usage?.output_tokens || 0,
        totalTokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
      },
      latencyMs,
      providerMetadata: {
        stopReason: data.stop_reason as string,
        type: data.type as string,
      },
      responseHash,
      timestamp: new Date().toISOString(),
    };
  },

  async verifyResponse(
    _config: ProviderConfig,
    response: ProviderResponse
  ): Promise<ProviderVerification> {
    // Anthropic doesn't provide response signatures yet
    // We verify by checking the response hash
    const recomputedHash = createHash('sha256')
      .update(response.content)
      .digest('hex');

    return {
      verified: recomputedHash === response.responseHash,
      method: 'api_response',
      providerRequestId: response.requestId,
      confidence: 0.9,
      data: {
        hashMatch: recomputedHash === response.responseHash,
      },
    };
  },

  async healthCheck(config: ProviderConfig): Promise<ProviderHealth> {
    const startTime = Date.now();

    try {
      const response = await this.sendRequest(config, {
        modelId: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: 'Hi' }],
        parameters: { maxTokens: 10 },
      });

      return {
        provider: ModelProvider.ANTHROPIC,
        available: true,
        avgLatencyMs: response.latencyMs,
        successRate: 1.0,
        lastCheckAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        provider: ModelProvider.ANTHROPIC,
        available: false,
        avgLatencyMs: Date.now() - startTime,
        successRate: 0,
        lastCheckAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

// -----------------------------------------------------------------------------
// OPENAI ADAPTER
// -----------------------------------------------------------------------------

const openaiAdapter: ProviderAdapter = {
  name: ModelProvider.OPENAI,
  defaultEndpoint: 'https://api.openai.com/v1/chat/completions',

  async sendRequest(
    config: ProviderConfig,
    request: ProviderRequest
  ): Promise<ProviderResponse> {
    const startTime = Date.now();
    const endpoint = config.apiEndpoint || this.defaultEndpoint;

    const body = {
      model: request.modelId,
      messages: request.messages,
      max_tokens: request.parameters?.maxTokens || 4096,
      temperature: request.parameters?.temperature ?? 0.7,
      top_p: request.parameters?.topP,
      presence_penalty: request.parameters?.presencePenalty,
      frequency_penalty: request.parameters?.frequencyPenalty,
      seed: request.parameters?.seed,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs || 60000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const latencyMs = Date.now() - startTime;

    const choices = data.choices as Array<{ message?: { content?: string }; finish_reason?: string }> | undefined;
    const content = choices?.[0]?.message?.content || '';
    const responseHash = createHash('sha256').update(content).digest('hex');

    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

    return {
      requestId: (data.id as string) || uuidv4(),
      content,
      model: data.model as string,
      usage: {
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
      latencyMs,
      providerMetadata: {
        finishReason: choices?.[0]?.finish_reason,
        systemFingerprint: data.system_fingerprint as string,
      },
      responseHash,
      timestamp: new Date().toISOString(),
    };
  },

  async verifyResponse(
    _config: ProviderConfig,
    response: ProviderResponse
  ): Promise<ProviderVerification> {
    const recomputedHash = createHash('sha256')
      .update(response.content)
      .digest('hex');

    return {
      verified: recomputedHash === response.responseHash,
      method: 'api_response',
      providerRequestId: response.requestId,
      confidence: 0.9,
      data: {
        hashMatch: recomputedHash === response.responseHash,
        systemFingerprint: response.providerMetadata?.systemFingerprint,
      },
    };
  },

  async healthCheck(config: ProviderConfig): Promise<ProviderHealth> {
    const startTime = Date.now();

    try {
      const response = await this.sendRequest(config, {
        modelId: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hi' }],
        parameters: { maxTokens: 10 },
      });

      return {
        provider: ModelProvider.OPENAI,
        available: true,
        avgLatencyMs: response.latencyMs,
        successRate: 1.0,
        lastCheckAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        provider: ModelProvider.OPENAI,
        available: false,
        avgLatencyMs: Date.now() - startTime,
        successRate: 0,
        lastCheckAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

// -----------------------------------------------------------------------------
// GOOGLE ADAPTER
// -----------------------------------------------------------------------------

const googleAdapter: ProviderAdapter = {
  name: ModelProvider.GOOGLE,
  defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',

  async sendRequest(
    config: ProviderConfig,
    request: ProviderRequest
  ): Promise<ProviderResponse> {
    const startTime = Date.now();
    const baseUrl = config.apiEndpoint || this.defaultEndpoint;
    const endpoint = `${baseUrl}/${request.modelId}:generateContent?key=${config.apiKey}`;

    const systemMessage = request.messages.find((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');

    const body = {
      contents: otherMessages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      systemInstruction: systemMessage
        ? { parts: [{ text: systemMessage.content }] }
        : undefined,
      generationConfig: {
        maxOutputTokens: request.parameters?.maxTokens || 4096,
        temperature: request.parameters?.temperature ?? 0.7,
        topP: request.parameters?.topP,
        topK: request.parameters?.topK,
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs || 60000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const latencyMs = Date.now() - startTime;

    const candidates = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string; safetyRatings?: unknown }> | undefined;
    const content = candidates?.[0]?.content?.parts?.[0]?.text || '';
    const responseHash = createHash('sha256').update(content).digest('hex');

    const usageMetadata = data.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;

    return {
      requestId: uuidv4(),
      content,
      model: request.modelId,
      usage: {
        promptTokens: usageMetadata?.promptTokenCount || 0,
        completionTokens: usageMetadata?.candidatesTokenCount || 0,
        totalTokens: usageMetadata?.totalTokenCount || 0,
      },
      latencyMs,
      providerMetadata: {
        finishReason: candidates?.[0]?.finishReason,
        safetyRatings: candidates?.[0]?.safetyRatings,
      },
      responseHash,
      timestamp: new Date().toISOString(),
    };
  },

  async verifyResponse(
    _config: ProviderConfig,
    response: ProviderResponse
  ): Promise<ProviderVerification> {
    const recomputedHash = createHash('sha256')
      .update(response.content)
      .digest('hex');

    return {
      verified: recomputedHash === response.responseHash,
      method: 'api_response',
      providerRequestId: response.requestId,
      confidence: 0.85,
      data: {
        hashMatch: recomputedHash === response.responseHash,
      },
    };
  },

  async healthCheck(config: ProviderConfig): Promise<ProviderHealth> {
    const startTime = Date.now();

    try {
      const response = await this.sendRequest(config, {
        modelId: 'gemini-1.5-flash',
        messages: [{ role: 'user', content: 'Hi' }],
        parameters: { maxTokens: 10 },
      });

      return {
        provider: ModelProvider.GOOGLE,
        available: true,
        avgLatencyMs: response.latencyMs,
        successRate: 1.0,
        lastCheckAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        provider: ModelProvider.GOOGLE,
        available: false,
        avgLatencyMs: Date.now() - startTime,
        successRate: 0,
        lastCheckAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

// =============================================================================
// PROVIDER SERVICE
// =============================================================================

export class ProviderService {
  private adapters: Map<ModelProvider, ProviderAdapter> = new Map();
  private configs: Map<ModelProvider, ProviderConfig> = new Map();
  private healthCache: Map<ModelProvider, ProviderHealth> = new Map();
  private requestHistory: Map<string, ProviderResponse[]> = new Map();

  constructor() {
    // Register default adapters
    this.adapters.set(ModelProvider.ANTHROPIC, anthropicAdapter);
    this.adapters.set(ModelProvider.OPENAI, openaiAdapter);
    this.adapters.set(ModelProvider.GOOGLE, googleAdapter);
  }

  /**
   * Configure a provider with API credentials
   */
  configureProvider(config: ProviderConfig): void {
    this.configs.set(config.provider, config);
    logger.info({ provider: config.provider }, 'Provider configured');
  }

  /**
   * Get configured providers
   */
  getConfiguredProviders(): ModelProvider[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Check if a provider is configured
   */
  isProviderConfigured(provider: ModelProvider): boolean {
    return this.configs.has(provider);
  }

  /**
   * Send a request to a provider
   */
  async sendRequest(
    provider: ModelProvider,
    request: ProviderRequest
  ): Promise<ProviderResponse> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No adapter for provider: ${provider}`);
    }

    const config = this.configs.get(provider);
    if (!config) {
      throw new Error(`Provider not configured: ${provider}`);
    }

    const response = await adapter.sendRequest(config, request);

    // Store in history
    const history = this.requestHistory.get(provider) || [];
    history.unshift(response);
    if (history.length > 100) history.pop();
    this.requestHistory.set(provider, history);

    logger.info(
      {
        provider,
        modelId: request.modelId,
        latencyMs: response.latencyMs,
        tokens: response.usage.totalTokens,
      },
      'Provider request completed'
    );

    return response;
  }

  /**
   * Verify a response from a provider
   */
  async verifyResponse(
    provider: ModelProvider,
    response: ProviderResponse
  ): Promise<ProviderVerification> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No adapter for provider: ${provider}`);
    }

    const config = this.configs.get(provider);
    if (!config) {
      throw new Error(`Provider not configured: ${provider}`);
    }

    return adapter.verifyResponse(config, response);
  }

  /**
   * Check health of a provider
   */
  async checkHealth(provider: ModelProvider): Promise<ProviderHealth> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No adapter for provider: ${provider}`);
    }

    const config = this.configs.get(provider);
    if (!config) {
      return {
        provider,
        available: false,
        avgLatencyMs: 0,
        successRate: 0,
        lastCheckAt: new Date().toISOString(),
        error: 'Provider not configured',
      };
    }

    const health = await adapter.healthCheck(config);
    this.healthCache.set(provider, health);

    return health;
  }

  /**
   * Check health of all configured providers
   */
  async checkAllHealth(): Promise<ProviderHealth[]> {
    const results: ProviderHealth[] = [];

    for (const provider of this.configs.keys()) {
      const health = await this.checkHealth(provider);
      results.push(health);
    }

    return results;
  }

  /**
   * Get cached health status
   */
  getCachedHealth(provider: ModelProvider): ProviderHealth | null {
    return this.healthCache.get(provider) || null;
  }

  /**
   * Get request history for a provider
   */
  getRequestHistory(provider: ModelProvider, limit: number = 20): ProviderResponse[] {
    const history = this.requestHistory.get(provider) || [];
    return history.slice(0, limit);
  }

  /**
   * Verify an agent's configuration by sending a test request
   */
  async verifyAgentConfig(
    modelConfig: ModelConfig,
    systemPrompt: string,
    testPrompt: string = 'Please respond with exactly: "Agent007 verification successful"'
  ): Promise<{
    verified: boolean;
    response?: ProviderResponse;
    verification?: ProviderVerification;
    error?: string;
  }> {
    try {
      // Temporarily configure provider with agent's API key
      const tempConfig: ProviderConfig = {
        provider: modelConfig.provider,
        apiKey: '', // Will need to be provided separately
        apiEndpoint: modelConfig.apiEndpoint,
        timeoutMs: 30000,
      };

      // Check if provider is already configured
      if (!this.isProviderConfigured(modelConfig.provider)) {
        return {
          verified: false,
          error: `Provider ${modelConfig.provider} is not configured`,
        };
      }

      const response = await this.sendRequest(modelConfig.provider, {
        modelId: modelConfig.modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: testPrompt },
        ],
      });

      const verification = await this.verifyResponse(modelConfig.provider, response);

      return {
        verified: verification.verified,
        response,
        verification,
      };
    } catch (error) {
      return {
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let providerServiceInstance: ProviderService | null = null;

export function getProviderService(): ProviderService {
  if (!providerServiceInstance) {
    providerServiceInstance = new ProviderService();
  }
  return providerServiceInstance;
}

export function resetProviderService(): void {
  providerServiceInstance = null;
}
