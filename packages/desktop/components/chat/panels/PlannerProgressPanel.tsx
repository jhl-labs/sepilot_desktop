'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type {
  PlannerHierarchicalStep,
  PlannerStepStatus,
  PlannerWorkingMemory,
} from '@sepilotd/api-client/daemon/types'
import { cn } from '@/lib/utils/cn'

interface Props {
  workingMemory: PlannerWorkingMemory
  maxRows?: number
}

const STATUS_GLYPH: Record<PlannerStepStatus, string> = {
  pending: '○',
  in_progress: '◐',
  done: '●',
  blocked: '!',
  skipped: '⊘',
}

const STATUS_COLOR_CLASS: Record<PlannerStepStatus, string> = {
  pending: 'text-muted-foreground',
  in_progress: 'text-sky-500 dark:text-sky-400',
  done: 'text-emerald-600 dark:text-emerald-400',
  blocked: 'text-red-600 dark:text-red-400',
  skipped: 'text-amber-600 dark:text-amber-400',
}

interface FlatRow {
  key: string
  glyph: string
  colorClass: string
  indent: number
  title: string
  highlight: boolean
}

function flatten(
  steps: PlannerHierarchicalStep[] | undefined,
  currentSubtaskId: string | undefined,
  depth = 0,
  rows: FlatRow[] = [],
): FlatRow[] {
  for (const step of steps ?? []) {
    rows.push({
      key: step.id,
      glyph: STATUS_GLYPH[step.status],
      colorClass: STATUS_COLOR_CLASS[step.status],
      indent: depth,
      title: step.title,
      highlight: step.id === currentSubtaskId,
    })
    if (step.children && step.children.length > 0) {
      flatten(step.children, currentSubtaskId, depth + 1, rows)
    }
  }
  return rows
}

export function PlannerProgressPanel({ workingMemory, maxRows = 12 }: Props) {
  const [expanded, setExpanded] = useState(false)
  const all = flatten(workingMemory.plan, workingMemory.currentSubtaskId)
  const rows = expanded ? all : all.slice(0, maxRows)
  const overflow = all.length - rows.length
  const allRisks = workingMemory.risks ?? []
  const risks = expanded ? allRisks : allRisks.slice(0, 3)
  const hiddenRisks = allRisks.length - risks.length
  const canToggle = all.length > maxRows || allRisks.length > 3

  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-500/[0.03] p-2 text-xs">
      <div className="mb-1.5 flex items-baseline justify-between gap-1.5">
        <span className="font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
          Planner
        </span>
        {workingMemory.taskSummary ? (
          <span
            className={cn(
              'flex-1 text-[11px] text-muted-foreground',
              expanded ? 'whitespace-pre-wrap break-words' : 'truncate',
            )}
          >
            {workingMemory.taskSummary}
          </span>
        ) : null}
        {canToggle ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-sky-600 hover:bg-sky-500/10 dark:text-sky-400"
            aria-label={expanded ? '계획 접기' : '계획 펼치기'}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {expanded ? '접기' : '펼치기'}
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">아직 계획이 없습니다.</p>
      ) : (
        <ul className="space-y-0.5 font-mono text-[11px] leading-4">
          {rows.map((row) => (
            <li
              key={row.key}
              className={cn(
                'flex items-baseline gap-1',
                row.highlight && 'font-semibold',
              )}
              style={{ paddingLeft: `${row.indent * 12}px` }}
            >
              <span className={cn('w-3 shrink-0', row.colorClass)}>
                {row.glyph}
              </span>
              <span className={expanded ? 'break-words' : 'truncate'}>
                {row.title}
              </span>
            </li>
          ))}
        </ul>
      )}

      {overflow > 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          +{overflow}개 단계 더…
        </p>
      ) : null}

      {risks.length > 0 ? (
        <div className="mt-1.5 border-t border-sky-500/20 pt-1.5">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
            Risks
          </div>
          <ul className="space-y-0.5 text-[11px]">
            {risks.map((risk, i) => (
              <li
                key={`r-${i}`}
                className={cn(
                  expanded ? 'break-words' : 'truncate',
                  risk.severity === 'high'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-amber-600 dark:text-amber-400',
                )}
              >
                [{risk.severity}] {risk.text}
              </li>
            ))}
          </ul>
          {hiddenRisks > 0 ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              +{hiddenRisks}개 위험 더…
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
