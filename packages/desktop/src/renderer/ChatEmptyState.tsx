import React from 'react'
import {
  DESKTOP_CHAT_EMPTY_STATE_COPY,
  type DesktopChatEmptyStateCopy,
} from './desktop-chat'
import { useLocale } from './useLocale'

interface ChatEmptyStateProps {
  suggestions: string[]
  copy?: DesktopChatEmptyStateCopy
  onSelectSuggestion: (suggestion: string) => void
}

export function ChatEmptyState({
  suggestions,
  copy,
  onSelectSuggestion,
}: ChatEmptyStateProps) {
  const { locale } = useLocale()
  const effectiveCopy = copy
    ?? DESKTOP_CHAT_EMPTY_STATE_COPY[locale]
    ?? DESKTOP_CHAT_EMPTY_STATE_COPY.en
  return (
    <div className="empty-state">
      <span className="empty-state-kicker">{effectiveCopy.kicker}</span>
      <div className="empty-state-title">{effectiveCopy.title}</div>
      <p className="empty-state-text">
        {effectiveCopy.text}
      </p>
      <div className="empty-state-grid">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            className="suggestion-chip"
            onClick={() => onSelectSuggestion(suggestion)}
          >
            <span className="suggestion-chip-mark">+</span>
            <span className="suggestion-chip-copy">{suggestion}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
