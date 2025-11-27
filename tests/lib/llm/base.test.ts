/**
 * BaseLLMProvider 테스트
 */

import { BaseLLMProvider, LLMOptions, LLMResponse, StreamChunk } from '@/lib/llm/base';
import type { Message, LLMConfig } from '@/types';

// Create a concrete implementation for testing
class TestLLMProvider extends BaseLLMProvider {
  async chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const formattedMessages = this.formatMessages(messages);
    const mergedOptions = this.mergeOptions(options);

    return {
      content: `Response for ${formattedMessages.length} messages with temp ${mergedOptions.temperature}`,
      model: this.model,
    };
  }

  async *stream(messages: Message[], options?: LLMOptions): AsyncGenerator<StreamChunk> {
    yield { content: 'Hello', done: false };
    yield { content: ' World', done: true };
  }

  async getModels(): Promise<string[]> {
    return ['model-1', 'model-2'];
  }

  async validate(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  // Expose protected methods for testing
  public testFormatMessages(messages: Message[]): any[] {
    return this.formatMessages(messages);
  }

  public testMergeOptions(options?: LLMOptions): LLMOptions {
    return this.mergeOptions(options);
  }
}

describe('BaseLLMProvider', () => {
  const baseURL = 'https://api.example.com/v1';
  const apiKey = 'test-api-key';
  const model = 'test-model';

  let provider: TestLLMProvider;

  beforeEach(() => {
    provider = new TestLLMProvider(baseURL, apiKey, model);
  });

  describe('constructor', () => {
    it('should initialize with required parameters', () => {
      expect(provider).toBeDefined();
    });

    it('should set default options', () => {
      const options = provider.testMergeOptions();

      expect(options.temperature).toBe(0.7);
      expect(options.maxTokens).toBe(2000);
      expect(options.stream).toBe(false);
    });

    it('should accept custom default options', () => {
      const customProvider = new TestLLMProvider(baseURL, apiKey, model, {
        temperature: 0.5,
        maxTokens: 1000,
      });

      const options = customProvider.testMergeOptions();

      expect(options.temperature).toBe(0.5);
      expect(options.maxTokens).toBe(1000);
    });
  });

  describe('formatMessages', () => {
    it('should format simple text messages', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'system',
          content: 'You are helpful',
          created_at: Date.now(),
        },
        {
          id: '2',
          role: 'user',
          content: 'Hello',
          created_at: Date.now(),
        },
        {
          id: '3',
          role: 'assistant',
          content: 'Hi there!',
          created_at: Date.now(),
        },
      ];

      const formatted = provider.testFormatMessages(messages);

      expect(formatted).toHaveLength(3);
      expect(formatted[0]).toEqual({ role: 'system', content: 'You are helpful' });
      expect(formatted[1]).toEqual({ role: 'user', content: 'Hello' });
      expect(formatted[2]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('should format tool messages with tool_call_id', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'tool',
          content: '{"result": "success"}',
          tool_call_id: 'call_123',
          name: 'get_weather',
          created_at: Date.now(),
        },
      ];

      const formatted = provider.testFormatMessages(messages);

      expect(formatted[0]).toEqual({
        role: 'tool',
        content: '{"result": "success"}',
        tool_call_id: 'call_123',
        name: 'get_weather',
      });
    });

    it('should format tool messages without optional name', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'tool',
          content: 'result',
          tool_call_id: 'call_123',
          created_at: Date.now(),
        },
      ];

      const formatted = provider.testFormatMessages(messages);

      expect(formatted[0].tool_call_id).toBe('call_123');
      expect(formatted[0].name).toBeUndefined();
    });

    it('should format assistant messages with tool_calls', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'assistant',
          content: 'Let me check the weather',
          tool_calls: [
            {
              id: 'call_123',
              name: 'get_weather',
              arguments: { city: 'Seoul' },
            },
          ],
          created_at: Date.now(),
        },
      ];

      const formatted = provider.testFormatMessages(messages);

      expect(formatted[0].role).toBe('assistant');
      expect(formatted[0].content).toBe('Let me check the weather');
      expect(formatted[0].tool_calls).toHaveLength(1);
      expect(formatted[0].tool_calls[0].id).toBe('call_123');
      expect(formatted[0].tool_calls[0].type).toBe('function');
      expect(formatted[0].tool_calls[0].function.name).toBe('get_weather');
      expect(formatted[0].tool_calls[0].function.arguments).toBe('{"city":"Seoul"}');
    });

    it('should format assistant messages with string arguments', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'assistant',
          content: null as any,
          tool_calls: [
            {
              id: 'call_123',
              name: 'test_tool',
              arguments: '{"key": "value"}' as any,
            },
          ],
          created_at: Date.now(),
        },
      ];

      const formatted = provider.testFormatMessages(messages);

      expect(formatted[0].content).toBeNull();
      expect(formatted[0].tool_calls[0].function.arguments).toBe('{"key": "value"}');
    });

    it('should format messages with images (Vision API)', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'What is in this image?',
          images: [
            {
              id: 'img_1',
              path: '/path/to/image.png',
              filename: 'image.png',
              mimeType: 'image/png',
              base64: 'data:image/png;base64,iVBORw0KGgo...',
            },
          ],
          created_at: Date.now(),
        },
      ];

      const formatted = provider.testFormatMessages(messages);

      expect(formatted[0].role).toBe('user');
      expect(Array.isArray(formatted[0].content)).toBe(true);
      expect(formatted[0].content).toHaveLength(2);
      expect(formatted[0].content[0]).toEqual({
        type: 'text',
        text: 'What is in this image?',
      });
      expect(formatted[0].content[1]).toEqual({
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,iVBORw0KGgo...',
        },
      });
    });

    it('should format messages with multiple images', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'Compare these images',
          images: [
            {
              id: 'img_1',
              path: '/path/1.png',
              filename: '1.png',
              mimeType: 'image/png',
              base64: 'data:image/png;base64,abc...',
            },
            {
              id: 'img_2',
              path: '/path/2.jpg',
              filename: '2.jpg',
              mimeType: 'image/jpeg',
              base64: 'data:image/jpeg;base64,xyz...',
            },
          ],
          created_at: Date.now(),
        },
      ];

      const formatted = provider.testFormatMessages(messages);

      expect(formatted[0].content).toHaveLength(3); // 1 text + 2 images
      expect(formatted[0].content[1].type).toBe('image_url');
      expect(formatted[0].content[2].type).toBe('image_url');
    });

    it('should handle empty images array', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          images: [],
          created_at: Date.now(),
        },
      ];

      const formatted = provider.testFormatMessages(messages);

      // With empty images, should be simple text format
      expect(formatted[0]).toEqual({ role: 'user', content: 'Hello' });
    });
  });

  describe('mergeOptions', () => {
    it('should return defaults when no options provided', () => {
      const merged = provider.testMergeOptions();

      expect(merged.temperature).toBe(0.7);
      expect(merged.maxTokens).toBe(2000);
      expect(merged.stream).toBe(false);
    });

    it('should override defaults with provided options', () => {
      const merged = provider.testMergeOptions({
        temperature: 0.9,
        maxTokens: 4000,
      });

      expect(merged.temperature).toBe(0.9);
      expect(merged.maxTokens).toBe(4000);
      expect(merged.stream).toBe(false); // Default
    });

    it('should preserve tools option', () => {
      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'test_tool',
            description: 'A test tool',
            parameters: {},
          },
        },
      ];

      const merged = provider.testMergeOptions({ tools });

      expect(merged.tools).toEqual(tools);
    });
  });

  describe('abstract methods implementation', () => {
    it('chat should return response', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: Date.now() },
      ];

      const response = await provider.chat(messages);

      expect(response.content).toContain('1 messages');
      expect(response.model).toBe(model);
    });

    it('stream should yield chunks', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: Date.now() },
      ];

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.stream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe('Hello');
      expect(chunks[0].done).toBe(false);
      expect(chunks[1].content).toBe(' World');
      expect(chunks[1].done).toBe(true);
    });

    it('getModels should return model list', async () => {
      const models = await provider.getModels();

      expect(models).toEqual(['model-1', 'model-2']);
    });

    it('validate should check API key', async () => {
      const valid = await provider.validate();

      expect(valid).toBe(true);
    });

    it('validate should fail for empty API key', async () => {
      const emptyKeyProvider = new TestLLMProvider(baseURL, '', model);
      const valid = await emptyKeyProvider.validate();

      expect(valid).toBe(false);
    });
  });
});
