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
import {
  beginDesktopSessionRun,
  finishDesktopSessionRun,
  getDesktopSessionRun,
  notifyDesktopSessionRun,
  rebindDesktopSessionRun,
  type DesktopSessionRun,
} from './session-run-registry'

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
  activitiesRef?: MutableRefObject<ActivityItem[]>
  activeSessionIdRef: MutableRefObject<string | undefined>
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
  activitiesRef,
  activeSessionIdRef,
  tokenSpeedTracker,
  maxActivityItems,
  formatError,
  queuedPromptsRef,
  onQueuedPromptsChange,
}: CreateDesktopChatRuntimeParams) {
  let activeRun: DesktopSessionRun | null = null
  const isRunVisible = (run: DesktopSessionRun | null): run is DesktopSessionRun =>
    run !== null && activeSessionIdRef.current === run.sessionId

  const resolveNext = <T,>(next: SetStateAction<T>, prev: T): T =>
    typeof next === 'function' ? (next as (value: T) => T)(prev) : next

  const scoped = {
    setMessages: (next: SetStateAction<Message[]>) => {
      if (!activeRun) { setMessages(next); return }
      activeRun.messages = resolveNext(next, activeRun.messages)
      if (isRunVisible(activeRun)) setMessages(activeRun.messages)
      notifyDesktopSessionRun(activeRun)
    },
    setActivities: (next: SetStateAction<ActivityItem[]>) => {
      if (!activeRun) { setActivities(next); return }
      activeRun.activities = resolveNext(next, activeRun.activities)
      if (isRunVisible(activeRun)) setActivities(activeRun.activities)
      notifyDesktopSessionRun(activeRun)
    },
    setAgentState: (state: AgentState) => {
      if (activeRun) activeRun.agentState = state
      if (!activeRun || isRunVisible(activeRun)) setAgentState(state)
      if (activeRun) notifyDesktopSessionRun(activeRun)
    },
    setStatus: (status: string | null) => {
      if (activeRun) activeRun.statusText = status
      if (!activeRun || isRunVisible(activeRun)) setStatusText(status)
      if (activeRun) notifyDesktopSessionRun(activeRun)
    },
    setError: (next: SetStateAction<string | null>) => {
      if (!activeRun) { setError(next); return }
      activeRun.error = resolveNext(next, activeRun.error)
      if (isRunVisible(activeRun)) setError(activeRun.error)
      notifyDesktopSessionRun(activeRun)
    },
    setStopReason: (reason: RunStopReason | null) => {
      if (activeRun) activeRun.stopReason = reason
      if (!activeRun || isRunVisible(activeRun)) setStopReason?.(reason)
      if (activeRun) notifyDesktopSessionRun(activeRun)
    },
    setLoading: (next: SetStateAction<boolean>) => {
      if (!activeRun) { setLoading(next); return }
      activeRun.loading = resolveNext(next, activeRun.loading)
      if (isRunVisible(activeRun)) setLoading(activeRun.loading)
      notifyDesktopSessionRun(activeRun)
    },
  }

  const pushActivity = (nextItem: ActivityItem) => {
    scoped.setActivities((prev) => [...prev.slice(-(maxActivityItems - 1)), nextItem])
  }

  const openRun = (targetSessionId: string | undefined): DesktopSessionRun => {
    const visible = activeSessionIdRef.current === targetSessionId
    activeRun = beginDesktopSessionRun(targetSessionId, {
      messages: visible ? messagesRef.current : [],
      activities: visible ? (activitiesRef?.current ?? []) : [],
    })
    return activeRun
  }

  const closeRun = (run: DesktopSessionRun) => {
    finishDesktopSessionRun(run, isRunVisible(run))
  }

  const runControllerFor = (run: DesktopSessionRun | null): DaemonChatRunController =>
    run?.controller ?? createDaemonChatRunController()

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
    const run = activeRun
    const followed = run !== null && activeSessionIdRef.current === run.sessionId && run.sessionId === undefined
    if (run) rebindDesktopSessionRun(run, nextSessionId)
    if (followed || !run) {
      activeSessionIdRef.current = nextSessionId
      onSessionChange(nextSessionId)
    }
    syncProjectMembership(nextSessionId)
  }

  const handleArtifactEvent = createArtifactEventHandler({
    createId: () => crypto.randomUUID(),
    setArtifacts,
    pushActivity,
  })

  let streamStopReason: RunStopReason | null = null
  const runChatStream = createManagedSurfaceStreamRunner({
    bindings: {
      setMessages: (next) =>
        scoped.setMessages((prev) => {
          const resolved = typeof next === 'function' ? next(prev) : next
          return sanitizeAssistantMessages(resolved, { stopReason: streamStopReason })
        }),
      setActivities: scoped.setActivities,
      setAgentState: scoped.setAgentState,
      setStatus: scoped.setStatus,
      setError: scoped.setError,
      setStopReason: (reason) => {
        streamStopReason = reason
        scoped.setStopReason(reason)
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

    const targetSessionId = sessionId
    await runChatStream({
      lifecycle: {
        setLoading: scoped.setLoading,
        beforeStart: () => {
          openRun(targetSessionId)
          if (clearComposer) {
            setInput('')
          }
          streamStopReason = null
          scoped.setStopReason(null)
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
        const run = activeRun
        const runController = runControllerFor(run)

        try {
          await api.streamChat(trimmedPrompt, targetSessionId, effectiveChatOptions, handlePayload)
          const abortReason = resolveDaemonChatRunAbortReason(runController.signal)
          if (abortReason) throw abortReason
        } catch (error) {
          throw resolveDaemonChatRunAbortReason(runController.signal, error) ?? error
        } finally {
          if (run) closeRun(run)
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
        setLoading: scoped.setLoading,
        beforeStart: () => {
          openRun(targetSessionId)
        },
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
        const run = activeRun
        const runController = runControllerFor(run)

        try {
          await api.streamApprovalResume(requestId, approved, targetSessionId, handlePayload)
        } catch (error) {
          throw resolveDaemonChatRunAbortReason(runController.signal, error) ?? error
        } finally {
          if (run) closeRun(run)
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
        setLoading: scoped.setLoading,
        afterFinish: async () => {
          if (activeSessionIdRef.current === sessionId) await loadSessionSnapshot(sessionId)
        },
        beforeStart: () => {
          openRun(sessionId)
          streamStopReason = null
          scoped.setStopReason(null)
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
        const run = activeRun
        const runController = runControllerFor(run)

        try {
          await api.streamSessionResume(
            sessionId,
            handlePayload,
            forceReplay ? { force: true } : undefined,
          )
        } catch (error) {
          throw resolveDaemonChatRunAbortReason(runController.signal, error) ?? error
        } finally {
          if (run) closeRun(run)
        }
      },
    })
  }

  const cancelActiveRun = () => {
    const shownSessionId = activeSessionIdRef.current
    const run = getDesktopSessionRun(shownSessionId)
    if (!run || run.status !== 'live') {
      return
    }

    run.statusText = 'Cancelling...'
    setStatusText('Cancelling...')
    run.controller.cancel()
    api.cancelActiveRun(shownSessionId)
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
