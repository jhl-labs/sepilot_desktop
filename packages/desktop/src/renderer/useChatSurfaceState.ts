import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  DaemonArtifact,
  DaemonSessionDetail,
  ActivityItem,
  AgentState,
  Message,
} from '@sepilotd/api-client'

export function useChatSurfaceState(initialPrompt?: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [sessionDetail, setSessionDetail] = useState<DaemonSessionDetail | null>(null)
  const [input, setInput] = useState(initialPrompt ?? '')
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [agentState, setAgentState] = useState<AgentState>('idle')
  const [artifacts, setArtifacts] = useState<DaemonArtifact[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<Message[]>([])
  const activitiesRef = useRef<ActivityItem[]>([])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [error, loading, messages, statusText])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    activitiesRef.current = activities
  }, [activities])

  const resetTranscript = useCallback(() => {
    setMessages([])
    setActivities([])
    setError(null)
    setStatusText(null)
    setAgentState('idle')
  }, [])

  return {
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
  }
}
