/**
 * OpenAIProvider 테스트
 */

import { OpenAIProvider } from '@/lib/domains/llm/providers/openai';
import type { Message, LLMConfig } from '@/types';
import type { LLMOptions } from '@/lib/domains/llm/base';

// Mock dependencies
jest.mock('@/lib/domains/llm/http-utils', () => ({
  fetchWithConfig: jest.fn(),
  createAuthHeader: jest.fn(() => ({ Authorization: 'Bearer test-key' })),
}));

jest.mock('@/lib/http', () => ({
  safeJsonParse: jest.fn(),
}));

jest.mock('@/lib/utils/safe-require', () => ({
  safeRequire: jest.fn(() => {
    throw new Error('Not in Electron');
  }),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { fetchWithConfig, createAuthHeader } from '@/lib/domains/llm/http-utils';
import { safeJsonParse } from '@/lib/http';

const mockFetchWithConfig = fetchWithConfig as jest.MockedFunction<typeof fetchWithConfig>;
const mockCreateAuthHeader = createAuthHeader as jest.MockedFunction<typeof createAuthHeader>;
const mockSafeJsonParse = safeJsonParse as jest.MockedFunction<typeof safeJsonParse>;

describe('OpenAIProvider', () => {
  const baseURL = 'https://api.openai.com/v1';
  const apiKey = 'sk-test-key';
  const model = 'gpt-4';
  const defaultConfig: LLMConfig = {
    provider: 'openai',
    baseURL,
    apiKey,
    model,
    temperature: 0.7,
    maxTokens: 2000,
  };

  let provider: OpenAIProvider;

  const createMessages = (content = 'Hello'): Message[] => [
    { id: '1', role: 'system', content: 'You are helpful', created_at: Date.now() },
    { id: '2', role: 'user', content, created_at: Date.now() },
  ];

  beforeEach(() => {
    provider = new OpenAIProvider(baseURL, apiKey, model, {}, defaultConfig);
    mockCreateAuthHeader.mockReturnValue({ Authorization: 'Bearer sk-test-key' });
  });

  describe('constructor', () => {
    it('should create an instance with required parameters', () => {
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it('should create an instance with custom options', () => {
      const customProvider = new OpenAIProvider(
        baseURL,
        apiKey,
        model,
        { temperature: 0.5, maxTokens: 1000 },
        defaultConfig
      );
      expect(customProvider).toBeDefined();
    });

    it('should create an instance without config', () => {
      const noConfigProvider = new OpenAIProvider(baseURL, apiKey, model);
      expect(noConfigProvider).toBeDefined();
    });
  });

  describe('chat', () => {
    it('should send a chat request and return response', async () => {
      const messages = createMessages();
      const responseData = {
        choices: [
          {
            message: { content: 'Hello! How can I help?', tool_calls: undefined },
            finish_reason: 'stop',
          },
        ],
        model: 'gpt-4',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify(responseData)),
      } as any);

      const result = await provider.chat(messages);

      expect(result.content).toBe('Hello! How can I help?');
      expect(result.model).toBe('gpt-4');
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    it('should include tool calls in response', async () => {
      const messages = createMessages();
      const responseData = {
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: { name: 'get_weather', arguments: '{"city":"Seoul"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        model: 'gpt-4',
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      };

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify(responseData)),
      } as any);

      const result = await provider.chat(messages);

      expect(result.toolCalls).toEqual([
        {
          id: 'call_123',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city":"Seoul"}' },
        },
      ]);
    });

    it('should throw error on non-ok response with JSON error', async () => {
      const messages = createMessages();
      const errorResponse = { error: { message: 'Invalid API key' } };

      mockFetchWithConfig.mockResolvedValue({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue(JSON.stringify(errorResponse)),
      } as any);

      await expect(provider.chat(messages)).rejects.toThrow('Invalid API key');
    });

    it('should throw error on non-ok response with non-JSON error', async () => {
      const messages = createMessages();

      mockFetchWithConfig.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
      } as any);

      await expect(provider.chat(messages)).rejects.toThrow('API error: 500');
    });

    it('should handle malformed JSON response by extracting first JSON object', async () => {
      const messages = createMessages();
      const validData = {
        choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
        model: 'gpt-4',
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
      // Malformed response: multiple JSON objects concatenated
      const malformedResponse = JSON.stringify(validData) + '{"extra":"data"}';

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(malformedResponse),
      } as any);

      const result = await provider.chat(messages);
      expect(result.content).toBe('test');
    });

    it('should throw error when no JSON object found in response', async () => {
      const messages = createMessages();

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('not json at all'),
      } as any);

      await expect(provider.chat(messages)).rejects.toThrow('No JSON object found');
    });

    it('should throw error on invalid response structure', async () => {
      const messages = createMessages();

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify({ invalid: 'data' })),
      } as any);

      await expect(provider.chat(messages)).rejects.toThrow('Invalid API response structure');
    });

    it('should pass tools in request body', async () => {
      const messages = createMessages();
      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'get_weather',
            description: 'Get weather',
            parameters: { type: 'object', properties: {} },
          },
        },
      ];

      const responseData = {
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        model: 'gpt-4',
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify(responseData)),
      } as any);

      await provider.chat(messages, { tools });

      const callArgs = mockFetchWithConfig.mock.calls[0];
      const body = JSON.parse(callArgs[2]?.body as string);
      expect(body.tools).toEqual(tools);
      expect(body.tool_choice).toBe('auto');
    });

    it('should include temperature and maxTokens in request', async () => {
      const messages = createMessages();
      const responseData = {
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        model: 'gpt-4',
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify(responseData)),
      } as any);

      await provider.chat(messages, { temperature: 0.9, maxTokens: 4000 });

      const callArgs = mockFetchWithConfig.mock.calls[0];
      const body = JSON.parse(callArgs[2]?.body as string);
      expect(body.temperature).toBe(0.9);
      expect(body.max_tokens).toBe(4000);
    });

    it('should include custom headers from config', async () => {
      const configWithHeaders: LLMConfig = {
        ...defaultConfig,
        customHeaders: { 'X-Custom': 'value' },
      };
      const customProvider = new OpenAIProvider(baseURL, apiKey, model, {}, configWithHeaders);
      const messages = createMessages();

      const responseData = {
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        model: 'gpt-4',
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify(responseData)),
      } as any);

      await customProvider.chat(messages);

      const callArgs = mockFetchWithConfig.mock.calls[0];
      expect(callArgs[2]?.headers).toHaveProperty('X-Custom', 'value');
    });

    it('should handle fetch error', async () => {
      const messages = createMessages();
      mockFetchWithConfig.mockRejectedValue(new Error('Network error'));

      await expect(provider.chat(messages)).rejects.toThrow('Network error');
    });
  });

  describe('stream', () => {
    function createSSEStream(lines: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      const data = lines.join('\n') + '\n';
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(data));
          controller.close();
        },
      });
    }

    it('should stream content chunks', async () => {
      const messages = createMessages();
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"content":" World"},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        'data: [DONE]',
      ];

      const stream = createSSEStream(sseData);
      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        body: stream,
      } as any);

      const chunks: any[] = [];
      for await (const chunk of provider.stream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks.some((c) => c.content === 'Hello')).toBe(true);
      expect(chunks.some((c) => c.content === ' World')).toBe(true);
      expect(chunks[chunks.length - 1].done).toBe(true);
    });

    it('should accumulate tool calls during streaming', async () => {
      const messages = createMessages();
      const sseData = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_","arguments":""}}]},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"weather","arguments":"{\\"city\\":"}}]},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Seoul\\"}"}}]},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
        'data: [DONE]',
      ];

      const stream = createSSEStream(sseData);
      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        body: stream,
      } as any);

      const chunks: any[] = [];
      for await (const chunk of provider.stream(messages)) {
        chunks.push(chunk);
      }

      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.done).toBe(true);
      expect(lastChunk.toolCalls).toBeDefined();
      expect(lastChunk.toolCalls[0].id).toBe('call_1');
      expect(lastChunk.toolCalls[0].function.name).toBe('get_weather');
      expect(lastChunk.toolCalls[0].function.arguments).toBe('{"city":"Seoul"}');
    });

    it('should throw error on non-ok response', async () => {
      const messages = createMessages();

      mockFetchWithConfig.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: jest.fn().mockResolvedValue('Rate limited'),
      } as any);

      const gen = provider.stream(messages);
      await expect(gen.next()).rejects.toThrow('429 Too Many Requests: Rate limited');
    });

    it('should throw error on non-ok response with JSON error body', async () => {
      const messages = createMessages();
      const errorBody = JSON.stringify({ error: { message: 'Quota exceeded' } });

      mockFetchWithConfig.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: jest.fn().mockResolvedValue(errorBody),
      } as any);

      const gen = provider.stream(messages);
      await expect(gen.next()).rejects.toThrow('Quota exceeded');
    });

    it('should throw error when no response body', async () => {
      const messages = createMessages();

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        body: null,
      } as any);

      const gen = provider.stream(messages);
      await expect(gen.next()).rejects.toThrow('No response body');
    });

    it('should skip empty lines and non-JSON SSE data', async () => {
      const messages = createMessages();
      const sseData = [
        '',
        ':comment',
        'data: {"choices":[{"delta":{"content":"OK"},"finish_reason":null}]}',
        'data: {}',
        'data: not-json',
        'data: [DONE]',
      ];

      const stream = createSSEStream(sseData);
      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        body: stream,
      } as any);

      const chunks: any[] = [];
      for await (const chunk of provider.stream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks.some((c) => c.content === 'OK')).toBe(true);
    });

    it('should handle abort signal', async () => {
      const messages = createMessages();
      const controller = new AbortController();
      controller.abort();

      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
        'data: [DONE]',
      ];
      const stream = createSSEStream(sseData);

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        body: stream,
      } as any);

      // With an already-aborted signal, the stream should return without yielding
      const chunks: any[] = [];
      for await (const chunk of provider.stream(messages, { abortSignal: controller.signal })) {
        chunks.push(chunk);
      }

      // Stream should have yielded nothing or been cancelled early
      // Since reader.read() happens before abort check, it may yield first chunk
      expect(chunks.length).toBeLessThanOrEqual(1);
    });

    it('should pass abort signal in fetch request', async () => {
      const messages = createMessages();
      const controller = new AbortController();

      const sseData = ['data: [DONE]'];
      const stream = createSSEStream(sseData);
      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        body: stream,
      } as any);

      const chunks: any[] = [];
      for await (const chunk of provider.stream(messages, { abortSignal: controller.signal })) {
        chunks.push(chunk);
      }

      const callArgs = mockFetchWithConfig.mock.calls[0];
      expect(callArgs[2]?.signal).toBe(controller.signal);
    });

    it('should handle JSON parse errors in SSE data gracefully', async () => {
      const messages = createMessages();
      const sseData = [
        'data: {invalid json}',
        'data: {"choices":[{"delta":{"content":"OK"},"finish_reason":null}]}',
        'data: [DONE]',
      ];

      const stream = createSSEStream(sseData);
      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        body: stream,
      } as any);

      const chunks: any[] = [];
      for await (const chunk of provider.stream(messages)) {
        chunks.push(chunk);
      }

      // Should still process valid chunks after parse error
      expect(chunks.some((c) => c.content === 'OK')).toBe(true);
    });

    it('should handle fetch error during streaming', async () => {
      const messages = createMessages();
      mockFetchWithConfig.mockRejectedValue(new Error('Connection reset'));

      const gen = provider.stream(messages);
      await expect(gen.next()).rejects.toThrow('Connection reset');
    });

    it('should handle topP option', async () => {
      const messages = createMessages();
      const sseData = ['data: [DONE]'];
      const stream = createSSEStream(sseData);

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        body: stream,
      } as any);

      const chunks: any[] = [];
      for await (const chunk of provider.stream(messages, { topP: 0.9 })) {
        chunks.push(chunk);
      }

      const callArgs = mockFetchWithConfig.mock.calls[0];
      const body = JSON.parse(callArgs[2]?.body as string);
      expect(body.top_p).toBe(0.9);
    });
  });

  describe('getModels', () => {
    it('should return list of model IDs', async () => {
      const modelsData = {
        data: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }, { id: 'gpt-4-turbo' }],
      };

      mockFetchWithConfig.mockResolvedValue({ ok: true } as any);
      mockSafeJsonParse.mockResolvedValue(modelsData);

      const models = await provider.getModels();

      expect(models).toEqual(['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo']);
      expect(mockFetchWithConfig).toHaveBeenCalledWith(
        `${baseURL}/models`,
        defaultConfig,
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('should return empty array on non-ok response', async () => {
      mockFetchWithConfig.mockResolvedValue({ ok: false, status: 401 } as any);

      const models = await provider.getModels();

      expect(models).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockFetchWithConfig.mockRejectedValue(new Error('Network error'));

      const models = await provider.getModels();

      expect(models).toEqual([]);
    });
  });

  describe('validate', () => {
    it('should return true when API is reachable', async () => {
      mockFetchWithConfig.mockResolvedValue({ ok: true } as any);

      const result = await provider.validate();

      expect(result).toBe(true);
    });

    it('should return false when API returns error', async () => {
      mockFetchWithConfig.mockResolvedValue({ ok: false, status: 401 } as any);

      const result = await provider.validate();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetchWithConfig.mockRejectedValue(new Error('Network error'));

      const result = await provider.validate();

      expect(result).toBe(false);
    });
  });
});
