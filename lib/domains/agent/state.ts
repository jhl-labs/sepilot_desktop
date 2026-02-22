import { Annotation } from '@langchain/langgraph';
import { Message, ToolCall } from '@/types';
import {
  AgentTraceEntry,
  ApprovalHistoryEntry,
  CompletionChecklist,
  CoworkAgentMessage,
  CoworkPlan,
  Document,
  ToolResult,
  VerificationStatus,
  WorkingMemory,
} from './types';
import { mergeApprovalHistoryEntries } from './utils/approval-history';

/**
 * Chat State - LangGraph Annotation 사용
 */
export const ChatStateAnnotation = Annotation.Root({
  messages: Annotation<Message[]>({
    reducer: (existing: Message[], updates: Message[]) => [...existing, ...updates],
    default: () => [],
  }),
  context: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  // conversationId: 동시 대화 시 스트리밍 격리를 위해 필수
  conversationId: Annotation<string>({
    reducer: (_existing: string, update: string) => update || _existing,
    default: () => '',
  }),
});

/**
 * RAG State - 문서 검색 포함
 */
export const RAGStateAnnotation = Annotation.Root({
  messages: Annotation<Message[]>({
    reducer: (existing: Message[], updates: Message[]) => [...existing, ...updates],
    default: () => [],
  }),
  context: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  documents: Annotation<Document[]>({
    reducer: (_existing: Document[], updates: Document[]) => updates,
    default: () => [],
  }),
  query: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  // conversationId: 동시 대화 시 스트리밍 격리를 위해 필수
  conversationId: Annotation<string>({
    reducer: (_existing: string, update: string) => update || _existing,
    default: () => '',
  }),
});

/**
 * Base State Annotations - 모든 Agent에서 공통으로 사용하는 필드
 */
const baseAnnotations = {
  messages: Annotation<Message[]>({
    reducer: (existing: Message[], updates: Message[]) => [...existing, ...updates],
    default: () => [],
  }),
  context: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  toolCalls: Annotation<ToolCall[]>({
    reducer: (existing: ToolCall[], updates: ToolCall[]) => [...existing, ...updates],
    default: () => [],
  }),
  toolResults: Annotation<ToolResult[]>({
    reducer: (existing: ToolResult[], updates: ToolResult[]) => [...existing, ...updates],
    default: () => [],
  }),
  // conversationId: 동시 대화 시 스트리밍 격리를 위해 필수
  conversationId: Annotation<string>({
    reducer: (_existing: string, update: string) => update || _existing,
    default: () => '',
  }),
  // Generated images from tools (e.g., generate_image)
  generatedImages: Annotation<
    Array<{
      id: string;
      base64: string;
      filename: string;
      mimeType: string;
      provider?: 'comfyui' | 'nanobanana';
    }>
  >({
    reducer: (existing, updates) => [...(existing || []), ...(updates || [])],
    default: () => [],
  }),
};

/**
 * Agent State - 도구 사용 포함
 */
export const AgentStateAnnotation = Annotation.Root({
  ...baseAnnotations,
  // Deep Web Research용 planning notes (iteration, forceSynthesize 등)
  planningNotes: Annotation<Record<string, any>>({
    reducer: (_existing: Record<string, any>, update: Record<string, any>) => ({
      ..._existing,
      ...update,
    }),
    default: () => ({}),
  }),
});

/**
 * Coding Agent State - ReAct Agent with planning, verification, and file tracking
 */
