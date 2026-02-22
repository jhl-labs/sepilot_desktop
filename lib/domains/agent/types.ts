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
  enableImageGeneration?: boolean; // ComfyUI 이미지 생성 활성화
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

export type ApprovalDecisionStatus = 'approved' | 'feedback' | 'denied';

export type ApprovalHistorySource = 'system' | 'policy' | 'user';

/**
 * Structured approval audit log entry.
 * Replaces legacy string logs for better machine readability and UX.
 */
export interface ApprovalHistoryEntry {
  id: string;
  timestamp: string; // ISO-8601
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
  generatedAt: string; // ISO-8601
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
  lastUpdated: string; // ISO-8601
}

// ===== Cowork Agent Types =====

export type CoworkTaskType = 'coding' | 'research' | 'review' | 'test' | 'document' | 'general';
export type CoworkTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export interface CoworkTask {
  id: string;
  title: string;
  description: string;
  type: CoworkTaskType;
  status: CoworkTaskStatus;
  dependencies: string[];
  agentType: string; // 'coding-agent', 'agent', 'deep-web-research' etc.
  result?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CoworkPlan {
  objective: string;
  tasks: CoworkTask[];
  createdAt: string;
}

export interface CoworkAgentMessage {
  taskId: string;
  agentType: string;
  content: string;
  timestamp: string;
}

export interface AgentTraceEntry {
  id: string;
  timestamp: string; // ISO-8601
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
 * Discuss Input Callback (Cowork [DISCUSS] step)
 * Returns user input text (empty string = skip)
 */
export type DiscussInputCallback = (stepIndex: number, question: string) => Promise<string>;

/**
 * 그래프 실행 옵션
 */
export interface GraphOptions {
  streaming?: boolean;
  maxIterations?: number;
  timeout?: number;
  toolApprovalCallback?: ToolApprovalCallback;
  discussInputCallback?: DiscussInputCallback;
  conversationId?: string; // 동시 대화 시 스트리밍 격리용
  signal?: AbortSignal;
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
    | 'message' // For direct message events (EditorAgent)
    | 'streaming' // For token streaming
    | 'referenced_documents' // For RAG referenced documents
    | 'cowork_plan' // Cowork: 계획 수립 완료
    | 'cowork_task_start' // Cowork: 개별 태스크 시작
    | 'cowork_task_complete' // Cowork: 개별 태스크 완료
    | 'cowork_task_failed' // Cowork: 개별 태스크 실패
    | 'cowork_synthesizing' // Cowork: 결과 종합 중
    | 'cowork_discuss_request' // Cowork: [DISCUSS] 사용자 입력 요청
    | 'cowork_discuss_response'; // Cowork: [DISCUSS] 사용자 응답
  node?: string;
  data?: any;
  error?: string;
  conversationId?: string;
  // Tool approval specific fields
  messageId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  approved?: boolean;
  note?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  approvalHistory?: ApprovalHistoryEntry[];
  traceMetrics?: AgentTraceMetrics;
  // Completion specific fields
  iterations?: number;
  // Message specific fields
  message?: any; // Message object
  // Streaming specific fields
  chunk?: string;
  // Discuss input specific fields (Cowork [DISCUSS])
  stepIndex?: number;
  question?: string;
  // Referenced documents specific fields (RAG)
  referenced_documents?: Array<{ id: string; title: string; source: string; content: string }>;
}
