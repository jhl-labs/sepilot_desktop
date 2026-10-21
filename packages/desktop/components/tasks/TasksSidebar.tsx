'use client'
import { useEffect, useMemo, useState } from 'react'
import { Clock, ListChecks, Pause, Play, Settings, TriangleAlert } from 'lucide-react'
import {
  daemonSchedulerDeliveryOutboxEvidence,
  type DaemonSchedulerDeliveryOutboxSummary,
} from '@sepilotd/api-client'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import {
  CapabilityUnavailableError,
  createSchedulerApi,
  type SchedulerApi,
  type SchedulerJob,
} from '@/lib/api/scheduler'
import { schedulerQueueCounts } from './scheduler-job-state'

type TasksSidebarState =
  | { kind: 'loading' }
  | { kind: 'ready'; jobs: SchedulerJob[] }
  | { kind: 'disabled' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }

type TasksFilter = 'all' | 'active' | 'paused' | 'failed'

function isCapabilityUnavailable(error: unknown): boolean {
  return error instanceof CapabilityUnavailableError
    || (error instanceof Error && error.name === 'CapabilityUnavailableError')
}

function isSurfaceDisabled(error: unknown): boolean {
  return error instanceof Error
    && (error.message.includes('SCHEDULER_SURFACE_DISABLED') || /\(403\)/.test(error.message))
}

function selectTasksFilter(filter: TasksFilter): void {
  window.dispatchEvent(new CustomEvent('sepilot:tasks-filter', { detail: filter }))
  document.getElementById('tasks-jobs')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

export function TasksSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const transport = useTransport()
  const [state, setState] = useState<TasksSidebarState>({ kind: 'loading' })
  const [deliveryStatus, setDeliveryStatus] = useState<
    DaemonSchedulerDeliveryOutboxSummary | null | undefined
  >(undefined)

  useEffect(() => {
    let cancelled = false
    let watcher: ReturnType<SchedulerApi['watch']> | null = null
    let deliveryTimer: ReturnType<typeof setInterval> | null = null
    void (async () => {
      setState({ kind: 'loading' })
      setDeliveryStatus(undefined)
      try {
        const api = await createSchedulerApi(transport)
        const refreshDeliveryStatus = async () => {
          try {
            const summary = await api.deliveryStatus()
            if (!cancelled) setDeliveryStatus(summary)
          } catch {
            if (!cancelled) setDeliveryStatus(null)
          }
        }
        void refreshDeliveryStatus()
        deliveryTimer = setInterval(() => void refreshDeliveryStatus(), 30_000)
        const jobs = await api.list()
        if (!cancelled) setState({ kind: 'ready', jobs })
        try {
          const nextWatcher = api.watch((event) => {
            if (cancelled || event.type === 'heartbeat') return
            setState({ kind: 'ready', jobs: event.jobs })
          })
          if (cancelled) {
            nextWatcher.close()
            return
          }
          watcher = nextWatcher
          watcher.done.catch((error: unknown) => {
            if (!cancelled) setState({ kind: 'error', message: error instanceof Error ? error.message : '예약 상태 연결을 복구하지 못했습니다.' })
          })
        } catch {
        }
      } catch (error) {
        if (cancelled) return
        if (isCapabilityUnavailable(error)) {
          setState({ kind: 'unavailable' })
          return
        }
        if (isSurfaceDisabled(error)) {
          setState({ kind: 'disabled' })
          return
        }
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'scheduler load failed',
        })
      }
    })()
    return () => {
      cancelled = true
      watcher?.close()
      if (deliveryTimer) clearInterval(deliveryTimer)
    }
  }, [transport])

  const counts = useMemo(() => {
    const jobs = state.kind === 'ready' ? state.jobs : []
    return schedulerQueueCounts(jobs)
  }, [state])
  const deliveryEvidence = useMemo(
    () => daemonSchedulerDeliveryOutboxEvidence(deliveryStatus),
    [deliveryStatus],
  )

  const statusLabel =
    state.kind === 'ready'
      ? 'ready'
      : state.kind === 'disabled'
        ? 'surface off'
        : state.kind === 'loading'
          ? 'loading'
          : state.kind

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b p-3">
        <section className="rounded-md border border-border p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-sm font-semibold">Scheduler</div>
              <div className="text-xs font-medium text-muted-foreground">{statusLabel}</div>
            </div>
          </div>
          {state.kind === 'ready' ? (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-muted/40 p-2">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-mono text-base">{counts.total}</dd>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <dt className="text-muted-foreground">Active</dt>
                <dd className="font-mono text-base">{counts.active}</dd>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <dt className="text-muted-foreground">Paused</dt>
                <dd className="font-mono text-base">{counts.paused}</dd>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <dt className="text-muted-foreground">Failed</dt>
                <dd className="font-mono text-base text-red-500">{counts.failed}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {state.kind === 'disabled'
                ? 'Desktop scheduler surface가 꺼져 있습니다.'
                : state.kind === 'unavailable'
                  ? 'daemon scheduler endpoint가 응답하지 않습니다.'
                  : state.kind === 'error'
                    ? state.message
                    : '작업 상태를 불러오는 중입니다.'}
              </p>
          )}
          {state.kind === 'ready' ? (
            <div className="mt-3 border-t border-border pt-3 text-xs">
              <div
                className={
                  deliveryEvidence?.state === 'retrying'
                    ? 'font-medium text-red-500'
                    : deliveryEvidence?.state === 'pending'
                      ? 'font-medium text-amber-600 dark:text-amber-400'
                      : 'font-medium text-muted-foreground'
                }
              >
                {deliveryStatus === undefined
                  ? 'Loading channel delivery status…'
                  : deliveryEvidence?.label ?? 'Channel delivery status unavailable'}
              </div>
              {deliveryEvidence ? (
                <div className="mt-1 text-muted-foreground">
                  {deliveryEvidence.active} active · {deliveryEvidence.delivered} delivered
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="space-y-1">
          <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Queue
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full justify-start gap-2 text-xs"
            onClick={() => selectTasksFilter('all')}
          >
            <ListChecks className="h-3.5 w-3.5" />
            All jobs
            {state.kind === 'ready' ? (
              <span className="ml-auto font-mono">{counts.total}</span>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full justify-start gap-2 text-xs"
            onClick={() => selectTasksFilter('active')}
          >
            <Play className="h-3.5 w-3.5" />
            Active
            {state.kind === 'ready' ? (
              <span className="ml-auto font-mono">{counts.active}</span>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full justify-start gap-2 text-xs"
            onClick={() => selectTasksFilter('paused')}
          >
            <Pause className="h-3.5 w-3.5" />
            Paused
            {state.kind === 'ready' ? (
              <span className="ml-auto font-mono">{counts.paused}</span>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full justify-start gap-2 text-xs"
            onClick={() => selectTasksFilter('failed')}
          >
            <TriangleAlert className="h-3.5 w-3.5" />
            Failed
            {state.kind === 'ready' ? (
              <span className="ml-auto font-mono">{counts.failed}</span>
            ) : null}
          </Button>
        </section>
      </div>

      <div className="mt-auto border-t p-2">
        <Button
          type="button"
          variant="ghost"
          className="h-8 w-full justify-start gap-2 text-xs"
          onClick={onOpenSettings}
        >
          <Settings className="h-3.5 w-3.5" />
          Automation settings
        </Button>
      </div>
    </div>
  )
}
