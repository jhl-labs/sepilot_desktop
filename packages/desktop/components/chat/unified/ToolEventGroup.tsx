'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Expand,
  ListChecks,
  LoaderCircle,
  MessageSquareMore,
  ShieldAlert,
} from 'lucide-react'
import { FrameViewer } from '@sepilotd/presentation'
import { presentAssistantContent } from '@/lib/chat/presentation-content'
import { summarizeLatestReasoningStep } from '@/lib/chat/reasoning-live-line'
import { useModalFocusLayer } from '@/lib/hooks/use-modal-focus-layer'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'
import type { ChatMessage } from '@/lib/store/chat-store'
import { cn } from '@/lib/utils/cn'
import { ChatItemErrorBoundary } from './ChatItemErrorBoundary'
import { ToolCard } from './ToolCard'

interface ToolEventGroupProps {
  messages: ChatMessage[]
  sessionPending?: boolean
}

const MAX_VISIBLE_TOOL_IMAGE_CHARS = 8 * 1024 * 1024

interface EvidenceVisual {
  id: string
  src: string
  caption: string
  alt: string
}

function presentationCaption(message: ChatMessage): string {
  try {
    const result = JSON.parse(message.content) as Record<string, unknown>
    const slide = Number(result.activeSlideIndex ?? result.slideIndex)
    if (Number.isInteger(slide) && slide > 0) return `Slide ${slide} · PowerPoint`
  } catch {
  }
  return 'Slide · PowerPoint'
}

function evidenceVisuals(messages: ChatMessage[]): EvidenceVisual[] {
  const visuals: EvidenceVisual[] = []
  for (const message of messages) {
    if (message.role !== 'tool' || message.toolName !== 'office.capture_slide') continue
    const caption = presentationCaption(message)
    for (const [index, image] of (message.toolImages ?? []).entries()) {
      if (
        image.data.length === 0
        || image.data.length > MAX_VISIBLE_TOOL_IMAGE_CHARS
        || !/^image\/(?:png|jpeg|webp|gif)$/i.test(image.mediaType)
      ) continue
      visuals.push({
        id: `${message.id}:${index}`,
        src: `data:${image.mediaType};base64,${image.data}`,
        caption,
        alt: `${caption} 슬라이드 미리보기`,
      })
    }
  }
  return visuals
}

function isFailure(message: ChatMessage): boolean {
  return message.toolState === 'error' || message.toolState === 'timeout'
}

function isBlocked(message: ChatMessage): boolean {
  return (
    message.toolState === 'policy_blocked' ||
    message.toolState === 'workspace_blocked' ||
    message.toolState === 'denied' ||
    message.toolState === 'cancelled'
  )
}

function isRunning(message: ChatMessage): boolean {
  if (message.role === 'tool') {
    return (
      message.toolState === 'pending' ||
      message.toolState === 'approved' ||
      message.toolState === 'executing'
    )
  }
  return Boolean(
    message.reasoningSteps?.length &&
      message.reasoningDurationMs == null &&
      !message.content.trim(),
  )
}

