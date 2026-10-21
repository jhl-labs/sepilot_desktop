'use client'

import { Activity, Bot, CornerDownRight, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { useChatModeStore } from '@/lib/store/chat-mode-store'
import { useChatStore } from '@/lib/store/chat-store'
import { useSessionStore } from '@/lib/store/session-store'
import { useRunTelemetryStore } from '@/lib/store/run-telemetry-store'
import { cn } from '@/lib/utils/cn'
import { formatTokens } from '@/lib/utils/token-counter'

const AUTONOMY_LABEL = {
  readonly: '읽기 전용',
  'accept-edits': '편집 자동 수락',
  'workspace-write': '작업공간 쓰기',
  supervised: '감독',
  autonomous: '자동',
} as const

export function RunTelemetryBar({
  onCancelSteering,
}: {
  onCancelSteering?: () => void | Promise<void>
} = {}) {
  const executionPolicy = useRunTelemetryStore((state) => state.executionPolicy)
  const routing = useRunTelemetryStore((state) => state.routing)
  const runSessionId = useRunTelemetryStore((state) => state.sessionId)
  const activeId = useSessionStore((state) => state.activeId)
  const localPending = useChatStore((state) => state.pending)
  const remoteRunning = useSessionStore((state) => state.sessions.find(session => session.id === state.activeId)?.isRunning)
  const pending = localPending || remoteRunning === true
  const bots = useChatModeStore((state) => state.bots)
  const roleBot = bots.find(bot => bot.id === routing?.persona)
  const contextUsage = useRunTelemetryStore((state) => state.contextUsage)
  const qualityGate = useRunTelemetryStore((state) => state.qualityGate)
  const steeringNotes = useRunTelemetryStore((state) => state.steeringNotes)

  if (runSessionId !== activeId) return null
  if (!routing && !pending && !executionPolicy && !contextUsage && !qualityGate && steeringNotes.length === 0) return null

  const queuedSteering = steeringNotes.filter((note) => note.status === 'queued').length
  const contextPercentage = contextUsage?.contextWindowTokens
    ? Math.min(100, (contextUsage.inputTokens / contextUsage.contextWindowTokens) * 100)
    : null

  return (
    <div
      className={cn(
        'flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border/60 bg-muted/35 px-2 py-1 text-[10px] text-muted-foreground',
        (executionPolicy?.clamped || qualityGate?.decision === 'retry') &&
          'border-amber-500/30 bg-amber-500/[0.05]',
      )}
      role="status"
      aria-label="현재 에이전트 실행 상태"
      data-testid="run-telemetry-bar"
    >
      <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-primary">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15"><Bot className="h-4 w-4" aria-hidden="true" /></span>
        <div>
          <div className="text-xs font-semibold">{routing?.fallback ? '기본 에이전트' : roleBot?.name ?? routing?.persona ?? '봇 확인 중'}</div>
          <div className="flex items-center gap-1 text-[10px]">
            {pending ? <Activity className="h-3 w-3 motion-safe:animate-pulse" /> : null}
            {pending ? routing ? '실행 중' : '라우팅 대기' : '최근 실행'}
            {routing?.mode ? ` · ${routing.mode}` : ''}
            {roleBot ? ` · ${roleBot.category}` : ''}
          </div>
        </div>
      </div>
      {executionPolicy ? (
        <span
          className={cn(
            'inline-flex items-center gap-1 font-medium text-foreground',
            executionPolicy.clamped && 'text-amber-700 dark:text-amber-300',
          )}
          title={executionPolicy.clampReason}
        >
          {executionPolicy.clamped ? (
            <ShieldAlert className="h-3 w-3" />
          ) : (
            <ShieldCheck className="h-3 w-3" />
          )}
          {AUTONOMY_LABEL[executionPolicy.effectiveAutonomy]}
          {executionPolicy.clamped ? '으로 제한됨' : ''}
        </span>
      ) : null}
      {executionPolicy ? (
        <span>{executionPolicy.workspaceBoundary === 'strict' ? '작업공간 경계' : '무제한 경계'}</span>
      ) : null}
      {contextUsage ? (
        <span title={`iteration ${contextUsage.iteration} · ${contextUsage.source}`}>
          컨텍스트 {formatTokens(contextUsage.inputTokens)}
          {contextPercentage == null ? '' : ` (${contextPercentage.toFixed(1)}%)`}
        </span>
      ) : null}
      {qualityGate ? (
        <span
          className={cn(
            qualityGate.decision === 'retry'
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-emerald-700 dark:text-emerald-300',
          )}
          title={qualityGate.blockingReason}
        >
          품질 {qualityGate.phase}: {qualityGate.decision === 'retry' ? '재시도' : '통과'}
        </span>
      ) : null}
      {queuedSteering > 0 ? (
        <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300">
          <CornerDownRight className="h-3 w-3" />
          추가 지시 {queuedSteering}개 대기
          {onCancelSteering ? (
            <button
              type="button"
              onClick={() => void onCancelSteering()}
              className="ml-0.5 inline-flex items-center gap-0.5 rounded px-1 py-0.5 hover:bg-sky-500/10"
              aria-label="최근 추가 지시 취소"
              title="아직 반영되지 않은 최근 추가 지시 취소"
            >
              <X className="h-2.5 w-2.5" />
              취소
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}
