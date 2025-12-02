/**
 * Thinking Mode 타입 정의
 */
export type ThinkingMode =
  | 'instant'
  | 'sequential'
  | 'tree-of-thought'
  | 'deep'
  | 'deep-web-research' // Add Deep Web Research mode
  | 'coding'
  | 'browser-agent'
  | 'editor-agent';

/**
 * 기능 토글 옵션
 */
export interface FeatureToggles {
  enableRAG: boolean;
  enableTools: boolean;
  enableImageGeneration?: boolean; // ComfyUI 이미지 생성 활성화
}

/**
 * 그래프 설정
 */
export interface GraphConfig extends FeatureToggles {
  thinkingMode: ThinkingMode;
}

// State 타입은 client-types.ts에 정의됨 (state.ts는 런타임 코드 포함)
// 브라우저 환경에서는 client-types에서 import하세요

// 하위 호환성을 위한 deprecated 타입
/** @deprecated Use ThinkingMode and FeatureToggles instead */
export type GraphType = 'chat' | 'rag' | 'agent';

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
 * Tool Approval Callback (Human-in-the-loop)
 * Returns true if approved, false if rejected
 */
export type ToolApprovalCallback = (
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
) => Promise<boolean>;

/**
 * 그래프 실행 옵션
 */
export interface GraphOptions {
  streaming?: boolean;
  maxIterations?: number;
  timeout?: number;
  toolApprovalCallback?: ToolApprovalCallback;
  conversationId?: string; // 동시 대화 시 스트리밍 격리용
}

/**
 * 스트리밍 이벤트
 */
export interface StreamEvent {
  type:
    | 'node'
    | 'edge'
    | 'end'
    | 'error'
    | 'tool_approval_request'
    | 'tool_approval_result'
    | 'progress'
    | 'completion';
  node?: string;
  data?: any;
  error?: string;
  // Tool approval specific fields
  messageId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  approved?: boolean;
  // Completion specific fields
  iterations?: number;
}
