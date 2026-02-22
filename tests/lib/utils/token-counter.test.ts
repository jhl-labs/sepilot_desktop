/**
 * token-counter utility tests
 */

jest.mock('js-tiktoken', () => {
  const mockEncode = jest.fn((text: string) => {
    // Simple mock: split by spaces and return array of numbers
    if (!text) return [];
    return text
      .split(/\s+/)
      .filter(Boolean)
      .map((_, i) => i);
  });

  return {
    encodingForModel: jest.fn(() => ({
      encode: mockEncode,
    })),
  };
});

import {
  countTokens,
  countMessagesTokens,
  calculateContextUsage,
  formatTokens,
  clearEncoderCache,
  MODEL_CONTEXT_LIMITS,
} from '@/lib/utils/token-counter';
import type { Message } from '@/types';
import { encodingForModel } from 'js-tiktoken';

describe('token-counter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearEncoderCache();
  });

  describe('countTokens', () => {
    it('should return 0 for empty string', () => {
      expect(countTokens('')).toBe(0);
    });

    it('should return 0 for null/undefined-like input', () => {
      expect(countTokens(null as any)).toBe(0);
      expect(countTokens(undefined as any)).toBe(0);
    });

    it('should count tokens for a simple string', () => {
      const result = countTokens('Hello World');
      expect(result).toBeGreaterThan(0);
      expect(encodingForModel).toHaveBeenCalled();
    });

    it('should use gpt-4 encoder by default', () => {
      countTokens('test');
      expect(encodingForModel).toHaveBeenCalledWith('gpt-4');
    });

    it('should use specified model for gpt- prefix models', () => {
      countTokens('test', 'gpt-3.5-turbo');
      expect(encodingForModel).toHaveBeenCalledWith('gpt-3.5-turbo');
    });

    it('should fall back to gpt-4 for non-OpenAI models', () => {
      countTokens('test', 'claude-3-opus');
      expect(encodingForModel).toHaveBeenCalledWith('gpt-4');
    });

    it('should cache encoders for repeated calls', () => {
      countTokens('first call', 'gpt-4');
      countTokens('second call', 'gpt-4');
      // encodingForModel should only be called once because of caching
      expect(encodingForModel).toHaveBeenCalledTimes(1);
    });

    it('should handle encoder errors with fallback estimation', () => {
      // Make all calls throw to trigger the outer catch fallback
      (encodingForModel as jest.Mock).mockImplementation(() => {
        throw new Error('Unsupported model');
      });

      // Fallback: Math.ceil(text.length / 3)
      const text = 'abcdefghi'; // 9 chars -> ceil(9/3) = 3
      const result = countTokens(text, 'unknown-model');
      expect(result).toBe(3);

      // Restore default mock
      (encodingForModel as jest.Mock).mockImplementation(() => ({
        encode: (t: string) => {
          if (!t) return [];
          return t
            .split(/\s+/)
            .filter(Boolean)
            .map((_: string, i: number) => i);
        },
      }));
    });
  });

  describe('countMessagesTokens', () => {
    it('should return 0 for empty messages', () => {
      expect(countMessagesTokens([])).toBe(0);
    });

    it('should return 0 for null/undefined', () => {
      expect(countMessagesTokens(null as any)).toBe(0);
      expect(countMessagesTokens(undefined as any)).toBe(0);
    });

    it('should count tokens for single message', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: Date.now() },
      ];

      const result = countMessagesTokens(messages);
      // Should include message overhead (3) + role tokens + content tokens + primer (3)
      expect(result).toBeGreaterThan(0);
    });

    it('should count tokens for multiple messages', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: Date.now() },
        { id: '2', role: 'assistant', content: 'Hi there', created_at: Date.now() },
      ];

      const singleResult = countMessagesTokens([messages[0]]);
      const multiResult = countMessagesTokens(messages);
      expect(multiResult).toBeGreaterThan(singleResult);
    });

    it('should add tokens for images', () => {
      const messagesWithoutImages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: Date.now() },
      ];
      const messagesWithImages: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          created_at: Date.now(),
          images: [
            { id: 'img-1', filename: 'test.png', mimeType: 'image/png', base64: 'abc' },
            { id: 'img-2', filename: 'test2.png', mimeType: 'image/png', base64: 'def' },
          ],
        },
      ];

      const withoutImages = countMessagesTokens(messagesWithoutImages);
      const withImages = countMessagesTokens(messagesWithImages);

      // Each image adds 85 tokens
      expect(withImages - withoutImages).toBe(170);
    });

    it('should handle messages with empty content', () => {
      const messages: Message[] = [
        { id: '1', role: 'system', content: '', created_at: Date.now() },
      ];

      const result = countMessagesTokens(messages);
      // Should still include overhead and primer tokens
      expect(result).toBeGreaterThan(0);
    });

    it('should handle encoder errors with fallback', () => {
      // Make all calls throw to trigger the outer catch fallback
      (encodingForModel as jest.Mock).mockImplementation(() => {
        throw new Error('Encoder failed');
      });

      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello World Test', created_at: Date.now() },
      ];

      const result = countMessagesTokens(messages);
      // Fallback: Math.ceil(totalChars / 3)
      expect(result).toBe(Math.ceil('Hello World Test'.length / 3));

      // Restore default mock
      (encodingForModel as jest.Mock).mockImplementation(() => ({
        encode: (t: string) => {
          if (!t) return [];
          return t
            .split(/\s+/)
            .filter(Boolean)
            .map((_: string, i: number) => i);
        },
      }));
    });
  });

  describe('calculateContextUsage', () => {
    it('should calculate context usage for known model', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: Date.now() },
      ];

      const usage = calculateContextUsage(messages, '', 'gpt-4');
      expect(usage.max).toBe(8192);
      expect(usage.used).toBeGreaterThan(0);
      expect(usage.percentage).toBeGreaterThanOrEqual(0);
      expect(usage.percentage).toBeLessThanOrEqual(100);
    });

    it('should use custom max tokens when provided', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: Date.now() },
      ];

      const usage = calculateContextUsage(messages, '', 'gpt-4', 1000);
      expect(usage.max).toBe(1000);
    });

    it('should use default 128000 for unknown models', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: Date.now() },
      ];

      const usage = calculateContextUsage(messages, '', 'totally-unknown-model');
      expect(usage.max).toBe(128000);
    });

    it('should include input text tokens', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: Date.now() },
      ];

      const withoutInput = calculateContextUsage(messages, '', 'gpt-4');
      const withInput = calculateContextUsage(messages, 'Some additional input text here', 'gpt-4');

      expect(withInput.used).toBeGreaterThan(withoutInput.used);
    });

    it('should cap percentage at 100', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'x '.repeat(1000), created_at: Date.now() },
      ];

      // Use very small max tokens to exceed 100%
      const usage = calculateContextUsage(messages, '', 'gpt-4', 1);
      expect(usage.percentage).toBe(100);
    });

    it('should handle prefix matching for model variants', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: Date.now() },
      ];

      const usage = calculateContextUsage(messages, '', 'gpt-4-0613');
      // Should match gpt-4 prefix -> 8192
      expect(usage.max).toBe(8192);
    });
  });

  describe('formatTokens', () => {
    it('should format small numbers as-is', () => {
      expect(formatTokens(0)).toBe('0');
      expect(formatTokens(500)).toBe('500');
      expect(formatTokens(999)).toBe('999');
    });

    it('should format 1000+ as K', () => {
      expect(formatTokens(1000)).toBe('1.0K');
      expect(formatTokens(1500)).toBe('1.5K');
      expect(formatTokens(10000)).toBe('10.0K');
      expect(formatTokens(128000)).toBe('128.0K');
    });
  });

  describe('MODEL_CONTEXT_LIMITS', () => {
    it('should have entries for major OpenAI models', () => {
      expect(MODEL_CONTEXT_LIMITS['gpt-4o']).toBe(128000);
      expect(MODEL_CONTEXT_LIMITS['gpt-4']).toBe(8192);
      expect(MODEL_CONTEXT_LIMITS['gpt-3.5-turbo']).toBe(16385);
    });

    it('should have entries for Anthropic models', () => {
      expect(MODEL_CONTEXT_LIMITS['claude-3-opus-20240229']).toBe(200000);
      expect(MODEL_CONTEXT_LIMITS['claude-3-5-sonnet-20240620']).toBe(200000);
    });

    it('should have entries for Google models', () => {
      expect(MODEL_CONTEXT_LIMITS['gemini-1.5-pro']).toBe(2000000);
      expect(MODEL_CONTEXT_LIMITS['gemini-1.5-flash']).toBe(1000000);
    });
  });

  describe('clearEncoderCache', () => {
    it('should clear the encoder cache', () => {
      // Count tokens to populate cache
      countTokens('test', 'gpt-4');
      expect(encodingForModel).toHaveBeenCalledTimes(1);

      // Clear cache
      clearEncoderCache();

      // Count tokens again - should call encodingForModel again
      countTokens('test2', 'gpt-4');
      expect(encodingForModel).toHaveBeenCalledTimes(2);
    });
  });
});
