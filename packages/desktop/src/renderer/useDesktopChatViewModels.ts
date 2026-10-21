import { useMemo } from 'react'
import type { RunStopNextAction, RunStopReason } from '@sepilotd/api-client'
import type { ClipboardEventHandler, DragEventHandler, KeyboardEventHandler, RefObject } from 'react'
import type {
  ActivityItem,
  AgentState,
  AgentRunContract,
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
import {
  desktopChatEmptyStateCopyForMode,
  desktopChatStarterPromptsForMode,
  type DesktopQuestionActionError,
  type DesktopChatSurfaceModel,
} from './desktop-chat'
import { useLocale } from './useLocale'

interface UseDesktopChatViewModelsParams {
  sessionId?: string
  messages: Message[]
  pendingQuestions: DaemonPendingQuestion[]
  loading: boolean
  queuedPromptCount?: number
  statusText: string | null
  error: string | null
  questionActionPendingId: string | null
  questionActionError: DesktopQuestionActionError | null
  messagesEndRef: RefObject<HTMLDivElement | null>
  setInput: (value: string) => void
  resumableRun?: DaemonResumableRun | null
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
  inputRef: RefObject<HTMLTextAreaElement | null>
  input: string
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>
  onSend: () => void | Promise<void>
  onCancelRun: () => void
  selectedMode: string
  agents: DaemonAgentDescriptor[]
  onModeChange: (value: string) => void
  bots: DaemonRoleBot[]
  selectedBot: string
  onBotChange: (value: string) => void
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
  selectedProjectName?: string
  workingDirectory: string
  onWorkingDirectoryChange: (value: string) => void
  onPickWorkingDirectory: () => void | Promise<void>
  onClearWorkingDirectory: () => void
  maxTokensInput: string
  maxTokens?: number
  onMaxTokensChange: (value: string) => void
  agentState: AgentState
  tokenCount?: number
  isDragOver: boolean
  onDragOver: DragEventHandler<HTMLDivElement>
  onDragLeave: DragEventHandler<HTMLDivElement>
  onDrop: DragEventHandler<HTMLDivElement>
  messageCount: number
  toolCallCount: number
  pendingApprovals: number
  pendingQuestionCount: number
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
  providerLabel: string
  modelLabel: string
  costLabel: string
  updatedLabel: string
}

function formatWorkingDirectoryLabel(workingDirectory: string): string {
  const trimmed = workingDirectory.trim()
  if (!trimmed) return 'Daemon default'

  const normalized = trimmed.replace(/[\\/]+$/, '')
  if (!normalized) return trimmed

  const segments = normalized.split(/[\\/]/)
  return segments[segments.length - 1] || trimmed
}

export function useDesktopChatViewModels({
  sessionId,
  messages,
  pendingQuestions,
  loading,
  queuedPromptCount = 0,
  statusText,
  error,
  questionActionPendingId,
  questionActionError,
  messagesEndRef,
  setInput,
  resumableRun,
  canResumeRun,
  onResumeRun,
  onApprovalDecision,
  onQuestionAnswer,
  stopReason,
  onStopAction,
  stopActionsAvailable,
  inputRef,
  input,
  onKeyDown,
  onPaste,
  onSend,
  onCancelRun,
  selectedMode,
  agents,
  onModeChange,
  bots,
  selectedBot,
  onBotChange,
  selectedProvider,
  providers,
  onProviderChange,
  selectedModel,
  availableModels,
  onModelChange,
  thinkingLevel,
  onThinkingLevelChange,
  personas,
  selectedPersona,
  onPersonaChange,
  projects,
  selectedProjectId,
  onProjectChange,
  selectedProjectName,
  workingDirectory,
  onWorkingDirectoryChange,
  onPickWorkingDirectory,
  onClearWorkingDirectory,
  maxTokensInput,
  maxTokens,
  onMaxTokensChange,
  agentState,
  tokenCount,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  messageCount,
  toolCallCount,
  pendingApprovals,
  pendingQuestionCount,
  sessionTokenCount,
  runContract,
  contextEngine,
  evidenceManifest,
  evaluationGate,
  providerFallbackCount,
  providerAttemptCount,
  healthReportSnapshot,
  delegation,
  delegationMeta,
  recentActivities,
  activityCount,
  artifacts,
  providerLabel,
  modelLabel,
  costLabel,
  updatedLabel,
}: UseDesktopChatViewModelsParams) {
  const { locale } = useLocale()
  const isKo = locale === 'ko'
  const autoLabel = isKo ? '자동' : 'Auto'
  const defaultLabel = isKo ? '기본' : 'Default'
  const instantLabel = isKo ? '즉시' : 'Instant'
  const noProjectLabel = isKo ? '프로젝트 없음' : 'No project'
  const activeSessionLabel = isKo ? '활성 세션' : 'Active session'
  const newSessionLabel = isKo ? '새 세션' : 'New session'
  const sessionPrefix = isKo ? '세션' : 'Session'

  const modeLabel =
    selectedMode === 'auto'
      ? autoLabel
      : (agents.find((agent) => agent.id === selectedMode)?.name ?? selectedMode)
  const botLabel = selectedBot
    ? (bots.find((bot) => bot.id === selectedBot)?.name ?? selectedBot)
    : autoLabel
  const providerDisplayLabel = selectedProvider
    ? (providers.find((provider) => provider.id === selectedProvider)?.name ?? selectedProvider)
    : autoLabel
  const modelDisplayLabel = selectedModel || defaultLabel
  const personaDisplayLabel =
    personas.find((persona) => persona.id === selectedPersona)?.name ?? selectedPersona
  const projectDisplayLabel = selectedProjectName ?? noProjectLabel
  const thinkingDisplayLabel =
    thinkingLevel === 'off' ? instantLabel : thinkingLevel[0].toUpperCase() + thinkingLevel.slice(1)
  const workingDirectoryLabel = formatWorkingDirectoryLabel(workingDirectory)
  const maxTokensLabel = maxTokens ? `${maxTokens}` : defaultLabel
  const sessionLabel = sessionId ? activeSessionLabel : newSessionLabel
  const sessionMeta = sessionId
    ? `${sessionPrefix} ${sessionId.slice(0, 8)}`
    : `${providerDisplayLabel} · ${modelDisplayLabel}`

  return useMemo<DesktopChatSurfaceModel>(
    () => ({
      isDragOver,
      onDragOver,
      onDragLeave,
      onDrop,
      header: {
        sessionId,
        sessionLabel,
        sessionMeta,
        modeLabel,
        providerLabel: providerDisplayLabel,
        modelLabel: modelDisplayLabel,
        personaLabel: personaDisplayLabel,
        projectLabel: projectDisplayLabel,
        thinkingLabel: thinkingDisplayLabel,
        selectedMode,
        agents,
        onModeChange,
        selectedProvider,
        providers,
        onProviderChange,
        selectedModel,
        availableModels,
        onModelChange,
        thinkingLevel,
        onThinkingLevelChange,
        personas,
        selectedPersona,
        onPersonaChange,
        projects,
        selectedProjectId,
        onProjectChange,
      },
      transcript: {
        messages,
        pendingQuestions,
        loading,
        statusText,
        error,
        questionActionPendingId,
        questionActionError,
        messagesEndRef,
        suggestions: desktopChatStarterPromptsForMode(selectedMode, locale),
        emptyStateCopy: desktopChatEmptyStateCopyForMode(selectedMode, locale),
        onSelectSuggestion: setInput,
        resumableRun: resumableRun ?? undefined,
        canResumeRun,
        onResumeRun,
        onApprovalDecision,
        stopReason,
        onStopAction,
        stopActionsAvailable,
        onQuestionAnswer,
      },
      composer: {
        inputRef,
        input,
        onInputChange: setInput,
        onKeyDown,
        onPaste,
        onSend,
        onCancelRun,
        loading,
        queuedPromptCount,
        selectedMode,
        agents,
        onModeChange,
        modeLabel,
        bots,
        selectedBot,
        onBotChange,
        botLabel,
        selectedProvider,
        providers,
        onProviderChange,
        providerLabel: providerDisplayLabel,
        selectedModel,
        availableModels,
        onModelChange,
        modelLabel: modelDisplayLabel,
        thinkingLevel,
        onThinkingLevelChange,
        thinkingLabel: thinkingDisplayLabel,
        selectedPersona,
        personas,
        onPersonaChange,
        personaLabel: personaDisplayLabel,
        projects,
        selectedProjectId,
        onProjectChange,
        selectedProjectName,
        projectLabel: projectDisplayLabel,
        workingDirectory,
        workingDirectoryLabel,
        onWorkingDirectoryChange,
        onPickWorkingDirectory,
        onClearWorkingDirectory,
        maxTokensInput,
        maxTokens,
        maxTokensLabel,
        onMaxTokensChange,
        statusText,
        agentState,
        tokenCount,
      },
      monitor: {
        agentState,
        messageCount,
        toolCallCount,
        pendingApprovals,
        pendingQuestions: pendingQuestionCount,
        sessionTokenCount,
        runContract,
        contextEngine,
        evidenceManifest,
        evaluationGate,
        providerFallbackCount,
        providerAttemptCount,
        healthReportSnapshot,
        delegation,
        delegationMeta,
        recentActivities,
        activityCount,
        artifacts,
        selectedMode,
        selectedProjectName,
        providerLabel,
        modelLabel,
        costLabel,
        updatedLabel,
      },
    }),
    [
      activityCount,
      agentState,
      agents,
      artifacts,
      availableModels,
      botLabel,
      bots,
      canResumeRun,
      costLabel,
      delegation,
      delegationMeta,
      error,
      healthReportSnapshot,
      input,
      inputRef,
      isDragOver,
      locale,
      loading,
      messageCount,
      messages,
      messagesEndRef,
      modelLabel,
      onApprovalDecision,
      onBotChange,
      onQuestionAnswer,
      onDragLeave,
      onDragOver,
      onDrop,
      onKeyDown,
      onPaste,
      onModeChange,
      onModelChange,
      onPersonaChange,
      onProjectChange,
      onPickWorkingDirectory,
      onClearWorkingDirectory,
      onProviderChange,
      onResumeRun,
      onSend,
      onCancelRun,
      onThinkingLevelChange,
      onWorkingDirectoryChange,
      onMaxTokensChange,
      pendingApprovals,
      pendingQuestionCount,
      pendingQuestions,
      questionActionError,
      questionActionPendingId,
      stopReason,
      onStopAction,
      stopActionsAvailable,
      runContract,
      contextEngine,
      evidenceManifest,
      evaluationGate,
      providerFallbackCount,
      providerAttemptCount,
      personas,
      projects,
      projectDisplayLabel,
      providerDisplayLabel,
      providerLabel,
      providers,
      personaDisplayLabel,
      queuedPromptCount,
      recentActivities,
      resumableRun,
      sessionLabel,
      sessionMeta,
      selectedMode,
      selectedBot,
      selectedModel,
      selectedPersona,
      selectedProjectId,
      selectedProjectName,
      selectedProvider,
      sessionId,
      sessionTokenCount,
      setInput,
      statusText,
      thinkingLevel,
      thinkingDisplayLabel,
      workingDirectory,
      workingDirectoryLabel,
      maxTokens,
      maxTokensInput,
      maxTokensLabel,
      tokenCount,
      toolCallCount,
      updatedLabel,
      modeLabel,
      modelDisplayLabel,
    ],
  )
}
