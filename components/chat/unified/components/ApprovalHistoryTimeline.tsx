'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ApprovalHistoryEntry } from '@/types';

interface ApprovalHistoryTimelineProps {
  entries: ApprovalHistoryEntry[];
  className?: string;
  maxItems?: number;
}

const DECISION_META: Record<
  ApprovalHistoryEntry['decision'],
  { badgeClass: string; dotClass: string }
> = {
  approved: {
    badgeClass: 'bg-green-500/15 text-green-700 dark:text-green-400',
    dotClass: 'bg-green-500',
  },
  feedback: {
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    dotClass: 'bg-amber-500',
  },
  denied: {
    badgeClass: 'bg-destructive/15 text-destructive',
    dotClass: 'bg-destructive',
  },
};

function formatTimelineTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ApprovalHistoryTimeline({
  entries,
  className,
  maxItems = 8,
}: ApprovalHistoryTimelineProps) {
  const { t } = useTranslation();

  if (!entries.length) {
    return null;
  }

  const visibleEntries = entries.slice(-maxItems).reverse();

  return (
    <div className={cn('mt-2 rounded-md border border-primary/20 bg-background/60 p-2', className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium text-foreground/90">
          {t('unifiedInput.agentProgress.timeline.title')}
        </p>
        <span className="text-[10px] text-muted-foreground">
          {t('unifiedInput.agentProgress.timeline.count', {
            visible: visibleEntries.length,
            total: entries.length,
          })}
        </span>
      </div>

      <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
        {visibleEntries.map((entry) => {
          const meta = DECISION_META[entry.decision] || DECISION_META.feedback;
          const decisionLabel = t(
            `unifiedInput.agentProgress.timeline.decisions.${entry.decision}`
          );
          const sourceLabel = t(`unifiedInput.agentProgress.timeline.sources.${entry.source}`);

          return (
            <div key={entry.id} className="relative pl-3">
              <span
                className={cn('absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full', meta.dotClass)}
              />
              <div className="flex flex-wrap items-center gap-1">
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', meta.badgeClass)}>
                  {decisionLabel}
                </span>
                <span className="text-[10px] text-muted-foreground">{sourceLabel}</span>
                {entry.riskLevel && (
                  <span className="text-[10px] text-muted-foreground">
                    {t('unifiedInput.agentProgress.timeline.risk', { level: entry.riskLevel })}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {formatTimelineTime(entry.timestamp)}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{entry.summary}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
