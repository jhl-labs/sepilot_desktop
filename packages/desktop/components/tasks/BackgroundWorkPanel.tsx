'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, RefreshCw, Square, TerminalSquare } from 'lucide-react'
import type { DaemonChatBackgroundStatusResult } from '@sepilotd/api-client'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import {
  createBackgroundWorkApi,
  isTerminalWorkStatus,
  workCancelAction,
  type BackgroundWorkApi,
  type WorkItem,
} from '@/lib/api/background-work'

const KIND_ORDER: WorkItem['kind'][] = [
  'chat',
  'run',
  'process',
  'job',
  'schedule',
  'approval',
  'service',
]
const MAX_CHAT_DETAIL_FETCHES = 5
const MAX_PROCESS_OUTPUT_CHARS = 64_000
const PROCESS_TAIL_PAGES = 8
const PROCESS_FOLLOW_MS = 1500

interface ProcessOutputState {
  text: string
  screen?: string
  status: string
  stdoutOffset: number
  stderrOffset: number
  truncated: boolean
  error?: string
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase()
  if (['completed', 'succeeded', 'success', 'done', 'ready', 'healthy'].includes(normalized)) {
    return 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
  }
  if (['failed', 'error', 'cancelled', 'canceled', 'dead', 'blocked', 'killed'].includes(normalized)) {
    return 'border-destructive/40 text-destructive'
  }
  if (['running', 'active', 'pending', 'queued', 'waiting', 'starting'].includes(normalized)) {
    return 'border-amber-500/40 text-amber-700 dark:text-amber-300'
  }
  return 'border-border text-muted-foreground'
}

