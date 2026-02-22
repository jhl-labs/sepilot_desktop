/**
 * LangGraph 관련 타입 정의
 *
 * Extension Agent에서 사용하는 그래프, 도구 실행, 스트리밍 관련 타입
 */

import type { AgentTraceMetrics, ApprovalHistoryEntry, ToolResult } from './agent-state';
import type { ToolCall } from './message';

// Re-export ToolResult for backwards compatibility
export type { ToolResult };

/**
 * Thinking Mode 타입 정의
 */
export type ThinkingMode =
  | 'instant'
  | 'sequential'
  | 'tree-of-thought'
  | 'deep'
  | 'deep-web-research'
  | 'coding'
  | 'cowork'
  | 'browser-agent'
  | 'editor-agent'
  | 'terminal-agent';

export type InputTrustLevel = 'trusted' | 'untrusted';

/**
 * 기능 토글 옵션
 */
export interface FeatureToggles {
  enableRAG: boolean;
  enableTools: boolean;
  enableImageGeneration?: boolean;
}

/**
 * 그래프 설정
 */
export interface GraphConfig extends FeatureToggles {
  thinkingMode: ThinkingMode;
  inputTrustLevel?: InputTrustLevel;
  workingDirectory?: string;
  enabledTools?: string[];
  activeFileSelection?: {
    text: string;
    range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    } | null;
  } | null;
}

/**
 * Tool Approval Callback (Human-in-the-loop)
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
  conversationId?: string;
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
    | 'completion'
    | 'message'
    | 'streaming';
  node?: string;
  data?: any;
  error?: string;
  messageId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  approved?: boolean;
  note?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  approvalHistory?: ApprovalHistoryEntry[];
  traceMetrics?: AgentTraceMetrics;
  iterations?: number;
  message?: any;
  chunk?: string;
}

// PendingToolApproval은 extension.ts에서 정의
