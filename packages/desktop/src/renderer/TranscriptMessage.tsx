import {
  AssistantCitations,
  AssistantRichContent,
  ContextMessageCard,
} from '@sepilotd/presentation'
import type { ApprovalScope, Message } from '@sepilotd/api-client'
import { Bot, Check, Copy, FileStack, Info, UserRound, Wrench } from 'lucide-react'
import React, { useState } from 'react'
import { Canvas } from './Canvas'
import { MarkdownRenderer } from './MarkdownRenderer'
import { QuestionAnswerCard } from './QuestionAnswerCard'
import { ToolMessageCard } from './ToolMessageCard'
import type { DesktopQuestionActionError } from './desktop-chat'
import { useLocale, type SupportedLocale } from './useLocale'
import { formatMessageTimestamp } from '../../lib/chat/message-timestamp'

const TRANSCRIPT_MESSAGE_COPY = {
  en: {
    assistant: 'Assistant',
    citedResponse: 'Cited response',
    generatedResponse: 'Generated response',
    you: 'You',
    prompt: 'Prompt',
    toolRun: 'Tool run',
    waitingForApproval: 'Waiting for approval',
    toolExecution: 'Tool execution',
    referencedContext: 'Referenced context',
    system: 'System',
    notice: 'Notice',
    userQuestion: 'User question',
    answerRequired: 'Answer required',
    sourcesAttachedSuffix: (n: number) => `${n} sources attached`,
    message: 'Message',
    copy: 'Copy',
    copied: 'Copied',
    copyPrefix: 'Copy',
    messageAriaSuffix: ' message',
    tokensSuffix: ' tokens',
    registered: 'Registered',
    registeredAria: 'Message registered at',
  },
  ko: {
    assistant: '어시스턴트',
    citedResponse: '인용된 응답',
    generatedResponse: '생성된 응답',
    you: '나',
    prompt: '프롬프트',
    toolRun: '도구 실행',
    waitingForApproval: '승인 대기 중',
    toolExecution: '도구 실행',
    referencedContext: '참조된 컨텍스트',
    system: '시스템',
    notice: '안내',
    userQuestion: '사용자 질문',
    answerRequired: '답변 필요',
    sourcesAttachedSuffix: (n: number) => `소스 ${n}개 첨부됨`,
    message: '메시지',
    copy: '복사',
    copied: '복사됨',
    copyPrefix: '복사',
    messageAriaSuffix: ' 메시지',
    tokensSuffix: ' 토큰',
    registered: '등록',
    registeredAria: '메시지 등록 시간',
  },
} as const

type TranscriptMessageCopy = (typeof TRANSCRIPT_MESSAGE_COPY)[SupportedLocale]

interface TranscriptMessageProps {
  message: Message
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
  questionActionPendingId: string | null
  questionActionError: DesktopQuestionActionError | null
  searchMatch?: boolean
  activeSearchMatch?: boolean
}

function getMessageChrome(message: Message, copy: TranscriptMessageCopy) {
  switch (message.role) {
    case 'assistant':
      return {
        icon: Bot,
        label: copy.assistant,
        detail: message.citations?.length ? copy.citedResponse : copy.generatedResponse,
        copyValue: message.content,
      }
    case 'user':
      return {
        icon: UserRound,
        label: copy.you,
        detail: copy.prompt,
        copyValue: message.content,
      }
    case 'tool':
      return {
        icon: Wrench,
        label: message.toolName || copy.toolRun,
        detail: message.toolStatus === 'pending' ? copy.waitingForApproval : copy.toolExecution,
        copyValue: message.toolResult || message.content,
      }
    case 'system':
      if (message.questionRequestId) {
        return {
          icon: Info,
          label: copy.userQuestion,
          detail: copy.answerRequired,
          copyValue: message.content,
        }
      }
      return {
        icon: Info,
        label: copy.system,
        detail: copy.notice,
        copyValue: message.content,
      }
    case 'context':
      return {
        icon: FileStack,
        label: copy.referencedContext,
        detail: copy.sourcesAttachedSuffix(message.contextItems?.length ?? 0),
        copyValue: '',
      }
    default:
      return {
        icon: Bot,
        label: copy.message,
        detail: '',
        copyValue: message.content,
      }
  }
}

