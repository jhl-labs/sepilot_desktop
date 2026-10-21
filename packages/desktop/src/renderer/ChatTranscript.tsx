import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import React from 'react'
import type { Message } from '@sepilotd/api-client'
import type { DesktopChatTranscriptModel } from './desktop-chat'
import { ChatEmptyState } from './ChatEmptyState'
import { DesktopRunStopCard } from './DesktopRunStopCard'
import { QuestionAnswerCard } from './QuestionAnswerCard'
import { ResumableRunBanner } from './ResumableRunBanner'
import { TranscriptMessage } from './TranscriptMessage'
import { useLocale } from './useLocale'

const TRANSCRIPT_COPY = {
  en: {
    conversationKicker: 'Conversation',
    messageSingular: '1 message',
    messagePlural: (n: number) => `${n} messages`,
    typeToSearch: 'Type to search',
    noMatches: 'No matches',
    matchProgress: (current: number, total: number) => `${current} of ${total}`,
    findPlaceholder: 'Find in this conversation',
    searchAria: 'Search conversation',
    prevMatch: 'Previous match',
    nextMatch: 'Next match',
    closeSearch: 'Close conversation search',
    searchButton: 'Search conversation',
    typingAria: 'Assistant is typing',
    working: 'Working…',
    scrollToLatestAria: 'Scroll to latest',
    latest: 'Latest',
  },
  ko: {
    conversationKicker: '대화',
    messageSingular: '메시지 1개',
    messagePlural: (n: number) => `메시지 ${n}개`,
    typeToSearch: '검색어 입력',
    noMatches: '일치 항목 없음',
    matchProgress: (current: number, total: number) => `${current} / ${total}`,
    findPlaceholder: '이 대화에서 찾기',
    searchAria: '대화 검색',
    prevMatch: '이전 일치',
    nextMatch: '다음 일치',
    closeSearch: '대화 검색 닫기',
    searchButton: '대화 검색',
    typingAria: '어시스턴트 입력 중',
    working: '작업 중…',
    scrollToLatestAria: '최신으로 스크롤',
    latest: '최신',
  },
} as const

function getSearchableMessageContent(message: Message): string {
  if (message.role === 'context') {
    return (message.contextItems ?? []).flatMap((item) => [
      item.title,
      item.snippet,
      item.citationLabel,
      item.documentTitle,
      item.documentPath,
    ]).filter(Boolean).join(' ')
  }

  if (message.role === 'tool') {
    return [message.toolName, message.content, message.toolResult, message.toolMeta]
      .filter(Boolean)
      .join(' ')
  }

  return [
    message.content,
    ...(message.citations ?? []).flatMap((item) => [
      item.citationLabel,
      item.title,
      item.snippet,
    ]),
  ].filter(Boolean).join(' ')
}

