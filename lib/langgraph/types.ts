import { Message, ToolCall } from '@/types';

/**
 * Graph 타입 정의
 */
export type GraphType = 'chat' | 'rag' | 'agent';

/**
 * 기본 채팅 상태
 */
export interface ChatState {
  messages: Message[];
  context?: string;
}

/**
 * RAG 상태 (문서 검색 포함)
 */
export interface RAGState extends ChatState {
  documents: Document[];
  query?: string;
}

/**
 * Agent 상태 (도구 사용 포함)
 */
export interface AgentState extends ChatState {
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
}

/**
 * 검색된 문서
 */
export interface Document {
  id: string;
  content: string;
  metadata: Record<string, any>;
  score?: number;
}

/**
 * 도구 실행 결과
 */
export interface ToolResult {
  toolCallId: string;
  toolName: string;
  result: any;
  error?: string;
}

/**
 * 그래프 노드 함수 타입
 */
export type NodeFunction<T> = (state: T) => Promise<Partial<T>>;

/**
 * 조건부 엣지 함수 타입
 */
export type ConditionalEdgeFunction<T> = (state: T) => string;

/**
 * 그래프 실행 옵션
 */
export interface GraphOptions {
  streaming?: boolean;
  maxIterations?: number;
  timeout?: number;
}

/**
 * 스트리밍 이벤트
 */
export interface StreamEvent {
  type: 'node' | 'edge' | 'end' | 'error';
  node?: string;
  data?: any;
  error?: string;
}
