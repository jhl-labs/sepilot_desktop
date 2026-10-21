import { AlertTriangle, CheckCircle2, Database, LoaderCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

export interface SemanticPipelineStatusValue {
  status?: 'disabled' | 'ready' | 'backfilling' | 'degraded' | 'reindex_required'
  configuredProviderId?: string
  configuredModel?: string
  indexedProviderId?: string
  indexedModel?: string
  dimensions?: number
  dimension?: number
  pendingCount?: number
  failedCount?: number
  vectorBackend?: string
  engine?: string
  backendAvailable?: boolean
  documents?: number
  lastError?: string
}

const STATUS_COPY = {
  disabled: { label: '키워드 검색만 사용', tone: 'muted' },
  ready: { label: '정상', tone: 'success' },
  backfilling: { label: '인덱싱 중', tone: 'progress' },
  degraded: { label: '점검 필요', tone: 'danger' },
  reindex_required: { label: '재인덱싱 필요', tone: 'warning' },
} as const

function stepTone(active: boolean, attention = false): string {
  if (attention) return 'border-amber-500/30 bg-amber-500/[0.06] text-amber-700 dark:text-amber-300'
  if (active) return 'border-emerald-500/30 bg-emerald-500/[0.05] text-foreground'
  return 'border-border bg-muted/20 text-muted-foreground'
}

export function SemanticPipelineStatus({
  value,
  loading = false,
  actionLabel,
  actionPending = false,
  onAction,
}: {
  value: SemanticPipelineStatusValue | null
  loading?: boolean
  actionLabel?: string
  actionPending?: boolean
  onAction?: () => void
}) {
  const status = value?.status
  const copy = status ? STATUS_COPY[status] : null
  const backend = value?.vectorBackend ?? value?.engine ?? '미확인'
  const configuredEmbedding = [value?.configuredProviderId, value?.configuredModel]
    .filter(Boolean)
    .join(' / ')
  const indexedEmbedding = [value?.indexedProviderId, value?.indexedModel]
    .filter(Boolean)
    .join(' / ')
  const embeddingMismatch = Boolean(
    configuredEmbedding && indexedEmbedding && configuredEmbedding !== indexedEmbedding,
  )
  const semanticReady = status === 'ready' || status === 'backfilling'
  const dimensions = value?.dimensions ?? value?.dimension

  return (
    <section className="rounded-md border border-border/70 bg-muted/15 p-3" aria-label="시맨틱 검색 파이프라인 상태">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">시맨틱 검색 파이프라인</span>
          {loading ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <LoaderCircle className="h-3 w-3 animate-spin" />확인 중
            </span>
          ) : copy ? (
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                copy.tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                copy.tone === 'progress' && 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
                copy.tone === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                copy.tone === 'danger' && 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
                copy.tone === 'muted' && 'border-border bg-muted text-muted-foreground',
              )}
            >
              {copy.label}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">상태 미확인</span>
          )}
        </div>
        {onAction && actionLabel ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onAction}
            disabled={actionPending || loading}
            className="h-7 text-xs"
          >
            {actionPending ? '확인 중…' : actionLabel}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <div className={cn('rounded-md border p-2', stepTone(Boolean(configuredEmbedding)))}>
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <CheckCircle2 className="h-3 w-3" />1 · Embedding
          </div>
          <p className="truncate text-xs" title={configuredEmbedding || undefined}>
            {configuredEmbedding || 'provider/model 미설정'}
          </p>
        </div>
        <div className={cn('rounded-md border p-2', stepTone(value?.backendAvailable !== false && Boolean(status), embeddingMismatch))}>
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Database className="h-3 w-3" />2 · Vector index
          </div>
          <p className="truncate text-xs">
            {backend}
            {value?.documents != null ? ` · 문서 ${value.documents}개` : ''}
          </p>
        </div>
        <div className={cn('rounded-md border p-2', stepTone(semanticReady, status === 'degraded' || status === 'reindex_required'))}>
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Search className="h-3 w-3" />3 · Retrieval
          </div>
          <p className="truncate text-xs">
            {semanticReady ? 'Hybrid semantic 검색' : 'Keyword fallback'}
          </p>
        </div>
      </div>

      {embeddingMismatch || (value?.failedCount ?? 0) > 0 || value?.lastError ? (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-500/[0.07] px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {value?.lastError
              ?? (embeddingMismatch
                ? `현재 설정(${configuredEmbedding})과 인덱스(${indexedEmbedding})가 다릅니다.`
                : `임베딩 실패 ${(value?.failedCount ?? 0)}건을 확인하세요.`)}
          </span>
        </div>
      ) : null}

      {value && ((value.pendingCount ?? 0) > 0 || dimensions) ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {(value.pendingCount ?? 0) > 0 ? `대기 ${value.pendingCount}건 · ` : ''}
          {dimensions ? `${dimensions}차원` : ''}
        </p>
      ) : null}
    </section>
  )
}
