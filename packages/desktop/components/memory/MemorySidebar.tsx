'use client'
import { useEffect, useState } from 'react'
import { Database, FileText, RefreshCcw, Search, Settings } from 'lucide-react'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { CapabilityUnavailableError } from '@/lib/api/_http'
import { createMemoryApi, type MemorySemanticStatus } from '@/lib/api/memory'
import { cn } from '@/lib/utils/cn'

type MemorySidebarState =
  | { kind: 'loading' }
  | { kind: 'ready'; status: MemorySemanticStatus }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }

function statusTone(status: MemorySemanticStatus['status']): string {
  if (status === 'ready') return 'text-emerald-600 dark:text-emerald-400'
  if (status === 'backfilling') return 'text-sky-600 dark:text-sky-400'
  if (status === 'degraded' || status === 'reindex_required') {
    return 'text-amber-600 dark:text-amber-400'
  }
  return 'text-muted-foreground'
}

function isCapabilityUnavailable(error: unknown): boolean {
  return error instanceof CapabilityUnavailableError
    || (error instanceof Error && error.name === 'CapabilityUnavailableError')
}

function isMemoryStatus(value: unknown): value is MemorySemanticStatus {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as { status?: unknown }).status === 'string'
}

export function MemorySidebar({
  onOpenSearch,
  onOpenIndex,
  onOpenDocuments,
  onOpenSettings,
}: {
  onOpenSearch: () => void
  onOpenIndex: () => void
  onOpenDocuments: () => void
  onOpenSettings: () => void
}) {
  const transport = useTransport()
  const [state, setState] = useState<MemorySidebarState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    async function loadStatus(): Promise<void> {
      setState({ kind: 'loading' })
      try {
        const api = await createMemoryApi(transport)
        const status = await api.status()
        if (!cancelled) setState({ kind: 'ready', status })
      } catch (error) {
        if (cancelled) return
        if (isCapabilityUnavailable(error)) {
          setState({ kind: 'unavailable' })
          return
        }
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'memory status failed',
        })
      }
    }
    function onMemoryStatus(event: Event): void {
      if (cancelled) return
      const status = (event as CustomEvent<unknown>).detail
      if (isMemoryStatus(status)) {
        setState({ kind: 'ready', status })
      }
    }
    void loadStatus()
    window.addEventListener('sepilot:memory-status', onMemoryStatus)
    return () => {
      cancelled = true
      window.removeEventListener('sepilot:memory-status', onMemoryStatus)
    }
  }, [transport])

  const statusLabel =
    state.kind === 'ready'
      ? state.status.status
      : state.kind === 'loading'
        ? 'loading'
        : state.kind === 'unavailable'
          ? 'unavailable'
          : 'error'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b p-3">
        <section className="rounded-md border border-border p-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-sm font-semibold">Semantic Index</div>
              <div
                className={cn(
                  'text-xs font-medium',
                  state.kind === 'ready' ? statusTone(state.status.status) : 'text-muted-foreground',
                )}
              >
                {statusLabel}
              </div>
            </div>
          </div>
          {state.kind === 'ready' ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              세부 인덱스 상태는 본문에서 확인합니다.
            </p>
          ) : (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {state.kind === 'unavailable'
                ? 'daemon memory endpoint가 응답하지 않습니다.'
                : state.kind === 'error'
                  ? state.message
                  : '상태를 불러오는 중입니다.'}
            </p>
          )}
        </section>

        <section className="space-y-1">
          <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Workspace
          </div>
          <div className="space-y-1">
            <Button
              type="button"
              variant="ghost"
              className="h-8 w-full justify-start gap-2 text-xs"
              onClick={onOpenSearch}
            >
              <Search className="h-3.5 w-3.5" />
              Search & recall
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 w-full justify-start gap-2 text-xs"
              onClick={onOpenIndex}
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Index maintenance
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 w-full justify-start gap-2 text-xs"
              onClick={onOpenDocuments}
            >
              <FileText className="h-3.5 w-3.5" />
              Documents
            </Button>
          </div>
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
          Memory settings
        </Button>
      </div>
    </div>
  )
}
