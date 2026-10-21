import type { ClipboardEventHandler, DragEventHandler, KeyboardEventHandler, RefObject } from 'react'
import type {
  ActivityItem,
  AgentState,
  AgentRunContract,
  RunStopNextAction,
  RunStopReason,
  ApprovalScope,
  DaemonAgentDescriptor,
  DaemonArtifact,
  DaemonHealthReportSnapshot,
  DaemonPendingQuestion,
  DaemonPersona,
  DaemonProject,
  DaemonProviderInfo,
  DaemonRoleBot,
  DaemonResumableRun,
  DaemonSessionDelegation,
  DaemonSessionDetail,
  Message,
} from '@sepilotd/api-client'

export type DesktopChatLocale = 'en' | 'ko'

export const DESKTOP_CHAT_STARTER_PROMPTS: Record<DesktopChatLocale, string[]> = {
  en: [
    'Summarize the current repository architecture',
    'Find the riskiest UX regressions in this app',
    'Draft the next release notes from recent work',
  ],
  ko: [
    '현재 저장소 아키텍처를 요약해줘',
    '이 앱에서 가장 위험한 UX 회귀를 찾아줘',
    '최근 작업을 바탕으로 다음 릴리스 노트를 작성해줘',
  ],
}

export const DESKTOP_COMPUTER_USE_STARTER_PROMPTS: Record<DesktopChatLocale, string[]> = {
  en: [
    'Observe the current screen and summarize the visible window list',
    'Open Notepad, observe the screen, type "hello from CUA", and observe again',
    'Open Calculator, compute 12 * 7, and check the result screen',
  ],
  ko: [
    '현재 화면을 관찰하고 보이는 창 목록을 요약해줘',
    '메모장을 열고 화면을 관찰한 뒤 "hello from CUA"를 입력하고 다시 관찰해줘',
    '계산기를 열고 12 * 7을 계산한 뒤 결과 화면을 확인해줘',
  ],
}

export interface DesktopChatEmptyStateCopy {
  kicker: string
  title: string
  text: string
}

export interface DesktopQuestionActionError {
  questionId: string
  message: string
}

export const DESKTOP_CHAT_EMPTY_STATE_COPY: Record<DesktopChatLocale, DesktopChatEmptyStateCopy> = {
  en: {
    kicker: 'Unified chat workspace',
    title: 'Start from intent, not from a blank box',
    text: 'Ask for repo changes, pull prior context back in, or branch into a new working thread with one prompt.',
  },
  ko: {
    kicker: '통합 채팅 워크스페이스',
    title: '빈 화면이 아니라 의도에서 출발하세요',
    text: '저장소 변경을 요청하거나 이전 컨텍스트를 다시 불러오거나 한 프롬프트로 새 작업 스레드를 시작하세요.',
  },
}

export const DESKTOP_COMPUTER_USE_EMPTY_STATE_COPY: Record<DesktopChatLocale, DesktopChatEmptyStateCopy> = {
  en: {
    kicker: 'Windows CUA workspace',
    title: 'Start with a visible desktop task',
    text: 'Use small app-focused requests so the agent can observe the screen, take one approved GUI action, observe again, and report each step in the conversation.',
  },
  ko: {
    kicker: 'Windows CUA 워크스페이스',
    title: '보이는 데스크톱 작업으로 시작하세요',
    text: '작은 앱 중심 요청을 사용하면 에이전트가 화면을 관찰하고, 승인된 GUI 동작을 하나 수행한 뒤 다시 관찰하고, 각 단계를 대화로 보고할 수 있습니다.',
  },
}

export function desktopChatStarterPromptsForMode(
  mode?: string,
  locale: DesktopChatLocale = 'en',
): string[] {
  const table = mode === 'computer-use'
    ? DESKTOP_COMPUTER_USE_STARTER_PROMPTS
    : DESKTOP_CHAT_STARTER_PROMPTS
  return table[locale] ?? table.en
}

export function desktopChatEmptyStateCopyForMode(
  mode?: string,
  locale: DesktopChatLocale = 'en',
): DesktopChatEmptyStateCopy {
  const table = mode === 'computer-use'
    ? DESKTOP_COMPUTER_USE_EMPTY_STATE_COPY
    : DESKTOP_CHAT_EMPTY_STATE_COPY
  return table[locale] ?? table.en
}

