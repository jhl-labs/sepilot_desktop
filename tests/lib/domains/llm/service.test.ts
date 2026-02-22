/**
 * LLMService 테스트
 */

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/lib/domains/llm/client', () => {
  const mockProvider = {
    chat: jest.fn(),
    stream: jest.fn(),
    validate: jest.fn(),
  };
  const mockClient = {
    isConfigured: jest.fn().mockReturnValue(true),
    getProvider: jest.fn().mockReturnValue(mockProvider),
  };
  return {
    getLLMClient: jest.fn().mockReturnValue(mockClient),
    __mockClient: mockClient,
    __mockProvider: mockProvider,
  };
});

jest.mock('@/lib/domains/llm/vision-utils', () => ({
  hasImages: jest.fn().mockReturnValue(false),
  getVisionProviderFromConfig: jest.fn().mockResolvedValue(null),
  createVisionProvider: jest.fn().mockReturnValue(null),
}));

jest.mock('@/lib/domains/llm/streaming-callback', () => ({
  isAborted: jest.fn().mockReturnValue(false),
  getCurrentConversationId: jest.fn().mockReturnValue(null),
}));

jest.mock('@/lib/domains/config/llm-config-migration', () => ({
  isLLMConfigV2: jest.fn().mockReturnValue(false),
  convertV2ToV1: jest.fn((c: any) => c),
}));

// Must mock the database import used internally
jest.mock(
  '../../../electron/services/database',
  () => ({
    databaseService: {
      getSetting: jest.fn().mockReturnValue(null),
    },
  }),
  { virtual: true }
);

import { LLMService } from '@/lib/domains/llm/service';
import { getLLMClient } from '@/lib/domains/llm/client';
import { hasImages } from '@/lib/domains/llm/vision-utils';
import { isAborted, getCurrentConversationId } from '@/lib/domains/llm/streaming-callback';

const { __mockClient, __mockProvider } = require('@/lib/domains/llm/client');