export function ChatTranscript({
  model,
}: {
  model: DesktopChatTranscriptModel
}) {
  const { locale } = useLocale()
  const copy = TRANSCRIPT_COPY[locale] ?? TRANSCRIPT_COPY.en
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement | null>(null)
  const messageRefs = React.useRef<Array<HTMLDivElement | null>>([])
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = React.useState(-1)
  const [showScrollButton, setShowScrollButton] = React.useState(false)

  const searchMatches = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) {
      return []
    }

    return model.messages.reduce<number[]>((matches, message, index) => {
      if (getSearchableMessageContent(message).toLowerCase().includes(term)) {
        matches.push(index)
      }
      return matches
    }, [])
  }, [model.messages, searchTerm])

  const activeMessageIndex = currentMatchIndex >= 0
    ? searchMatches[currentMatchIndex] ?? -1
    : -1
  const matchIndexSet = React.useMemo(() => new Set(searchMatches), [searchMatches])

  React.useEffect(() => {
    setCurrentMatchIndex(searchMatches.length > 0 ? searchMatches.length - 1 : -1)
  }, [searchMatches])

  React.useEffect(() => {
    if (!searchOpen) {
      return
    }

    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [searchOpen])

  React.useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    const updateScrollState = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      setShowScrollButton(distanceFromBottom > 180)
    }

    updateScrollState()
    container.addEventListener('scroll', updateScrollState)
    return () => container.removeEventListener('scroll', updateScrollState)
  }, [model.messages.length, model.loading])

  React.useEffect(() => {
    if (activeMessageIndex < 0) {
      return
    }

    messageRefs.current[activeMessageIndex]?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'center',
    })
  }, [activeMessageIndex])

  const toggleSearch = React.useCallback(() => {
    setSearchOpen((open) => {
      const nextOpen = !open
      if (!nextOpen) {
        setSearchTerm('')
        setCurrentMatchIndex(-1)
      }
      return nextOpen
    })
  }, [])

  const stepSearchMatch = React.useCallback((direction: -1 | 1) => {
    if (searchMatches.length === 0) {
      return
    }

    setCurrentMatchIndex((current) => {
      if (current < 0) {
        return direction > 0 ? 0 : searchMatches.length - 1
      }
      return (current + direction + searchMatches.length) % searchMatches.length
    })
  }, [searchMatches.length])

  const scrollToBottom = React.useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
      return
    }

    container.scrollTop = container.scrollHeight
  }, [])

  const messageCountLabel = model.messages.length === 1
    ? copy.messageSingular
    : copy.messagePlural(model.messages.length)
  const searchStatusLabel = !searchTerm.trim()
    ? copy.typeToSearch
    : searchMatches.length === 0
      ? copy.noMatches
      : copy.matchProgress(currentMatchIndex + 1, searchMatches.length)
  const pendingQuestions = React.useMemo(
    () => model.pendingQuestions ?? [],
    [model.pendingQuestions],
  )
  const questionActionPendingId = model.questionActionPendingId ?? null
  const questionActionError = model.questionActionError ?? null
  const onQuestionAnswer = model.onQuestionAnswer ?? (() => {})
  const inlineQuestionIds = React.useMemo(
    () => new Set(model.messages
      .map((message) => message.questionRequestId)
      .filter((questionId): questionId is string => Boolean(questionId))),
    [model.messages],
  )
  const snapshotPendingQuestions = React.useMemo(
    () => pendingQuestions.filter((question) => !inlineQuestionIds.has(question.id)),
    [inlineQuestionIds, pendingQuestions],
  )

  return (
    <div className="chat-messages" role="log" aria-live="polite" ref={scrollContainerRef}>
      <div className="chat-message-column">
        {(model.messages.length > 0 || searchOpen) && (
          <div className="transcript-toolbar">
            <div className="transcript-toolbar-meta">
              <span className="transcript-toolbar-kicker">{copy.conversationKicker}</span>
              <strong>{messageCountLabel}</strong>
              {searchOpen && (
                <span className="transcript-toolbar-state">{searchStatusLabel}</span>
              )}
            </div>
            <div className="transcript-toolbar-actions">
              {searchOpen ? (
                <div className="transcript-search-panel">
                  <label className="transcript-search-field">
                    <Search className="shell-icon" />
                    <input
                      ref={searchInputRef}
                      type="search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder={copy.findPlaceholder}
                      aria-label={copy.searchAria}
                    />
                  </label>
                  <div className="transcript-search-nav">
                    <button
                      type="button"
                      className="transcript-toolbar-action icon-only"
                      onClick={() => stepSearchMatch(-1)}
                      aria-label={copy.prevMatch}
                      disabled={searchMatches.length === 0}
                    >
                      <ChevronUp className="shell-icon" />
                    </button>
                    <button
                      type="button"
                      className="transcript-toolbar-action icon-only"
                      onClick={() => stepSearchMatch(1)}
                      aria-label={copy.nextMatch}
                      disabled={searchMatches.length === 0}
                    >
                      <ChevronDown className="shell-icon" />
                    </button>
                    <button
                      type="button"
                      className="transcript-toolbar-action icon-only"
                      onClick={toggleSearch}
                      aria-label={copy.closeSearch}
                    >
                      <X className="shell-icon" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="transcript-toolbar-action"
                  onClick={toggleSearch}
                >
                  <Search className="shell-icon" />
                  <span>{copy.searchButton}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {model.messages.length === 0 && !model.loading && (
          <ChatEmptyState
            suggestions={model.suggestions}
            copy={model.emptyStateCopy}
            onSelectSuggestion={model.onSelectSuggestion}
          />
        )}

        {model.canResumeRun && model.resumableRun && (
          <ResumableRunBanner
            resumableRun={model.resumableRun}
            onResume={model.onResumeRun}
          />
        )}

        {snapshotPendingQuestions.length > 0 ? (
          <div className="question-answer-deck">
            {snapshotPendingQuestions.map((question) => (
              <QuestionAnswerCard
                key={question.id}
                question={{
                  id: question.id,
                  prompt: question.prompt,
                  choices: question.choices,
                }}
                pendingQuestionId={questionActionPendingId}
                error={questionActionError}
                onAnswer={onQuestionAnswer}
              />
            ))}
          </div>
        ) : null}

        {model.messages.map((message, index) => (
          <div
            key={message.id}
            ref={(node) => {
              messageRefs.current[index] = node
            }}
            data-transcript-message-index={index}
          >
            <TranscriptMessage
              message={message}
              onApprovalDecision={model.onApprovalDecision}
              onQuestionAnswer={onQuestionAnswer}
              questionActionPendingId={questionActionPendingId}
              questionActionError={questionActionError}
              searchMatch={matchIndexSet.has(index)}
              activeSearchMatch={activeMessageIndex === index}
            />
          </div>
        ))}

        {model.loading && (
          <div className="typing-indicator" aria-label={copy.typingAria}>
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
            <span className="typing-label">{model.statusText ?? copy.working}</span>
          </div>
        )}

        {model.error && (
          <div className="chat-inline-error" role="alert">
            {model.error}
          </div>
        )}
        {!model.loading ? (
          <DesktopRunStopCard
            reason={model.stopReason}
            locale={locale}
            onAction={model.onStopAction}
            availableActions={model.stopActionsAvailable}
          />
        ) : null}
        <div ref={model.messagesEndRef} />
      </div>

      {showScrollButton && (
        <button
          type="button"
          className="transcript-scroll-latest"
          onClick={scrollToBottom}
          aria-label={copy.scrollToLatestAria}
        >
          <ChevronDown className="shell-icon" />
          <span>{copy.latest}</span>
        </button>
      )}
    </div>
  )
}
