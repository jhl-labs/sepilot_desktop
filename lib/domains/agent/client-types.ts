/**
 * LangGraph 클라이언트 타입 정의
 *
 * 브라우저/클라이언트 컴포넌트에서 사용할 수 있는 타입만 export
 * 실제 LangGraph 구현은 서버 사이드(Electron Main Process)에서만 사용
 */

import type { Message } from '@/types';
import type { Document, ToolResult } from './types';

// 기본 타입들만 re-export (런타임 코드 없음)
export type {
  ThinkingMode,
  FeatureToggles,
  GraphConfig,
  GraphType, // deprecated
  StreamEvent,
  Document,
  ToolResult,
} from './types';

// State 타입 정의 (브라우저 안전)
export interface ChatState {
  messages: Message[];
  context: string;
}

export interface RAGState {
  messages: Message[];
  context: string;
  documents: Document[];
  query: string;
}

export interface AgentState {
  messages: Message[];
  context: string;
  toolCalls: import('@/types').ToolCall[];
  toolResults: ToolResult[];
}
