'use client';

/**
 * CoworkPanel
 *
 * Cowork 모드의 Task Board UI 플러그인
 * 작업 계획, 태스크 진행 상태, 토큰 예산을 시각화합니다.
 */

import type { CoworkPlan, CoworkTaskStatus } from '@/lib/domains/agent/types';
import { useTranslation } from 'react-i18next';

interface CoworkPanelProps {
  plan: CoworkPlan;
  teamStatus: 'idle' | 'planning' | 'executing' | 'synthesizing';
  tokensConsumed?: number;
  totalTokenBudget?: number;
}

const STATUS_ICONS: Record<CoworkTaskStatus, string> = {
  pending: '⏳',
  in_progress: '🔄',
  completed: '✅',
  failed: '❌',
  skipped: '⏭️',
};

const TEAM_STATUS_LABELS: Record<string, string> = {
  idle: '대기',
  planning: '계획 수립 중',
  executing: '실행 중',
  synthesizing: '결과 종합 중',
};

export function CoworkPanel({
  plan,
  teamStatus,
  tokensConsumed = 0,
  totalTokenBudget = 200000,
}: CoworkPanelProps) {
  const { t } = useTranslation();

  const completedCount = plan.tasks.filter((t) => t.status === 'completed').length;
  const failedCount = plan.tasks.filter((t) => t.status === 'failed').length;
  const totalCount = plan.tasks.length;
  const tokenPercent = totalTokenBudget > 0 ? (tokensConsumed / totalTokenBudget) * 100 : 0;

  return (
    <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <span>🤝</span>
          <span>{t('cowork.panel.title', '팀 작업 현황')}</span>
          <span className="text-muted-foreground font-normal">
            ({completedCount + failedCount}/{totalCount})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] text-muted-foreground">
            {TEAM_STATUS_LABELS[teamStatus] || teamStatus}
          </span>
        </div>
      </div>

      {/* Objective */}
      <div className="mb-2 text-xs text-muted-foreground bg-background/50 rounded px-2 py-1.5">
        <span className="font-medium text-foreground">{t('cowork.panel.objective', '목표')}:</span>{' '}
        {plan.objective}
      </div>

      {/* Task List */}
      <div className="space-y-1">
        {plan.tasks.map((task, index) => {
          const isActive = task.status === 'in_progress';
          const depLabels = task.dependencies
            .map((depId) => {
              const depTask = plan.tasks.find((t) => t.id === depId);
              return depTask ? `Task ${plan.tasks.indexOf(depTask) + 1}` : depId;
            })
            .join(', ');

          return (
            <div
              key={task.id}
              className={`flex items-start gap-2 text-xs rounded px-2 py-1 ${
                isActive
                  ? 'bg-primary/10 border border-primary/20'
                  : task.status === 'completed'
                    ? 'opacity-70'
                    : ''
              }`}
            >
              <span className="mt-0.5 shrink-0">{STATUS_ICONS[task.status]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`font-medium ${isActive ? 'text-primary' : ''}`}>
                    Task {index + 1}: {task.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                  <span>{task.agentType}</span>
                  {isActive && <span className="animate-pulse">진행 중...</span>}
                  {task.status === 'completed' && task.completedAt && task.startedAt && (
                    <span>
                      {Math.round(
                        (new Date(task.completedAt).getTime() -
                          new Date(task.startedAt).getTime()) /
                          1000
                      )}
                      s
                    </span>
                  )}
                  {task.status === 'pending' && depLabels && (
                    <span>
                      {t('cowork.panel.waitingFor', '대기')} ({depLabels}{' '}
                      {t('cowork.panel.dependency', '의존')})
                    </span>
                  )}
                  {task.status === 'failed' && task.error && (
                    <span className="text-destructive truncate max-w-[200px]">{task.error}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Token Budget */}
      {totalTokenBudget > 0 && (
        <div className="mt-2 pt-2 border-t border-border/30">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>
              {t('cowork.panel.tokens', '토큰')}: {tokensConsumed.toLocaleString()} /{' '}
              {totalTokenBudget.toLocaleString()}
            </span>
            <span>{tokenPercent.toFixed(1)}%</span>
          </div>
          <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(tokenPercent, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