function AssistantWorkLogEntry({ message }: { message: ChatMessage }) {
  const presented = presentAssistantContent(message.content)
  const hasContent = Boolean(presented.content)
  const hasReasoning = Boolean(message.reasoningSteps?.length)
  const hasDiagnostics = presented.diagnostics.length > 0
  if (!hasContent && !hasReasoning && !hasDiagnostics) return null

  return (
    <section
      aria-label="중간 진행 기록"
      className="min-w-0 overflow-hidden rounded-lg border border-border/60 bg-muted/15"
    >
      <div className="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground">
        <MessageSquareMore aria-hidden className="h-3 w-3" />
        중간 기록
      </div>
      {hasContent ? (
        <p className="max-h-48 overflow-auto overscroll-contain whitespace-pre-wrap break-words px-2.5 py-2 text-[11px] leading-5 text-muted-foreground">
          {presented.content}
        </p>
      ) : null}
      {hasReasoning ? (
        <ol className="space-y-1.5 border-t border-border/50 px-2.5 py-1.5">
          {message.reasoningSteps?.map((step, index) => (
            <li key={`${step.label}-${index}`} className="min-w-0">
              <div className="text-[10px] font-medium text-muted-foreground">{step.label}</div>
              {step.detail ? (
                <pre className="mt-1 max-h-48 overflow-auto overscroll-contain whitespace-pre-wrap break-all rounded bg-background/60 px-2 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground">
                  {step.detail}
                </pre>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {hasDiagnostics ? (
        <div className="space-y-1.5 border-t border-border/50 px-2.5 py-1.5">
          {presented.diagnostics.map((block, index) => (
            <div key={`${block.kind}-${index}`}>
              <div className="text-[10px] font-medium text-muted-foreground">
                {block.kind === 'phase-usage'
                  ? '단계별 사용량'
                  : block.kind === 'interim-output'
                    ? '중간 응답 원문'
                    : block.kind === 'execution-report'
                      ? '실행 보고 원문'
                    : '완료 조건 판정'}
              </div>
              <pre className="mt-1 max-h-48 overflow-auto overscroll-contain whitespace-pre-wrap break-all rounded bg-background/60 px-2 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground">
                {block.content}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function CoworkWorkLogEntry({ message }: { message: ChatMessage }) {
  const [firstLine = '협업 기록', ...remainingLines] = message.content.split(/\r?\n/)
  const heading = firstLine.replace(/^\*\*(.+)\*\*$/, '$1').trim() || '협업 기록'
  const detail = remainingLines.join('\n').trim()

  return (
    <section
      aria-label="협업 기록"
      className="min-w-0 overflow-hidden rounded-lg border border-border/60 bg-muted/15 px-2.5 py-1.5"
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
        <MessageSquareMore aria-hidden className="h-3 w-3" />
        {heading}
      </div>
      {detail ? (
        <p className="mt-1 max-h-32 overflow-auto overscroll-contain whitespace-pre-wrap break-words text-[11px] leading-5 text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </section>
  )
}

const QUIET_NOTICE_SECONDS = 20

export function ToolEventGroup({ messages, sessionPending = true }: ToolEventGroupProps) {
  const regionId = useId()
  const toolMessages = useMemo(
    () => messages.filter((message) => message.role === 'tool'),
    [messages],
  )
  const assistantMessages = useMemo(
    () => messages.filter((message) => message.role === 'assistant'),
    [messages],
  )
  const coworkMessages = useMemo(
    () =>
      messages.filter(
        (message) => message.role === 'system' && message.id.startsWith('cowork:'),
      ),
    [messages],
  )
  const visuals = useMemo(() => evidenceVisuals(toolMessages), [toolMessages])
  const currentVisual = visuals[visuals.length - 1]
  const [enlargedVisualId, setEnlargedVisualId] = useState<string | null>(null)
  const enlargedVisual = visuals.find((visual) => visual.id === enlargedVisualId)
  const evidenceTriggerRef = useRef<HTMLButtonElement>(null)
  const enlargedPanelRef = useRef<HTMLDivElement>(null)
  const isTopModalLayer = useModalFocusLayer(Boolean(enlargedVisual))
  useModalViewportLock(Boolean(enlargedVisual))
  useEffect(() => {
    if (!enlargedVisual) return
    const opener = evidenceTriggerRef.current
    const frame = window.requestAnimationFrame(() => {
      if (!isTopModalLayer()) return
      const firstControl = enlargedPanelRef.current?.querySelector<HTMLElement>(
        'button:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )
      ;(firstControl ?? enlargedPanelRef.current)?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopModalLayer()) return
      if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) {
        event.preventDefault()
        setEnlargedVisualId(null)
        return
      }
      if (event.key !== 'Tab') return

      const controls = Array.from(
        enlargedPanelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      const first = controls[0]
      const last = controls.at(-1)
      if (!first || !last) {
        event.preventDefault()
        enlargedPanelRef.current?.focus()
      } else if (!enlargedPanelRef.current?.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', handleKeyDown)
      window.requestAnimationFrame(() => opener?.focus())
    }
  }, [enlargedVisual, isTopModalLayer])
  const successCount = toolMessages.filter((message) => message.toolState === 'success').length
  const failureCount = toolMessages.filter(isFailure).length
  const blockedCount = toolMessages.filter(isBlocked).length
  const approvalIds = useMemo(
    () =>
      toolMessages
        .filter((message) => message.toolState === 'approval_required')
        .map((message) => message.id),
    [toolMessages],
  )
  const approvalCount = approvalIds.length
  const progressCount = toolMessages.filter(
    (message) =>
      message.toolState === 'pending' ||
      message.toolState === 'approved' ||
      message.toolState === 'executing',
  ).length
  const previousApprovalIdsRef = useRef(new Set(approvalIds))
  const pendingApprovalRevealRef = useRef<string | null>(
    approvalIds[approvalIds.length - 1] ?? null,
  )
  const messageNodesRef = useRef(new Map<string, HTMLDivElement>())
  const [expanded, setExpanded] = useState(approvalCount > 0)

  useEffect(() => {
    const previous = previousApprovalIdsRef.current
    const newApprovalIds = approvalIds.filter((id) => !previous.has(id))
    previousApprovalIdsRef.current = new Set(approvalIds)
    if (newApprovalIds.length > 0) {
      pendingApprovalRevealRef.current = newApprovalIds[newApprovalIds.length - 1] ?? null
      setExpanded(true)
    }
  }, [approvalIds])

  useEffect(() => {
    const approvalId = pendingApprovalRevealRef.current
    if (!expanded || !approvalId) return
    const node = messageNodesRef.current.get(approvalId)
    if (!node) return
    pendingApprovalRevealRef.current = null
    node.scrollIntoView?.({ block: 'nearest' })
  }, [expanded, messages])

  const running = sessionPending && messages.some(isRunning)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  const activeTool = [...toolMessages].reverse().find(isRunning)
  const runningAssistant = [...assistantMessages].reverse().find(isRunning)
  const generating = runningAssistant?.reasoningSteps?.some((step) => step.kind === 'thinking') ?? false
  const liveLine = runningAssistant?.reasoningSteps
    ? summarizeLatestReasoningStep(runningAssistant.reasoningSteps)
    : null
  const activity = activeTool
    ? `${activeTool.toolName ?? '도구'} 실행 중`
    : liveLine ?? (generating ? '모델 응답 생성 중' : '모델 응답 대기 중')
  const latestRowAt = runningAssistant?.reasoningSteps?.at(-1)?.at
  const quietSeconds = !activeTool && latestRowAt != null
    ? Math.max(0, Math.floor((now - latestRowAt) / 1000))
    : null
  const startedAt = Math.min(...messages.map((message) => message.createdAt))
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const assistantContentCount = assistantMessages.filter(
    (message) => presentAssistantContent(message.content).content.length > 0,
  ).length
  const reasoningCount = assistantMessages.reduce(
    (total, message) => total + (message.reasoningSteps?.length ?? 0),
    0,
  )
  const recordCount = assistantContentCount + reasoningCount
  const summary = [
    toolMessages.length > 0 ? `도구 ${toolMessages.length}건` : null,
    approvalCount > 0 ? `승인 ${approvalCount}` : null,
    progressCount > 0 ? `진행 ${progressCount}` : null,
    failureCount > 0 ? `오류 ${failureCount}` : null,
    blockedCount > 0 ? `차단 ${blockedCount}` : null,
    successCount > 0 ? `성공 ${successCount}` : null,
    visuals.length > 0 ? `미리보기 ${visuals.length}` : null,
    coworkMessages.length > 0 ? `협업 ${coworkMessages.length}` : null,
    toolMessages.length === 0 && recordCount > 0 ? `기록 ${recordCount}` : null,
  ].filter(Boolean).join(' · ')
  const title = approvalCount > 0
    ? '승인 필요'
    : running
      ? '작업 중'
      : failureCount > 0
      ? '오류 기록'
      : blockedCount > 0
        ? '차단 기록'
        : '작업 로그'
  const tone = approvalCount > 0
    ? 'approval'
    : running
      ? 'quiet'
      : failureCount > 0
      ? 'failure'
      : blockedCount > 0
        ? 'blocked'
        : 'quiet'

  return (
    <>
      {currentVisual ? (
        <figure className="my-1 w-full min-w-0 overflow-hidden rounded-lg border border-border/70 bg-background">
          <figcaption className="flex h-8 items-center justify-between border-b border-border/60 px-2.5 font-mono text-[10px] text-muted-foreground">
            <span>{currentVisual.caption}</span>
            <span className="flex items-center gap-1 font-sans">클릭해 확대 <Expand className="h-3 w-3" aria-hidden /></span>
          </figcaption>
          <button
            ref={evidenceTriggerRef}
            type="button"
            className="group relative block aspect-video w-full overflow-hidden bg-muted/25 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-label={`${currentVisual.caption} 크게 보기`}
            onClick={() => setEnlargedVisualId(currentVisual.id)}
          >
            <img
              src={currentVisual.src}
              alt={currentVisual.alt}
              className="h-full w-full object-contain"
            />
          </button>
        </figure>
      ) : null}
      <section
      aria-label={`${title}${summary ? ` · ${summary}` : ''}`}
      aria-busy={running}
      className={cn(
        'relative my-1 w-full min-w-0 overflow-hidden rounded-lg border text-xs',
        tone === 'failure'
          ? 'border-destructive/40 bg-destructive/[0.035]'
          : tone === 'approval' || tone === 'blocked'
            ? 'border-amber-500/45 bg-amber-500/[0.035]'
            : 'border-border/60 bg-muted/15',
      )}
    >
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {title}
        {summary ? ` · ${summary}` : ''}
      </span>
      <button
        type="button"
        className="flex min-h-8 w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-foreground/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={regionId}
        aria-label={`${title}${summary ? ` · ${summary}` : ''} 세부 정보 ${expanded ? '접기' : '펼치기'}`}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90',
          )}
        />
        {approvalCount > 0 ? (
          <ShieldAlert aria-hidden className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        ) : running ? (
          <LoaderCircle
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin text-sky-600 dark:text-sky-400"
          />
        ) : failureCount > 0 ? (
          <AlertCircle aria-hidden className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : blockedCount > 0 ? (
          <ShieldAlert aria-hidden className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        ) : (
          <ListChecks aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <strong
          className={cn(
            'shrink-0 text-sm font-medium',
            tone === 'failure'
              ? 'text-destructive'
              : tone === 'approval' || tone === 'blocked'
                ? 'text-amber-800 dark:text-amber-200'
                : 'text-muted-foreground',
          )}
        >
          {title}
        </strong>
        {summary ? (
          <span className="min-w-0 flex-1 truncate text-xs tabular-nums text-muted-foreground/80">
            {summary}
          </span>
        ) : null}
        <span className="flex shrink-0 items-center gap-1" aria-hidden>
          {successCount > 0 ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : null}
          {failureCount > 0 ? <AlertCircle className="h-3 w-3 text-destructive" /> : null}
          {blockedCount > 0 ? <ShieldAlert className="h-3 w-3 text-amber-500" /> : null}
        </span>
      </button>
      {!expanded && failureCount > 0 ? (
        <p className="border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
          {toolMessages.find(isFailure)?.toolName ?? '도구'} 실행 오류가 기록되었습니다. 세부 정보에서 원인을 확인할 수 있습니다.
        </p>
      ) : null}
      {running && approvalCount === 0 ? (
        <div aria-label="현재 작업" className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 px-3 py-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-foreground" title={activity}>{activity}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {Math.floor(elapsedSeconds / 60)}분 {elapsedSeconds % 60}초 경과 · 완료된 도구 {successCount}개
            {quietSeconds != null && quietSeconds >= QUIET_NOTICE_SECONDS
              ? ` · 마지막 업데이트 ${quietSeconds}초 전`
              : ''}
          </span>
          {!activeTool && elapsedSeconds >= 30 ? (
            <p className="w-full text-muted-foreground">응답이 도착하면 계속 진행합니다. 아래 입력창에서 추가 지시하거나 중단할 수 있습니다.</p>
          ) : null}
        </div>
      ) : null}
      {expanded ? (
        <div
          id={regionId}
          role="region"
          aria-label={`${title} 세부 정보`}
          className="max-h-[65vh] space-y-1.5 overflow-y-auto overscroll-contain border-t border-border/60 bg-background/30 p-1.5 [contain:content]"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              ref={(node) => {
                if (node) messageNodesRef.current.set(message.id, node)
                else messageNodesRef.current.delete(message.id)
              }}
            >
              <ChatItemErrorBoundary resetKey={message.id}>
                {message.role === 'tool' ? (
                  <ToolCard message={message} />
                ) : message.role === 'assistant' ? (
                  <AssistantWorkLogEntry message={message} />
                ) : message.role === 'system' && message.id.startsWith('cowork:') ? (
                  <CoworkWorkLogEntry message={message} />
                ) : null}
              </ChatItemErrorBoundary>
            </div>
          ))}
        </div>
      ) : null}
      </section>
      {enlargedVisual ? (
        <div
          ref={enlargedPanelRef}
          tabIndex={-1}
          className="contents"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget.firstElementChild) setEnlargedVisualId(null)
          }}
        >
          <FrameViewer
            open
            title={`${enlargedVisual.caption} 확대 보기`}
            src={enlargedVisual.src}
            onClose={() => setEnlargedVisualId(null)}
            labels={{ close: '확대 보기 닫기' }}
            classNames={{
              root: 'fixed inset-0 z-[80] flex flex-col items-center justify-center gap-0 bg-black/80 p-4',
              header: 'flex h-10 w-full max-w-[min(96vw,1600px)] shrink-0 items-center gap-3 border-b border-white/15 bg-black px-3 font-mono text-xs text-white/75',
              body: 'min-h-0 w-full max-w-[min(96vw,1600px)] flex-1 overflow-auto bg-black p-2',
              image: 'mx-auto max-h-[calc(100dvh-5.5rem)] max-w-full object-contain',
              closeButton: 'ml-auto rounded p-1 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
            }}
          />
        </div>
      ) : null}
    </>
  )
}
