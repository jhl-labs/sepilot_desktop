import React from 'react'
import type {
  DaemonHealthReportSnapshot,
  GatewayTicketWatchRevalidateHealth,
  RunStopNextAction,
  RunStopReason,
} from '@sepilotd/api-client'
import { createTokenSpeedTracker, formatTokenSpeedStats } from '@sepilotd/api-client'
import { DesktopChatSurface } from './DesktopChatSurface'
import { createDesktopChatRuntime } from './chat-runtime'
import { useChatCatalog } from './useChatCatalog'
import { useChatComposer } from './useChatComposer'
import { useChatMetrics } from './useChatMetrics'
import { useChatSurfaceState } from './useChatSurfaceState'
import { useDesktopChatViewModels } from './useDesktopChatViewModels'
import { useSessionSurface } from './useSessionSurface'
import { useLocale } from './useLocale'
import { resolveDesktopComposerShortcut } from './composerShortcuts'

interface ChatViewProps {
  sessionId?: string
  onSessionChange: (id?: string) => void
  initialPrompt?: string
  healthReportSnapshot?: DaemonHealthReportSnapshot | null
  gatewayWatchHealth?: GatewayTicketWatchRevalidateHealth | null
  onOpenMemory?: (query?: string) => void
}

const MAX_ACTIVITY_ITEMS = 24

const CHAT_VIEW_FALLBACK_COPY = {
  en: 'Failed to connect to daemon',
  ko: 'daemon에 연결하지 못했습니다',
} as const

function buildErrorFormatter(fallback: string): (error: unknown) => string {
  return (error) => {
    if (error instanceof Error && error.message.trim()) return error.message
    return fallback
  }
}

