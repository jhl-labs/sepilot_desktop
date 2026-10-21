'use client'
import { useEffect, useState } from 'react'
import { Brain, ChevronRight, Info } from 'lucide-react'
import { summarizeLatestReasoningStep } from '@/lib/chat/reasoning-live-line'
import type { ReasoningEntry } from '@/lib/store/chat-store'
import { cn } from '@/lib/utils/cn'

interface Props {
  steps: ReasoningEntry[]
  durationMs?: number
  startedAt?: number
}

const STALE_AFTER_SECONDS = 20
const LIVE_TICK_MS = 1000

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}초`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest > 0 ? `${minutes}분 ${rest}초` : `${minutes}분`
}

function useLiveNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), LIVE_TICK_MS)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

export function ReasoningCard({ steps, durationMs, startedAt }: Props) {
  const [expanded, setExpanded] = useState(false)
  const inProgress = durationMs == null
  const visibleSteps = steps.filter((step) => !isRoutingStep(step))
  const routingSteps = steps.filter(isRoutingStep)
  const stepCount = visibleSteps.length
  const now = useLiveNow(inProgress)
  const liveLine = inProgress
    ? summarizeLatestReasoningStep(visibleSteps)
      ?? (visibleSteps.at(-1)?.kind === 'thinking' ? '모델 응답 생성 중' : null)
    : null
  const elapsedSeconds = inProgress && startedAt != null
    ? Math.max(0, Math.floor((now - startedAt) / 1000))
    : null
  const latestAt = visibleSteps[visibleSteps.length - 1]?.at
  const staleSeconds = inProgress && latestAt != null
    ? Math.max(0, Math.floor((now - latestAt) / 1000))
    : null

  if (visibleSteps.length === 0) {
    if (!inProgress) return null
    return (
      <div
        role="status"
        className="mb-1.5 flex min-h-6 items-center gap-1.5 px-1 text-[10px] text-muted-foreground"
      >
        <Brain
          aria-hidden
          className="h-3 w-3 motion-safe:animate-pulse text-violet-500 dark:text-violet-400"
        />
        요청 파악 중
      </div>
    )
  }

  const statusLabel = inProgress
    ? [
        '작업 중',
        liveLine,
        elapsedSeconds != null ? formatElapsed(elapsedSeconds) : null,
        staleSeconds != null && staleSeconds >= STALE_AFTER_SECONDS
          ? `마지막 업데이트 ${formatElapsed(staleSeconds)} 전`
          : null,
        `${stepCount}개 기록`,
      ].filter(Boolean).join(' · ')
    : `작업 로그 · ${stepCount}개${formatDuration(durationMs)}`

  return (
    <div className="mb-1.5 rounded-lg border border-border/60 bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted/60"
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <Brain
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            inProgress
              ? 'motion-safe:animate-pulse text-violet-500 dark:text-violet-400'
              : 'text-muted-foreground',
          )}
        />
        <span
          role={inProgress ? 'status' : undefined}
          aria-live={inProgress ? 'polite' : undefined}
          title={statusLabel}
          className={cn(
            'min-w-0 flex-1 truncate font-medium',
            inProgress ? 'text-violet-700 dark:text-violet-300' : 'text-muted-foreground',
          )}
        >
          {statusLabel}
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-border/60">
          <ol className="space-y-1.5 px-2.5 py-1.5">
          {visibleSteps.map((step, idx) => (
            <li key={idx} className="flex gap-2">
              <span
                className="mt-0.5 shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground/70"
                aria-hidden
              >
                {String(idx + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'font-medium',
                    step.kind === 'step'
                      ? 'text-foreground'
                      : 'text-violet-700 dark:text-violet-300',
                  )}
                >
                  {step.label}
                </div>
                {step.detail ? (
                  <pre className="mt-1 max-h-72 max-w-full overflow-auto overscroll-contain whitespace-pre-wrap break-all rounded bg-background/60 px-2 py-1.5 font-mono text-[11px] leading-5 text-muted-foreground [contain:content]">
                    {step.detail}
                  </pre>
                ) : null}
                {step.truncated ? (
                  <p className="mt-1 text-[10px] leading-4 text-amber-700 dark:text-amber-300">
                    내부 기록이 길어 {step.originalChars?.toLocaleString() ?? '여러'}자 중 화면에 필요한
                    부분만 표시합니다.
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
          {routingSteps.length > 0 ? (
            <div className="border-t border-border/50 px-2.5 py-1.5">
              <div className="mb-1 text-[10px] font-medium text-muted-foreground/70">내부 경로</div>
              <ul className="space-y-1 text-[10px] text-muted-foreground/80">
                {routingSteps.map((step, index) => (
                  <li key={`${step.label}-${index}`}>
                    {step.label}
                    {step.detail ? ` — ${step.detail.replace(/\s+/g, ' ')}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="flex gap-1.5 border-t border-border/50 px-2.5 py-1.5 text-[10px] leading-4 text-muted-foreground">
            <Info aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />이 기록은 응답을 준비한
            경로이며, 파일 생성이나 명령 실행의 성공을 뜻하지 않습니다.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function isRoutingStep(step: ReasoningEntry): boolean {
  return step.kind === 'step' && (step.label.startsWith('라우터:') || step.label.startsWith('그래프:'))
}

function formatDuration(ms: number | undefined): string {
  if (ms == null || ms <= 0) return ''
  const seconds = ms / 1000
  if (seconds < 1) return ' · 1초 미만'
  return ` · ${seconds.toFixed(seconds < 10 ? 1 : 0)}초`
}
