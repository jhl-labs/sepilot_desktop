'use client';

/**
 * AgentLogsPlugin
 *
 * Agent 실행 로그 표시 플러그인
 * Browser Chat에서 사용
 */

import { Brain, Wrench, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { BrowserAgentLogEntry } from '@sepilot/extension-browser';

interface AgentLogsPluginProps {
  logs: BrowserAgentLogEntry[];
  isRunning: boolean;
  maxLogs?: number;
}

export function AgentLogsPlugin({ logs, isRunning, maxLogs = 3 }: AgentLogsPluginProps) {
  if (logs.length === 0) {
    return null;
  }

  const displayLogs = logs.slice(-maxLogs);

  return (
    <div className="max-w-[95%] rounded-md px-2 py-1.5 bg-muted/50 border border-muted-foreground/10">
      <div className="flex items-center gap-1.5 mb-1 text-[10px] font-semibold text-muted-foreground">
        <Brain className="h-2.5 w-2.5" />
        <span>실행 과정</span>
        {isRunning && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      </div>
      <div className="space-y-0.5 text-[10px]">
        {displayLogs.map((log) => (
          <div key={log.id} className="flex items-start gap-1.5">
            {log.phase === 'thinking' && (
              <Brain className="h-2.5 w-2.5 mt-0.5 text-blue-500 shrink-0" />
            )}
            {log.phase === 'tool_call' && (
              <Wrench className="h-2.5 w-2.5 mt-0.5 text-purple-500 shrink-0" />
            )}
            {log.phase === 'tool_result' && (
              <CheckCircle2 className="h-2.5 w-2.5 mt-0.5 text-green-500 shrink-0" />
            )}
            {log.phase === 'error' && (
              <XCircle className="h-2.5 w-2.5 mt-0.5 text-red-500 shrink-0" />
            )}
            {log.phase === 'completion' && (
              <CheckCircle2 className="h-2.5 w-2.5 mt-0.5 text-green-500 shrink-0" />
            )}
            <div className="flex-1 min-w-0 leading-tight">
              <span className="text-foreground/70">{log.message}</span>
              {log.details?.toolName && (
                <span className="ml-1 text-muted-foreground/60">({log.details.toolName})</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
