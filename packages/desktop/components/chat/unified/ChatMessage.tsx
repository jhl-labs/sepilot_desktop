'use client'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Check,
  Copy,
  GitBranch,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  User,
  Volume2,
} from 'lucide-react'
import type { ChatMessage as Msg } from '@/lib/store/chat-store'
import {
  usePersonaStore,
  BUILTIN_PERSONAS,
  type Persona,
} from '@/lib/store/persona-store'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { makeDaemonRequestContext } from '@/lib/api/_daemon'
import { cn } from '@/lib/utils/cn'
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer'
import { PersonaAvatar } from '@/components/persona/PersonaSurface'
import { createVoiceApi } from '@/lib/api/voice'
import { createFilesApi } from '@/lib/api/files'
import { isSafeInlineImageMimeType } from '@/lib/utils/image-mime'
import {
  InteractiveInputBlock,
  InteractiveSelectBlock,
  ToolResultBlock,
} from '@/components/chat/InteractiveBlocks'
import { parseInteractiveContent, type InteractiveBlock } from '@/lib/utils/interactive-parser'
import { ReasoningCard } from '@/components/chat/unified/ReasoningCard'
import { LiveViewCard } from '@/components/chat/unified/LiveViewCard'
import type { BrowserConnection } from '@/lib/api/browser-remote'
import { presentAssistantContent } from '@/lib/chat/presentation-content'
import { formatMessageTimestamp } from '@/lib/chat/message-timestamp'
import { StreamingResponseIndicator } from '@/components/ui/streaming-response-indicator'

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

type ChatMessageProps = {
  message: Msg
  sessionId?: string
  browserConnection?: BrowserConnection
  assistantPersona?: Persona
  isLastAssistantMessage?: boolean
  streaming?: boolean
  onRegenerate?: (id: string) => void
  onBranchAt?: (eventIndex: number) => void
  onRetry?: (id: string) => void
}

type PersistedImageAttachment = {
  fileId: string
  filename: string
  mimeType: string
}

function containsPseudoToolCall(content: string): boolean {
  let fenceMarker: '`' | '~' | null = null

  return content.split(/\r?\n/).some((line) => {
    const fence = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      const marker = fence[1]?.[0] as '`' | '~'
      fenceMarker = fenceMarker === marker ? null : (fenceMarker ?? marker)
      return false
    }
    if (fenceMarker) return false

    const candidate = line
      .replace(/^\s*>\s*/, '')
      .replace(/^(?:ANSWER\s*:\s*)+/i, '')
      .trimStart()
    return /^(?:tool_call\s*[:：]|<tool_call(?:\s|>))/i.test(candidate)
  })
}

function PseudoToolCallNotice() {
  return (
    <aside
      role="note"
      aria-label="실행되지 않은 도구 호출 안내"
      className="mb-2 flex gap-2 rounded-md border border-amber-500/45 bg-amber-500/[0.07] px-2.5 py-2 text-amber-900 dark:text-amber-100"
    >
      <AlertTriangle
        aria-hidden
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <div className="min-w-0">
        <div className="text-xs font-semibold">실행되지 않은 도구 호출 문구</div>
        <p className="mt-0.5 text-[11px] leading-5 text-amber-800/90 dark:text-amber-200/90">
          아래 tool_call 텍스트는 모델 답변일 뿐 실제 도구 이벤트가 아닙니다. 파일이나 명령이
          변경되었다고 간주하지 마세요.
        </p>
      </div>
    </aside>
  )
}

