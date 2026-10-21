'use client'
import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react'
import { toast } from 'sonner'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import { AUTONOMY_LEVELS, createAutonomyApi, type AutonomyLevel } from '@/lib/api/autonomy'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { cn } from '@/lib/utils/cn'
import { useRunTelemetryStore } from '@/lib/store/run-telemetry-store'

const LABEL: Record<AutonomyLevel, string> = {
  readonly: '읽기 전용',
  'accept-edits': '편집 자동 수락',
  'workspace-write': '작업공간 쓰기',
  supervised: '감독',
  autonomous: '자동',
}

const TONE: Record<AutonomyLevel, string> = {
  readonly: 'border-slate-500/40 bg-slate-500/[0.06] text-slate-700 dark:text-slate-300',
  'accept-edits': 'border-sky-500/40 bg-sky-500/[0.06] text-sky-700 dark:text-sky-300',
  'workspace-write':
    'border-violet-500/40 bg-violet-500/[0.06] text-violet-700 dark:text-violet-300',
  supervised: 'border-emerald-500/40 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-300',
  autonomous: 'border-red-500/50 bg-red-500/[0.07] text-red-700 dark:text-red-300',
}

export function AutonomyIndicator({
  compact = false,
  iconOnly = false,
}: { compact?: boolean; iconOnly?: boolean } = {}) {
  const transport = useOptionalTransport()
  const [level, setLevel] = useState<AutonomyLevel | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const executionPolicy = useRunTelemetryStore((state) => state.executionPolicy)
  const setExecutionPolicy = useRunTelemetryStore((state) => state.setExecutionPolicy)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!transport) return
      try {
        if (await isBrowserPreviewTransport(transport)) return
        const api = await createAutonomyApi(transport)
        const current = await api.get()
        if (!cancelled) setLevel(current)
      } catch {
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    function onChanged(event: Event) {
      const detail = (event as CustomEvent<AutonomyLevel>).detail
      if (detail) setLevel(detail)
    }
    window.addEventListener('sepilot:autonomy-changed', onChanged as EventListener)
    return () => window.removeEventListener('sepilot:autonomy-changed', onChanged as EventListener)
  }, [])

  async function apply(next: AutonomyLevel): Promise<void> {
    if (busy || next === level || !transport) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      const api = await createAutonomyApi(transport)
      await api.set(next)
      setLevel(next)
      setExecutionPolicy(null)
      setOpen(false)
      window.dispatchEvent(new CustomEvent('sepilot:autonomy-changed', { detail: next }))
      if (next === 'autonomous') {
        toast.warning('자동 모드 활성화', {
          description:
            '도구가 승인 없이 실행됩니다. 되돌리려면 /privilege supervised 를 실행하세요.',
        })
      } else {
        toast.success(`privilege: ${LABEL[next]}`)
      }
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setBusy(false)
    }
  }

  if (level == null) return null
  const displayedLevel = executionPolicy?.effectiveAutonomy ?? level
  const Icon =
    executionPolicy?.clamped || displayedLevel === 'autonomous'
      ? ShieldAlert
      : displayedLevel === 'readonly'
        ? ShieldQuestion
        : ShieldCheck

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={
          executionPolicy?.clamped
            ? `실행 정책 제한: ${executionPolicy.clampReason ?? displayedLevel}`
            : 'privilege 레벨'
        }
        className={cn(
          compact
            ? 'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            : 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          executionPolicy?.clamped
            ? 'border-amber-500/45 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300'
            : TONE[displayedLevel],
          busy && 'opacity-60',
        )}
      >
        <Icon className="h-3 w-3" />
        <span className={cn(iconOnly && 'sr-only')}>
          {compact ? LABEL[displayedLevel] : `privilege: ${LABEL[displayedLevel]}`}
          {executionPolicy?.clamped ? ' (정책 제한)' : ''}
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute bottom-full z-50 mb-1 min-w-[180px] rounded-md border bg-popover p-1 text-popover-foreground shadow-lg max-[420px]:fixed max-[420px]:inset-x-2 max-[420px]:bottom-20',
            compact ? 'right-0' : 'left-0',
          )}
        >
          {AUTONOMY_LEVELS.map((option) => {
            const selected = option === level
            return (
              <button
                key={option}
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => void apply(option)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors',
                  selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  busy && 'cursor-wait',
                )}
              >
                <span className="font-medium">{LABEL[option]}</span>
                <span className="text-[10px] text-muted-foreground">/privilege {option}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
