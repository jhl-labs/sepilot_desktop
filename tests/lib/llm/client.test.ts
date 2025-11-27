/**
 * LLMClient 테스트
 */

import { LLMClient, getLLMClient, initializeLLMClient } from '@/lib/llm/client';
import type { LLMConfig } from '@/types';

// Mock OpenAIProvider
jest.mock('@/lib/llm/providers/openai', () => ({
  OpenAIProvider: jest.fn().mockImplementation(() => ({
    chat: jest.fn(),
    stream: jest.fn(),
    getModels: jest.fn(),
    validate: jest.fn(),
  })),
}));

describe('LLMClient', () => {
  const mockConfig: LLMConfig = {
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    apiKey: 'test-api-key',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client without config', () => {
      const client = new LLMClient();

      expect(client.isConfigured()).toBe(false);
    });

    it('should create client with config', () => {
      const client = new LLMClient(mockConfig);

      expect(client.isConfigured()).toBe(true);
    });
  });

  describe('setConfig', () => {
    it('should set OpenAI provider', () => {
      const client = new LLMClient();
      client.setConfig(mockConfig);

      expect(client.isConfigured()).toBe(true);
    });

    it('should set Anthropic provider (using OpenAI compatible)', () => {
      const client = new LLMClient();
      client.setConfig({
        ...mockConfig,
        provider: 'anthropic',
        baseURL: 'https://api.anthropic.com/v1',
      });

      expect(client.isConfigured()).toBe(true);
    });

    it('should set custom provider (using OpenAI compatible)', () => {
      const client = new LLMClient();
      client.setConfig({
        ...mockConfig,
        provider: 'custom',
        baseURL: 'https://localhost:11434/v1',
      });

      expect(client.isConfigured()).toBe(true);
    });

    it('should throw error for unsupported provider', () => {
      const client = new LLMClient();

      expect(() => {
        client.setConfig({
          ...mockConfig,
          provider: 'unsupported' as any,
        });
      }).toThrow('Unsupported provider: unsupported');
    });
  });

  describe('getProvider', () => {
    it('should return provider when configured', () => {
      const client = new LLMClient(mockConfig);

      const provider = client.getProvider();

      expect(provider).toBeDefined();
    });

    it('should throw error when not configured', () => {
      const client = new LLMClient();

      expect(() => client.getProvider()).toThrow(
        'LLM provider not initialized. Call setConfig() first.'
      );
    });
  });

  describe('isConfigured', () => {
    it('should return false when not configured', () => {
      const client = new LLMClient();

      expect(client.isConfigured()).toBe(false);
    });

    it('should return true when configured', () => {
      const client = new LLMClient(mockConfig);

      expect(client.isConfigured()).toBe(true);
    });
  });

  describe('singleton functions', () => {
    beforeEach(() => {
      // Reset singleton by accessing private module state
      jest.resetModules();
    });

    it('getLLMClient should return singleton instance', () => {
      const { getLLMClient } = require('@/lib/llm/client');

      const client1 = getLLMClient();
      const client2 = getLLMClient();

      expect(client1).toBe(client2);
    });

    it('initializeLLMClient should configure the singleton', () => {
      const { getLLMClient, initializeLLMClient } = require('@/lib/llm/client');

      initializeLLMClient(mockConfig);
      const client = getLLMClient();

      expect(client.isConfigured()).toBe(true);
    });
  });
});
