/**
 * Context Manager for Coding Agent
 *
 * Manages message history to prevent context overflow while preserving important information
 */

import { Message } from '@/types';

interface ContextWindow {
  systemMessages: Message[];
  userRequests: Message[];
  recentHistory: Message[];
  importantToolResults: Message[];
}

export class ContextManager {
  private readonly MAX_TOKENS: number;
  private readonly AVG_CHARS_PER_TOKEN = 4; // Rough estimate

  constructor(maxTokens: number = 100000) {
    this.MAX_TOKENS = maxTokens;
  }

  /**
   * Estimate token count from messages
   */
  private estimateTokens(messages: Message[]): number {
    const totalChars = messages.reduce((sum, msg) => {
      const contentLength = msg.content?.length || 0;
      const toolCallsLength = msg.tool_calls
        ? JSON.stringify(msg.tool_calls).length
        : 0;
      return sum + contentLength + toolCallsLength;
    }, 0);
    return Math.ceil(totalChars / this.AVG_CHARS_PER_TOKEN);
  }

  /**
   * Categorize messages into different types
   */
  private categorizeMessages(messages: Message[]): ContextWindow {
    const window: ContextWindow = {
      systemMessages: [],
      userRequests: [],
      recentHistory: [],
      importantToolResults: [],
    };

    messages.forEach((msg, index) => {
      if (msg.role === 'system') {
        window.systemMessages.push(msg);
      } else if (msg.role === 'user' && index < 5) {
        // Keep first few user requests
        window.userRequests.push(msg);
      } else if (msg.role === 'tool') {
        // Keep important tool results (errors, file reads, etc.)
        if (
          msg.content?.includes('error') ||
          msg.content?.includes('Error') ||
          msg.name?.includes('file_read') ||
          msg.content && msg.content.length < 1000
        ) {
          window.importantToolResults.push(msg);
        }
      } else {
        window.recentHistory.push(msg);
      }
    });

    return window;
  }

  /**
   * Get optimized context that fits within token limit
   */
  getOptimizedContext(messages: Message[], additionalSystemPrompts: Message[] = []): Message[] {
    // Always include additional system prompts first
    const context: Message[] = [...additionalSystemPrompts];
    let tokens = this.estimateTokens(context);

    // Categorize messages
    const window = this.categorizeMessages(messages);

    // 1. Add system messages (always keep)
    context.push(...window.systemMessages);
    tokens = this.estimateTokens(context);

    // 2. Add initial user requests (always keep)
    if (window.userRequests.length > 0) {
      context.push(...window.userRequests);
      tokens = this.estimateTokens(context);
    }

    // 3. Add as many recent messages as fit
    const recentMessages = window.recentHistory.slice(-50); // Last 50 messages max
    const importantResults = window.importantToolResults.slice(-20); // Last 20 important results

    // Combine and sort by timestamp
    const candidateMessages = [...recentMessages, ...importantResults]
      .sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
      .filter((msg, index, arr) => arr.findIndex(m => m.id === msg.id) === index); // Deduplicate

    // Add messages until we hit the limit
    for (const msg of candidateMessages) {
      const msgTokens = this.estimateTokens([msg]);
      if (tokens + msgTokens > this.MAX_TOKENS * 0.8) {
        break;
      }
      context.push(msg);
      tokens += msgTokens;
    }

    // Sort by timestamp to maintain conversation order
    context.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

    console.log('[ContextManager] Optimized context:', {
      original: messages.length,
      optimized: context.length,
      estimatedTokens: tokens,
      maxTokens: this.MAX_TOKENS,
      utilizationPercent: Math.round((tokens / this.MAX_TOKENS) * 100),
    });

    return context;
  }

  /**
   * Summarize old messages using LLM (future enhancement)
   */
  async summarizeOldMessages(messages: Message[]): Promise<Message> {
    // TODO: Implement LLM-based summarization
    const summary = `이전 대화 요약 (${messages.length}개 메시지):
- 사용자 요청 및 작업 내용
- 주요 파일 변경 사항
- 발생한 에러 및 해결 방법`;

    return {
      id: `summary-${Date.now()}`,
      role: 'system',
      content: summary,
      created_at: Date.now(),
    };
  }
}
