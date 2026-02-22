/**
 * Agent State 타입
 *
 * LangGraph Agent의 상태 타입을 순수 인터페이스로 정의합니다.
 * 런타임 Annotation 객체는 state-registry를 통해 접근합니다.
 */

import type { Message, ToolCall } from './message';

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
 * 생성된 이미지 정보
 */
export interface GeneratedImage {
  id: string;
  base64: string;
  filename: string;
  mimeType: string;
  provider?: 'comfyui' | 'nanobanana';
}

export type ApprovalDecisionStatus = 'approved' | 'feedback' | 'denied';
export type ApprovalHistorySource = 'system' | 'policy' | 'user';

export interface ApprovalHistoryEntry {
  id: string;
  timestamp: string;
  decision: ApprovalDecisionStatus;
  source: ApprovalHistorySource;
  summary: string;
  riskLevel?: 'low' | 'medium' | 'high';
  toolCallIds?: string[];
  metadata?: Record<string, unknown>;
}

export type ChecklistStatus = 'pending' | 'passed' | 'failed' | 'skipped';

export interface CompletionChecklistItem {
  id: string;
  title: string;
  status: ChecklistStatus;
  detail?: string;
}

export interface CompletionChecklist {
  generatedAt: string;
  allPassed: boolean;
  items: CompletionChecklistItem[];
}

export type VerificationStatus = 'not_run' | 'passed' | 'failed';

export interface WorkingMemory {
  taskSummary: string;
  latestPlanStep: string;
  keyDecisions: string[];
  recentToolOutcomes: string[];
  fileChangeSummary: {
    modified: number;
    deleted: number;
    files: string[];
  };
  lastUpdated: string;
}

export interface AgentTraceEntry {
  id: string;
  timestamp: string;
  phase: 'triage' | 'planner' | 'agent' | 'approval' | 'tools' | 'verifier' | 'reporter';
  event: 'start' | 'end' | 'decision' | 'error';
  iteration?: number;
  toolName?: string;
  approved?: boolean;
  durationMs?: number;
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTraceMetrics {
  nodeLatencyMs: Partial<Record<AgentTraceEntry['phase'], number>>;
  toolStats: {
    total: number;
    success: number;
    failed: number;
  };
  approvalStats: {
    approved: number;
    denied: number;
    feedback: number;
  };
}

/**
 * Agent State - 도구 사용 포함
 */
export interface AgentState {
  messages: Message[];
  context: string;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  conversationId: string;
  generatedImages: GeneratedImage[];
  planningNotes: Record<string, any>;
}

/**
 * Coding Agent State - 계획, 검증, 파일 추적 포함
 */
export interface CodingAgentState {
  messages: Message[];
  context: string;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  conversationId: string;
  generatedImages: GeneratedImage[];

  // Planning & Verification
  planningNotes: string[];
  verificationNotes: string[];
  planCreated: boolean;
  planSteps: string[];
  currentPlanStep: number;

  // File Tracking
  requiredFiles: string[];
  fileChangesCount: number;
  modifiedFiles: string[];
  deletedFiles: string[];

  // Iteration Control
  iterationCount: number;
  maxIterations: number;
  forceTermination: boolean;
  alwaysApproveTools: boolean;

  // Decision Flow
  triageDecision: string;
  triageReason: string;
  approvalHistory: ApprovalHistoryEntry[];
  completionChecklist: CompletionChecklist | null;
  verificationStatus: VerificationStatus;
  verificationFailedChecks: string[];
  workingMemory: WorkingMemory;
  agentTrace: AgentTraceEntry[];
  lastApprovalStatus: string;
  needsAdditionalIteration: boolean;

  // Error Tracking
  agentError: string;

  // Environment
  workingDirectory: string;
  activeFileSelection:
    | {
        text: string;
        range: {
          startLineNumber: number;
          startColumn: number;
          endLineNumber: number;
          endColumn: number;
        } | null;
      }
    | null
    | undefined;

  // Token & Cost Tracking
  totalTokensUsed: number;
  estimatedCost: number;
}
