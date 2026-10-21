'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FilePenLine,
  ShieldAlert,
  TerminalSquare,
  X,
} from 'lucide-react'
import {
  dismissDesktopNotification,
  onNotificationPush,
  openDesktopNotification,
} from '@/lib/electron/bridge'

interface NotificationItem {
  id: string
  title: string
  body: string
  url: string | null
  topic: string | null
  createdAt: number
  readAt: number | null
}

interface ApprovalPresentation {
  kind: 'approval'
  outcome: 'pending' | 'expired'
  tool: string
  target: string
  sessionId: string | null
  expiresAt: number | null
  impact: {
    label: string
    className: string
    reason: string
  }
}

const MAX_VISIBLE_NOTIFICATIONS = 8

function boundedText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeRendererNotification(value: unknown): NotificationItem | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = boundedText(record.id, 240)
  const title = boundedText(record.title, 240)
  if (!id || !title) return null

  return {
    id,
    title,
    body: boundedText(record.body, 2_000),
    url: boundedText(record.url, 2_048) || null,
    topic: boundedText(record.topic, 512) || null,
    createdAt:
      typeof record.createdAt === 'number'
      && Number.isFinite(record.createdAt)
      && !Number.isNaN(new Date(record.createdAt).getTime())
        ? record.createdAt
        : Date.now(),
    readAt:
      typeof record.readAt === 'number' && Number.isFinite(record.readAt)
        ? record.readAt
        : null,
  }
}

function parseSessionId(url: string | null): string | null {
  if (!url) return null
  try {
    const target = new URL(url)
    if (target.protocol !== 'sepilotd:' || target.hostname !== 'chat') return null
    return boundedText(target.searchParams.get('sessionId'), 240) || null
  } catch {
    return null
  }
}

function approvalTarget(body: string, outcome: ApprovalPresentation['outcome']): {
  target: string
  expiresAt: number | null
} {
  if (outcome === 'expired') {
    const prefix = 'Run continued with a denial for '
    const target = body.startsWith(prefix) ? body.slice(prefix.length) : body
    return { target: target.replace(/\.$/, '') || '요청 세부 정보 없음', expiresAt: null }
  }

  const prefix = 'Waiting for approval until '
  if (!body.startsWith(prefix)) {
    return { target: body.replace(/\.$/, '') || '요청 세부 정보 없음', expiresAt: null }
  }
  const divider = body.indexOf(': ', prefix.length)
  if (divider < 0) {
    return { target: body.replace(/\.$/, ''), expiresAt: null }
  }
  const rawExpiry = body.slice(prefix.length, divider)
  const parsedExpiry = Date.parse(rawExpiry)
  return {
    target: body.slice(divider + 2).replace(/\.$/, '') || '요청 세부 정보 없음',
    expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : null,
  }
}

function impactForTool(tool: string): ApprovalPresentation['impact'] {
  if (/(?:delete|remove|unlink|destroy)/i.test(tool)) {
    return {
      label: '높은 영향',
      className:
        'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
      reason: '삭제 또는 제거 작업은 되돌리기 어려울 수 있습니다.',
    }
  }
  if (/(?:terminal|shell|computer|exec|run)/i.test(tool)) {
    return {
      label: '시스템 작업',
      className:
        'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200',
      reason: 'OS나 프로세스 상태에 영향을 줄 수 있습니다.',
    }
  }
  if (/(?:write|edit|patch|mutate|move|rename)/i.test(tool)) {
    return {
      label: '파일 변경',
      className:
        'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
      reason: '워크스페이스의 파일 내용이나 위치가 바뀝니다.',
    }
  }
  return {
    label: '검토 필요',
    className:
      'border-border bg-muted/60 text-foreground',
    reason: '현재 작업 상태를 변경할 수 있어 실행 전 확인이 필요합니다.',
  }
}

function approvalPresentation(item: NotificationItem): ApprovalPresentation | null {
  if (!item.topic?.startsWith('approval:')) return null
  const outcome = /^Approval expired:/i.test(item.title) ? 'expired' : 'pending'
  const separator = item.title.indexOf(':')
  const tool = separator >= 0 ? item.title.slice(separator + 1).trim() : item.title
  const detail = approvalTarget(item.body, outcome)
  return {
    kind: 'approval',
    outcome,
    tool: tool || '도구 작업',
    target: detail.target,
    sessionId: parseSessionId(item.url),
    expiresAt: detail.expiresAt,
    impact: impactForTool(tool),
  }
}