export const CodingAgentStateAnnotation = Annotation.Root({
  ...baseAnnotations,
  // Planning & Verification
  planningNotes: Annotation<string[]>({
    reducer: (existing: string[], updates: string[]) => [...existing, ...updates],
    default: () => [],
  }),
  verificationNotes: Annotation<string[]>({
    reducer: (existing: string[], updates: string[]) => [...existing, ...updates],
    default: () => [],
  }),
  planCreated: Annotation<boolean>({
    reducer: (_existing: boolean, update: boolean) => update,
    default: () => false,
  }),
  planSteps: Annotation<string[]>({
    reducer: (_existing: string[], updates: string[]) => updates,
    default: () => [],
  }),
  currentPlanStep: Annotation<number>({
    reducer: (_existing: number, update: number) => update,
    default: () => 0,
  }),
  // File Tracking
  requiredFiles: Annotation<string[]>({
    reducer: (_existing: string[], updates: string[]) => updates,
    default: () => [],
  }),
  fileChangesCount: Annotation<number>({
    reducer: (existing: number, update: number) => existing + update,
    default: () => 0,
  }),
  modifiedFiles: Annotation<string[]>({
    reducer: (existing: string[], updates: string[]) => [...existing, ...updates],
    default: () => [],
  }),
  deletedFiles: Annotation<string[]>({
    reducer: (existing: string[], updates: string[]) => [...existing, ...updates],
    default: () => [],
  }),
  executedToolCallIds: Annotation<string[]>({
    reducer: (existing: string[], updates: string[]) => {
      const merged = new Set([...(existing || []), ...(updates || [])]);
      return Array.from(merged);
    },
    default: () => [],
  }),
  // Iteration Control
  iterationCount: Annotation<number>({
    reducer: (existing: number, update: number) => existing + update,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    reducer: (_existing: number, update: number) => update,
    default: () => 50,
  }),
  forceTermination: Annotation<boolean>({
    reducer: (_existing: boolean, update: boolean) => update,
    default: () => false,
  }),
  alwaysApproveTools: Annotation<boolean>({
    reducer: (_existing: boolean, update: boolean) => update,
    default: () => false,
  }),
  // Decision Flow
  triageDecision: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => 'graph',
  }),
  triageReason: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  approvalHistory: Annotation<ApprovalHistoryEntry[]>({
    reducer: (existing: ApprovalHistoryEntry[], updates: ApprovalHistoryEntry[]) =>
      mergeApprovalHistoryEntries(
        existing as unknown as Array<ApprovalHistoryEntry | string>,
        updates as unknown as Array<ApprovalHistoryEntry | string>
      ),
    default: () => [],
  }),
  completionChecklist: Annotation<CompletionChecklist | null>({
    reducer: (_existing: CompletionChecklist | null, update: CompletionChecklist | null) => update,
    default: () => null,
  }),
  verificationStatus: Annotation<VerificationStatus>({
    reducer: (_existing: VerificationStatus, update: VerificationStatus) => update,
    default: () => 'not_run',
  }),
  verificationFailedChecks: Annotation<string[]>({
    reducer: (_existing: string[], updates: string[]) => updates,
    default: () => [],
  }),
  workingMemory: Annotation<WorkingMemory>({
    reducer: (_existing: WorkingMemory, update: WorkingMemory) => ({
      ..._existing,
      ...update,
    }),
    default: () => ({
      taskSummary: '',
      latestPlanStep: '',
      keyDecisions: [],
      recentToolOutcomes: [],
      fileChangeSummary: {
        modified: 0,
        deleted: 0,
        files: [],
      },
      lastUpdated: '',
    }),
  }),
  agentTrace: Annotation<AgentTraceEntry[]>({
    reducer: (existing: AgentTraceEntry[], updates: AgentTraceEntry[]) => {
      const merged = [...(existing || []), ...(updates || [])];
      return merged.slice(-200);
    },
    default: () => [],
  }),
  lastApprovalStatus: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  awaitingDiscussInput: Annotation<boolean>({
    reducer: (_existing: boolean, update: boolean) => update,
    default: () => false,
  }),
  needsAdditionalIteration: Annotation<boolean>({
    reducer: (_existing: boolean, update: boolean) => update,
    default: () => false,
  }),
  // Error Tracking
  agentError: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  // Environment
  workingDirectory: Annotation<string>({
    reducer: (_existing: string, update: string) => update || _existing,
    default: () => '',
  }),
  activeFileSelection: Annotation<
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
    | undefined
  >({
    reducer: (_existing, update) => update,
    default: () => null,
  }),
  // Token & Cost Tracking
  totalTokensUsed: Annotation<number>({
    reducer: (existing: number, update: number) => existing + update,
    default: () => 0,
  }),
  estimatedCost: Annotation<number>({
    reducer: (existing: number, update: number) => existing + update,
    default: () => 0,
  }),
});

/**
 * Cowork Agent State - Supervisor-Worker 패턴 다중 에이전트 오케스트레이션
 */
