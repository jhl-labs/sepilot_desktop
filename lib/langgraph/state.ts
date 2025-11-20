import { Message, ToolCall } from '@/types';
import { ChatState, RAGState, AgentState, Document, ToolResult } from './types';

/**
 * 메시지 리듀서 - 새로운 메시지를 기존 메시지 배열에 추가
 */
export function messagesReducer(existing: Message[], updates: Message[]): Message[] {
  return [...existing, ...updates];
}

/**
 * 문서 리듀서 - 새로운 문서로 교체
 */
export function documentsReducer(_existing: Document[], updates: Document[]): Document[] {
  return updates;
}

/**
 * Tool Calls 리듀서
 */
export function toolCallsReducer(existing: ToolCall[], updates: ToolCall[]): ToolCall[] {
  return [...existing, ...updates];
}

/**
 * Tool Results 리듀서
 */
export function toolResultsReducer(existing: ToolResult[], updates: ToolResult[]): ToolResult[] {
  return [...existing, ...updates];
}

/**
 * 초기 Chat 상태 생성
 */
export function createInitialChatState(messages: Message[] = []): ChatState {
  return {
    messages,
    context: '',
  };
}

/**
 * 초기 RAG 상태 생성
 */
export function createInitialRAGState(messages: Message[] = []): RAGState {
  return {
    messages,
    context: '',
    documents: [],
    query: '',
  };
}

/**
 * 초기 Agent 상태 생성
 */
export function createInitialAgentState(messages: Message[] = []): AgentState {
  return {
    messages,
    context: '',
    toolCalls: [],
    toolResults: [],
  };
}
