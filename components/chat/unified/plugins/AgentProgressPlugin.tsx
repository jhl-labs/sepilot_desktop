'use client';

/**
 * AgentProgressPlugin
 *
 * Agent 진행 상태 표시 (Browser, Editor)
 * Iteration, status, message, progress bar
 */

import { Button } from '@/components/ui/button';
import type { PluginProps } from '../types';

interface AgentProgress {
  iteration: number;
  maxIterations: number;
  status: string;
  message: string;
}

interface AgentProgressPluginProps extends PluginProps {
  progress: AgentProgress | null;
  onStop: () => void;
}

export function AgentProgressPlugin({ progress, onStop, config }: AgentProgressPluginProps) {
  if (!progress) {
    return null;
  }

  const { mode } = config;
  const isCompact = mode === 'browser';

  return (
    <div
      className={`${isCompact ? 'mb-1.5' : 'mb-2'} ${isCompact ? 'rounded-md' : 'rounded-lg'} border border-primary/30 bg-primary/5 ${isCompact ? 'px-2 py-1' : 'px-3 py-2'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div
            className={`flex items-center gap-2 ${isCompact ? 'text-[10px]' : 'text-xs'} font-medium text-primary`}
          >
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
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
            className={`mt-1 ${isCompact ? 'text-[10px]' : 'text-xs'} text-muted-foreground truncate`}
          >
            {progress.message}
          </p>
        </div>
        <Button
          onClick={onStop}
          variant="ghost"
          size="sm"
          className={`${isCompact ? 'h-5 px-2 text-[10px]' : 'h-6 text-xs'} shrink-0`}
          title="중단"
        >
          중단
        </Button>
      </div>

      {/* Progress bar */}
      <div className={`${isCompact ? 'mt-1' : 'mt-2'} h-1 w-full bg-muted rounded-full overflow-hidden`}>
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{
            width: `${(progress.iteration / progress.maxIterations) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