export function ChatView({
  sessionId: selectedSessionId,
  onSessionChange,
  initialPrompt,
  healthReportSnapshot,
  gatewayWatchHealth,
  onOpenMemory,
}: ChatViewProps) {
  const [followedSessionId, setFollowedSessionId] = React.useState<string | undefined>()
  React.useEffect(() => {
    setFollowedSessionId(undefined)
  }, [selectedSessionId])
  const sessionId = selectedSessionId ?? followedSessionId
  const handleSessionChange = React.useCallback((next?: string) => {
    setFollowedSessionId(next)
    onSessionChange(next)
  }, [onSessionChange])

  const activeSessionIdRef = React.useRef<string | undefined>(sessionId)
  activeSessionIdRef.current = sessionId
  const tokenSpeedTrackerRef = React.useRef(createTokenSpeedTracker())
  const tokenSpeedSessionIdRef = React.useRef<string | undefined>(sessionId)
  const { locale } = useLocale()
  const formatError = React.useMemo(
    () => buildErrorFormatter(CHAT_VIEW_FALLBACK_COPY[locale] ?? CHAT_VIEW_FALLBACK_COPY.en),
    [locale],
  )

  const {
    messages,
    setMessages,
    activities,
    setActivities,
    sessionDetail,
    setSessionDetail,
    input,
    setInput,
    loading,
    setLoading,
    statusText,
    setStatusText,
    error,
    setError,
    agentState,
    setAgentState,
    artifacts,
    setArtifacts,
    messagesEndRef,
    messagesRef,
    activitiesRef,
    resetTranscript,
  } = useChatSurfaceState(initialPrompt)

  const {
    providers,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
    thinkingLevel,
    setThinkingLevel,
    personas,
    selectedPersona,
    setSelectedPersona,
    bots,
    selectedBot,
    setSelectedBot,
    agents,
    selectedMode,
    setSelectedMode,
    projects,
    setProjects,
    selectedProjectId,
    setSelectedProjectId,
    maxTokensInput,
    setMaxTokensInput,
    maxTokens,
    workingDirectory,
    setWorkingDirectory,
    availableModels,
    selectedProject,
    chatOptions,
  } = useChatCatalog({ sessionId })

  const {
    toolMessages,
    pendingApprovals,
    sessionTokenCount,
    recentActivities,
    activityCount,
    canResumeRun,
    runContract,
    contextEngine,
    evidenceManifest,
    evaluationGate,
    providerFallbackCount,
    providerAttemptCount,
    delegation,
    delegationMeta,
    nonToolMessageCount,
    lastUsageTokenCount,
    costLabel,
    updatedLabel,
    providerLabel,
    modelLabel,
  } = useChatMetrics({
    messages,
    activities,
    sessionDetail,
    selectedProvider,
    selectedModel,
    gatewayWatchHealth,
  })

  const [stopReason, setStopReason] = React.useState<RunStopReason | null>(null)

  const { loadSessionSnapshot } = useSessionSurface({
    api: window.sepilot,
    sessionId,
    loading,
    sessionStatus: sessionDetail?.status,
    onSessionChange: handleSessionChange,
    messagesRef,
    activitiesRef,
    setMessages,
    setActivities,
    setSessionDetail,
    setArtifacts,
    setError,
    setAgentState,
    setLoading,
    setStatusText,
    setStopReason,
  })

  React.useEffect(() => {
    const previousSessionId = tokenSpeedSessionIdRef.current
    if (previousSessionId && previousSessionId !== sessionId) {
      tokenSpeedTrackerRef.current.reset()
    }
    tokenSpeedSessionIdRef.current = sessionId
  }, [sessionId])

  const queuedPromptsRef = React.useRef<string[]>([])
  const [queuedPromptCount, setQueuedPromptCount] = React.useState(0)
  const [questionActionPendingId, setQuestionActionPendingId] = React.useState<string | null>(null)
  const [questionActionError, setQuestionActionError] = React.useState<{
    questionId: string
    message: string
  } | null>(null)

  const [iterationBudgetOverride, setIterationBudgetOverride] = React.useState<number | null>(null)
  const effectiveChatOptions = React.useMemo(
    () =>
      iterationBudgetOverride
        ? { ...(chatOptions ?? {}), maxIterations: iterationBudgetOverride }
        : chatOptions,
    [chatOptions, iterationBudgetOverride],
  )

  const {
    streamPrompt,
    streamSessionResume,
    cancelActiveRun,
    handleSend,
    flushQueuedPrompt,
    handleApprovalDecision,
  } =
    createDesktopChatRuntime({
      api: window.sepilot,
      sessionId,
      sessionDetail,
      loading,
      input,
      chatOptions: effectiveChatOptions,
      selectedProjectId,
      loadSessionSnapshot,
      onSessionChange: handleSessionChange,
      setInput,
      setMessages,
      setActivities,
      setArtifacts,
      setProjects,
      setLoading,
      setStatusText,
      setError,
      setAgentState,
      setStopReason,
      messagesRef,
      activitiesRef,
      activeSessionIdRef,
      tokenSpeedTracker: tokenSpeedTrackerRef.current,
      maxActivityItems: MAX_ACTIVITY_ITEMS,
      formatError,
      queuedPromptsRef,
      onQueuedPromptsChange: setQueuedPromptCount,
    })

  const STOP_ACTIONS_AVAILABLE: RunStopNextAction[] = [
    'resume',
    'retry',
    'raise_budget',
    'approve_pending',
  ]

  const handleStopAction = async (kind: RunStopNextAction) => {
    const lastUserPrompt = [...messages].reverse().find((m) => m.role === 'user')?.content
    switch (kind) {
      case 'resume':
        if (canResumeRun && sessionDetail?.resumableRun) {
          await streamSessionResume()
          return
        }
        if (lastUserPrompt?.trim()) await streamPrompt(lastUserPrompt)
        return
      case 'retry':
        if (lastUserPrompt?.trim()) await streamPrompt(lastUserPrompt)
        return
      case 'raise_budget': {
        if (!lastUserPrompt?.trim()) return
        const current = stopReason?.detail?.budget ?? effectiveChatOptions?.maxIterations ?? 25
        const next = Math.max(current * 2, current + 10)
        setIterationBudgetOverride(next)
        await streamPrompt(lastUserPrompt, { chatOptions: { maxIterations: next } })
        return
      }
      case 'approve_pending': {
        const target =
          document.querySelector<HTMLElement>('[data-approval-request]') ??
          document.querySelector<HTMLElement>('.message-approval, .tool-approval, .approval-actions')
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        target?.querySelector<HTMLElement>('button')?.focus()
        return
      }
      default:
        return
    }
  }

  const flushQueuedPromptRef = React.useRef(flushQueuedPrompt)
  flushQueuedPromptRef.current = flushQueuedPrompt
  React.useEffect(() => {
    if (!loading) {
      void flushQueuedPromptRef.current()
    }
  }, [loading, queuedPromptCount])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !loading) {
        return
      }

      event.preventDefault()
      cancelActiveRun()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cancelActiveRun, loading])

  const pendingQuestions = React.useMemo(
    () => sessionDetail?.pendingQuestions ?? [],
    [sessionDetail?.pendingQuestions],
  )
  const pendingQuestionCount = React.useMemo(() => {
    const ids = new Set(pendingQuestions.map((question) => question.id))
    messages.forEach((message) => {
      if (message.questionRequestId && message.questionState !== 'answered') {
        ids.add(message.questionRequestId)
      }
    })
    return ids.size
  }, [messages, pendingQuestions])

  const handleQuestionAnswer = React.useCallback(async (questionId: string, answer: string) => {
    const trimmedAnswer = answer.trim()
    if (!sessionId) {
      setQuestionActionError({
        questionId,
        message: locale === 'ko'
          ? '활성 세션을 선택한 뒤 답변하세요.'
          : 'Select an active session before answering.',
      })
      return
    }
    if (!trimmedAnswer) {
      setQuestionActionError({
        questionId,
        message: locale === 'ko'
          ? '계속하려면 답변을 입력하세요.'
          : 'Enter an answer before continuing.',
      })
      return
    }

    setQuestionActionPendingId(questionId)
    setQuestionActionError(null)

    try {
      await window.sepilot.answerSessionQuestion(sessionId, questionId, trimmedAnswer)
      setMessages((current) => current.map((message) =>
        message.questionRequestId === questionId
          ? { ...message, questionState: 'answered' }
          : message,
      ))
      setSessionDetail((current) => {
        if (!current || current.id !== sessionId) {
          return current
        }
        return {
          ...current,
          pendingQuestions: (current.pendingQuestions ?? []).filter(
            (question) => question.id !== questionId,
          ),
        }
      })
      setActivities((current) => [
        ...current.slice(-(MAX_ACTIVITY_ITEMS - 1)),
        {
          id: crypto.randomUUID(),
          kind: 'state',
          label: 'Question answered',
          detail: 'User answered a pending question.',
          status: 'success',
          meta: questionId,
        },
      ])
      setStatusText(locale === 'ko' ? '답변을 전송했습니다.' : 'Answer sent.')
    } catch (questionError) {
      setQuestionActionError({
        questionId,
        message: formatError(questionError),
      })
    } finally {
      setQuestionActionPendingId(null)
    }
  }, [
    formatError,
    locale,
    sessionId,
    setActivities,
    setMessages,
    setSessionDetail,
    setStatusText,
  ])

  const handleComposerSend = React.useCallback(async () => {
    const trimmedInput = input.trim()
    if (trimmedInput.toLowerCase() === '/tps' || trimmedInput.toLowerCase() === '/tps reset') {
      if (trimmedInput.toLowerCase() === '/tps reset') {
        tokenSpeedTrackerRef.current.reset()
        setStatusText(locale === 'ko' ? 'TPS 통계를 초기화했습니다.' : 'TPS stats reset.')
      } else {
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: 'system',
            content: formatTokenSpeedStats(tokenSpeedTrackerRef.current.snapshot(), { locale }),
            timestamp: new Date().toISOString(),
          },
        ])
        setStatusText(locale === 'ko' ? 'TPS 통계를 표시했습니다.' : 'TPS stats shown.')
      }
      setInput('')
      setError(null)
      return
    }

    const shortcut = resolveDesktopComposerShortcut(input)
    if (!shortcut) {
      await handleSend()
      return
    }

    setError(null)

    if (shortcut.kind === 'help') {
      setInput('')
      window.dispatchEvent(new Event('sepilot:toggle-keyboard-help'))
      return
    }

    if (shortcut.kind === 'shell-unsupported') {
      setError(locale === 'ko'
        ? '! 셸 단축키는 CLI TUI에서만 직접 실행됩니다. 로컬 명령은 터미널에서 sepilot을 사용하세요.'
        : '! shell shortcuts run directly in the CLI TUI. Use sepilot in a terminal for local commands.')
      return
    }

    if (shortcut.kind === 'memory-save') {
      try {
        await window.sepilot.addMemory(shortcut.content, ['manual'], {
          source: 'user',
          reason: 'desktop composer # shortcut',
        })
        setInput('')
        setStatusText(locale === 'ko' ? '메모리를 저장했습니다.' : 'Memory saved.')
        onOpenMemory?.()
      } catch (memoryError) {
        setError(formatError(memoryError))
      }
      return
    }

    setInput('')
    if (shortcut.kind === 'memory-search') {
      setStatusText(locale === 'ko' ? '메모리 검색을 열었습니다.' : 'Memory search opened.')
      onOpenMemory?.(shortcut.query)
      return
    }

    setStatusText(locale === 'ko' ? '메모리 워크스페이스를 열었습니다.' : 'Memory workspace opened.')
    onOpenMemory?.()
  }, [formatError, handleSend, input, locale, onOpenMemory, setError, setInput, setMessages, setStatusText])

  const {
    inputRef,
    isDragOver,
    handleKeyDown,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useChatComposer({
    sessionId,
    initialPrompt,
    input,
    setInput,
    onSend: handleComposerSend,
    onClearTranscript: resetTranscript,
  })

  const pickWorkingDirectory = React.useCallback(async () => {
    const nextDirectory = await window.sepilot.selectDirectory(workingDirectory)
    if (typeof nextDirectory === 'string') {
      setWorkingDirectory(nextDirectory)
    }
  }, [workingDirectory, setWorkingDirectory])

  const clearWorkingDirectory = React.useCallback(() => {
    setWorkingDirectory('')
  }, [setWorkingDirectory])

  const chatSurfaceModel = useDesktopChatViewModels({
    sessionId,
    messages,
    pendingQuestions,
    loading,
    queuedPromptCount,
    statusText,
    error,
    questionActionPendingId,
    questionActionError,
    messagesEndRef,
    setInput,
    resumableRun: sessionDetail?.resumableRun ?? null,
    canResumeRun,
    onResumeRun: streamSessionResume,
    onApprovalDecision: handleApprovalDecision,
    onQuestionAnswer: handleQuestionAnswer,
    stopReason,
    onStopAction: handleStopAction,
    stopActionsAvailable: STOP_ACTIONS_AVAILABLE,
    inputRef,
    input,
    onKeyDown: handleKeyDown,
    onPaste: handlePaste,
    onSend: handleComposerSend,
    onCancelRun: cancelActiveRun,
    selectedMode,
    agents,
    onModeChange: setSelectedMode,
    bots,
    selectedBot,
    onBotChange: setSelectedBot,
    selectedProvider,
    providers,
    onProviderChange: setSelectedProvider,
    selectedModel,
    availableModels,
    onModelChange: setSelectedModel,
    thinkingLevel,
    onThinkingLevelChange: setThinkingLevel,
    personas,
    selectedPersona,
    onPersonaChange: setSelectedPersona,
    projects,
    selectedProjectId,
    onProjectChange: setSelectedProjectId,
    selectedProjectName: selectedProject?.name,
    workingDirectory,
    onWorkingDirectoryChange: setWorkingDirectory,
    onPickWorkingDirectory: pickWorkingDirectory,
    onClearWorkingDirectory: clearWorkingDirectory,
    maxTokensInput,
    maxTokens,
    onMaxTokensChange: setMaxTokensInput,
    agentState,
    tokenCount: lastUsageTokenCount,
    isDragOver,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    messageCount: nonToolMessageCount,
    toolCallCount: toolMessages.length,
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
  })

  return <DesktopChatSurface model={chatSurfaceModel} />
}