export const CoworkStateAnnotation = Annotation.Root({
  ...baseAnnotations,
  // Planning
  planningNotes: Annotation<string[]>({
    reducer: (existing: string[], updates: string[]) => [...existing, ...updates],
    default: () => [],
  }),
  // Cowork-specific state
  coworkPlan: Annotation<CoworkPlan | null>({
    reducer: (_existing: CoworkPlan | null, update: CoworkPlan | null) => update,
    default: () => null,
  }),
  currentTaskIndex: Annotation<number>({
    reducer: (_existing: number, update: number) => update,
    default: () => 0,
  }),
  taskResults: Annotation<Record<string, string>>({
    reducer: (_existing: Record<string, string>, update: Record<string, string>) => ({
      ..._existing,
      ...update,
    }),
    default: () => ({}),
  }),
  agentMessages: Annotation<CoworkAgentMessage[]>({
    reducer: (existing: CoworkAgentMessage[], updates: CoworkAgentMessage[]) => [
      ...existing,
      ...updates,
    ],
    default: () => [],
  }),
  teamStatus: Annotation<'idle' | 'planning' | 'executing' | 'synthesizing'>({
    reducer: (
      _existing: 'idle' | 'planning' | 'executing' | 'synthesizing',
      update: 'idle' | 'planning' | 'executing' | 'synthesizing'
    ) => update,
    default: () => 'idle' as const,
  }),
  synthesizedResult: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  totalTokenBudget: Annotation<number>({
    reducer: (_existing: number, update: number) => update,
    default: () => 200000,
  }),
  tokensConsumed: Annotation<number>({
    reducer: (existing: number, update: number) => existing + update,
    default: () => 0,
  }),
  // Decision Flow (reuse from coding agent)
  triageDecision: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => 'graph',
  }),
  // Iteration Control
  iterationCount: Annotation<number>({
    reducer: (existing: number, update: number) => existing + update,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    reducer: (_existing: number, update: number) => update,
    default: () => 50,
  }),
  forceTermination: Annotation<boolean>({
    reducer: (_existing: boolean, update: boolean) => update,
    default: () => false,
  }),
  // Environment
  workingDirectory: Annotation<string>({
    reducer: (_existing: string, update: string) => update || _existing,
    default: () => '',
  }),
});

// 타입 추출
export type ChatState = typeof ChatStateAnnotation.State;
export type RAGState = typeof RAGStateAnnotation.State;
export type AgentState = typeof AgentStateAnnotation.State;
export type CodingAgentState = typeof CodingAgentStateAnnotation.State;
export type CoworkState = typeof CoworkStateAnnotation.State;

/**
 * 초기 Chat 상태 생성
 */
export function createInitialChatState(
  messages: Message[] = [],
  conversationId: string = ''
): ChatState {
  return {
    messages,
    context: '',
    conversationId,
  };
}

/**
 * 초기 RAG 상태 생성
 */
export function createInitialRAGState(
  messages: Message[] = [],
  conversationId: string = ''
): RAGState {
  return {
    messages,
    context: '',
    documents: [],
    query: '',
    conversationId,
  };
}

/**
 * 초기 Agent 상태 생성
 */
export function createInitialAgentState(
  messages: Message[] = [],
  conversationId: string = ''
): AgentState {
  return {
    messages,
    context: '',
    toolCalls: [],
    toolResults: [],
    conversationId,
    generatedImages: [],
    planningNotes: {},
  };
}

/**
 * 초기 Coding Agent 상태 생성
 */
export function createInitialCodingAgentState(
  messages: Message[] = [],
  conversationId: string = '',
  maxIterations: number = 50,
  workingDirectory: string = '',
  activeFileSelection: {
    text: string;
    range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    } | null;
  } | null = null
): CodingAgentState {
  return {
    messages,
    context: '',
    toolCalls: [],
    toolResults: [],
    conversationId,
    generatedImages: [],
    alwaysApproveTools: false,
    approvalHistory: [],
    completionChecklist: null,
    verificationStatus: 'not_run',
    verificationFailedChecks: [],
    workingMemory: {
      taskSummary: '',
      latestPlanStep: '',
      keyDecisions: [],
      recentToolOutcomes: [],
      fileChangeSummary: {
        modified: 0,
        deleted: 0,
        files: [],
      },
      lastUpdated: '',
    },
    agentTrace: [],
    planningNotes: [],
    verificationNotes: [],
    planCreated: false,
    planSteps: [],
    currentPlanStep: 0,
    requiredFiles: [],
    fileChangesCount: 0,
    modifiedFiles: [],
    deletedFiles: [],
    executedToolCallIds: [],
    iterationCount: 0,
    maxIterations,
    forceTermination: false,
    triageDecision: 'graph',
    triageReason: '',
    lastApprovalStatus: '',
    awaitingDiscussInput: false,
    needsAdditionalIteration: false,
    agentError: '',
    totalTokensUsed: 0,
    estimatedCost: 0,
    workingDirectory,
    activeFileSelection,
  };
}

/**
 * 초기 Cowork 상태 생성
 */
export function createInitialCoworkState(
  messages: Message[] = [],
  conversationId: string = '',
  workingDirectory: string = ''
): CoworkState {
  return {
    messages,
    context: '',
    toolCalls: [],
    toolResults: [],
    conversationId,
    generatedImages: [],
    planningNotes: [],
    coworkPlan: null,
    currentTaskIndex: 0,
    taskResults: {},
    agentMessages: [],
    teamStatus: 'idle',
    synthesizedResult: '',
    totalTokenBudget: 200000,
    tokensConsumed: 0,
    triageDecision: 'graph',
    iterationCount: 0,
    maxIterations: 50,
    forceTermination: false,
    workingDirectory,
  };
}