export interface DesktopChatHeaderModel {
  sessionId?: string
  sessionLabel: string
  sessionMeta: string
  modeLabel: string
  providerLabel: string
  modelLabel: string
  personaLabel: string
  projectLabel: string
  thinkingLabel: string
  selectedMode: string
  agents: DaemonAgentDescriptor[]
  onModeChange: (value: string) => void
  selectedProvider: string
  providers: DaemonProviderInfo[]
  onProviderChange: (value: string) => void
  selectedModel: string
  availableModels: string[]
  onModelChange: (value: string) => void
  thinkingLevel: string
  onThinkingLevelChange: (value: string) => void
  personas: DaemonPersona[]
  selectedPersona: string
  onPersonaChange: (value: string) => void
  projects: DaemonProject[]
  selectedProjectId: string
  onProjectChange: (value: string) => void
}

export interface DesktopChatTranscriptModel {
  messages: Message[]
  pendingQuestions: DaemonPendingQuestion[]
  loading: boolean
  statusText: string | null
  error: string | null
  questionActionPendingId: string | null
  questionActionError: DesktopQuestionActionError | null
  messagesEndRef: RefObject<HTMLDivElement | null>
  suggestions: string[]
  emptyStateCopy: DesktopChatEmptyStateCopy
  onSelectSuggestion: (suggestion: string) => void
  resumableRun?: DaemonResumableRun
  canResumeRun: boolean
  onResumeRun: () => void | Promise<void>
  onApprovalDecision: (
    requestId: string,
    toolMessageId: string,
    approved: boolean,
    approvalState?: Message['approvalState'],
    resumeAvailable?: boolean,
    scope?: ApprovalScope,
    targetSessionId?: string,
  ) => void | Promise<void>
  onQuestionAnswer: (questionId: string, answer: string) => void | Promise<void>
  stopReason?: RunStopReason | null
  onStopAction?: (kind: RunStopNextAction) => void | Promise<void>
  stopActionsAvailable?: RunStopNextAction[]
}

export interface DesktopChatComposerModel {
  inputRef: RefObject<HTMLTextAreaElement | null>
  input: string
  onInputChange: (value: string) => void
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>
  onSend: () => void | Promise<void>
  onCancelRun: () => void
  loading: boolean
  queuedPromptCount?: number
  selectedMode: string
  agents: DaemonAgentDescriptor[]
  onModeChange: (value: string) => void
  modeLabel: string
  bots: DaemonRoleBot[]
  selectedBot: string
  onBotChange: (value: string) => void
  botLabel: string
  selectedProvider: string
  providers: DaemonProviderInfo[]
  onProviderChange: (value: string) => void
  providerLabel: string
  selectedModel: string
  availableModels: string[]
  onModelChange: (value: string) => void
  modelLabel: string
  thinkingLevel: string
  onThinkingLevelChange: (value: string) => void
  thinkingLabel: string
  selectedPersona: string
  personas: DaemonPersona[]
  onPersonaChange: (value: string) => void
  personaLabel: string
  projects: DaemonProject[]
  selectedProjectId: string
  onProjectChange: (value: string) => void
  selectedProjectName?: string
  projectLabel: string
  workingDirectory: string
  workingDirectoryLabel: string
  onWorkingDirectoryChange: (value: string) => void
  onPickWorkingDirectory: () => void | Promise<void>
  onClearWorkingDirectory: () => void
  maxTokensInput: string
  maxTokens?: number
  maxTokensLabel: string
  onMaxTokensChange: (value: string) => void
  statusText: string | null
  agentState: AgentState
  tokenCount?: number
}

export interface DesktopActivityMonitorModel {
  agentState: AgentState
  messageCount: number
  toolCallCount: number
  pendingApprovals: number
  pendingQuestions: number
  sessionTokenCount: number
  runContract?: AgentRunContract | null
  contextEngine?: DaemonSessionDetail['contextEngine'] | null
  evidenceManifest?: DaemonSessionDetail['evidenceManifest'] | null
  evaluationGate?: DaemonSessionDetail['evaluationGate'] | null
  providerFallbackCount?: number
  providerAttemptCount?: number
  healthReportSnapshot?: DaemonHealthReportSnapshot | null
  delegation?: DaemonSessionDelegation
  delegationMeta?: string | null
  recentActivities: ActivityItem[]
  activityCount: number
  artifacts: DaemonArtifact[]
  selectedMode: string
  selectedProjectName?: string
  providerLabel: string
  modelLabel: string
  costLabel: string
  updatedLabel: string
}

export interface DesktopChatSurfaceModel {
  isDragOver: boolean
  onDragOver: DragEventHandler<HTMLDivElement>
  onDragLeave: DragEventHandler<HTMLDivElement>
  onDrop: DragEventHandler<HTMLDivElement>
  header: DesktopChatHeaderModel
  transcript: DesktopChatTranscriptModel
  composer: DesktopChatComposerModel
  monitor: DesktopActivityMonitorModel
}
