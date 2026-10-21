'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChartPie,
  Info,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import {
  createContextUsageApi,
  includeDraftInContextUsage,
  type ContextUsageCategoryId,
  type ContextUsageSnapshot,
} from '@/lib/api/context-usage'
import { toDaemonMode } from '@/lib/chat/chat-modes'
import { useChatModeStore } from '@/lib/store/chat-mode-store'
import { useChatStore } from '@/lib/store/chat-store'
import { useSessionStore } from '@/lib/store/session-store'
import { useSettingsStore } from '@/lib/store/settings-store'
import { useRunTelemetryStore } from '@/lib/store/run-telemetry-store'
import { cn } from '@/lib/utils/cn'
import { formatTokens } from '@/lib/utils/token-counter'

interface ContextUsageIndicatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  iconOnly?: boolean
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

const CATEGORY_STYLES: Record<ContextUsageCategoryId, { dot: string; bar: string }> = {
  system: { dot: 'bg-violet-500', bar: 'bg-violet-500' },
  tools: { dot: 'bg-cyan-500', bar: 'bg-cyan-500' },
  memory: { dot: 'bg-amber-500', bar: 'bg-amber-500' },
  skills: { dot: 'bg-fuchsia-500', bar: 'bg-fuchsia-500' },
  workspace: { dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
  document: { dot: 'bg-orange-500', bar: 'bg-orange-500' },
  conversation: { dot: 'bg-blue-500', bar: 'bg-blue-500' },
  draft: { dot: 'bg-rose-500', bar: 'bg-rose-500' },
}

export function ContextUsageIndicator({
  open,
  onOpenChange,
  iconOnly = false,
}: ContextUsageIndicatorProps) {
  const transport = useOptionalTransport()
  const activeSession = useSessionStore((state) =>
    state.sessions.find((session) => session.id === state.activeId) ?? null,
  )
  const mode = useChatModeStore((state) => state.mode)
  const composer = useChatStore((state) => state.composer)
  const llm = useSettingsStore((state) => state.llm)
  const liveContextUsage = useRunTelemetryStore((state) =>
    state.sessionId === activeSession?.id ? state.contextUsage : null,
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)
  const snapshotKeyRef = useRef<string | null>(null)
  const [state, setState] = useState<LoadState>('idle')
  const [snapshot, setSnapshot] = useState<ContextUsageSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!transport) {
      setState('error')
      setError('데몬 연결이 준비되지 않았습니다.')
      return
    }
    const requestId = ++requestIdRef.current
    const requestKey = JSON.stringify({
      sessionId: activeSession?.isDraft ? undefined : activeSession?.id,
      mode,
      provider: llm.providerId ?? activeSession?.provider,
      model: llm.modelId ?? activeSession?.model,
      maxOutputTokens: llm.maxTokens,
      input: composer,
    })
    if (snapshotKeyRef.current !== requestKey) setSnapshot(null)
    setState('loading')
    setError(null)
    try {
      const api = await createContextUsageApi(transport)
      const next = await api.inspect({
        ...(!activeSession?.isDraft ? { sessionId: activeSession?.id } : {}),
        mode: toDaemonMode(mode),
        provider: llm.providerId ?? activeSession?.provider,
        model: llm.modelId ?? activeSession?.model,
        maxOutputTokens: llm.maxTokens ?? undefined,
        input: composer,
      })
      if (requestId !== requestIdRef.current) return
      setSnapshot(next)
      snapshotKeyRef.current = requestKey
      setState('ready')
    } catch (reason) {
      if (requestId !== requestIdRef.current) return
      setState('error')
      setError(reason instanceof Error ? reason.message : '컨텍스트 사용량을 불러오지 못했습니다.')
    }
  }, [activeSession, composer, llm.maxTokens, llm.modelId, llm.providerId, mode, transport])

  useEffect(() => {
    if (!open) return
    setState('loading')
    const timer = window.setTimeout(() => void reload(), 300)
    return () => window.clearTimeout(timer)
  }, [open, reload])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onOpenChange, open])

  const displayed = useMemo(
    () => (snapshot ? includeDraftInContextUsage(snapshot, composer) : null),
    [composer, snapshot],
  )
  const livePercentage = liveContextUsage?.contextWindowTokens
    ? Math.min(100, (liveContextUsage.inputTokens / liveContextUsage.contextWindowTokens) * 100)
    : null
  const triggerPercentage = livePercentage ?? displayed?.percentage ?? 0

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="컨텍스트 사용 현황"
        title="컨텍스트 사용 현황"
        className={cn(
          'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open
            ? 'border-cyan-500/40 bg-cyan-500/[0.09] text-cyan-700 dark:text-cyan-300'
            : 'border-transparent bg-muted/55 text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <span className="relative grid h-3.5 w-3.5 place-items-center" aria-hidden="true">
          <svg viewBox="0 0 16 16" className="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.18" />
            <circle
              cx="8"
              cy="8"
              r="6.25"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray={`${displayed ? Math.max(2, triggerPercentage) : 0} 100`}
            />
          </svg>
          <ChartPie className="h-2 w-2" />
        </span>
        <span className={cn(iconOnly && 'sr-only')}>
          {livePercentage != null
            ? `${Math.round(livePercentage)}%`
            : displayed
              ? `${Math.round(displayed.percentage)}%`
              : 'Context'}
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="컨텍스트 사용 현황"
          className="absolute bottom-full right-0 z-50 mb-1 flex max-h-[min(32rem,70vh)] w-[23rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl max-[420px]:fixed max-[420px]:inset-x-2 max-[420px]:bottom-20 max-[420px]:w-auto max-[420px]:max-w-none"
        >
          <div className="flex shrink-0 items-start justify-between border-b border-border/70 px-3 py-2.5">
            <div>
              <div className="flex items-center gap-1.5">
                <ChartPie className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                <h2 className="text-xs font-semibold tracking-tight">Context</h2>
                <span className="rounded-full border border-border/80 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                  추정
                </span>
                {displayed?.compatibilityMode ? (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/[0.08] px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-300">
                    호환 모드
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">다음 요청에 들어갈 입력 컴포넌트</p>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => void reload()}
                disabled={state === 'loading'}
                aria-label="컨텍스트 사용량 새로고침"
                title="새로고침"
                className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', state === 'loading' && 'animate-spin')} />
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="컨텍스트 사용 현황 닫기"
                className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto">
            {liveContextUsage ? <LiveContextUsage context={liveContextUsage} /> : null}
            {state === 'loading' && !displayed ? <LoadingState /> : null}
            {state === 'error' && !displayed ? (
              <ErrorState error={error} onRetry={() => void reload()} />
            ) : null}
            {state === 'error' && displayed ? (
              <div className="border-b border-amber-500/20 bg-amber-500/[0.07] px-3 py-1.5 text-[10px] text-amber-700 dark:text-amber-300" role="alert">
                새로고침에 실패해 직전 계산값을 표시합니다.
              </div>
            ) : null}
            {displayed?.compatibilityMode === 'legacy-get' ? (
              <div className="border-b border-amber-500/20 bg-amber-500/[0.07] px-3 py-1.5 text-[10px] leading-4 text-amber-700 dark:text-amber-300" role="status">
                daemon 이전 조회 경로를 사용 중입니다. 작성 내용에 따른 instant 도구 선택은 daemon 재시작 후 정확해집니다.
              </div>
            ) : null}
            {displayed ? <ContextUsageContent snapshot={displayed} refreshing={state === 'loading'} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function LiveContextUsage({
  context,
}: {
  context: NonNullable<ReturnType<typeof useRunTelemetryStore.getState>['contextUsage']>
}) {
  const percentage = context.contextWindowTokens
    ? Math.min(100, (context.inputTokens / context.contextWindowTokens) * 100)
    : null
  return (
    <div
      className="border-b border-cyan-500/20 bg-cyan-500/[0.05] px-3 py-2 text-[10px]"
      data-testid="live-context-usage"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">최근 실제 모델 요청</span>
        <span className="tabular-nums text-cyan-700 dark:text-cyan-300">
          {formatTokens(context.inputTokens)}
          {context.contextWindowTokens ? ` / ${formatTokens(context.contextWindowTokens)}` : ''}
          {percentage == null ? '' : ` · ${percentage.toFixed(1)}%`}
        </span>
      </div>
      <p className="mt-0.5 text-muted-foreground">
        iteration {context.iteration} · {context.source === 'provider' ? 'provider 실측' : '요청 전 추정'}
        {context.reservedOutputTokens
          ? ` · 응답 예약 ${formatTokens(context.reservedOutputTokens)}`
          : ''}
      </p>
    </div>
  )
}

function ContextUsageContent({
  snapshot,
  refreshing,
}: {
  snapshot: ContextUsageSnapshot
  refreshing: boolean
}) {
  const occupiedWithReserve = snapshot.usedTokens + snapshot.reservedOutputTokens
  const occupiedPercentage = Math.min(100, (occupiedWithReserve / snapshot.contextWindow) * 100)
  const modelLabel = snapshot.model.modelId === 'unknown'
    ? '모델 미설정'
    : snapshot.model.modelId

  return (
    <div className={cn('px-3 py-3 transition-opacity', refreshing && 'opacity-65')}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground">입력 사용량</p>
          <p
            className="mt-0.5 text-xl font-semibold leading-none tabular-nums tracking-tight"
            data-testid="context-usage-summary"
          >
            {formatTokens(snapshot.usedTokens)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              / {formatTokens(snapshot.contextWindow)}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold tabular-nums">{snapshot.percentage.toFixed(1)}%</p>
          <p className="max-w-40 truncate text-[9px] text-muted-foreground" title={`${snapshot.model.providerId} / ${modelLabel}`}>
            {modelLabel}
          </p>
        </div>
      </div>

      <div
        className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="컨텍스트 입력 사용량"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(snapshot.percentage)}
      >
        {snapshot.categories.filter((category) => category.estimatedTokens > 0).map((category) => (
          <span
            key={category.id}
            className={cn('h-full min-w-px shrink-0', CATEGORY_STYLES[category.id].bar)}
            style={{ width: `${(category.estimatedTokens / snapshot.contextWindow) * 100}%` }}
            title={`${category.label}: ${category.estimatedTokens.toLocaleString()} 토큰`}
          />
        ))}
        {snapshot.reservedOutputTokens > 0 ? (
          <span
            className="h-full min-w-px shrink-0 bg-foreground/20 [background-image:repeating-linear-gradient(135deg,transparent,transparent_2px,currentColor_2px,currentColor_3px)]"
            style={{ width: `${(snapshot.reservedOutputTokens / snapshot.contextWindow) * 100}%` }}
            title={`응답 예약: ${snapshot.reservedOutputTokens.toLocaleString()} 토큰`}
          />
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-[9px] tabular-nums text-muted-foreground">
        <span>사용 + 응답 예약 {occupiedPercentage.toFixed(1)}%</span>
        <span>여유 {formatTokens(snapshot.freeTokens)}</span>
      </div>

      <div className="mt-3 divide-y divide-border/60 border-y border-border/60">
        {snapshot.categories.map((category) => (
          <div
            key={category.id}
            className="flex items-center gap-2 py-1.5 text-[11px]"
            data-testid="context-usage-category"
            data-category-id={category.id}
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full', CATEGORY_STYLES[category.id].dot)} />
            <span className="min-w-0 flex-1">
              <span className="font-medium text-foreground">{category.label}</span>
              {category.detail ? (
                <span className="ml-1.5 text-[9px] text-muted-foreground">{category.detail}</span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatTokens(category.estimatedTokens)}
            </span>
            <span className="w-9 shrink-0 text-right tabular-nums text-[9px] text-muted-foreground">
              {((category.estimatedTokens / snapshot.contextWindow) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 py-1.5 text-[11px]">
          <span className="h-2 w-2 shrink-0 rounded-sm border border-foreground/25 bg-foreground/10" />
          <span className="min-w-0 flex-1 font-medium text-foreground">응답 토큰 예약</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {formatTokens(snapshot.reservedOutputTokens)}
          </span>
          <span className="w-9 shrink-0 text-right tabular-nums text-[9px] text-muted-foreground">
            {((snapshot.reservedOutputTokens / snapshot.contextWindow) * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/55 px-2.5 py-2 text-[10px] leading-4 text-muted-foreground">
        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-cyan-600 dark:text-cyan-300" />
        <div>
          <p className="font-medium text-foreground">요청 전에는 확정할 수 없는 동적 컨텍스트</p>
          <p>{snapshot.dynamicContext.join(' · ')}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[9px] text-muted-foreground">
        <Info className="h-3 w-3" />
        <span>
          {snapshot.estimator.calibrated
            ? `실제 사용량으로 보정된 ${snapshot.estimator.charsPerToken.toFixed(2)}자/토큰 추정`
            : `모델 토크나이저 없음 · ${snapshot.estimator.charsPerToken.toFixed(1)}자/토큰 추정`}
          {snapshot.model.contextWindowSource === 'fallback' ? ' · 컨텍스트 한도 기본값' : ''}
        </span>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex min-h-48 items-center justify-center gap-2 text-xs text-muted-foreground" role="status">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      현재 컨텍스트를 계산하는 중…
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center">
      <p className="text-xs font-medium">컨텍스트 사용량을 계산하지 못했습니다.</p>
      {error ? <p className="mt-1 max-w-full break-words text-[10px] text-muted-foreground">{error}</p> : null}
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] hover:bg-accent"
      >
        <RefreshCw className="h-3 w-3" />
        다시 시도
      </button>
    </div>
  )
}
