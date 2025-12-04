'use client';

/**
 * AgentProgressPlugin
 *
 * Agent 진행 상태 표시 플러그인
 * Browser Chat, Editor Chat에서 사용
 */

import { Button } from '@/components/ui/button';

interface AgentProgress {
  iteration: number;
  maxIterations: number;
  status: string;
  message: string;
}

interface AgentProgressPluginProps {
  progress: AgentProgress | null;
  onStop?: () => void;
  compact?: boolean;
}

export function AgentProgressPlugin({
  progress,
  onStop,
  compact = false,
}: AgentProgressPluginProps) {
  if (!progress) {
    return null;
  }

  return (
    <div
      className={`${compact ? 'mb-1.5' : 'mb-2'} rounded-${compact ? 'md' : 'lg'} border border-primary/30 bg-primary/5 px-${compact ? '2' : '3'} py-${compact ? '1' : '2'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div
            className={`flex items-center gap-2 ${compact ? 'text-[10px]' : 'text-xs'} font-medium text-primary`}
          >
            <div
              className={`${compact ? 'h-1.5 w-1.5' : 'h-2 w-2'} rounded-full bg-primary animate-pulse`}
            />
            <span>
              {progress.status === 'thinking' && '🤔 생각 중...'}
              {progress.status === 'executing' && '⚙️ 실행 중...'}
              {progress.status !== 'thinking' && progress.status !== 'executing' && '🔄 작업 중...'}
            </span>
            <span className="text-muted-foreground">
              ({progress.iteration}/{progress.maxIterations})
            </span>
          </div>
          <p
            className={`mt-1 ${compact ? 'text-[10px]' : 'text-xs'} text-muted-foreground truncate`}
          >
            {progress.message}
          </p>
        </div>
        {onStop && (
          <Button
            onClick={onStop}
            variant="ghost"
            size="sm"
            className={`${compact ? 'h-5 px-2 text-[10px]' : 'h-6 text-xs'} shrink-0`}
            title="중단"
          >
            중단
          </Button>
        )}
      </div>
      {/* Progress bar */}
      {!compact && (
        <div className="mt-2 h-1 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{
              width: `${(progress.iteration / progress.maxIterations) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
