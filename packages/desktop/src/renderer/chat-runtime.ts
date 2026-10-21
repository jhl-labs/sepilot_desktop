import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type {
  ActivityItem,
  AgentState,
  ApprovalScope,
  ApprovalState,
  DaemonArtifact,
  DaemonProject,
  DaemonSessionDetail,
  Message,
  RunStopReason,
  SepilotDesktopApi,
  TokenSpeedTracker,
} from '@sepilotd/api-client'
import { sanitizeAssistantMessages } from '@sepilotd/api-client'
import {
  applyApprovalResolution,
  approvalResolutionActivityDetail,
  approvalResolutionStatusText,
  createArtifactEventHandler,
  createApprovalResolutionActivity,
  createDaemonChatRunController,
  createManagedSurfaceStreamRunner,
  resumableRunActivityDetail,
  summarizeText,
  resolveApprovalDecision,
  resolveDaemonChatRunAbortReason,
  type DaemonChatRunController,
} from '@sepilotd/api-client'

export interface CreateDesktopChatRuntimeParams {
  api: SepilotDesktopApi
  sessionId?: string
  sessionDetail: DaemonSessionDetail | null
  loading: boolean
  input: string
  chatOptions: Parameters<SepilotDesktopApi['streamChat']>[2]
  selectedProjectId: string
  loadSessionSnapshot: (nextSessionId: string) => Promise<void>
  onSessionChange: (id?: string) => void
  setInput: Dispatch<SetStateAction<string>>
  setMessages: Dispatch<SetStateAction<Message[]>>
  setActivities: Dispatch<SetStateAction<ActivityItem[]>>
  setArtifacts: Dispatch<SetStateAction<DaemonArtifact[]>>
  setProjects: Dispatch<SetStateAction<DaemonProject[]>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setStatusText: Dispatch<SetStateAction<string | null>>
  setError: Dispatch<SetStateAction<string | null>>
  setAgentState: Dispatch<SetStateAction<AgentState>>
  setStopReason?: Dispatch<SetStateAction<RunStopReason | null>>
  messagesRef: MutableRefObject<Message[]>
  activeRunControllerRef: MutableRefObject<DaemonChatRunController | null>
  tokenSpeedTracker?: TokenSpeedTracker
  maxActivityItems: number
  formatError: (error: unknown) => string
  queuedPromptsRef?: MutableRefObject<string[]>
  onQueuedPromptsChange?: (count: number) => void
}

