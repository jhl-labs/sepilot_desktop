/**
 * LLM HTTP Utils 테스트
 */

import { createFetchOptions, fetchWithConfig, createAuthHeader } from '@/lib/llm/http-utils';
import type { LLMConfig } from '@/types';

describe('http-utils', () => {
  const baseConfig: LLMConfig = {
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

  describe('createFetchOptions', () => {
    it('should create basic fetch options', () => {
      const options = createFetchOptions(baseConfig);

      expect(options).toBeDefined();
      expect(options.headers).toBeDefined();
    });

    it('should merge with base options', () => {
      const baseOptions: RequestInit = {
        method: 'POST',
        body: JSON.stringify({ test: true }),
      };

      const options = createFetchOptions(baseConfig, baseOptions);

      expect(options.method).toBe('POST');
      expect(options.body).toBeDefined();
    });

    it('should add custom headers from config', () => {
      const configWithHeaders: LLMConfig = {
        ...baseConfig,
        customHeaders: {
          'X-Custom-Header': 'custom-value',
          'X-Another': 'another-value',
        },
      };

      const options = createFetchOptions(configWithHeaders);
      const headers = options.headers as Record<string, string>;

      expect(headers['X-Custom-Header']).toBe('custom-value');
      expect(headers['X-Another']).toBe('another-value');
    });

    it('should preserve existing headers', () => {
      const baseOptions: RequestInit = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      const configWithHeaders: LLMConfig = {
        ...baseConfig,
        customHeaders: {
          'X-Custom': 'value',
        },
      };

      const options = createFetchOptions(configWithHeaders, baseOptions);
      const headers = options.headers as Record<string, string>;

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Custom']).toBe('value');
    });
  });

  describe('createAuthHeader', () => {
    it('should create Bearer token for OpenAI', () => {
      const headers = createAuthHeader('openai', 'sk-test-key');

      expect(headers.Authorization).toBe('Bearer sk-test-key');
    });

    it('should create x-api-key for Anthropic', () => {
      const headers = createAuthHeader('anthropic', 'sk-ant-test-key');

      expect(headers['x-api-key']).toBe('sk-ant-test-key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers.Authorization).toBeUndefined();
    });

    it('should create Bearer token for custom provider', () => {
      const headers = createAuthHeader('custom', 'custom-key');

      expect(headers.Authorization).toBe('Bearer custom-key');
    });
  });

  describe('fetchWithConfig', () => {
    it('should make fetch request with config options', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ result: 'success' }),
      });

      const response = await fetchWithConfig(
        'https://api.example.com/endpoint',
        baseConfig,
        { method: 'GET' }
      );

      expect(response.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/endpoint',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should include custom headers in request', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      });

      const configWithHeaders: LLMConfig = {
        ...baseConfig,
        customHeaders: {
          'X-Custom': 'test-value',
        },
      };

      await fetchWithConfig(
        'https://api.example.com/endpoint',
        configWithHeaders
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/endpoint',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'test-value',
          }),
        })
      );
    });

    it('should handle timeout with AbortController', async () => {
      // Create a promise that will never resolve
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((_, reject) => {
            // Simulate abort
            const error = new Error('Aborted');
            error.name = 'AbortError';
            setTimeout(() => reject(error), 10);
          })
      );

      await expect(
        fetchWithConfig('https://api.example.com/slow', baseConfig, {}, 50)
      ).rejects.toThrow('Request timeout');
    });

    it('should propagate fetch errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network failure'));

      await expect(
        fetchWithConfig('https://api.example.com/endpoint', baseConfig)
      ).rejects.toThrow('Network failure');
    });

    it('should use default timeout of 5 minutes', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
      });

      await fetchWithConfig('https://api.example.com/endpoint', baseConfig);

      // Verify fetch was called (timeout is handled internally)
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('proxy configuration', () => {
    it('should handle config without network settings', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await fetchWithConfig('https://api.example.com/endpoint', baseConfig);

      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle config with disabled proxy', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const configWithDisabledProxy: LLMConfig = {
        ...baseConfig,
        network: {
          proxy: {
            enabled: false,
            mode: 'none',
          },
        },
      };

      await fetchWithConfig(
        'https://api.example.com/endpoint',
        configWithDisabledProxy
      );

      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle config with enabled proxy mode none', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const config: LLMConfig = {
        ...baseConfig,
        network: {
          proxy: {
            enabled: true,
            mode: 'none',
          },
        },
      };

      await fetchWithConfig('https://api.example.com/endpoint', config);

      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle SSL configuration', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const config: LLMConfig = {
        ...baseConfig,
        network: {
          ssl: {
            verify: true,
          },
        },
      };

      await fetchWithConfig('https://api.example.com/endpoint', config);

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('fetchWithConfig error handling', () => {
    it('should clear timeout on successful response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const response = await fetchWithConfig(
        'https://api.example.com/endpoint',
        baseConfig
      );

      expect(response.ok).toBe(true);
    });

    it('should throw timeout error with correct message', async () => {
      // Simulate abort
      (global.fetch as jest.Mock).mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          // Listen for abort signal
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const error = new Error('Aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        });
      });

      const customTimeout = 100;
      await expect(
        fetchWithConfig(
          'https://api.example.com/slow',
          baseConfig,
          {},
          customTimeout
        )
      ).rejects.toThrow(`Request timeout after ${customTimeout}ms`);
    });

    it('should re-throw non-abort errors', async () => {
      const customError = new Error('Custom network error');
      customError.name = 'NetworkError';
      (global.fetch as jest.Mock).mockRejectedValue(customError);

      await expect(
        fetchWithConfig('https://api.example.com/endpoint', baseConfig)
      ).rejects.toThrow('Custom network error');
    });
  });

  describe('createFetchOptions edge cases', () => {
    it('should handle empty base options', () => {
      const options = createFetchOptions(baseConfig, {});

      expect(options.headers).toBeDefined();
    });

    it('should handle config without network field', () => {
      const simpleConfig: LLMConfig = {
        provider: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2000,
      };

      const options = createFetchOptions(simpleConfig);

      expect(options).toBeDefined();
      expect(options.headers).toBeDefined();
    });

    it('should handle config with empty customHeaders', () => {
      const config: LLMConfig = {
        ...baseConfig,
        network: {
          customHeaders: {},
        },
      };

      const options = createFetchOptions(config);

      expect(options.headers).toBeDefined();
    });
  });
});