describe('LLMService', () => {
  beforeEach(() => {
    __mockClient.isConfigured.mockReturnValue(true);
    __mockClient.getProvider.mockReturnValue(__mockProvider);
    (hasImages as jest.Mock).mockReturnValue(false);
    (isAborted as jest.Mock).mockReturnValue(false);
    (getCurrentConversationId as jest.Mock).mockReturnValue(null);
  });

  describe('streamChat', () => {
    it('should stream content from LLM provider', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];

      async function* mockStream() {
        yield { content: 'Hello', done: false };
        yield { content: ' World', done: false };
        yield { content: '', done: true };
      }

      __mockProvider.stream.mockReturnValue(mockStream());

      const chunks: string[] = [];
      for await (const chunk of LLMService.streamChat(messages)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' World']);
    });

    it('should throw when LLM client is not configured', async () => {
      __mockClient.isConfigured.mockReturnValue(false);

      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];

      const gen = LLMService.streamChat(messages);
      await expect(gen.next()).rejects.toThrow('LLM client is not configured');
    });

    it('should throw when streaming is aborted', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];

      (getCurrentConversationId as jest.Mock).mockReturnValue('conv-1');
      (isAborted as jest.Mock).mockReturnValue(true);

      async function* mockStream() {
        yield { content: 'Hello', done: false };
      }

      __mockProvider.stream.mockReturnValue(mockStream());

      const gen = LLMService.streamChat(messages);
      await expect(gen.next()).rejects.toThrow('Streaming aborted by user');
    });

    it('should propagate stream errors', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];

      async function* mockStream() {
        yield { content: 'Hello', done: false };
        throw new Error('API Error');
      }

      __mockProvider.stream.mockReturnValue(mockStream());

      const gen = LLMService.streamChat(messages);
      // First chunk should work
      const first = await gen.next();
      expect(first.value).toBe('Hello');
      // Second should throw
      await expect(gen.next()).rejects.toThrow('API Error');
    });

    it('should skip empty content chunks', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];

      async function* mockStream() {
        yield { content: '', done: false };
        yield { content: 'Hello', done: false };
        yield { content: '', done: true };
      }

      __mockProvider.stream.mockReturnValue(mockStream());

      const chunks: string[] = [];
      for await (const chunk of LLMService.streamChat(messages)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello']);
    });
  });

  describe('streamChatWithChunks', () => {
    it('should stream full chunk objects', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];

      const chunk1 = { content: 'Hello', done: false };
      const chunk2 = {
        content: '',
        done: true,
        toolCalls: [{ id: 'c1', type: 'function', function: { name: 'test', arguments: '{}' } }],
      };

      async function* mockStream() {
        yield chunk1;
        yield chunk2;
      }

      __mockProvider.stream.mockReturnValue(mockStream());

      const chunks: any[] = [];
      for await (const chunk of LLMService.streamChatWithChunks(messages)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual(chunk1);
      expect(chunks[1]).toEqual(chunk2);
    });

    it('should throw when not configured', async () => {
      __mockClient.isConfigured.mockReturnValue(false);

      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];

      const gen = LLMService.streamChatWithChunks(messages);
      await expect(gen.next()).rejects.toThrow('LLM client is not configured');
    });

    it('should throw when streaming is aborted', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];

      (getCurrentConversationId as jest.Mock).mockReturnValue('conv-1');
      (isAborted as jest.Mock).mockReturnValue(true);

      async function* mockStream() {
        yield { content: 'test', done: false };
      }

      __mockProvider.stream.mockReturnValue(mockStream());

      const gen = LLMService.streamChatWithChunks(messages);
      await expect(gen.next()).rejects.toThrow('Streaming aborted by user');
    });

    it('should not use vision provider when tools are provided', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];
      (hasImages as jest.Mock).mockReturnValue(true);

      async function* mockStream() {
        yield { content: 'OK', done: true };
      }

      __mockProvider.stream.mockReturnValue(mockStream());

      const tools = [
        {
          type: 'function' as const,
          function: { name: 'test', description: 'test', parameters: {} },
        },
      ];

      const chunks: any[] = [];
      for await (const chunk of LLMService.streamChatWithChunks(messages, { tools })) {
        chunks.push(chunk);
      }

      // Should use regular provider, not vision
      expect(__mockClient.getProvider).toHaveBeenCalled();
    });
  });

  describe('chat', () => {
    it('should return LLM response', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];

      const mockResponse = {
        content: 'Hi there!',
        model: 'gpt-4',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };

      __mockProvider.chat.mockResolvedValue(mockResponse);

      const result = await LLMService.chat(messages);

      expect(result).toEqual(mockResponse);
    });

    it('should throw when not configured', async () => {
      __mockClient.isConfigured.mockReturnValue(false);

      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];

      await expect(LLMService.chat(messages)).rejects.toThrow('LLM client is not configured');
    });

    it('should throw when images present but vision not configured', async () => {
      const messages = [
        {
          id: '1',
          role: 'user' as const,
          content: 'What is this?',
          images: [
            {
              id: 'img1',
              path: '/test.png',
              filename: 'test.png',
              mimeType: 'image/png',
              base64: 'data:image/png;base64,abc',
            },
          ],
          created_at: Date.now(),
        },
      ];

      (hasImages as jest.Mock).mockReturnValue(true);

      await expect(LLMService.chat(messages)).rejects.toThrow('Vision model is not configured');
    });

    it('should use regular provider when images present but tools provided', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];
      (hasImages as jest.Mock).mockReturnValue(true);

      const mockResponse = { content: 'OK', model: 'gpt-4' };
      __mockProvider.chat.mockResolvedValue(mockResponse);

      const tools = [
        {
          type: 'function' as const,
          function: { name: 'test', description: 'test', parameters: {} },
        },
      ];

      const result = await LLMService.chat(messages, { tools });

      expect(result).toEqual(mockResponse);
    });

    it('should propagate chat errors', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];

      __mockProvider.chat.mockRejectedValue(new Error('API Error'));

      await expect(LLMService.chat(messages)).rejects.toThrow('API Error');
    });

    it('should pass options to provider', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
      ];
      const options = { temperature: 0.5, maxTokens: 1000 };

      __mockProvider.chat.mockResolvedValue({ content: 'OK', model: 'gpt-4' });

      await LLMService.chat(messages, options);

      expect(__mockProvider.chat).toHaveBeenCalledWith(messages, options);
    });
  });

  describe('validate', () => {
    it('should return true when validation succeeds', async () => {
      __mockProvider.validate.mockResolvedValue(true);

      const result = await LLMService.validate();

      expect(result).toBe(true);
    });

    it('should return false when not configured', async () => {
      __mockClient.isConfigured.mockReturnValue(false);

      const result = await LLMService.validate();

      expect(result).toBe(false);
    });

    it('should return false when validation fails', async () => {
      __mockProvider.validate.mockResolvedValue(false);

      const result = await LLMService.validate();

      expect(result).toBe(false);
    });
  });
});
