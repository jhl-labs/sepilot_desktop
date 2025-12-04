/**
 * Context Manager for Coding Agent
 *
 * Manages message history to prevent context overflow while preserving important information
 */

import { Message } from '@/types';
import { Tiktoken, encoding_for_model } from 'tiktoken';

interface ContextWindow {
  systemMessages: Message[];
  userRequests: Message[];
  recentHistory: Message[];
  importantToolResults: Message[];
}

export class ContextManager {
  private readonly MAX_TOKENS: number;
  private encoder: Tiktoken;

  constructor(maxTokens: number = 100000) {
    this.MAX_TOKENS = maxTokens;
    // Use GPT-4 tokenizer (compatible with Claude models for estimation)
    this.encoder = encoding_for_model('gpt-4');
  }

  /**
   * Calculate accurate token count from messages using tiktoken
   */
  private countTokens(messages: Message[]): number {
    let totalTokens = 0;

    for (const msg of messages) {
      // Count tokens in content
      if (msg.content) {
        totalTokens += this.encoder.encode(msg.content).length;
      }

      // Count tokens in tool calls
      if (msg.tool_calls) {
        const toolCallsStr = JSON.stringify(msg.tool_calls);
        totalTokens += this.encoder.encode(toolCallsStr).length;
      }

      // Add overhead for message structure (role, name, etc.)
      totalTokens += 4; // Approximate overhead per message
    }

    return totalTokens;
  }

  /**
   * Estimate token count from messages (alias for backward compatibility)
   */
  private estimateTokens(messages: Message[]): number {
    return this.countTokens(messages);
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
          (msg.content && msg.content.length < 1000)
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
      .filter((msg, index, arr) => arr.findIndex((m) => m.id === msg.id) === index); // Deduplicate

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
   * Compress old messages by extracting key information
   */
  compressOldMessages(messages: Message[]): Message {
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    const toolMessages = messages.filter((m) => m.role === 'tool');

    // Extract key file operations
    const fileOperations: string[] = [];
    toolMessages.forEach((msg) => {
      if (msg.name?.includes('file_write') || msg.name?.includes('file_edit')) {
        fileOperations.push(msg.name);
      }
    });

    // Extract errors
    const errors: string[] = [];
    toolMessages.forEach((msg) => {
      if (msg.content?.includes('Error') || msg.content?.includes('error')) {
        const errorLine = msg.content.split('\n')[0];
        if (errorLine.length < 200) {
          errors.push(errorLine);
        }
      }
    });

    // Build summary
    const summaryParts = [
      `📊 이전 대화 압축 요약 (${messages.length}개 메시지)`,
      '',
      `👤 사용자 요청: ${userMessages.length}건`,
      userMessages
        .slice(0, 3)
        .map((m) => `  - ${m.content?.substring(0, 100)}...`)
        .join('\n'),
      '',
      `🤖 어시스턴트 응답: ${assistantMessages.length}건`,
      '',
      `🔧 파일 작업: ${fileOperations.length}건`,
      fileOperations.slice(-5).join(', '),
      '',
    ];

    if (errors.length > 0) {
      summaryParts.push(`❌ 발생한 에러: ${errors.length}건`);
      summaryParts.push(errors.slice(-3).join('\n'));
    }

    return {
      id: `compressed-${Date.now()}`,
      role: 'system',
      content: summaryParts.filter(Boolean).join('\n'),
      created_at: Date.now(),
    };
  }

  /**
   * Get token usage statistics
   */
  getTokenStats(messages: Message[]): {
    totalTokens: number;
    utilization: number;
    remaining: number;
  } {
    const totalTokens = this.countTokens(messages);
    return {
      totalTokens,
      utilization: Math.round((totalTokens / this.MAX_TOKENS) * 100),
      remaining: this.MAX_TOKENS - totalTokens,
    };
  }

  /**
   * Clean up encoder resources
   */
  dispose(): void {
    if (this.encoder) {
      this.encoder.free();
    }
  }
}