function formatClock(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp)
  } catch {
    return '방금'
  }
}

function expiryLabel(expiresAt: number | null): string {
  if (!expiresAt) return '만료 시간 미상'
  const remainingMinutes = Math.ceil((expiresAt - Date.now()) / 60_000)
  if (remainingMinutes <= 0) return '곧 만료'
  if (remainingMinutes === 1) return '1분 이내'
  return `${remainingMinutes}분 이내`
}

function toolIcon(tool: string) {
  if (/(?:terminal|shell|exec|run)/i.test(tool)) {
    return <TerminalSquare className="h-4 w-4" aria-hidden="true" />
  }
  if (/(?:write|edit|patch|mutate|file)/i.test(tool)) {
    return <FilePenLine className="h-4 w-4" aria-hidden="true" />
  }
  return <ShieldAlert className="h-4 w-4" aria-hidden="true" />
}

function ApprovalCard({
  item,
  presentation,
  busy,
  error,
  onOpen,
  onDismiss,
}: {
  item: NotificationItem
  presentation: ApprovalPresentation
  busy: boolean
  error: string | null
  onOpen: () => void
  onDismiss: () => void
}) {
  const pending = presentation.outcome === 'pending'
  const titleId = `notification-title-${item.id}`

  return (
    <article
      aria-labelledby={titleId}
      className="relative overflow-hidden rounded-xl border border-border bg-background shadow-sm"
    >
      <div
        className={`absolute inset-y-0 left-0 w-1 ${pending ? 'bg-amber-500' : 'bg-muted-foreground/40'}`}
        aria-hidden="true"
      />
      <div className="px-3.5 pb-2.5 pt-2.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
              pending
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'border-border bg-muted text-muted-foreground'
            }`}
          >
            {pending ? toolIcon(presentation.tool) : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                  pending
                    ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                    : 'border-border bg-muted text-muted-foreground'
                }`}
              >
                {pending ? '승인 대기' : '만료됨'}
              </span>
              <span
                className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${presentation.impact.className}`}
              >
                영향도 · {presentation.impact.label}
              </span>
            </div>
            <h2 id={titleId} className="mt-1.5 truncate text-[13px] font-semibold" title={presentation.tool}>
              {presentation.tool}
            </h2>
          </div>
          <button
            type="button"
            aria-label="알림 닫기"
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onDismiss}
            disabled={busy}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-2 rounded-lg border border-border/80 bg-muted/35 px-2.5 py-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            실행 대상
          </div>
          <code
            className="mt-1 block max-h-10 overflow-hidden break-all font-mono text-[11px] leading-5 text-foreground"
            title={presentation.target}
          >
            {presentation.target}
          </code>
        </div>

        <dl className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
          <div className="min-w-0 rounded-md bg-muted/35 px-2 py-1">
            <dt className="text-muted-foreground">요청 대화</dt>
            <dd className="mt-0.5 truncate font-mono text-foreground" title={presentation.sessionId ?? undefined}>
              {presentation.sessionId ? presentation.sessionId.slice(0, 12) : '정보 없음'}
            </dd>
          </div>
          <div className="rounded-md bg-muted/35 px-2 py-1">
            <dt className="text-muted-foreground">상태</dt>
            <dd className="mt-0.5 flex items-center gap-1 font-medium text-foreground">
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              {pending ? expiryLabel(presentation.expiresAt) : '자동 거부됨'}
            </dd>
          </div>
        </dl>

        {pending ? (
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            <span className="font-semibold text-foreground">확인 이유 · </span>
            {presentation.impact.reason} 자세한 맥락과 변경 내용은 메인 앱에서 확인합니다.
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            제한 시간 안에 결정되지 않아 이 작업은 실행되지 않았습니다.
          </p>
        )}

        {error ? (
          <p role="alert" className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-red-600 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/70 pt-2">
          <span className="text-[10px] text-muted-foreground">선택 · 검토 또는 닫기</span>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            onClick={onOpen}
            disabled={busy}
          >
            {busy ? '여는 중…' : pending ? '검토하기' : '대화 열기'}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  )
}

function ActivityCard({
  item,
  busy,
  error,
  onOpen,
  onDismiss,
}: {
  item: NotificationItem
  busy: boolean
  error: string | null
  onOpen: () => void
  onDismiss: () => void
}) {
  const titleId = `notification-title-${item.id}`
  return (
    <article aria-labelledby={titleId} className="rounded-xl border border-border bg-background p-3 shadow-sm">
      <div className="flex min-w-0 items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
          <Bell className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-xs font-semibold" title={item.title}>
            {item.title}
          </h2>
          {item.body ? (
            <p className="mt-1 max-h-10 overflow-hidden break-words text-[11px] leading-5 text-muted-foreground">
              {item.body}
            </p>
          ) : null}
          {item.url ? (
            <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/80" title={item.url}>
              {item.url}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="알림 닫기"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onDismiss}
          disabled={busy}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-[11px] text-red-600 dark:text-red-300">{error}</p> : null}
      <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-2">
        <span className="text-[10px] text-muted-foreground">{formatClock(item.createdAt)}</span>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          onClick={onOpen}
          disabled={busy}
        >
          {busy ? '여는 중…' : '열기'}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

export default function NotificationPage() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorById, setErrorById] = useState<Record<string, string>>({})

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      document.documentElement.classList.toggle('dark', preference.matches)
    }
    applyTheme()
    preference.addEventListener?.('change', applyTheme)
    return () => preference.removeEventListener?.('change', applyTheme)
  }, [])

  useEffect(() => {
    return onNotificationPush<unknown>((payload) => {
      const item = normalizeRendererNotification(payload)
      if (!item) return
      setItems((previous) =>
        [item, ...previous.filter((candidate) => candidate.id !== item.id)].slice(
          0,
          MAX_VISIBLE_NOTIFICATIONS,
        ),
      )
    })
  }, [])

  const pendingApprovalCount = useMemo(
    () =>
      items.filter((item) => approvalPresentation(item)?.outcome === 'pending').length,
    [items],
  )

  const dismiss = useCallback((id?: string) => {
    const next = id ? items.filter((item) => item.id !== id) : []
    setItems(next)
    if (next.length === 0) void dismissDesktopNotification()
  }, [items])

  const open = useCallback(async (item: NotificationItem) => {
    if (busyId) return
    setBusyId(item.id)
    setErrorById((current) => ({ ...current, [item.id]: '' }))
    try {
      const opened = await openDesktopNotification(item.url)
      if (!opened) throw new Error('메인 앱 연결을 사용할 수 없습니다.')
    } catch (error) {
      setBusyId(null)
      setErrorById((current) => ({
        ...current,
        [item.id]: error instanceof Error ? error.message : '메인 앱을 열지 못했습니다.',
      }))
    }
  }, [busyId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void dismissDesktopNotification()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && items[0]) {
        event.preventDefault()
        void open(items[0])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [items, open])

  return (
    <main className="flex h-screen min-h-0 bg-muted/50 p-2 text-sm text-foreground">
      <section
        aria-label="작업 알림"
        className="flex min-h-0 w-full flex-col overflow-hidden rounded-[14px] border border-border/80 bg-background shadow-xl"
      >
        <header className="flex items-center gap-2.5 border-b border-border/80 px-3.5 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[13px] font-semibold tracking-tight">
              {pendingApprovalCount > 0 ? '작업 검토' : '최근 활동'}
            </h1>
            <p className="truncate text-[10px] text-muted-foreground">
              {pendingApprovalCount > 0
                ? '에이전트가 결정을 기다리고 있습니다.'
                : '백그라운드 작업 업데이트'}
            </p>
          </div>
          {items.length > 0 ? (
            <span
              aria-live="polite"
              className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
            >
              {items.length}개
            </span>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="flex h-full min-h-40 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/50 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </div>
              <p className="mt-3 text-xs font-medium">알림 없음</p>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                검토가 필요한 작업이 생기면 여기에 표시됩니다.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => {
                const approval = approvalPresentation(item)
                const props = {
                  item,
                  busy: busyId === item.id,
                  error: errorById[item.id] || null,
                  onOpen: () => void open(item),
                  onDismiss: () => dismiss(item.id),
                }
                return approval ? (
                  <ApprovalCard key={item.id} {...props} presentation={approval} />
                ) : (
                  <ActivityCard key={item.id} {...props} />
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
