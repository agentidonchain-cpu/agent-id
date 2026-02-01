/**
 * Agent007 - Provider Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ProviderService,
  getProviderService,
  resetProviderService,
  type ProviderConfig,
  type ProviderRequest,
} from '../../src/services/providers/index.js';
import { ModelProvider } from '../../src/types/identity.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ProviderService', () => {
  let service: ProviderService;

  beforeEach(() => {
    service = new ProviderService();
    mockFetch.mockReset();
  });

  afterEach(() => {
    resetProviderService();
  });

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  describe('configureProvider', () => {
    it('should configure a provider', () => {
      const config: ProviderConfig = {
        provider: ModelProvider.ANTHROPIC,
        apiKey: 'test-key',
      };

      service.configureProvider(config);

      expect(service.isProviderConfigured(ModelProvider.ANTHROPIC)).toBe(true);
      expect(service.getConfiguredProviders()).toContain(ModelProvider.ANTHROPIC);
    });

    it('should track multiple providers', () => {
      service.configureProvider({
        provider: ModelProvider.ANTHROPIC,
        apiKey: 'key1',
      });

      service.configureProvider({
        provider: ModelProvider.OPENAI,
        apiKey: 'key2',
      });

      expect(service.getConfiguredProviders()).toHaveLength(2);
    });
  });

  describe('isProviderConfigured', () => {
    it('should return false for unconfigured providers', () => {
      expect(service.isProviderConfigured(ModelProvider.GOOGLE)).toBe(false);
    });

    it('should return true for configured providers', () => {
      service.configureProvider({
        provider: ModelProvider.OPENAI,
        apiKey: 'test',
      });

      expect(service.isProviderConfigured(ModelProvider.OPENAI)).toBe(true);
    });
  });

  // ===========================================================================
  // ANTHROPIC ADAPTER
  // ===========================================================================

  describe('Anthropic adapter', () => {
    beforeEach(() => {
      service.configureProvider({
        provider: ModelProvider.ANTHROPIC,
        apiKey: 'test-anthropic-key',
      });
    });

    it('should send request to Anthropic API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg_123',
          content: [{ type: 'text', text: 'Hello from Claude!' }],
          model: 'claude-3-sonnet-20240229',
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: 'end_turn',
        }),
      });

      const request: ProviderRequest = {
        modelId: 'claude-3-sonnet-20240229',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello!' },
        ],
      };

      const response = await service.sendRequest(ModelProvider.ANTHROPIC, request);

      expect(response.content).toBe('Hello from Claude!');
      expect(response.model).toBe('claude-3-sonnet-20240229');
      expect(response.usage.totalTokens).toBe(15);
      expect(response.responseHash).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-anthropic-key',
          }),
        })
      );
    });

    it('should handle Anthropic API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const request: ProviderRequest = {
        modelId: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(
        service.sendRequest(ModelProvider.ANTHROPIC, request)
      ).rejects.toThrow('Anthropic API error: 401');
    });

    it('should verify response hash', async () => {
      const content = 'Test response';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg_123',
          content: [{ type: 'text', text: content }],
          model: 'claude-3-sonnet-20240229',
          usage: { input_tokens: 5, output_tokens: 2 },
        }),
      });

      const response = await service.sendRequest(ModelProvider.ANTHROPIC, {
        modelId: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
      });

      const verification = await service.verifyResponse(ModelProvider.ANTHROPIC, response);

      expect(verification.verified).toBe(true);
      expect(verification.method).toBe('api_response');
    });
  });

  // ===========================================================================
  // OPENAI ADAPTER
  // ===========================================================================

  describe('OpenAI adapter', () => {
    beforeEach(() => {
      service.configureProvider({
        provider: ModelProvider.OPENAI,
        apiKey: 'test-openai-key',
      });
    });

    it('should send request to OpenAI API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          choices: [{
            message: { content: 'Hello from GPT!' },
            finish_reason: 'stop',
          }],
          model: 'gpt-4',
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          system_fingerprint: 'fp_123',
        }),
      });

      const request: ProviderRequest = {
        modelId: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello!' },
        ],
      };

      const response = await service.sendRequest(ModelProvider.OPENAI, request);

      expect(response.content).toBe('Hello from GPT!');
      expect(response.model).toBe('gpt-4');
      expect(response.usage.totalTokens).toBe(15);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-openai-key',
          }),
        })
      );
    });
  });

  // ===========================================================================
  // GOOGLE ADAPTER
  // ===========================================================================

  describe('Google adapter', () => {
    beforeEach(() => {
      service.configureProvider({
        provider: ModelProvider.GOOGLE,
        apiKey: 'test-google-key',
      });
    });

    it('should send request to Google API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: { parts: [{ text: 'Hello from Gemini!' }] },
            finishReason: 'STOP',
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      });

      const request: ProviderRequest = {
        modelId: 'gemini-1.5-flash',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const response = await service.sendRequest(ModelProvider.GOOGLE, request);

      expect(response.content).toBe('Hello from Gemini!');
      expect(response.usage.totalTokens).toBe(15);
    });
  });

  // ===========================================================================
  // HEALTH CHECKS
  // ===========================================================================

  describe('healthCheck', () => {
    it('should return unavailable for unconfigured provider', async () => {
      // Use a supported provider that is not configured
      const health = await service.checkHealth(ModelProvider.ANTHROPIC);

      expect(health.available).toBe(false);
      expect(health.error).toContain('not configured');
    });

    it('should check health of configured provider', async () => {
      service.configureProvider({
        provider: ModelProvider.ANTHROPIC,
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg_123',
          content: [{ type: 'text', text: 'Hi' }],
          model: 'claude-3-haiku-20240307',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      });

      const health = await service.checkHealth(ModelProvider.ANTHROPIC);

      expect(health.available).toBe(true);
      expect(health.avgLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // REQUEST HISTORY
  // ===========================================================================

  describe('getRequestHistory', () => {
    it('should return empty array for no requests', () => {
      const history = service.getRequestHistory(ModelProvider.ANTHROPIC);
      expect(history).toHaveLength(0);
    });

    it('should store request history', async () => {
      service.configureProvider({
        provider: ModelProvider.ANTHROPIC,
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg_1',
          content: [{ type: 'text', text: 'Response 1' }],
          model: 'claude-3-sonnet',
          usage: { input_tokens: 5, output_tokens: 5 },
        }),
      });

      await service.sendRequest(ModelProvider.ANTHROPIC, {
        modelId: 'claude-3-sonnet',
        messages: [{ role: 'user', content: 'Test' }],
      });

      const history = service.getRequestHistory(ModelProvider.ANTHROPIC);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Response 1');
    });
  });

  // ===========================================================================
  // SINGLETON
  // ===========================================================================

  describe('getProviderService singleton', () => {
    afterEach(() => {
      resetProviderService();
    });

    it('should return same instance', () => {
      const service1 = getProviderService();
      const service2 = getProviderService();
      expect(service1).toBe(service2);
    });

    it('should reset correctly', () => {
      const service1 = getProviderService();
      resetProviderService();
      const service2 = getProviderService();
      expect(service1).not.toBe(service2);
    });
  });
});
