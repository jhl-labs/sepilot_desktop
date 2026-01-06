/**
 * Sidebar Terminal Component
 *
 * 사이드바에 표시되는 Terminal extension 아이콘 및 상태
 */

'use client';

import React from 'react';
import { Terminal, Loader2 } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { cn } from '@/lib/utils';

export function SidebarTerminal() {
  const { terminalBlocks, terminalAgentIsRunning } = useChatStore();

  // 실행 중인 명령어 수 (exitCode가 undefined인 것들)
  const runningCommands = terminalBlocks.filter((block) => block.exitCode === undefined).length;

  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <div className="relative">
        <Terminal className="w-5 h-5" />

        {/* Agent 실행 중 표시 */}
        {terminalAgentIsRunning && (
          <Loader2 className="absolute -top-1 -right-1 w-3 h-3 animate-spin text-primary" />
        )}

        {/* 실행 중인 명령어 수 표시 */}
        {runningCommands > 0 && !terminalAgentIsRunning && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {runningCommands}
          </span>
        )}
      </div>

      {/* 총 명령어 수 */}
      {terminalBlocks.length > 0 && (
        <span className="text-[10px] text-muted-foreground">{terminalBlocks.length}</span>
      )}
    </div>
  );
}
