'use client'
import { useId, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileCode2,
  RotateCcw,
} from 'lucide-react'
import type { EditCheckpointSummary } from '@sepilotd/api-client/daemon/types'
import { cn } from '@/lib/utils/cn'

interface Props {
  checkpoints: EditCheckpointSummary[]
  maxRows?: number
}

const STATUS_LABEL: Record<EditCheckpointSummary['status'], string> = {
  open: '진행 중',
  committed: '완료',
  reverted: '되돌림',
}

const STATUS_CLASS: Record<EditCheckpointSummary['status'], string> = {
  open: 'text-amber-700 dark:text-amber-300',
  committed: 'text-emerald-700 dark:text-emerald-300',
  reverted: 'text-destructive',
}

function visibleCheckpoints(
  ordered: EditCheckpointSummary[],
  maxRows: number,
): EditCheckpointSummary[] {
  const recentIds = new Set(
    ordered.slice(0, Math.max(1, maxRows)).map((checkpoint) => checkpoint.checkpointId),
  )
  return ordered.filter(
    (checkpoint) => checkpoint.status !== 'committed' || recentIds.has(checkpoint.checkpointId),
  )
}

export function EditRollbackPanel({ checkpoints, maxRows = 6 }: Props) {
  const [expanded, setExpanded] = useState(false)
  const detailId = useId()
  if (checkpoints.length === 0) return null

  const ordered = [...checkpoints].reverse()
  const recent = visibleCheckpoints(ordered, maxRows)
  const hidden = ordered.length - recent.length
  const openCount = checkpoints.filter((checkpoint) => checkpoint.status === 'open').length
  const revertedCount = checkpoints.filter(
    (checkpoint) => checkpoint.status === 'reverted',
  ).length
  const committedCount = checkpoints.length - openCount - revertedCount
  const fileCount = new Set(
    checkpoints.flatMap((checkpoint) => checkpoint.files.map((file) => file.path)),
  ).size
  const hasAlert = revertedCount > 0
  const hasActive = openCount > 0
  const summaryLabel = [
    `편집 체크포인트 ${checkpoints.length}개`,
    `진행 중 ${openCount}개`,
    `되돌림 ${revertedCount}개`,
    `완료 ${committedCount}개`,
    `영향 파일 ${fileCount}개`,
  ].join(', ')

  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border border-l-2 bg-background/75 text-xs',
        hasAlert
          ? 'border-destructive/35 border-l-destructive'
          : hasActive
            ? 'border-amber-500/35 border-l-amber-500'
            : 'border-border/80 border-l-emerald-500/70',
      )}
      aria-label="편집 체크포인트"
    >
      <button
        type="button"
        className="flex h-8 w-full min-w-0 items-center gap-1.5 px-2 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-label={`${summaryLabel}, 상세 ${expanded ? '접기' : '펼치기'}`}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="min-w-0 truncate font-medium text-foreground">편집 기록</span>
        <span className="shrink-0 rounded border border-border/80 bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {checkpoints.length}개
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {openCount > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-700 dark:text-amber-300">
              <CircleDot aria-hidden className="h-2.5 w-2.5" />
              진행 {openCount}
            </span>
          ) : null}
          {revertedCount > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded border border-destructive/30 bg-destructive/[0.08] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-destructive">
              <RotateCcw aria-hidden className="h-2.5 w-2.5" />
              되돌림 {revertedCount}
            </span>
          ) : null}
          {committedCount > 0 && !hasActive && !hasAlert ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/[0.07] px-1.5 py-0.5 text-[10px] tabular-nums text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 aria-hidden className="h-2.5 w-2.5" />
              완료 {committedCount}
            </span>
          ) : null}
        </span>

        <span className="inline-flex shrink-0 items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
          <FileCode2 aria-hidden className="h-3 w-3" />
          파일 {fileCount}
        </span>
        {expanded ? (
          <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded ? (
        <div
          id={detailId}
          className="max-h-56 overflow-y-auto border-t border-border/70 bg-muted/[0.12] px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          role="region"
          aria-label="최근 편집 체크포인트 상세"
          tabIndex={0}
        >
          <ul className="divide-y divide-border/60">
            {recent.map((checkpoint) => {
              const visibleFiles = checkpoint.files.slice(0, 4)
              const extraFiles = checkpoint.files.length - visibleFiles.length
              return (
                <li key={checkpoint.checkpointId} className="min-w-0 py-1.5 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'shrink-0 font-mono text-[10px] font-semibold',
                        STATUS_CLASS[checkpoint.status],
                      )}
                    >
                      {STATUS_LABEL[checkpoint.status]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                      {checkpoint.label}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {checkpoint.files.length}개 파일
                    </span>
                  </div>

                  {checkpoint.status === 'reverted' && checkpoint.revertReason ? (
                    <p className="mt-0.5 break-words text-[10px] leading-4 text-destructive">
                      {checkpoint.revertReason}
                    </p>
                  ) : null}

                  {visibleFiles.length > 0 ? (
                    <p className="mt-0.5 truncate font-mono text-[10px] leading-4 text-muted-foreground">
                      {visibleFiles.map((file) => file.path).join(' · ')}
                      {extraFiles > 0 ? ` · +${extraFiles}개` : ''}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {hidden > 0 ? (
            <p className="border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
              완료된 이전 체크포인트 {hidden}개는 요약에 포함됩니다.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