function PersistedMessageImages({
  attachmentKey,
}: {
  attachmentKey: string
}) {
  const transport = useTransport()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<{
    loading: boolean
    images: Array<{ fileId: string; url: string }>
    failedFilenames: string[]
  }>({ loading: true, images: [], failedFilenames: [] })
  const attachments = useMemo(
    () => JSON.parse(attachmentKey) as PersistedImageAttachment[],
    [attachmentKey],
  )

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setVisible(true)
        observer.disconnect()
      },
      { rootMargin: '240px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    const ownedUrls: string[] = []
    let disposed = false

    void (async () => {
      const images: Array<{ fileId: string; url: string }> = []
      const failedFilenames: string[] = []
      try {
        const files = await createFilesApi(transport)
        for (const attachment of attachments) {
          try {
            const blob = await files.download(attachment.fileId, controller.signal)
            if (!isSafeInlineImageMimeType(blob.type)) {
              failedFilenames.push(attachment.filename)
              continue
            }
            const url = URL.createObjectURL(blob)
            ownedUrls.push(url)
            images.push({ fileId: attachment.fileId, url })
          } catch {
            if (controller.signal.aborted) break
            failedFilenames.push(attachment.filename)
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          failedFilenames.push(...attachments.map((attachment) => attachment.filename))
        }
      }

      if (disposed) {
        ownedUrls.forEach((url) => URL.revokeObjectURL(url))
        return
      }
      setState({ loading: false, images, failedFilenames })
    })()

    return () => {
      disposed = true
      controller.abort()
      ownedUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [attachments, transport, visible])

  return (
    <div ref={containerRef} className="mt-2 grid min-h-16 grid-cols-2 gap-2">
      {!visible || state.loading ? (
        <div role="status" className="rounded-md border border-border px-3 py-4 text-xs opacity-60">
          첨부 이미지 불러오는 중…
        </div>
      ) : null}
      {state.images.map((image, index) => (
        <a
          key={image.fileId}
          href={image.url}
          target="_blank"
          rel="noopener noreferrer"
          className="overflow-hidden rounded-md border border-border"
        >
          <img
            src={image.url}
            alt={`attachment-${index}`}
            loading="lazy"
            className="block h-auto w-full object-cover"
          />
        </a>
      ))}
      {state.failedFilenames.map((filename, index) => (
        <div
          key={`${filename}-${index}`}
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-4 text-xs text-destructive"
        >
          {filename}을(를) 불러올 수 없습니다.
        </div>
      ))}
    </div>
  )
}

function ChatMessageComponent({
  message,
  sessionId,
  browserConnection,
  assistantPersona,
  isLastAssistantMessage = false,
  streaming = false,
  onRegenerate,
  onBranchAt,
  onRetry,
}: ChatMessageProps) {
  const transport = useTransport()
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const isPanelist = isAssistant && Boolean(message.personaName)
  const isSessionPersona = isAssistant
    && !isPanelist
    && message.origin !== 'scheduler'
    && Boolean(assistantPersona)
  const [copied, setCopied] = useState(false)
  const [reaction, setReaction] = useState<'positive' | 'negative' | null>(null)
  const [speechLoading, setSpeechLoading] = useState(false)
  const [completionAnnouncement, setCompletionAnnouncement] = useState('')
  const wasStreamingRef = useRef(streaming)
  const speechAbortRef = useRef<AbortController | null>(null)
  const speechAudioUrlRef = useRef<string | null>(null)
  const hasOptimisticImages = Boolean(message.imageUrls?.length)
  const displayContent = useMemo(
    () => (isAssistant ? presentAssistantContent(message.content).content : message.content),
    [isAssistant, message.content],
  )
  const persistedImageKey = useMemo(
    () =>
      JSON.stringify(
        (message.attachments ?? [])
          .filter((attachment) => isSafeInlineImageMimeType(attachment.mimeType))
          .map(({ fileId, filename, mimeType }) => ({ fileId, filename, mimeType })),
      ),
    [message.attachments],
  )
  const createdTimestamp = useMemo(
    () => formatMessageTimestamp(message.createdAt),
    [message.createdAt],
  )

  const hasPseudoToolCall = useMemo(
    () => isAssistant && containsPseudoToolCall(displayContent),
    [displayContent, isAssistant],
  )

  const personaItems = usePersonaStore((s) => s.items)
  const messagePersona = useMemo<Persona | undefined>(() => {
    if (isSessionPersona) return assistantPersona
    if (!isPanelist) return undefined
    if (message.personaId) {
      const fromStore = personaItems.find((persona) => persona.id === message.personaId)
      if (fromStore) return fromStore
      const fromBuiltin = BUILTIN_PERSONAS.find((persona) => persona.id === message.personaId)
      if (fromBuiltin) return fromBuiltin
    }
    if (!message.personaName) return undefined
    return {
      id: message.personaId || message.personaName,
      name: message.personaName,
      avatar: message.personaAvatar,
      systemPrompt: '',
      isActive: false,
    }
  }, [
    assistantPersona,
    isPanelist,
    isSessionPersona,
    message.personaAvatar,
    message.personaId,
    message.personaName,
    personaItems,
  ])

  const parsed = useMemo(
    () => (isAssistant && displayContent ? parseInteractiveContent(displayContent) : null),
    [displayContent, isAssistant],
  )

  const title = isUser
    ? 'You'
    : isPanelist
      ? message.personaName!
      : isSessionPersona
        ? assistantPersona!.name
      : isAssistant
        ? 'SEPilot'
        : 'System'
  const Avatar = isUser ? User : isAssistant ? Bot : Sparkles
  const hasReasoningWithoutAnswer = Boolean(
    isAssistant
    && message.reasoningSteps
    && message.reasoningSteps.length > 0,
  )

  async function handleCopy(): Promise<void> {
    const ok = await copyToClipboard(displayContent)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
    if (isAssistant) {
      void recordObservabilityEvent('message.copied')
    }
  }

  async function postDaemonJson(path: string, payload: Record<string, unknown>) {
    const daemon = await makeDaemonRequestContext(transport)
    await fetch(daemon.url(path), {
      method: 'POST',
      headers: daemon.headers(),
      body: JSON.stringify(payload),
    })
  }

  function recordObservabilityEvent(eventType: string): void {
    void postDaemonJson('/observability/events', {
      events: [
        {
          source: 'desktop-renderer',
          surface: 'desktop',
          eventType,
          sessionId,
          messageId: message.id,
        },
      ],
    }).catch(() => {})
  }

  function handleFeedback(nextReaction: 'positive' | 'negative'): void {
    setReaction(nextReaction)
    void postDaemonJson('/feedback', {
      sessionId,
      messageId: message.id,
      rating: nextReaction,
      reason: 'message-reaction',
      source: 'desktop-renderer',
      surface: 'desktop',
    }).catch(() => {})
  }

  async function handleSpeak(): Promise<void> {
    if (!displayContent.trim() || speechLoading) return
    speechAbortRef.current?.abort()
    const controller = new AbortController()
    speechAbortRef.current = controller
    setSpeechLoading(true)
    try {
      const api = await createVoiceApi(transport)
      const speech = await api.speech({
        text: displayContent,
        signal: controller.signal,
      })
      const blob = await api.audioBlob(speech.audio.fileId, controller.signal)
      if (speechAudioUrlRef.current) URL.revokeObjectURL(speechAudioUrlRef.current)
      const url = URL.createObjectURL(blob)
      speechAudioUrlRef.current = url
      const audio = new Audio(url)
      await audio.play()
      recordObservabilityEvent('message.spoken')
    } catch {
    } finally {
      if (speechAbortRef.current === controller) speechAbortRef.current = null
      setSpeechLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      speechAbortRef.current?.abort()
      if (speechAudioUrlRef.current) URL.revokeObjectURL(speechAudioUrlRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isAssistant) {
      setCompletionAnnouncement('')
      wasStreamingRef.current = streaming
      return
    }
    if (streaming) {
      setCompletionAnnouncement('')
      wasStreamingRef.current = streaming
      return
    }
    if (wasStreamingRef.current && !streaming) {
      setCompletionAnnouncement('Assistant response complete')
      const timeout = window.setTimeout(() => setCompletionAnnouncement(''), 3000)
      wasStreamingRef.current = streaming
      return () => window.clearTimeout(timeout)
    }
    wasStreamingRef.current = streaming
  }, [isAssistant, streaming])

  return (
    <div
      data-testid="chat-message"
      data-message-id={message.id}
      data-message-role={message.role}
      className={cn(
        'group relative flex gap-2.5 rounded-lg px-3 py-3 transition-colors duration-300',
        !isUser && 'hover:bg-muted/30',
        isAssistant && streaming && 'bg-primary/[0.025] dark:bg-primary/[0.045]',
      )}
    >
      {messagePersona ? (
        <PersonaAvatar
          persona={messagePersona}
          size="md"
          className="h-8 w-8 rounded-full border-primary/25 bg-primary/10 text-primary shadow-sm ring-2 ring-background"
        />
      ) : (
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm shadow-sm ring-2 ring-background',
            isUser
              ? 'bg-gradient-to-br from-blue-600 to-blue-500 text-white dark:from-blue-500 dark:to-blue-400'
              : 'bg-gradient-to-br from-secondary to-secondary/80 text-secondary-foreground',
          )}
        >
          <Avatar className="h-4 w-4" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-h-4 items-center gap-2">
          <span
            className={cn(
              'text-xs font-semibold leading-4',
              isUser && 'text-blue-700 dark:text-blue-400',
              (isPanelist || isSessionPersona) && 'text-primary',
            )}
          >
            {title}
            {isPanelist || isSessionPersona ? (
              <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-primary">
                {isPanelist ? '관점' : '페르소나'}
              </span>
            ) : null}
          </span>
          {createdTimestamp ? (
            <time
              dateTime={createdTimestamp.dateTime}
              title={`등록: ${createdTimestamp.full}`}
              aria-label={`메시지 등록 시간 ${createdTimestamp.full}`}
              className="select-none whitespace-nowrap text-[10px] font-normal tabular-nums text-muted-foreground"
            >
              {createdTimestamp.compact}
            </time>
          ) : null}
          {isAssistant && streaming ? <StreamingResponseIndicator /> : null}
        </div>
        <div
          aria-live={isAssistant && streaming ? 'polite' : undefined}
          aria-busy={isAssistant && streaming ? true : undefined}
          aria-atomic={isAssistant && streaming ? false : undefined}
          aria-relevant={isAssistant && streaming ? 'additions text' : undefined}
          className={cn(
            'break-words text-[13px] leading-[1.55]',
            isUser ? 'text-blue-700 dark:text-blue-400' : 'text-foreground',
          )}
        >
          {isAssistant && message.reasoningSteps && message.reasoningSteps.length > 0 ? (
            <ReasoningCard
              steps={message.reasoningSteps}
              durationMs={message.reasoningDurationMs}
              startedAt={message.reasoningStartedAt}
            />
          ) : null}
          {isAssistant && sessionId && message.views?.length ? (
            <div className="flex flex-wrap gap-2">
              {message.views.map((view) => (
                <LiveViewCard
                  key={view.id}
                  view={view}
                  live={Boolean(message.liveViewIds?.includes(view.id))}
                  sessionId={sessionId}
                  connectionId={browserConnection?.id}
                  controller={browserConnection?.mode}
                />
              ))}
            </div>
          ) : null}
          {hasPseudoToolCall ? <PseudoToolCallNotice /> : null}
          {}
          <div data-testid="chat-message-content">
            {displayContent ? (
              isUser ? (
                <span className="whitespace-pre-wrap">{displayContent}</span>
              ) : parsed ? (
                parsed.segments.map((segment, idx) => {
                  if (segment.type === 'text') {
                    return (
                      <MarkdownRenderer
                        key={`s-${idx}`}
                        content={segment.content as string}
                        streaming={streaming}
                      />
                    )
                  }
                  const block = segment.content as InteractiveBlock
                  if (block.type === 'interactive-select') {
                    return <InteractiveSelectBlock key={`s-${idx}`} data={block} />
                  }
                  if (block.type === 'interactive-input') {
                    return <InteractiveInputBlock key={`s-${idx}`} data={block} />
                  }
                  if (block.type === 'tool-result') {
                    return <ToolResultBlock key={`s-${idx}`} data={block} />
                  }
                  return null
                })
              ) : (
                <MarkdownRenderer content={displayContent} streaming={streaming} />
              )
            ) : hasReasoningWithoutAnswer || (isAssistant && streaming) ? null : (
              <span className="opacity-60">(빈 메시지)</span>
            )}
          </div>
          {hasOptimisticImages ? (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {(message.imageUrls ?? []).map((url, i) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="overflow-hidden rounded-md border border-border"
                >
                  <img
                    src={url}
                    alt={`${isUser ? 'attachment' : 'generated'}-${i}`}
                    className="block h-auto w-full object-cover"
                  />
                </a>
              ))}
            </div>
          ) : persistedImageKey !== '[]' ? (
            <PersistedMessageImages
              key={persistedImageKey}
              attachmentKey={persistedImageKey}
            />
          ) : null}
          {isUser && message.failed ? (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>전송하지 못했습니다.</span>
              {onRetry ? (
                <button
                  type="button"
                  onClick={() => onRetry(message.id)}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium underline-offset-2 hover:bg-destructive/10 hover:underline"
                >
                  <RefreshCw className="h-3 w-3" />
                  다시 보내기
                </button>
              ) : null}
            </div>
          ) : null}
          {completionAnnouncement ? (
            <span role="status" className="sr-only">
              {completionAnnouncement}
            </span>
          ) : null}
        </div>
      </div>

      <div
        role="toolbar"
        aria-label="message actions"
        className="absolute right-2 top-2 flex gap-1 rounded-md border bg-background/80 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Button
          size="icon"
          variant="ghost"
          onClick={handleCopy}
          className="h-7 w-7 rounded-md"
          title={copied ? '복사됨' : '복사'}
          aria-label={copied ? 'message copied' : 'copy message'}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
        {isAssistant ? (
          <>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => void handleSpeak()}
              disabled={speechLoading || !displayContent.trim()}
              className="h-7 w-7 rounded-md"
              title={speechLoading ? '음성 준비 중' : '낭독'}
              aria-label={speechLoading ? 'preparing speech' : 'speak response'}
            >
              {speechLoading ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => handleFeedback('positive')}
              className={cn(
                'h-7 w-7 rounded-md',
                reaction === 'positive' && 'bg-muted text-foreground',
              )}
              title="도움됨"
              aria-label="mark response helpful"
              aria-pressed={reaction === 'positive'}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => handleFeedback('negative')}
              className={cn(
                'h-7 w-7 rounded-md',
                reaction === 'negative' && 'bg-muted text-foreground',
              )}
              title="도움 안 됨"
              aria-label="mark response not helpful"
              aria-pressed={reaction === 'negative'}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : null}
        {isAssistant && isLastAssistantMessage && onRegenerate ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              recordObservabilityEvent('response.regenerated')
              onRegenerate(message.id)
            }}
            className="h-7 w-7 rounded-md"
            title="재생성"
            aria-label="regenerate response"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {isUser && onBranchAt && message.eventIndex != null ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onBranchAt(message.eventIndex!)}
            className="h-7 w-7 rounded-md"
            title="이 시점에서 분기"
            aria-label="branch at this message"
          >
            <GitBranch className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export const ChatMessage = memo(ChatMessageComponent)
ChatMessage.displayName = 'ChatMessage'
