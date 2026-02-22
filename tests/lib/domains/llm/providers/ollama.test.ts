/**
 * OllamaProvider 테스트
 */

import { OllamaProvider } from '@/lib/domains/llm/providers/ollama';
import type { Message, LLMConfig } from '@/types';

// Mock dependencies
jest.mock('@/lib/domains/llm/http-utils', () => ({
  fetchWithConfig: jest.fn(),
}));

jest.mock('@/lib/http', () => ({
  safeJsonParse: jest.fn(),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { fetchWithConfig } from '@/lib/domains/llm/http-utils';
import { safeJsonParse } from '@/lib/http';

const mockFetchWithConfig = fetchWithConfig as jest.MockedFunction<typeof fetchWithConfig>;
const mockSafeJsonParse = safeJsonParse as jest.MockedFunction<typeof safeJsonParse>;

describe('OllamaProvider', () => {
  const baseURL = 'http://localhost:11434';
  const apiKey = '';
  const model = 'llama3';
  const defaultConfig: LLMConfig = {
    provider: 'ollama',
    baseURL,
    apiKey,
    model,
    temperature: 0.7,
    maxTokens: 2000,
  };

  let provider: OllamaProvider;

  const createMessages = (content = 'Hello'): Message[] => [
    { id: '1', role: 'user', content, created_at: Date.now() },
  ];

  beforeEach(() => {
    provider = new OllamaProvider(baseURL, apiKey, model, {}, defaultConfig);
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it('should create an instance with custom options', () => {
      const custom = new OllamaProvider(
        baseURL,
        apiKey,
        model,
        { temperature: 0.3, maxTokens: 500 },
        defaultConfig
      );
      expect(custom).toBeDefined();
    });
  });

  describe('chat', () => {
    it('should send a chat request and return response', async () => {
      const messages = createMessages();
      const responseData = {
        message: { content: 'Hello! How can I help?' },
        model: 'llama3',
      };

      mockFetchWithConfig.mockResolvedValue({ ok: true } as any);
      mockSafeJsonParse.mockResolvedValue(responseData);

      const result = await provider.chat(messages);

      expect(result.content).toBe('Hello! How can I help?');
      expect(result.model).toBe('llama3');
    });

    it('should use provider model when response model is missing', async () => {
      const messages = createMessages();
      const responseData = {
        message: { content: 'Response' },
      };

      mockFetchWithConfig.mockResolvedValue({ ok: true } as any);
      mockSafeJsonParse.mockResolvedValue(responseData);

      const result = await provider.chat(messages);

      expect(result.model).toBe('llama3');
    });

    it('should handle empty message content in response', async () => {
      const messages = createMessages();
      const responseData = { model: 'llama3' };

      mockFetchWithConfig.mockResolvedValue({ ok: true } as any);
      mockSafeJsonParse.mockResolvedValue(responseData);

      const result = await provider.chat(messages);

      expect(result.content).toBe('');
    });

    it('should throw on non-ok response', async () => {
      const messages = createMessages();

      mockFetchWithConfig.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
      } as any);

      await expect(provider.chat(messages)).rejects.toThrow('Ollama API error: 500');
    });

    it('should pass temperature and maxTokens in options', async () => {
      const messages = createMessages();
      mockFetchWithConfig.mockResolvedValue({ ok: true } as any);
      mockSafeJsonParse.mockResolvedValue({ message: { content: '' }, model: 'llama3' });

      await provider.chat(messages, { temperature: 0.5, maxTokens: 1000 });

      const callArgs = mockFetchWithConfig.mock.calls[0];
      const body = JSON.parse(callArgs[2]?.body as string);
      expect(body.options.temperature).toBe(0.5);
      expect(body.options.num_predict).toBe(1000);
      expect(body.stream).toBe(false);
    });

    it('should format messages with images for Ollama native API', async () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'What is this?',
          images: [
            {
              id: 'img1',
              path: '/test.png',
              filename: 'test.png',
              mimeType: 'image/png',
              base64: 'data:image/png;base64,iVBORw0KGgo=',
            },
          ],
          created_at: Date.now(),
        },
      ];

      mockFetchWithConfig.mockResolvedValue({ ok: true } as any);
      mockSafeJsonParse.mockResolvedValue({ message: { content: 'A cat' }, model: 'llava' });

      await provider.chat(messages);

      const callArgs = mockFetchWithConfig.mock.calls[0];
      const body = JSON.parse(callArgs[2]?.body as string);
      // Should extract pure base64 (without data URL prefix)
      expect(body.messages[0].images[0]).toBe('iVBORw0KGgo=');
      expect(body.messages[0].content).toBe('What is this?');
    });

    it('should handle images without data URL prefix', async () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'Describe',
          images: [
            {
              id: 'img1',
              path: '/test.png',
              filename: 'test.png',
              mimeType: 'image/png',
              base64: 'rawBase64String',
            },
          ],
          created_at: Date.now(),
        },
      ];

      mockFetchWithConfig.mockResolvedValue({ ok: true } as any);
      mockSafeJsonParse.mockResolvedValue({ message: { content: 'OK' }, model: 'llava' });

      await provider.chat(messages);

      const callArgs = mockFetchWithConfig.mock.calls[0];
      const body = JSON.parse(callArgs[2]?.body as string);
      expect(body.messages[0].images[0]).toBe('rawBase64String');
    });

    it('should handle fetch error', async () => {
      const messages = createMessages();
      mockFetchWithConfig.mockRejectedValue(new Error('Connection refused'));

      await expect(provider.chat(messages)).rejects.toThrow('Connection refused');
    });
  });

  describe('stream', () => {
    function createJsonStream(lines: string[]): ReadableStream<Uint8Array> {
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
      const lines = [
        '{"message":{"content":"Hello"},"done":false}',
        '{"message":{"content":" World"},"done":false}',
        '{"done":true}',
      ];

      const stream = createJsonStream(lines);
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
      expect(chunks.some((c) => c.done === true)).toBe(true);
    });

    it('should throw error on non-ok response', async () => {
      const messages = createMessages();

      mockFetchWithConfig.mockResolvedValue({
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('Model not found'),
      } as any);

      const gen = provider.stream(messages);
      await expect(gen.next()).rejects.toThrow('Ollama API error: 404');
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

    it('should skip non-JSON lines gracefully', async () => {
      const messages = createMessages();
      const lines = ['not json', '', '{"message":{"content":"OK"},"done":false}', '{"done":true}'];

      const stream = createJsonStream(lines);
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

    it('should handle JSON parse errors gracefully', async () => {
      const messages = createMessages();
      const lines = [
        '{bad json}',
        '{"message":{"content":"After error"},"done":false}',
        '{"done":true}',
      ];

      const stream = createJsonStream(lines);
      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        body: stream,
      } as any);

      const chunks: any[] = [];
      for await (const chunk of provider.stream(messages)) {
        chunks.push(chunk);
      }

      // Should still get chunks after the error
      expect(chunks.some((c) => c.content === 'After error')).toBe(true);
    });

    it('should include num_predict when maxTokens is set', async () => {
      const messages = createMessages();
      const lines = ['{"done":true}'];
      const stream = createJsonStream(lines);

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        body: stream,
      } as any);

      const chunks: any[] = [];
      for await (const chunk of provider.stream(messages, { maxTokens: 500 })) {
        chunks.push(chunk);
      }

      const callArgs = mockFetchWithConfig.mock.calls[0];
      const body = JSON.parse(callArgs[2]?.body as string);
      expect(body.options.num_predict).toBe(500);
    });

    it('should not include num_predict when maxTokens is undefined', async () => {
      // Create provider without maxTokens default
      const customProvider = new OllamaProvider(
        baseURL,
        apiKey,
        model,
        { temperature: 0.7, maxTokens: undefined },
        { ...defaultConfig, maxTokens: undefined as any }
      );

      const messages = createMessages();
      const lines = ['{"done":true}'];
      const stream = createJsonStream(lines);

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        body: stream,
      } as any);

      const chunks: any[] = [];
      for await (const chunk of customProvider.stream(messages, { maxTokens: undefined })) {
        chunks.push(chunk);
      }

      const callArgs = mockFetchWithConfig.mock.calls[0];
      const body = JSON.parse(callArgs[2]?.body as string);
      expect(body.options.num_predict).toBeUndefined();
    });

    it('should handle fetch error', async () => {
      const messages = createMessages();
      mockFetchWithConfig.mockRejectedValue(new Error('Connection refused'));

      const gen = provider.stream(messages);
      await expect(gen.next()).rejects.toThrow('Connection refused');
    });

    it('should yield done when reader is done', async () => {
      const messages = createMessages();
      // Stream with no done:true, just EOF
      const lines = ['{"message":{"content":"Hello"},"done":false}'];
      const stream = createJsonStream(lines);

      mockFetchWithConfig.mockResolvedValue({
        ok: true,
        body: stream,
      } as any);

      const chunks: any[] = [];
      for await (const chunk of provider.stream(messages)) {
        chunks.push(chunk);
      }

      // Should have a done chunk from the reader finishing
      expect(chunks[chunks.length - 1].done).toBe(true);
    });
  });

  describe('getModels', () => {
    it('should return list of model names', async () => {
      const modelsData = {
        models: [{ name: 'llama3' }, { name: 'mistral' }, { name: 'codellama' }],
      };

      mockFetchWithConfig.mockResolvedValue({ ok: true } as any);
      mockSafeJsonParse.mockResolvedValue(modelsData);

      const models = await provider.getModels();

      expect(models).toEqual(['llama3', 'mistral', 'codellama']);
      expect(mockFetchWithConfig).toHaveBeenCalledWith(`${baseURL}/api/tags`, defaultConfig);
    });

    it('should return empty array when models field is missing', async () => {
      mockFetchWithConfig.mockResolvedValue({ ok: true } as any);
      mockSafeJsonParse.mockResolvedValue({});

      const models = await provider.getModels();

      expect(models).toEqual([]);
    });

    it('should return empty array on non-ok response', async () => {
      mockFetchWithConfig.mockResolvedValue({ ok: false, status: 500 } as any);

      const models = await provider.getModels();

      expect(models).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockFetchWithConfig.mockRejectedValue(new Error('Connection refused'));

      const models = await provider.getModels();

      expect(models).toEqual([]);
    });
  });

  describe('validate', () => {
    it('should return true when Ollama is reachable', async () => {
      mockFetchWithConfig.mockResolvedValue({ ok: true } as any);

      const result = await provider.validate();

      expect(result).toBe(true);
      expect(mockFetchWithConfig).toHaveBeenCalledWith(`${baseURL}/api/tags`, defaultConfig);
    });

    it('should return false when Ollama is not reachable', async () => {
      mockFetchWithConfig.mockResolvedValue({ ok: false } as any);

      const result = await provider.validate();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetchWithConfig.mockRejectedValue(new Error('Connection refused'));

      const result = await provider.validate();

      expect(result).toBe(false);
    });
  });
});
