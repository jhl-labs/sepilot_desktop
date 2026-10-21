import React from 'react'
import type { AgentState } from '@sepilotd/api-client'
import { useLocale } from './useLocale'

const CHAT_STATUS_BAR_COPY = {
  en: {
    mode: 'Mode',
    provider: 'Provider',
    auto: 'auto',
    model: 'Model',
    default: 'default',
    thinking: 'Thinking',
    persona: 'Persona',
    project: 'Project',
    none: 'none',
    cwd: 'Cwd',
    budget: 'Budget',
    streaming: 'Streaming',
    idle: 'Idle',
    state: 'State',
    tokensSuffix: (n: number) => `${n} tokens`,
  },
  ko: {
    mode: '모드',
    provider: 'Provider',
    auto: '자동',
    model: '모델',
    default: '기본',
    thinking: 'Thinking',
    persona: '페르소나',
    project: '프로젝트',
    none: '없음',
    cwd: '작업 디렉토리',
    budget: '예산',
    streaming: '스트리밍 중',
    idle: '대기 중',
    state: '상태',
    tokensSuffix: (n: number) => `${n} 토큰`,
  },
} as const

interface ChatStatusBarProps {
  selectedMode: string
  selectedProvider: string
  selectedModel: string
  thinkingLevel: string
  selectedPersona: string
  selectedProjectName?: string
  workingDirectoryLabel: string
  maxTokensLabel: string
  loading: boolean
  statusText: string | null
  agentState: AgentState
  tokenCount?: number
}

export function ChatStatusBar({
  selectedMode,
  selectedProvider,
  selectedModel,
  thinkingLevel,
  selectedPersona,
  selectedProjectName,
  workingDirectoryLabel,
  maxTokensLabel,
  loading,
  statusText,
  agentState,
  tokenCount,
}: ChatStatusBarProps) {
  const { locale } = useLocale()
  const copy = CHAT_STATUS_BAR_COPY[locale] ?? CHAT_STATUS_BAR_COPY.en
  return (
    <div className="chat-status-bar" role="status" aria-live="polite">
      <span className="chat-status-pill">
        {copy.mode} {selectedMode}
      </span>
      <span className="chat-status-pill">
        {copy.provider} {selectedProvider || copy.auto}
      </span>
      <span className="chat-status-pill">
        {copy.model} {selectedModel || copy.default}
      </span>
      <span className="chat-status-pill">
        {copy.thinking} {thinkingLevel}
      </span>
      <span className="chat-status-pill">
        {copy.persona} {selectedPersona}
      </span>
      <span className="chat-status-pill">
        {copy.project} {selectedProjectName ?? copy.none}
      </span>
      <span className="chat-status-pill">
        {copy.cwd} {workingDirectoryLabel}
      </span>
      <span className="chat-status-pill">
        {copy.budget} {maxTokensLabel}
      </span>
      <span className="chat-status-pill">
        {loading ? (statusText ?? copy.streaming) : copy.idle}
      </span>
      <span className="chat-status-pill">
        {copy.state} {agentState}
      </span>
      {tokenCount !== undefined && (
        <span className="chat-status-pill">
          {copy.tokensSuffix(tokenCount)}
        </span>
      )}
    </div>
  )
}
