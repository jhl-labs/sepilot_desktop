'use client'
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  LoaderCircle,
  ShieldAlert,
  TimerOff,
  Wrench,
  XCircle,
} from 'lucide-react'
import type { ChatMessage as Msg, ToolMessageState } from '@/lib/store/chat-store'
import { cn } from '@/lib/utils/cn'

const PREVIEW_MAX_CHARS = 96

interface ParsedView {
  preview: string
  body: string
  approvalRequired: boolean
}

type DisplayState = ToolMessageState | 'unknown'

interface StatePresentation {
  label: string
  description: string
  icon: LucideIcon
  cardClassName: string
  badgeClassName: string
  iconClassName: string
  terminal?: boolean
}

const STATE_PRESENTATION: Record<DisplayState, StatePresentation> = {
  pending: {
    label: '실행 요청',
    description: '구조화된 도구 호출을 받았습니다.',
    icon: Clock3,
    cardClassName: 'border-sky-500/35 bg-sky-500/[0.04]',
    badgeClassName: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    iconClassName: 'text-sky-600 dark:text-sky-400',
  },
  approved: {
    label: '실행 준비',
    description: '승인된 도구 실행을 준비하고 있습니다.',
    icon: LoaderCircle,
    cardClassName: 'border-sky-500/35 bg-sky-500/[0.04]',
    badgeClassName: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    iconClassName: 'motion-safe:animate-spin text-sky-600 dark:text-sky-400',
  },
  executing: {
    label: '실행 중',
    description: 'daemon이 도구를 실행하고 있습니다.',
    icon: LoaderCircle,
    cardClassName: 'border-sky-500/35 bg-sky-500/[0.04]',
    badgeClassName: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    iconClassName: 'motion-safe:animate-spin text-sky-600 dark:text-sky-400',
  },
  approval_required: {
    label: '사용자 확인 대기',
    description: '내용을 검토한 뒤 승인하거나 거절하세요.',
    icon: ShieldAlert,
    cardClassName: 'border-amber-500/50 bg-amber-500/[0.06]',
    badgeClassName: 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200',
    iconClassName: 'text-amber-600 dark:text-amber-400',
  },
  success: {
    label: '실행 성공',
    description: '도구가 결과를 반환했습니다.',
    icon: CheckCircle2,
    cardClassName: 'border-emerald-500/30 bg-emerald-500/[0.035]',
    badgeClassName:
      'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
    terminal: true,
  },
  error: {
    label: '실행 실패',
    description: '도구가 오류를 반환했습니다.',
    icon: XCircle,
    cardClassName: 'border-destructive/45 bg-destructive/[0.05]',
    badgeClassName: 'border-destructive/45 bg-destructive/10 text-destructive',
    iconClassName: 'text-destructive',
    terminal: true,
  },
  policy_blocked: {
    label: '정책으로 차단',
    description: '보안 정책이 실행 전에 요청을 차단했습니다.',
    icon: ShieldAlert,
    cardClassName: 'border-orange-500/50 bg-orange-500/[0.06]',
    badgeClassName: 'border-orange-500/50 bg-orange-500/10 text-orange-800 dark:text-orange-200',
    iconClassName: 'text-orange-600 dark:text-orange-400',
    terminal: true,
  },
  workspace_blocked: {
    label: '워크스페이스 밖 차단',
    description: '선택한 워크스페이스의 파일 경계를 벗어나 실행하지 않았습니다.',
    icon: ShieldAlert,
    cardClassName: 'border-amber-500/55 bg-amber-500/[0.07]',
    badgeClassName: 'border-amber-500/55 bg-amber-500/10 text-amber-800 dark:text-amber-200',
    iconClassName: 'text-amber-600 dark:text-amber-400',
    terminal: true,
  },
  timeout: {
    label: '시간 초과',
    description: '제한 시간 안에 실행이 끝나지 않았습니다.',
    icon: TimerOff,
    cardClassName: 'border-destructive/45 bg-destructive/[0.05]',
    badgeClassName: 'border-destructive/45 bg-destructive/10 text-destructive',
    iconClassName: 'text-destructive',
    terminal: true,
  },
  denied: {
    label: '승인 거절',
    description: '사용자 결정으로 도구를 실행하지 않았습니다.',
    icon: Ban,
    cardClassName: 'border-border bg-muted/40',
    badgeClassName: 'border-border bg-muted text-muted-foreground',
    iconClassName: 'text-muted-foreground',
    terminal: true,
  },
  cancelled: {
    label: '실행 취소',
    description: '도구 실행이 완료 전에 취소되었습니다.',
    icon: Ban,
    cardClassName: 'border-border bg-muted/40',
    badgeClassName: 'border-border bg-muted text-muted-foreground',
    iconClassName: 'text-muted-foreground',
    terminal: true,
  },
  unknown: {
    label: '상태 미확인',
    description: '이전 기록에 실행 상태가 포함되어 있지 않습니다.',
    icon: CircleHelp,
    cardClassName: 'border-border bg-muted/40',
    badgeClassName: 'border-border bg-muted text-muted-foreground',
    iconClassName: 'text-muted-foreground',
  },
}

