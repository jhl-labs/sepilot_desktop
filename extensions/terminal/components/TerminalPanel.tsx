/**
 * Terminal Panel Component
 *
 * AI 터미널 - 세션 탭 + xterm.js 터미널 + AI 입력창
 */

'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, History } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { InteractiveTerminal } from './InteractiveTerminal';
import { AICommandInput } from './AICommandInput';
import { SessionTabBar } from './SessionTabBar';
import { logger } from '@/lib/utils/logger';

interface TerminalPanelProps {
  workingDirectory?: string;
}

export function TerminalPanel({ workingDirectory }: TerminalPanelProps) {
  const store = useChatStore();
  const {
    currentCwd,
    activeSessionId,
    setCurrentCwd,
    setTerminalAgentIsRunning,
    terminalAgentIsRunning,
    toggleHistory,
  } = store as any;

  const sessions = (store as any).sessions || [];
  const activeSession = sessions.find((s: any) => s.id === activeSessionId);

  const hasInitialized = useRef(false);

  // Working directory 초기화
  useEffect(() => {
    if (workingDirectory && workingDirectory !== currentCwd) {
      setCurrentCwd(workingDirectory);
    }
  }, [workingDirectory, currentCwd, setCurrentCwd]);

  // 초기 세션 생성 (한 번만)
  useEffect(() => {
    if (hasInitialized.current) return;
    if (sessions.length > 0) {
      hasInitialized.current = true;
      return;
    }

    hasInitialized.current = true;

    const createInitialSession = async () => {
      if (!window.electronAPI?.terminal) return;

      try {
        logger.info('[TerminalPanel] Creating initial session...');
        const result = await window.electronAPI.terminal.createSession(
          workingDirectory || undefined,
          120,
          30
        );

        if (result.success && result.data) {
          const createTerminalSession = (store as any).createTerminalSession;
          if (createTerminalSession) {
            createTerminalSession({
              name: 'Terminal 1',
              ptySessionId: result.data.sessionId,
              cwd: result.data.cwd,
              shell: result.data.shell,
            });
            logger.info('[TerminalPanel] Initial session created:', result.data.sessionId);
          }
        }
      } catch (error) {
        logger.error('[TerminalPanel] Failed to create session:', error);
      }
    };

    createInitialSession();
  }, [sessions.length, workingDirectory, store]);

  // AI 명령어를 터미널에 전송
  const sendCommand = useCallback(
    async (command: string) => {
      if (!activeSession?.ptySessionId) {
        logger.error('[TerminalPanel] No active session');
        return;
      }

      try {
        await window.electronAPI?.terminal?.write(activeSession.ptySessionId, command + '\r');
      } catch (error) {
        logger.error('[TerminalPanel] Failed to send command:', error);
      }
    },
    [activeSession?.ptySessionId]
  );

  // AI 명령어 처리
  const handleAICommand = useCallback(
    async (naturalInput: string) => {
      if (!window.electronAPI?.terminal) return;

      setTerminalAgentIsRunning(true);

      try {
        const result = await window.electronAPI.terminal.aiCommand(
          naturalInput,
          currentCwd || workingDirectory,
          []
        );

        if (result.success && result.data?.command) {
          await sendCommand(result.data.command);
        } else if (result.success && result.data?.textResponse) {
          if (activeSession?.ptySessionId) {
            await window.electronAPI.terminal.write(
              activeSession.ptySessionId,
              `\r\n\x1b[36m[AI]\x1b[0m ${result.data.textResponse}\r\n`
            );
          }
        } else if (!result.success) {
          if (activeSession?.ptySessionId) {
            await window.electronAPI.terminal.write(
              activeSession.ptySessionId,
              `\r\n\x1b[31m[AI Error]\x1b[0m ${result.error || 'Failed'}\r\n`
            );
          }
        }
      } catch (error) {
        logger.error('[TerminalPanel] AI command failed:', error);
      } finally {
        setTerminalAgentIsRunning(false);
      }
    },
    [
      currentCwd,
      workingDirectory,
      activeSession?.ptySessionId,
      sendCommand,
      setTerminalAgentIsRunning,
    ]
  );

  const handleSubmit = useCallback(
    (input: string, mode: 'natural' | 'direct') => {
      if (mode === 'natural') {
        handleAICommand(input);
      } else {
        sendCommand(input);
      }
    },
    [handleAICommand, sendCommand]
  );

  // 터미널 클리어
  const handleClear = useCallback(async () => {
    if (!activeSession?.ptySessionId) return;
    await window.electronAPI?.terminal?.write(activeSession.ptySessionId, '\x1b[2J\x1b[H');
  }, [activeSession?.ptySessionId]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 헤더 */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">AI Terminal</h2>
          <span className="text-xs text-muted-foreground font-mono truncate max-w-[300px]">
            {activeSession?.cwd || currentCwd || workingDirectory || '~'}
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={toggleHistory}
            title="히스토리"
          >
            <History className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={handleClear}
            title="클리어"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 세션 탭 */}
      <SessionTabBar />

      {/* 터미널 영역 */}
      <div className="flex-1 min-h-0">
        {activeSession ? (
          <InteractiveTerminal
            key={activeSession.ptySessionId} // 세션 변경 시 완전히 재생성
            ptySessionId={activeSession.ptySessionId}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">터미널 세션을 시작하는 중...</p>
          </div>
        )}
      </div>

      {/* AI 입력 */}
      <AICommandInput
        onSubmit={handleSubmit}
        isLoading={terminalAgentIsRunning}
        currentCwd={activeSession?.cwd || currentCwd || workingDirectory || ''}
      />
    </div>
  );
}
