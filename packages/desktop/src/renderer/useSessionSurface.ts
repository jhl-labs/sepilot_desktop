import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type {
  ActivityItem,
  AgentState,
  DaemonArtifact,
  DaemonSessionDetail,
  Message,
  RunStopReason,
  SepilotDesktopApi,
} from '@sepilotd/api-client'
import {
  buildSessionData,
  reconcileSurfaceMessages,
} from '@sepilotd/api-client'
import {
  subscribeDesktopSessionRun,
  takeDesktopSessionRunReplay,
  type DesktopSessionRun,
} from './session-run-registry'

interface UseSessionSurfaceParams {
  api: SepilotDesktopApi
  sessionId?: string
  loading: boolean
  sessionStatus?: DaemonSessionDetail['status']
  onSessionChange: (id?: string) => void
  messagesRef: MutableRefObject<Message[]>
  activitiesRef: MutableRefObject<ActivityItem[]>
  setMessages: Dispatch<SetStateAction<Message[]>>
  setActivities: Dispatch<SetStateAction<ActivityItem[]>>
  setSessionDetail: Dispatch<SetStateAction<DaemonSessionDetail | null>>
  setArtifacts: Dispatch<SetStateAction<DaemonArtifact[]>>
  setError: Dispatch<SetStateAction<string | null>>
  setAgentState: Dispatch<SetStateAction<AgentState>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setStatusText: Dispatch<SetStateAction<string | null>>
  setStopReason?: Dispatch<SetStateAction<RunStopReason | null>>
}

function deriveAgentState(
  session: DaemonSessionDetail,
  messages: Message[],
): AgentState {
  return session.status === 'completed'
    || messages.some((message) => message.role === 'assistant' && Boolean(message.usage))
    ? 'done'
    : 'idle'
}