function parseToolContent(content: string): ParsedView {
  const trimmed = content.trim()
  if (!trimmed) {
    return { preview: '(내용 없음)', body: content, approvalRequired: false }
  }
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      if (record.state === 'approval_required') {
        const input = record.input
        const inputBody =
          input == null ? '' : typeof input === 'string' ? input : JSON.stringify(input, null, 2)
        return {
          preview: summarizeValue(input),
          body: inputBody || trimmed,
          approvalRequired: true,
        }
      }
      return { preview: summarizeValue(parsed), body: content, approvalRequired: false }
    }
    return { preview: truncate(String(parsed)), body: content, approvalRequired: false }
  } catch {
    const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim().length > 0) ?? trimmed
    return { preview: truncate(firstLine), body: content, approvalRequired: false }
  }
}

function summarizeValue(value: unknown): string {
  if (value == null) return String(value)
  if (typeof value !== 'object') return truncate(String(value))
  if (Array.isArray(value)) return `Array(${value.length})`
  const record = value as Record<string, unknown>
  if (typeof record.prompt === 'string') return truncate(record.prompt)
  const entries = Object.entries(record).slice(0, 4)
  const compact = entries.map(([key, entry]) => `${key}: ${formatScalar(entry)}`).join(', ')
  return truncate(compact || '{}')
}

function formatScalar(value: unknown): string {
  if (value == null) return String(value)
  if (typeof value === 'string') {
    return value.length > 32 ? `"${value.slice(0, 32)}…"` : `"${value}"`
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `Array(${value.length})`
  if (typeof value === 'object') return '{…}'
  return String(value)
}

function truncate(text: string): string {
  if (text.length <= PREVIEW_MAX_CHARS) return text
  return `${text.slice(0, PREVIEW_MAX_CHARS)}…`
}

function resolveDisplayState(
  toolState: ToolMessageState | undefined,
  approvalRequired: boolean,
): DisplayState {
  return toolState ?? (approvalRequired ? 'approval_required' : 'unknown')
}

function formatDuration(durationMs: number | undefined): string | null {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) return null
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`
  const seconds = durationMs / 1000
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}초`
}

export function ToolCard({ message }: { message: Msg }) {
  const toolName = message.toolName ?? 'unknown'
  const { preview, body, approvalRequired } = parseToolContent(message.content ?? '')
  const displayState = resolveDisplayState(message.toolState, approvalRequired)
  const presentation = STATE_PRESENTATION[displayState]
  const StatusIcon = presentation.icon
  const duration = formatDuration(message.toolDurationMs)
  const truncatedLabel = message.toolContentTruncated
    ? message.toolOriginalChars
      ? `원본 ${message.toolOriginalChars.toLocaleString()}자 · 화면 표시용으로 요약됨`
      : '긴 출력 · 화면 표시용으로 요약됨'
    : null
  const detailLabel = presentation.terminal
    ? displayState === 'policy_blocked' || displayState === 'workspace_blocked'
      ? '차단 사유'
      : '실행 결과'
    : displayState === 'approval_required'
      ? '검토할 요청'
      : '요청 내용'
  const defaultExpanded =
    (displayState === 'approval_required' && toolName === 'question') ||
    displayState === 'policy_blocked' ||
    displayState === 'workspace_blocked'
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <section
      aria-label={`${toolName} 도구 · ${presentation.label}`}
      data-tool-state={displayState}
      className={cn(
        'w-full min-w-0 overflow-hidden rounded-lg border text-xs',
        presentation.cardClassName,
      )}
    >
      <span role="status" className="sr-only">
        {toolName} 도구 상태: {presentation.label}
      </span>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={`${toolName} · ${presentation.label} · 세부 정보 ${expanded ? '접기' : '펼치기'}`}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-foreground/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:grid-cols-[auto_minmax(0,1fr)_auto]"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <Wrench aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="max-w-full break-all font-mono text-[11px] font-semibold text-foreground">
              {toolName}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide',
                presentation.badgeClassName,
              )}
            >
              <StatusIcon aria-hidden className={cn('h-3 w-3', presentation.iconClassName)} />
              {presentation.label}
            </span>
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
            {preview}
          </span>
          <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground/80">
            {presentation.description}
          </span>
          {truncatedLabel ? (
            <span className="mt-0.5 block text-[10px] leading-4 text-amber-700 dark:text-amber-300">
              {truncatedLabel}
            </span>
          ) : null}
        </span>
        {duration ? (
          <span className="col-start-2 row-start-2 mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground sm:col-start-3 sm:row-start-1">
            {duration}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div className="border-t border-border/60 px-2.5 py-2">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {detailLabel}
          </div>
          <pre className="max-h-96 max-w-full overflow-auto overscroll-contain whitespace-pre-wrap break-all rounded-md bg-background/55 px-2.5 py-2 font-mono text-[11px] leading-5 text-foreground [contain:content]">
            {message.toolPolicyReason || body || '(내용 없음)'}
          </pre>
        </div>
      ) : null}
    </section>
  )
}
