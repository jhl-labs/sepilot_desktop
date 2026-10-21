'use client'
import { useEffect } from 'react'
import {
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  X,
  XCircle,
} from 'lucide-react'
import type { McpServerMetrics, McpServerStatus } from '@/lib/api/mcp'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'

interface Props {
  open: boolean
  server: McpServerStatus | null
  onClose: () => void
  onSetDisabledTools?: (
    serverName: string,
    nextDisabled: string[],
  ) => Promise<void> | void
  busyTool?: string | null
  metrics?: McpServerMetrics | null
  metricsLoading?: boolean
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function StatusBadge({ status }: { status: McpServerStatus['status'] }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        connected
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">
        <XCircle className="h-3 w-3" />
        error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Circle className="h-3 w-3" />
      {status}
    </span>
  )
}

export function McpServerDetailDialog({
  open,
  server,
  onClose,
  onSetDisabledTools,
  busyTool,
  metrics,
  metricsLoading,
}: Props) {
  useModalViewportLock(open && Boolean(server))

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !server) return null

  const allTools = server.allTools ?? server.tools
  const disabled = new Set(server.disabledTools ?? [])
  const enabledTools = allTools.filter((t) => !disabled.has(t))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${server.name} 상세`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h3 className="min-w-0 truncate text-base font-semibold">{server.name}</h3>
            <StatusBadge status={server.status} />
            {!server.enabled ? (
              <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                disabled
              </span>
            ) : null}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={onClose}
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5">

        <section className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-3 text-xs">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Transport
          </p>
          <p className="font-mono">{server.transport}</p>
          {server.command ? (
            <>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Command
              </p>
              <p className="break-all font-mono">
                {server.command}
                {server.args && server.args.length > 0
                  ? ` ${server.args.join(' ')}`
                  : ''}
              </p>
            </>
          ) : null}
          {server.url ? (
            <>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                URL
              </p>
              <p className="break-all font-mono">{server.url}</p>
            </>
          ) : null}
        </section>

        {server.error ? (
          <section className="flex flex-col gap-1 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs">
            <p className="text-[10px] uppercase tracking-wide text-red-600 dark:text-red-400">
              Error
            </p>
            <p className="break-words font-mono text-red-700 dark:text-red-300">
              {server.error}
            </p>
          </section>
        ) : null}

        <section className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-3 text-xs">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Metrics
          </p>
          {metricsLoading ? (
            <p className="text-muted-foreground">로딩 중…</p>
          ) : metrics && metrics.totalCalls > 0 ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
              <div>
                <dt className="text-[10px] text-muted-foreground">호출</dt>
                <dd className="font-mono">{metrics.totalCalls}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-muted-foreground">에러</dt>
                <dd
                  className={cn(
                    'font-mono',
                    metrics.errors > 0 && 'text-red-600 dark:text-red-400',
                  )}
                >
                  {metrics.errors}
                  {metrics.totalCalls > 0
                    ? ` (${Math.round((metrics.errors / metrics.totalCalls) * 100)}%)`
                    : ''}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] text-muted-foreground">평균 지연</dt>
                <dd className="font-mono">
                  {formatDuration(metrics.totalDurationMs / metrics.totalCalls)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] text-muted-foreground">마지막 호출</dt>
                <dd className="truncate" title={metrics.lastCallAt ?? ''}>
                  {metrics.lastCallAt
                    ? formatTimestamp(metrics.lastCallAt)
                    : '—'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-muted-foreground">아직 호출 기록이 없습니다.</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h4 className="text-sm font-medium">
              Tools{' '}
              <span className="text-[11px] text-muted-foreground">
                ({enabledTools.length}/{allTools.length})
              </span>
            </h4>
            {disabled.size > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                {disabled.size}개 비활성화됨
              </span>
            ) : null}
          </div>
          {allTools.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {server.status === 'connected'
                ? '이 서버는 도구를 노출하지 않습니다.'
                : '연결 후 도구 목록을 가져올 수 있습니다.'}
            </p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-background/40 p-2 font-mono text-[12px]">
              {allTools.map((tool) => {
                const isDisabled = disabled.has(tool)
                const isBusy = busyTool === tool
                const perTool = metrics?.perTool[tool]
                return (
                  <li
                    key={tool}
                    className={cn(
                      'flex items-center gap-2 rounded px-2 py-1',
                      isDisabled
                        ? 'bg-muted/30 text-muted-foreground'
                        : 'text-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        isDisabled && 'line-through',
                      )}
                      title={tool}
                    >
                      {tool}
                    </span>
                    {perTool ? (
                      <span
                        className={cn(
                          'shrink-0 text-[10px] tabular-nums text-muted-foreground',
                          perTool.errors > 0
                            && 'text-red-600 dark:text-red-400',
                        )}
                        title={`calls: ${perTool.calls}, errors: ${perTool.errors}, avg: ${formatDuration(
                          perTool.totalDurationMs / Math.max(perTool.calls, 1),
                        )}`}
                      >
                        {perTool.calls}× ·{' '}
                        {formatDuration(
                          perTool.totalDurationMs / Math.max(perTool.calls, 1),
                        )}
                        {perTool.errors > 0 ? ` · ${perTool.errors}e` : ''}
                      </span>
                    ) : null}
                    {onSetDisabledTools ? (
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(disabled)
                          if (isDisabled) next.delete(tool)
                          else next.add(tool)
                          void onSetDisabledTools(
                            server.name,
                            Array.from(next),
                          )
                        }}
                        disabled={isBusy}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50',
                          isDisabled
                            ? 'text-muted-foreground'
                            : 'text-foreground',
                        )}
                        aria-label={
                          isDisabled
                            ? `${tool} 활성화`
                            : `${tool} 비활성화`
                        }
                        title={isDisabled ? '활성화' : '비활성화'}
                      >
                        {isDisabled ? (
                          <>
                            <Eye className="h-3 w-3" />
                            활성
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3 w-3" />
                            비활성
                          </>
                        )}
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        </div>
      </div>
    </div>
  )
}