export function useSessionSurface({
  api,
  sessionId,
  loading,
  sessionStatus,
  onSessionChange,
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
}: UseSessionSurfaceParams): {
  loadSessionSnapshot: (nextSessionId: string) => Promise<void>
} {
  const applySessionSnapshot = useCallback((
    session: DaemonSessionDetail,
    nextArtifacts: DaemonArtifact[],
  ) => {
    const nextState = buildSessionData(session)
    const nextMessages = reconcileSurfaceMessages(
      nextState.messages,
      messagesRef.current,
    )
    setMessages(nextMessages)
    setActivities(
      nextState.activities.length >= activitiesRef.current.length
        ? nextState.activities
        : activitiesRef.current,
    )
    setSessionDetail(session)
    setArtifacts(nextArtifacts)
    setAgentState(deriveAgentState(session, nextMessages))
    setError(null)
  }, [
    activitiesRef,
    messagesRef,
    setActivities,
    setAgentState,
    setArtifacts,
    setError,
    setMessages,
    setSessionDetail,
  ])

  const loadSessionSnapshot = useCallback(async (nextSessionId: string) => {
    const [session, nextArtifacts] = await Promise.all([
      api.session(nextSessionId),
      api.sessionArtifacts(nextSessionId).catch(() => []),
    ])
    applySessionSnapshot(session, nextArtifacts)
  }, [api, applySessionSnapshot])

  const NEVER_SHOWN = Symbol('never-shown')
  const shownSessionIdRef = useRef<string | undefined | typeof NEVER_SHOWN>(NEVER_SHOWN)
  const switchSettersRef = useRef({ setLoading, setStatusText, setStopReason })
  switchSettersRef.current = { setLoading, setStatusText, setStopReason }

  const applyRunRecord = useCallback((run: Pick<DesktopSessionRun, keyof DesktopSessionRun>) => {
    messagesRef.current = run.messages
    activitiesRef.current = run.activities
    setMessages(run.messages)
    setActivities(run.activities)
    setAgentState(run.agentState)
    switchSettersRef.current.setStatusText(run.statusText)
    setError(run.error)
    switchSettersRef.current.setStopReason?.(run.stopReason)
    switchSettersRef.current.setLoading(run.status === 'live' && run.loading)
  }, [activitiesRef, messagesRef, setActivities, setAgentState, setError, setMessages])

  useEffect(() => {
    const switched = shownSessionIdRef.current !== sessionId
    shownSessionIdRef.current = sessionId
    let replayLive = false
    let unsubscribe: (() => void) | undefined
    if (switched) {
      const replay = takeDesktopSessionRunReplay(sessionId)
      const snapshot = replay.snapshot
      replayLive = replay.live
      messagesRef.current = snapshot?.messages ?? []
      activitiesRef.current = snapshot?.activities ?? []
      setMessages(snapshot?.messages ?? [])
      setActivities(snapshot?.activities ?? [])
      setAgentState(snapshot?.agentState ?? 'idle')
      switchSettersRef.current.setStatusText(snapshot?.statusText ?? null)
      if (snapshot) setError(snapshot.error)
      switchSettersRef.current.setStopReason?.(snapshot?.stopReason ?? null)
      switchSettersRef.current.setLoading(replay.live)
      setArtifacts([])
      setSessionDetail(null)
      if (replay.live) {
        unsubscribe = subscribeDesktopSessionRun(sessionId, (run) => {
          if (run.sessionId !== sessionId) return
          applyRunRecord(run)
          if (run.status !== 'live') {
            unsubscribe?.()
            unsubscribe = undefined
            takeDesktopSessionRunReplay(sessionId)
          }
        })
      }
    }

    if (!sessionId) {
      if (!switched) {
        setMessages([])
        setActivities([])
        setSessionDetail(null)
        setArtifacts([])
        setError(null)
        setAgentState('idle')
      }
      return () => unsubscribe?.()
    }

    if (loading || replayLive) {
      return () => unsubscribe?.()
    }

    let cancelled = false
    void loadSessionSnapshot(sessionId).catch(() => {
      if (cancelled) return
      setMessages([])
      setActivities([])
      setSessionDetail(null)
      setError('Failed to load session history')
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [activitiesRef, applyRunRecord, loading, loadSessionSnapshot, messagesRef, sessionId, setActivities, setAgentState, setArtifacts, setError, setMessages, setSessionDetail])

  useEffect(() => {
    if (
      !sessionId
      || loading
      || sessionStatus !== 'active'
    ) {
      return
    }

    let cancelled = false
    let dispose: (() => void) | undefined

    void api
      .watchSession(sessionId, (event) => {
        if (cancelled || event.type === 'heartbeat') {
          return
        }

        if (event.type === 'deleted') {
          setMessages([])
          setActivities([])
          setSessionDetail(null)
          setArtifacts([])
          setAgentState('idle')
          setError('Session was deleted')
          onSessionChange(undefined)
          return
        }

        const nextSession = event.session
        const nextState = buildSessionData(nextSession)
        const nextMessages = reconcileSurfaceMessages(
          nextState.messages,
          messagesRef.current,
        )
        setMessages(nextMessages)
        setActivities(
          nextState.activities.length >= activitiesRef.current.length
            ? nextState.activities
            : activitiesRef.current,
        )
        setSessionDetail(nextSession)
        setAgentState(deriveAgentState(nextSession, nextMessages))
        setError(null)
        void api
          .sessionArtifacts(nextSession.id)
          .then((nextArtifacts) => {
            if (!cancelled) {
              setArtifacts(nextArtifacts)
            }
          })
          .catch(() => {})
      })
      .then((nextDispose) => {
        if (cancelled) {
          nextDispose()
          return
        }
        dispose = nextDispose
      })
      .catch(() => {})

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [activitiesRef, api, loading, messagesRef, onSessionChange, sessionId, sessionStatus, setActivities, setAgentState, setArtifacts, setError, setMessages, setSessionDetail])

  return {
    loadSessionSnapshot,
  }
}