function renderUserContent(content: string) {
  const imageRegex = /!\[([^\]]*)\]\((data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,[^)]+)\)/gi
  const nodes: React.ReactNode[] = []
  let cursor = 0

  for (const match of content.matchAll(imageRegex)) {
    const index = match.index ?? 0
    const text = content.slice(cursor, index)
    if (text) {
      nodes.push(
        <div key={`text-${cursor}`} style={{ whiteSpace: 'pre-wrap' }}>
          {text}
        </div>,
      )
    }

    const alt = match[1]?.trim() || 'Pasted image'
    const src = match[2]
    if (src) {
      nodes.push(
        <img
          key={`image-${index}`}
          src={src}
          alt={alt}
          className="message-user-image"
        />,
      )
    }
    cursor = index + match[0].length
  }

  const tail = content.slice(cursor)
  if (tail) {
    nodes.push(
      <div key={`text-${cursor}`} style={{ whiteSpace: 'pre-wrap' }}>
        {tail}
      </div>,
    )
  }

  return nodes.length > 0 ? nodes : <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
}

export function TranscriptMessage({
  message,
  onApprovalDecision,
  onQuestionAnswer,
  questionActionPendingId,
  questionActionError,
  searchMatch = false,
  activeSearchMatch = false,
}: TranscriptMessageProps) {
  const [copied, setCopied] = useState(false)
  const { locale } = useLocale()
  const copy = TRANSCRIPT_MESSAGE_COPY[locale] ?? TRANSCRIPT_MESSAGE_COPY.en
  const chrome = getMessageChrome(message, copy)
  const ChromeIcon = chrome.icon
  const createdTimestamp = formatMessageTimestamp(message.timestamp, locale)

  const handleCopy = async () => {
    if (!chrome.copyValue.trim() || !navigator.clipboard?.writeText) {
      return
    }

    await navigator.clipboard.writeText(chrome.copyValue)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div
      className={[
        'chat-message',
        message.role,
        searchMatch ? 'search-match' : '',
        activeSearchMatch ? 'active-search-match' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="article"
      aria-label={message.role + copy.messageAriaSuffix}
    >
      <div className="message-chrome">
        <div className="message-chrome-copy">
          <span className={'message-chrome-icon ' + message.role} aria-hidden="true">
            <ChromeIcon className="shell-icon" />
          </span>
          <div className="message-chrome-labels">
            <strong>{chrome.label}</strong>
            {chrome.detail ? <span>{chrome.detail}</span> : null}
          </div>
          {createdTimestamp ? (
            <time
              className="message-created-at"
              dateTime={createdTimestamp.dateTime}
              title={`${copy.registered}: ${createdTimestamp.full}`}
              aria-label={`${copy.registeredAria} ${createdTimestamp.full}`}
            >
              {createdTimestamp.compact}
            </time>
          ) : null}
        </div>
        {chrome.copyValue.trim() ? (
          <button
            type="button"
            className={copied ? 'message-chrome-action copied' : 'message-chrome-action'}
            onClick={() => {
              void handleCopy()
            }}
            aria-label={copy.copyPrefix + ' ' + chrome.label}
            title={copy.copyPrefix + ' ' + chrome.label}
          >
            {copied ? <Check className="shell-icon" /> : <Copy className="shell-icon" />}
            <span>{copied ? copy.copied : copy.copy}</span>
          </button>
        ) : null}
      </div>
      {message.questionRequestId ? (
        <QuestionAnswerCard
          question={{
            id: message.questionRequestId,
            prompt: message.questionPrompt ?? message.content,
            choices: message.questionChoices,
            answered: message.questionState === 'answered',
          }}
          pendingQuestionId={questionActionPendingId}
          error={questionActionError}
          onAnswer={onQuestionAnswer}
          compact
        />
      ) : message.role === 'tool' ? (
        <ToolMessageCard message={message} onApprovalDecision={onApprovalDecision} />
      ) : message.role === 'context' ? (
        <ContextMessageCard
          messageId={message.id}
          items={message.contextItems ?? []}
          classNames={{
            root: 'message-context-card',
            head: 'message-context-head',
            copy: 'message-context-copy',
            kicker: 'message-context-kicker',
            list: 'message-context-list',
            item: 'message-context-item',
            itemHead: 'message-context-item-head',
          }}
        />
      ) : (
        <div className={'message-bubble ' + message.role}>
          {message.role === 'assistant' ? (
            <>
              <AssistantRichContent
                content={message.content}
                MarkdownRenderer={MarkdownRenderer}
                CanvasRenderer={Canvas}
              />
              <AssistantCitations
                messageId={message.id}
                items={message.citations ?? []}
                classNames={{
                  root: 'message-assistant-citations',
                  kicker: 'message-assistant-citations-kicker',
                  list: 'message-assistant-citations-list',
                  item: 'message-assistant-citation',
                  itemHead: 'message-assistant-citation-head',
                }}
              />
            </>
          ) : (
            renderUserContent(message.content)
          )}
          {message.usage && (
            <div className="message-usage">
              {message.usage.inputTokens}
              {'\u2192'}
              {message.usage.outputTokens}
              {copy.tokensSuffix}
              {message.usage.estimatedCost ? ' · $' + message.usage.estimatedCost.toFixed(4) : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