export function createDesktopChatRuntime({
  api,
  sessionId,
  sessionDetail,
  loading,
  input,
  chatOptions,
  selectedProjectId,
  loadSessionSnapshot,
  onSessionChange,
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
  activeRunControllerRef,
  tokenSpeedTracker,
  maxActivityItems,
  formatError,
  queuedPromptsRef,
  onQueuedPromptsChange,
}: CreateDesktopChatRuntimeParams) {
  const pushActivity = (nextItem: ActivityItem) => {
    setActivities((prev) => [...prev.slice(-(maxActivityItems - 1)), nextItem])
  }

  const syncProjectMembership = (nextSessionId: string) => {
    if (!selectedProjectId) return

    const request = api.attachSessionToProject(selectedProjectId, nextSessionId)
    if (!request || typeof request.then !== 'function') {
      return
    }

    void request
      .then((project) => {
        setProjects((prev) => {
          const next = prev.filter((item) => item.id !== project.id)
          return [...next, project]
        })
      })
      .catch(() => {})
  }

  const handleAssignedSession = (nextSessionId: string) => {
    onSessionChange(nextSessionId)
    syncProjectMembership(nextSessionId)
  }

  const handleArtifactEvent = createArtifactEventHandler({
    createId: () => crypto.randomUUID(),
    setArtifacts,
    pushActivity,
  })

  const beginRunController = () => {
    activeRunControllerRef.current?.cancel()
    activeRunControllerRef.current?.dispose()
    const controller = createDaemonChatRunController()
    activeRunControllerRef.current = controller
    return controller
  }

  const clearRunController = (controller: DaemonChatRunController) => {
    controller.dispose()
    if (activeRunControllerRef.current === controller) {
      activeRunControllerRef.current = null
    }
  }

  let streamStopReason: RunStopReason | null = null
  const runChatStream = createManagedSurfaceStreamRunner({
    bindings: {
      setMessages: (next) =>
        setMessages((prev) => {
          const resolved = typeof next === 'function' ? next(prev) : next
          return sanitizeAssistantMessages(resolved, { stopReason: streamStopReason })
        }),
      setActivities,
      setAgentState,
      setStatus: setStatusText,
      setError,
      setStopReason: (reason) => {
        streamStopReason = reason
        setStopReason?.(reason)
      },
    },
    createId: () => crypto.randomUUID(),
    pushActivity,
    onSession: async (nextSessionId) => {
      handleAssignedSession(nextSessionId)
    },
    onArtifacts: async (nextArtifacts) => {
      handleArtifactEvent(nextArtifacts)
    },
    tokenSpeedTracker,
    maxActivityItems,
    formatRunError: formatError,
  })

  const streamPrompt = async (
    userMessage: string,
    options?: {
      clearComposer?: boolean
      startLabel?: string
      startDetail?: string
      chatOptions?: Partial<NonNullable<CreateDesktopChatRuntimeParams['chatOptions']>>
    },
  ) => {
    const trimmedPrompt = userMessage.trim()
    if (!trimmedPrompt || loading) return

    const {
      clearComposer = false,
      startLabel = 'Run started',
      startDetail = summarizeText(trimmedPrompt, 120),
      chatOptions: chatOptionsOverride,
    } = options ?? {}
    const effectiveChatOptions = chatOptionsOverride
      ? { ...(chatOptions ?? {}), ...chatOptionsOverride }
      : chatOptions

    await runChatStream({
      lifecycle: {
        setLoading,
        beforeStart: () => {
          if (clearComposer) {
            setInput('')
          }
          streamStopReason = null
          setStopReason?.(null)
        },
        statusText: 'Contacting daemon...',
        agentState: 'thinking',
        activityLabel: startLabel,
        activityDetail: startDetail,
      },
      doneFallbackText: 'No response',
      errorFallbackText: 'Request failed',
      errorLabel: 'Run failed',
      createSeedMessages: (assistantId) => [
        { id: crypto.randomUUID(), role: 'user', content: trimmedPrompt },
        { id: assistantId, role: 'assistant', content: '' },
      ],
      errorAssistantFallbackText: 'Failed to connect to daemon',
      run: async (handlePayload) => {
        const runController = beginRunController()

        try {
          await api.streamChat(trimmedPrompt, sessionId, effectiveChatOptions, handlePayload)
        } catch (error) {
          throw resolveDaemonChatRunAbortReason(runController.signal, error) ?? error
        } finally {
          clearRunController(runController)
        }
      },
    })
  }

  const streamApprovalResume = async (
    requestId: string,
    approved: boolean,
    toolName: string,
    targetSessionId = sessionId,
  ) => {
    if (loading) return

    await runChatStream({
      lifecycle: {
        setLoading,
        statusText: approved ? `Resuming ${toolName}...` : `Resuming after denying ${toolName}...`,
        agentState: 'acting',
        activityLabel: 'Resuming run',
        activityDetail: approved
          ? `Continuing ${toolName} from the saved checkpoint`
          : `Continuing without ${toolName} from the saved checkpoint`,
      },
      doneFallbackText: 'Run resumed',
      errorFallbackText: 'Resume failed',
      errorLabel: 'Resume failed',
      approvalResumeAvailable: true,
      errorAssistantFallbackText: 'Failed to resume run',
      rethrow: true,
      run: async (handlePayload) => {
        const runController = beginRunController()

        try {
          await api.streamApprovalResume(requestId, approved, targetSessionId, handlePayload)
        } catch (error) {
          throw resolveDaemonChatRunAbortReason(runController.signal, error) ?? error
        } finally {
          clearRunController(runController)
        }
      },
    })
  }

  const streamSessionResume = async () => {
    const resumableRun = sessionDetail?.resumableRun
    if (!sessionId || !resumableRun || loading) return

    const forceReplay = resumableRun.forceRequired
    if (
      forceReplay &&
      !window.confirm(
        `Resuming now may replay ${resumableRun.currentTool ?? 'the active tool'}. Continue?`,
      )
    ) {
      return
    }

    await runChatStream({
      lifecycle: {
        setLoading,
        afterFinish: async () => {
          await loadSessionSnapshot(sessionId)
        },
        beforeStart: () => {
          streamStopReason = null
          setStopReason?.(null)
        },
        statusText: 'Resuming interrupted run...',
        agentState: 'thinking',
        activityLabel: 'Resuming run',
        activityDetail: resumableRunActivityDetail(resumableRun),
      },
      doneFallbackText: 'Run resumed',
      errorFallbackText: 'Resume failed',
      errorLabel: 'Resume failed',
      approvalResumeAvailable: true,
      errorAssistantFallbackText: 'Failed to resume run',
      run: async (handlePayload) => {
        const runController = beginRunController()

        try {
          await api.streamSessionResume(
            sessionId,
            handlePayload,
            forceReplay ? { force: true } : undefined,
          )
        } catch (error) {
          throw resolveDaemonChatRunAbortReason(runController.signal, error) ?? error
        } finally {
          clearRunController(runController)
        }
      },
    })
  }

  const cancelActiveRun = () => {
    if (!loading) {
      return
    }

    setStatusText('Cancelling...')
    activeRunControllerRef.current?.cancel()
    api.cancelActiveRun()
  }

  const handleSend = async () => {
    if (!input.trim()) return
    if (loading) {
      if (!queuedPromptsRef) return
      queuedPromptsRef.current.push(input)
      setInput('')
      onQueuedPromptsChange?.(queuedPromptsRef.current.length)
      return
    }
    await streamPrompt(input, { clearComposer: true })
  }

  const flushQueuedPrompt = async (): Promise<boolean> => {
    if (!queuedPromptsRef || loading) return false
    const next = queuedPromptsRef.current.shift()
    if (next === undefined) return false
    onQueuedPromptsChange?.(queuedPromptsRef.current.length)
    await streamPrompt(next, {})
    return true
  }

  const handleApprovalDecision = async (
    requestId: string,
    toolMessageId: string,
    approved: boolean,
    approvalState?: ApprovalState,
    resumeAvailable?: boolean,
    scope?: ApprovalScope,
    targetSessionId?: string,
  ) => {
    try {
      const toolName =
        messagesRef.current.find((message) => message.id === toolMessageId)?.toolName ?? 'tool'
      const approvalSessionId = targetSessionId ?? sessionId
      const outcome = await resolveApprovalDecision({
        requestId,
        approved,
        toolName,
        sessionId: approvalSessionId,
        approvalState,
        resumeAvailable,
        resumeStaleApproval: () =>
          streamApprovalResume(requestId, approved, toolName, approvalSessionId),
        respondApproval: () =>
          api.respondApproval(requestId, approved, { sessionId: approvalSessionId, scope }),
        recoverStaleApproval: async (recovery) => {
          await loadSessionSnapshot(recovery.sessionId)
          await streamPrompt(recovery.prompt, {
            startLabel: recovery.startLabel,
            startDetail: recovery.startDetail,
          })
        },
      })

      if (outcome.outcome !== 'resolved') {
        return
      }

      setMessages((prev) => applyApprovalResolution(prev, toolMessageId, approved))
      pushActivity(
        createApprovalResolutionActivity({
          id: crypto.randomUUID(),
          approved,
          detail: approvalResolutionActivityDetail('desktop'),
        }),
      )
      setStatusText(approvalResolutionStatusText(approved))
    } catch (approvalError) {
      setError(formatError(approvalError))
    }
  }

  return {
    loadSessionSnapshot,
    handleAssignedSession,
    streamPrompt,
    streamSessionResume,
    cancelActiveRun,
    handleSend,
    flushQueuedPrompt,
    handleApprovalDecision,
  }
}
