/**
 * Terminal Panel Component
 *
 * Warp Terminal 스타일의 블록 기반 터미널 UI
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Trash2, History, Settings } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { TerminalBlock } from './TerminalBlock';
import { AICommandInput } from './AICommandInput';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/utils/logger';

interface TerminalPanelProps {
  workingDirectory?: string;
}

export function TerminalPanel({ workingDirectory }: TerminalPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Store에서 상태 가져오기
  const {
    terminalBlocks,
    activeBlockId,
    terminalAgentIsRunning,
    currentCwd,
    addTerminalBlock,
    updateTerminalBlock,
    removeTerminalBlock,
    clearTerminalBlocks,
    setCurrentCwd,
    setTerminalAgentIsRunning,
    toggleHistory,
    loadTerminalHistoryFromStorage,
  } = useChatStore();

  // 히스토리 로드 (컴포넌트 마운트 시 한 번만)
  useEffect(() => {
    loadTerminalHistoryFromStorage();
  }, [loadTerminalHistoryFromStorage]);

  // Working directory 초기화
  useEffect(() => {
    if (workingDirectory && workingDirectory !== currentCwd) {
      setCurrentCwd(workingDirectory);
    }
  }, [workingDirectory, currentCwd, setCurrentCwd]);

  // 블록 추가 시 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalBlocks.length]);

  // 명령어 실행 (직접 또는 AI 생성)
  const handleExecuteCommand = async (command: string, naturalInput?: string) => {
    logger.info('[TerminalPanel] Executing command:', command);

    // 새 블록 생성
    const blockId = addTerminalBlock({
      type: naturalInput ? 'ai-suggestion' : 'command',
      naturalInput,
      command,
      output: '',
      aiGenerated: !!naturalInput,
      cwd: currentCwd || workingDirectory || '',
      sessionId: 'default', // TODO: PTY 세션 ID 연동
      exitCode: undefined,
    });

    try {
      // Main Process에서 명령어 실행 (IPC 필요)
      // TODO: Phase 4에서 실제 PTY Manager 연동 구현
      if (window.electronAPI) {
        // Electron 환경
        const result = await window.electronAPI.invoke('terminal:execute-command', {
          command,
          cwd: currentCwd || workingDirectory,
        });

        updateTerminalBlock(blockId, {
          output: result.stdout + result.stderr,
          exitCode: result.exitCode,
          duration: result.duration,
        });

        // 에러 시 AI 분석 (옵션)
        if (result.exitCode !== 0) {
          // TODO: explain_error tool 호출
        }
      } else {
        // 웹 환경 - 시뮬레이션
        updateTerminalBlock(blockId, {
          output: `[Web Environment] Command: ${command}\nThis is a simulation. Electron environment required for actual execution.`,
          exitCode: 0,
          duration: 100,
        });
      }
    } catch (error: any) {
      logger.error('[TerminalPanel] Command execution failed:', error);
      updateTerminalBlock(blockId, {
        output: `Error: ${error.message}`,
        exitCode: 1,
      });
    }
  };

  // AI 명령어 제안 요청
  const handleAICommand = async (naturalInput: string) => {
    logger.info('[TerminalPanel] AI command request:', naturalInput);

    setTerminalAgentIsRunning(true);

    try {
      // Terminal Agent 호출 (IPC)
      // TODO: Phase 4에서 실제 Agent 연동 구현
      if (window.electronAPI) {
        // Electron: Terminal Agent 호출
        const result = await window.electronAPI.invoke('terminal:ai-command', {
          naturalInput,
          currentCwd: currentCwd || workingDirectory,
          recentBlocks: terminalBlocks.slice(-5),
        });

        if (result.command) {
          // Agent가 제안한 명령어 실행
          await handleExecuteCommand(result.command, naturalInput);
        }
      } else {
        // 웹 환경 - 시뮬레이션
        const simulatedCommand = `echo "AI suggestion for: ${naturalInput}"`;
        await handleExecuteCommand(simulatedCommand, naturalInput);
      }
    } catch (error: any) {
      logger.error('[TerminalPanel] AI command failed:', error);
    } finally {
      setTerminalAgentIsRunning(false);
    }
  };

  // 입력 처리
  const handleSubmit = (input: string, mode: 'natural' | 'direct') => {
    if (mode === 'natural') {
      handleAICommand(input);
    } else {
      handleExecuteCommand(input);
    }
  };

  // 블록 재실행
  const handleRerunBlock = (blockId: string) => {
    const block = terminalBlocks.find((b) => b.id === blockId);
    if (block) {
      handleExecuteCommand(block.command, block.naturalInput);
    }
  };

  // 제안 명령어 실행
  const handleExecuteSuggestion = (command: string) => {
    handleExecuteCommand(command);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 헤더 */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">AI Terminal</h2>
          <span className="text-xs text-muted-foreground font-mono">
            {currentCwd || workingDirectory || '~'}
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
            onClick={clearTerminalBlocks}
            title="모두 지우기"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 블록 리스트 */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {terminalBlocks.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                터미널 명령어를 실행하거나 AI에게 작업을 요청하세요
              </p>
              <p className="text-xs text-muted-foreground">
                자연어로 &quot;최근 수정된 파일 보여줘&quot; 같은 요청을 할 수 있습니다
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            {terminalBlocks.map((block) => (
              <TerminalBlock
                key={block.id}
                block={block}
                isActive={block.id === activeBlockId}
                onSelect={() => {
                  // TODO: 블록 선택 시 activeBlockId 업데이트
                }}
                onRerun={() => handleRerunBlock(block.id)}
                onDelete={() => removeTerminalBlock(block.id)}
                onExecuteSuggestion={handleExecuteSuggestion}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* 입력 창 */}
      <AICommandInput onSubmit={handleSubmit} isLoading={terminalAgentIsRunning} />
    </div>
  );
}