function parseTime(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function keepTail(text: string): { text: string; truncated: boolean } {
  return text.length > MAX_PROCESS_OUTPUT_CHARS
    ? { text: text.slice(text.length - MAX_PROCESS_OUTPUT_CHARS), truncated: true }
    : { text, truncated: false }
}

export function BackgroundWorkPanel({
  onOpenSession,
  pollMs = 4000,
  api: injectedApi,
}: {
  onOpenSession?: (sessionId: string) => void
  pollMs?: number
  api?: BackgroundWorkApi
}) {
  const { t } = useTranslation()
  const transport = useTransport()
  const [api, setApi] = useState<BackgroundWorkApi | null>(injectedApi ?? null)
  const [items, setItems] = useState<WorkItem[]>([])
  const [unavailable, setUnavailable] = useState<string[]>([])
  const [truncated, setTruncated] = useState<string[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [chatDetails, setChatDetails] = useState<Record<string, DaemonChatBackgroundStatusResult>>({})
  const [chatTimes, setChatTimes] = useState<Record<string, { createdAt?: string; updatedAt?: string }>>({})
  const [openProcessId, setOpenProcessId] = useState<string | null>(null)
  const [processOutput, setProcessOutput] = useState<ProcessOutputState | null>(null)
  const [follow, setFollow] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const firstSeenRef = useRef<Map<string, number>>(new Map())
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (injectedApi || !transport) return
    let cancelled = false
    void createBackgroundWorkApi(transport).then(
      (next) => {
        if (!cancelled) setApi(next)
      },
      (error: unknown) => {
        if (cancelled) return
        setLoadState('error')
        setLoadError(error instanceof Error ? error.message : String(error))
      },
    )
    return () => {
      cancelled = true
    }
  }, [injectedApi, transport])

  const formatAge = useCallback(
    (from: number) => {
      const seconds = Math.max(0, Math.round((now - from) / 1000))
      if (seconds < 5) return t('backgroundWork.age.justNow')
      if (seconds < 60) return t('backgroundWork.age.seconds', { count: seconds })
      const minutes = Math.round(seconds / 60)
      if (minutes < 60) return t('backgroundWork.age.minutes', { count: minutes })
      const hours = Math.round(minutes / 60)
      if (hours < 48) return t('backgroundWork.age.hours', { count: hours })
      return t('backgroundWork.age.days', { count: Math.round(hours / 24) })
    },
    [now, t],
  )

  const refresh = useCallback(async () => {
    if (!api) return
    try {
      const result = await api.listWork()
      if (!mountedRef.current) return
      const seenAt = Date.now()
      for (const item of result.items) {
        if (!firstSeenRef.current.has(item.key)) firstSeenRef.current.set(item.key, seenAt)
      }
      setItems(result.items)
      setUnavailable(result.unavailable)
      setTruncated(result.truncated)
      setLoadState('ready')
      setLoadError(null)
      setNow(seenAt)
      const chats = result.items.filter((item) => item.kind === 'chat')
      if (chats.length === 0) return
      const jobs = await api.backgroundChatJobs().catch(() => null)
      if (jobs && mountedRef.current) {
        setChatTimes(
          Object.fromEntries(
            jobs.jobs.map((job) => [job.jobId, { createdAt: job.createdAt, updatedAt: job.updatedAt }]),
          ),
        )
      }
      const running = chats.filter((item) => !isTerminalWorkStatus(item.status))
      const details = await Promise.all(
        running
          .slice(0, MAX_CHAT_DETAIL_FETCHES)
          .map((item) => api.backgroundChatStatus(item.id).catch(() => null)),
      )
      if (!mountedRef.current) return
      setChatDetails((current) => {
        const next = { ...current }
        for (const detail of details) if (detail) next[detail.jobId] = detail
        return next
      })
    } catch (error) {
      if (!mountedRef.current) return
      setLoadState('error')
      setLoadError(error instanceof Error ? error.message : String(error))
    }
  }, [api])

  useEffect(() => {
    if (!api) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      if (stopped) return
      if (document.visibilityState === 'visible') await refresh()
      if (!stopped) timer = setTimeout(() => void tick(), pollMs)
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      clearTimeout(timer)
      void tick()
    }
    void tick()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [api, pollMs, refresh])

  const readProcess = useCallback(
    async (processId: string, previous: ProcessOutputState | null): Promise<ProcessOutputState> => {
      if (!api) throw new Error('daemon unavailable')
      let stdoutOffset = previous?.stdoutOffset ?? 0
      let stderrOffset = previous?.stderrOffset ?? 0
      let text = previous?.text ?? ''
      let wasTruncated = previous?.truncated ?? false
      let status = previous?.status ?? 'unknown'
      let screen = previous?.screen
      for (let page = 0; page < PROCESS_TAIL_PAGES; page += 1) {
        const result = await api.readProcess(processId, { stdoutOffset, stderrOffset })
        const advanced =
          result.nextStdoutOffset !== stdoutOffset || result.nextStderrOffset !== stderrOffset
        stdoutOffset = result.nextStdoutOffset
        stderrOffset = result.nextStderrOffset
        status = result.status
        screen = result.screen ?? screen
        const tail = keepTail(`${text}${result.stdout}${result.stderr}`)
        text = tail.text
        wasTruncated = wasTruncated || tail.truncated
        if (!advanced || (!result.stdout && !result.stderr)) break
      }
      return { text, screen, status, stdoutOffset, stderrOffset, truncated: wasTruncated }
    },
    [api],
  )

  useEffect(() => {
    if (!openProcessId || !api) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let state: ProcessOutputState | null = null
    const tick = async () => {
      if (stopped) return
      if (document.visibilityState === 'visible') {
        try {
          state = await readProcess(openProcessId, state)
          if (!stopped) setProcessOutput(state)
        } catch (error) {
          if (!stopped) {
            const message = error instanceof Error ? error.message : String(error)
            setProcessOutput((current) => ({
              ...(current ?? { text: '', status: 'unknown', stdoutOffset: 0, stderrOffset: 0, truncated: false }),
              error: message,
            }))
          }
        }
      }
      if (!stopped && follow && (!state || state.status === 'running')) {
        timer = setTimeout(() => void tick(), PROCESS_FOLLOW_MS)
      }
    }
    void tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [api, follow, openProcessId, readProcess])

  const runCancel = async (item: WorkItem) => {
    if (!api) return
    setConfirmKey(null)
    setBusyKey(item.key)
    setActionError(null)
    try {
      await api.cancel(item)
      await refresh()
    } catch (error) {
      if (mountedRef.current) {
        setActionError(
          t('backgroundWork.actionFailed', {
            message: error instanceof Error ? error.message : String(error),
          }),
        )
      }
    } finally {
      if (mountedRef.current) setBusyKey(null)
    }
  }

  const manualRefresh = async () => {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      if (mountedRef.current) setRefreshing(false)
    }
  }

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: items.filter((item) => item.kind === kind),
  })).filter((group) => group.items.length > 0)

  return (
    <section
      className="mb-4 rounded-xl border bg-card p-3"
      aria-label={t('backgroundWork.title')}
      data-testid="background-work-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('backgroundWork.title')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('backgroundWork.lead')}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('backgroundWork.autoRefresh', { seconds: Math.round(pollMs / 1000) })}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void manualRefresh()} disabled={refreshing || !api}>
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          {refreshing ? t('backgroundWork.refreshing') : t('backgroundWork.refresh')}
        </Button>
      </div>

      {unavailable.length > 0 ? (
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-2 py-1 text-xs" role="status">
          {t('backgroundWork.unavailable', { sources: unavailable.join(', ') })}
        </p>
      ) : null}
      {truncated.length > 0 ? (
        <p className="mt-2 rounded-md border px-2 py-1 text-xs text-muted-foreground" role="status">
          {t('backgroundWork.truncated', { sources: truncated.join(', ') })}
        </p>
      ) : null}
      {loadState === 'error' && loadError ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {t('backgroundWork.loadFailed', { message: loadError })}
        </p>
      ) : null}
      {actionError ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
      {loadState === 'loading' ? (
        <p className="mt-3 text-xs text-muted-foreground">{t('backgroundWork.loading')}</p>
      ) : null}
      {loadState === 'ready' && groups.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{t('backgroundWork.empty')}</p>
      ) : null}

      {groups.map((group) => (
        <div key={group.kind} className="mt-3" data-kind={group.kind}>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold">
            {t(`backgroundWork.kind.${group.kind}`)}
            <span className="rounded-full border px-1.5 text-[10px] text-muted-foreground">
              {group.items.length}
            </span>
          </h3>
          <ul className="mt-1.5 grid gap-1.5">
            {group.items.map((item) => {
              const action = workCancelAction(item)
              const detail = item.kind === 'chat' ? chatDetails[item.id] : undefined
              const times = item.kind === 'chat' ? chatTimes[item.id] : undefined
              const createdAt = parseTime(times?.createdAt ?? detail?.createdAt)
              const updatedAt = parseTime(times?.updatedAt ?? detail?.updatedAt)
              const firstSeen = firstSeenRef.current.get(item.key)
              const finished = isTerminalWorkStatus(item.status)
              const progressLabel = detail?.progress?.label
              const partial = !finished ? detail?.progress?.partialContent : undefined
              const processOpen = item.kind === 'process' && openProcessId === item.id
              return (
                <li
                  key={item.key}
                  className="min-w-0 rounded-lg border bg-background/60 px-2.5 py-2 text-xs"
                  data-work-key={item.key}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className={cn('rounded-full border px-1.5 py-px text-[10px] font-medium', statusClass(item.status))}>
                      {item.status}
                    </span>
                    <strong className="min-w-0 truncate">{item.title}</strong>
                    <code className="text-[10px] text-muted-foreground">{item.id.slice(0, 12)}</code>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {createdAt !== null
                        ? t('backgroundWork.started', { age: formatAge(createdAt) })
                        : firstSeen !== undefined
                          ? t('backgroundWork.observed', { age: formatAge(firstSeen) })
                          : null}
                      {updatedAt !== null && !finished
                        ? ` · ${t('backgroundWork.updated', { age: formatAge(updatedAt) })}`
                        : null}
                    </span>
                  </div>
                  {progressLabel ? (
                    <p className="mt-1 break-words text-muted-foreground">
                      {t('backgroundWork.progress', { label: progressLabel })}
                    </p>
                  ) : item.detail ? (
                    <p className="mt-1 break-words text-muted-foreground">{item.detail}</p>
                  ) : null}
                  {partial ? (
                    <pre
                      className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-[11px]"
                      aria-label={t('backgroundWork.partial')}
                      data-testid="background-work-partial"
                    >
                      {partial}
                    </pre>
                  ) : null}
                  {item.kind === 'approval' ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">{t('backgroundWork.approvalHint')}</p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {item.sessionId && onOpenSession ? (
                      <Button size="sm" variant="outline" className="h-7" onClick={() => onOpenSession(item.sessionId!)}>
                        <ExternalLink className="h-3 w-3" />
                        {t('backgroundWork.openSession')}
                      </Button>
                    ) : null}
                    {item.kind === 'process' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        aria-expanded={processOpen}
                        onClick={() => {
                          setProcessOutput(null)
                          setOpenProcessId((current) => (current === item.id ? null : item.id))
                        }}
                      >
                        <TerminalSquare className="h-3 w-3" />
                        {processOpen ? t('backgroundWork.hideOutput') : t('backgroundWork.output')}
                      </Button>
                    ) : null}
                    {action ? (
                      confirmKey === item.key ? (
                        <>
                          <span className="text-amber-700 dark:text-amber-300">
                            {t('backgroundWork.confirm', { action: t(`backgroundWork.action.${action}`) })}
                          </span>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7"
                            disabled={busyKey === item.key}
                            onClick={() => void runCancel(item)}
                          >
                            {t('backgroundWork.confirmYes')}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmKey(null)}>
                            {t('backgroundWork.confirmNo')}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={busyKey === item.key}
                          onClick={() => setConfirmKey(item.key)}
                        >
                          <Square className="h-3 w-3" />
                          {t(`backgroundWork.action.${action}`)}
                        </Button>
                      )
                    ) : null}
                  </div>
                  {processOpen ? (
                    <div className="mt-2 grid gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={follow}
                            onChange={(event) => setFollow(event.target.checked)}
                          />
                          {t('backgroundWork.follow')}
                        </label>
                        {!follow ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() => {
                              void readProcess(item.id, processOutput).then(
                                (next) => {
                                  if (mountedRef.current) setProcessOutput(next)
                                },
                                (error: unknown) => {
                                  if (mountedRef.current) {
                                    setProcessOutput((current) => current && { ...current, error: String(error) })
                                  }
                                },
                              )
                            }}
                          >
                            {t('backgroundWork.refreshOutput')}
                          </Button>
                        ) : null}
                        {processOutput ? (
                          <span className={cn('rounded-full border px-1.5 py-px text-[10px]', statusClass(processOutput.status))}>
                            {processOutput.status}
                          </span>
                        ) : null}
                      </div>
                      {processOutput?.truncated ? (
                        <p className="text-[11px] text-muted-foreground">{t('backgroundWork.outputTruncated')}</p>
                      ) : null}
                      {processOutput?.error ? (
                        <p className="text-[11px] text-destructive" role="alert">
                          {processOutput.error}
                        </p>
                      ) : null}
                      <pre
                        className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 font-mono text-[11px]"
                        data-testid="background-work-process-output"
                      >
                        {processOutput?.screen || processOutput?.text || t('backgroundWork.noOutput')}
                      </pre>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
