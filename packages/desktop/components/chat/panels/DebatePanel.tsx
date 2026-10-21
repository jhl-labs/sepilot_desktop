'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type {
  DebateDecision,
  DebateRoundSummary,
} from '@sepilotd/api-client/daemon/types'
import { cn } from '@/lib/utils/cn'

interface Props {
  rounds: DebateRoundSummary[]
  maxRows?: number
}

const DECISION_CLASS: Record<DebateDecision, string> = {
  accept: 'text-emerald-600 dark:text-emerald-400',
  revise: 'text-amber-600 dark:text-amber-400',
  reject: 'text-red-600 dark:text-red-400',
}

const DECISION_GLYPH: Record<DebateDecision, string> = {
  accept: '✓',
  revise: '↺',
  reject: '✗',
}

function truncate(text: string, max = 120): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export function DebatePanel({ rounds, maxRows = 4 }: Props) {
  const [expanded, setExpanded] = useState(false)
  const ordered = [...rounds].reverse()
  const recent = expanded ? ordered : ordered.slice(0, maxRows)
  const hidden = ordered.length - recent.length
  if (recent.length === 0) return null
  const canToggle =
    ordered.length > maxRows
    || ordered.some((round) =>
      round.entries.some((e) => e.content.length > 120)
      || round.topic.length > 80
      || (round.rationale ?? '').length > 120,
    )

  return (
    <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/[0.03] p-2 text-xs">
      <div className="mb-1.5 flex items-baseline justify-between gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-600 dark:text-fuchsia-400">
          Debate
        </span>
        {canToggle ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-fuchsia-600 hover:bg-fuchsia-500/10 dark:text-fuchsia-400"
            aria-label={expanded ? '논의 접기' : '논의 펼치기'}
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
      <ul className="space-y-2">
        {recent.map((round) => {
          const proposer = round.entries.find((e) => e.role === 'proposer')
          const critic = round.entries.find((e) => e.role === 'critic')
          const wrapClass = expanded
            ? 'whitespace-pre-wrap break-words'
            : 'truncate'
          return (
            <li
              key={round.roundId}
              className="rounded-md border border-fuchsia-500/15 bg-background/40 p-1.5"
            >
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'shrink-0 font-mono text-[12px] font-semibold',
                    DECISION_CLASS[round.finalDecision],
                  )}
                >
                  {DECISION_GLYPH[round.finalDecision]}{' '}
                  {round.finalDecision.toUpperCase()}
                </span>
                <span className={cn('text-muted-foreground', wrapClass)}>
                  {expanded ? round.topic : truncate(round.topic, 80)}
                </span>
              </div>
              {proposer ? (
                <p
                  className={cn(
                    'mt-1 text-[11px] text-sky-600 dark:text-sky-400',
                    wrapClass,
                  )}
                >
                  proposer: {expanded ? proposer.content : truncate(proposer.content)}
                </p>
              ) : null}
              {critic ? (
                <p
                  className={cn(
                    'mt-0.5 text-[11px] text-amber-600 dark:text-amber-400',
                    wrapClass,
                  )}
                >
                  critic: {expanded ? critic.content : truncate(critic.content)}
                </p>
              ) : null}
              {round.rationale ? (
                <p className={cn('mt-0.5 text-[11px]', wrapClass)}>
                  final: {expanded ? round.rationale : truncate(round.rationale)}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
      {hidden > 0 ? (
        <p className="mt-1 text-[10px] text-muted-foreground">
          +{hidden}개 라운드 더…
        </p>
      ) : null}
    </div>
  )
}
