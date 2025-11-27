/**
 * LangGraph State 테스트
 */

import {
  messagesReducer,
  documentsReducer,
  toolCallsReducer,
  toolResultsReducer,
  createInitialChatState,
  createInitialRAGState,
  createInitialAgentState,
} from '@/lib/langgraph/state';
import type { Message, ToolCall } from '@/types';
import type { Document, ToolResult } from '@/lib/langgraph/types';

describe('langgraph state', () => {
  describe('messagesReducer', () => {
    it('should append new messages to existing', () => {
      const existing: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: 100 },
      ];
      const updates: Message[] = [
        { id: '2', role: 'assistant', content: 'Hi!', created_at: 200 },
      ];

      const result = messagesReducer(existing, updates);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });

    it('should handle empty existing messages', () => {
      const existing: Message[] = [];
      const updates: Message[] = [
        { id: '1', role: 'user', content: 'First', created_at: 100 },
      ];

      const result = messagesReducer(existing, updates);

      expect(result).toHaveLength(1);
    });

    it('should handle empty updates', () => {
      const existing: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: 100 },
      ];

      const result = messagesReducer(existing, []);

      expect(result).toHaveLength(1);
    });

    it('should not mutate original arrays', () => {
      const existing: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: 100 },
      ];
      const updates: Message[] = [
        { id: '2', role: 'assistant', content: 'Hi!', created_at: 200 },
      ];

      const result = messagesReducer(existing, updates);

      expect(existing).toHaveLength(1);
      expect(updates).toHaveLength(1);
      expect(result).not.toBe(existing);
    });
  });

  describe('documentsReducer', () => {
    it('should replace existing documents with updates', () => {
      const existing: Document[] = [
        { id: 'doc-1', content: 'Old content', score: 0.8 },
      ];
      const updates: Document[] = [
        { id: 'doc-2', content: 'New content', score: 0.9 },
        { id: 'doc-3', content: 'Another new', score: 0.7 },
      ];

      const result = documentsReducer(existing, updates);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('doc-2');
      expect(result[1].id).toBe('doc-3');
    });

    it('should return empty array when updates are empty', () => {
      const existing: Document[] = [
        { id: 'doc-1', content: 'Content', score: 0.5 },
      ];

      const result = documentsReducer(existing, []);

      expect(result).toHaveLength(0);
    });
  });

  describe('toolCallsReducer', () => {
    it('should append tool calls', () => {
      const existing: ToolCall[] = [
        { id: 'tc-1', name: 'get_weather', arguments: { city: 'Seoul' } },
      ];
      const updates: ToolCall[] = [
        { id: 'tc-2', name: 'search', arguments: { query: 'test' } },
      ];

      const result = toolCallsReducer(existing, updates);

      expect(result).toHaveLength(2);
      expect(result[1].name).toBe('search');
    });
  });

  describe('toolResultsReducer', () => {
    it('should append tool results', () => {
      const existing: ToolResult[] = [
        { callId: 'tc-1', result: 'sunny' },
      ];
      const updates: ToolResult[] = [
        { callId: 'tc-2', result: 'search results' },
      ];

      const result = toolResultsReducer(existing, updates);

      expect(result).toHaveLength(2);
      expect(result[1].callId).toBe('tc-2');
    });
  });

  describe('createInitialChatState', () => {
    it('should create empty chat state', () => {
      const state = createInitialChatState();

      expect(state.messages).toEqual([]);
      expect(state.context).toBe('');
    });

    it('should create chat state with initial messages', () => {
      const messages: Message[] = [
        { id: '1', role: 'system', content: 'You are helpful', created_at: 100 },
      ];

      const state = createInitialChatState(messages);

      expect(state.messages).toEqual(messages);
      expect(state.context).toBe('');
    });
  });

  describe('createInitialRAGState', () => {
    it('should create empty RAG state', () => {
      const state = createInitialRAGState();

      expect(state.messages).toEqual([]);
      expect(state.context).toBe('');
      expect(state.documents).toEqual([]);
      expect(state.query).toBe('');
    });

    it('should create RAG state with initial messages', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'What is RAG?', created_at: 100 },
      ];

      const state = createInitialRAGState(messages);

      expect(state.messages).toEqual(messages);
      expect(state.documents).toEqual([]);
    });
  });

  describe('createInitialAgentState', () => {
    it('should create empty Agent state', () => {
      const state = createInitialAgentState();

      expect(state.messages).toEqual([]);
      expect(state.context).toBe('');
      expect(state.toolCalls).toEqual([]);
      expect(state.toolResults).toEqual([]);
    });

    it('should create Agent state with initial messages', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Use a tool', created_at: 100 },
      ];

      const state = createInitialAgentState(messages);

      expect(state.messages).toEqual(messages);
      expect(state.toolCalls).toEqual([]);
      expect(state.toolResults).toEqual([]);
    });
  });
});
