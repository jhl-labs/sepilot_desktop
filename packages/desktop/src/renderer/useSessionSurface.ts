import { useCallback, useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type {
  ActivityItem,
  AgentState,
  DaemonArtifact,
  DaemonSessionDetail,
  Message,
  SepilotDesktopApi,
} from '@sepilotd/api-client'
import {
  buildSessionData,
  reconcileSurfaceMessages,
} from '@sepilotd/api-client'

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

  useEffect(() => {
    if (!sessionId) {
      setMessages([])
      setActivities([])
      setSessionDetail(null)
      setArtifacts([])
      setError(null)
      setAgentState('idle')
      return
    }

    if (loading) {
      return
    }

    void loadSessionSnapshot(sessionId).catch(() => {
      setMessages([])
      setActivities([])
      setSessionDetail(null)
      setError('Failed to load session history')
    })
  }, [activitiesRef, loading, loadSessionSnapshot, messagesRef, sessionId, setActivities, setAgentState, setArtifacts, setError, setMessages, setSessionDetail])

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
