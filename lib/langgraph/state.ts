import { Annotation } from '@langchain/langgraph';
import { Message, ToolCall } from '@/types';
import { Document, ToolResult } from './types';

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
 * Agent State - 도구 사용 포함
 */
export const AgentStateAnnotation = Annotation.Root({
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
  approvalHistory: Annotation<string[]>({
    reducer: (existing: string[], updates: string[]) => [...existing, ...updates],
    default: () => [],
  }),
  lastApprovalStatus: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
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

// 타입 추출
export type ChatState = typeof ChatStateAnnotation.State;
export type RAGState = typeof RAGStateAnnotation.State;
export type AgentState = typeof AgentStateAnnotation.State;
export type CodingAgentState = typeof CodingAgentStateAnnotation.State;

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
  maxIterations: number = 50
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
    planningNotes: [],
    verificationNotes: [],
    planCreated: false,
    planSteps: [],
    currentPlanStep: 0,
    requiredFiles: [],
    fileChangesCount: 0,
    modifiedFiles: [],
    deletedFiles: [],
    iterationCount: 0,
    maxIterations,
    forceTermination: false,
    triageDecision: 'graph',
    triageReason: '',
    lastApprovalStatus: '',
    needsAdditionalIteration: false,
    agentError: '',
    totalTokensUsed: 0,
    estimatedCost: 0,
  };
}
