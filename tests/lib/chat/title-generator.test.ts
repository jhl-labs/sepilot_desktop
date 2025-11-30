/**
 * Title Generator 테스트
 */

import { generateConversationTitle, shouldGenerateTitle } from '@/lib/chat/title-generator';
import type { Message } from '@/types';
import { enableElectronMode, disableElectronMode, mockElectronAPI } from '../../setup';

describe('title-generator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateConversationTitle', () => {
    it('should generate title from LLM via Electron IPC', async () => {
      enableElectronMode();

      // Mock IPC response
      (mockElectronAPI.llm.generateTitle as jest.Mock).mockResolvedValue({
        success: true,
        data: { title: 'Generated Title' },
      });

      const messages: Pick<Message, 'role' | 'content'>[] = [
        { role: 'user', content: 'How do I implement a binary search?' },
        { role: 'assistant', content: 'Binary search is an efficient algorithm...' },
      ];

      const title = await generateConversationTitle(messages);

      expect(title).toBe('Generated Title');
      expect(mockElectronAPI.llm.generateTitle).toHaveBeenCalledWith(messages.slice(0, 3));
    });

    it('should use first 3 messages only', async () => {
      enableElectronMode();

      (mockElectronAPI.llm.generateTitle as jest.Mock).mockResolvedValue({
        success: true,
        data: { title: 'First Messages Title' },
      });

      const messages: Pick<Message, 'role' | 'content'>[] = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'user', content: 'Second message' },
        { role: 'assistant', content: 'Response 2' },
        { role: 'user', content: 'Third message' },
      ];

      const title = await generateConversationTitle(messages);

      expect(title).toBeDefined();
      // Should only pass first 3 messages to IPC
      expect(mockElectronAPI.llm.generateTitle).toHaveBeenCalledWith(messages.slice(0, 3));
    });

    it('should use generated title as-is (no quote cleaning)', async () => {
      enableElectronMode();

      (mockElectronAPI.llm.generateTitle as jest.Mock).mockResolvedValue({
        success: true,
        data: { title: 'Clean Title' },
      });

      const messages: Pick<Message, 'role' | 'content'>[] = [{ role: 'user', content: 'Test' }];

      const title = await generateConversationTitle(messages);

      expect(title).toBe('Clean Title');
    });

    it('should use fallback title on LLM error', async () => {
      enableElectronMode();

      (mockElectronAPI.llm.generateTitle as jest.Mock).mockResolvedValue({
        success: false,
        error: 'LLM error',
      });

      const messages: Pick<Message, 'role' | 'content'>[] = [
        { role: 'user', content: 'This is my question about programming' },
      ];

      const title = await generateConversationTitle(messages);

      // Should use fallback from first user message
      expect(title).toContain('This is my question');
    });

    it('should use fallback when title is too short', async () => {
      enableElectronMode();

      (mockElectronAPI.llm.generateTitle as jest.Mock).mockResolvedValue({
        success: true,
        data: { title: 'AB' }, // Too short (< 3 chars)
      });

      const messages: Pick<Message, 'role' | 'content'>[] = [
        { role: 'user', content: 'What is React?' },
      ];

      const title = await generateConversationTitle(messages);

      expect(title).toBe('What is React?');
    });

    it('should handle empty generated title', async () => {
      enableElectronMode();

      (mockElectronAPI.llm.generateTitle as jest.Mock).mockResolvedValue({
        success: true,
        data: { title: '' },
      });

      const messages: Pick<Message, 'role' | 'content'>[] = [
        { role: 'user', content: 'Short question' },
      ];

      const title = await generateConversationTitle(messages);

      expect(title).toBe('Short question');
    });

    it('should use fallback in non-Electron environment', async () => {
      disableElectronMode();

      const messages: Pick<Message, 'role' | 'content'>[] = [
        { role: 'user', content: 'Browser environment test' },
      ];

      const title = await generateConversationTitle(messages);

      // Should use fallback in browser
      expect(title).toBe('Browser environment test');
    });
  });

  describe('fallback title generation', () => {
    beforeEach(() => {
      enableElectronMode();
      (mockElectronAPI.llm.generateTitle as jest.Mock).mockRejectedValue(new Error('IPC Error'));
    });

    it('should use first user message content', async () => {
      const messages: Pick<Message, 'role' | 'content'>[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'What is TypeScript?' },
      ];

      const title = await generateConversationTitle(messages);

      expect(title).toBe('What is TypeScript?');
    });

    it('should truncate long messages with ellipsis', async () => {
      const longMessage =
        'This is a very long message that should be truncated because it exceeds the maximum length for a conversation title';
      const messages: Pick<Message, 'role' | 'content'>[] = [
        { role: 'user', content: longMessage },
      ];

      const title = await generateConversationTitle(messages);

      expect(title.length).toBeLessThanOrEqual(54); // 50 + "..."
      expect(title.endsWith('...')).toBe(true);
    });

    it('should return default title when no user message', async () => {
      const messages: Pick<Message, 'role' | 'content'>[] = [
        { role: 'system', content: 'System message only' },
      ];

      const title = await generateConversationTitle(messages);

      expect(title).toBe('새 대화');
    });

    it('should return default title for empty messages', async () => {
      const title = await generateConversationTitle([]);

      expect(title).toBe('새 대화');
    });
  });

  describe('shouldGenerateTitle', () => {
    it('should return true for default Korean title', () => {
      expect(shouldGenerateTitle('새 대화')).toBe(true);
    });

    it('should return true for default English title', () => {
      expect(shouldGenerateTitle('New Conversation')).toBe(true);
    });

    it('should return true for empty title', () => {
      expect(shouldGenerateTitle('')).toBe(true);
    });

    it('should return true for whitespace only', () => {
      expect(shouldGenerateTitle('   ')).toBe(true);
    });

    it('should return false for custom title', () => {
      expect(shouldGenerateTitle('React Tutorial')).toBe(false);
    });

    it('should return false for generated title', () => {
      expect(shouldGenerateTitle('How to implement binary search')).toBe(false);
    });
  });
});
