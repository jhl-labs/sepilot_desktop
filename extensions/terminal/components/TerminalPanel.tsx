/**
 * Terminal Panel Component
 *
 * Warp Terminal 스타일의 블록 기반 터미널 UI
 */

'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Trash2, History, Settings } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { TerminalBlock } from './TerminalBlock';
import { AICommandInput } from './AICommandInput';
import { SessionTabBar } from './SessionTabBar';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/utils/logger';

interface TerminalPanelProps {
  workingDirectory?: string;
}

export function TerminalPanel({ workingDirectory }: TerminalPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Store에서 상태 가져오기
  const store = useChatStore();
  const {
    terminalBlocks,
    activeBlockId,
    terminalAgentIsRunning,
    currentCwd,
    activeSessionId,
    addTerminalBlock,
    updateTerminalBlock,
    removeTerminalBlock,
    clearTerminalBlocks,
    setCurrentCwd,
    setTerminalAgentIsRunning,
    toggleHistory,
    loadTerminalHistoryFromStorage,
    getSessionBlocks,
  } = store as any; // Type assertion for extension store

  // 현재 활성 세션의 블록들만 필터링
  const sessionBlocks = useMemo(() => {
    if (!activeSessionId) return terminalBlocks;
    return getSessionBlocks ? getSessionBlocks(activeSessionId) : terminalBlocks;
  }, [terminalBlocks, activeSessionId, getSessionBlocks]);

  // 히스토리 로드 (컴포넌트 마운트 시 한 번만)
  useEffect(() => {
    loadTerminalHistoryFromStorage();
  }, [loadTerminalHistoryFromStorage]);

  // Terminal 데이터 스트리밍 이벤트 수신
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.terminal) {
      return;
    }

    // terminal:data 이벤트 리스너
    const dataHandler = window.electronAPI.terminal.onData(
      ({ sessionId, data }: { sessionId: string; data: string }) => {
        logger.info('[TerminalPanel] Received data:', { sessionId, dataLength: data.length });

        // 해당 PTY 세션과 연결된 Terminal Session 찾기
        const session = (store as any).sessions?.find((s: any) => s.ptySessionId === sessionId);
        if (!session) {
          logger.warn('[TerminalPanel] Session not found for PTY:', sessionId);
          return;
        }

        // 해당 세션의 가장 최근 블록 찾기 (실행 중인 블록)
        const sessionBlocks = terminalBlocks.filter((b: any) => b.sessionId === session.id);
        const lastBlock = sessionBlocks[sessionBlocks.length - 1];

        if (lastBlock && lastBlock.exitCode === undefined) {
          // 실행 중인 블록에 데이터 추가
          updateTerminalBlock(lastBlock.id, {
            output: (lastBlock.output || '') + data,
          });
        }
      }
    );

    // terminal:exit 이벤트 리스너
    const exitHandler = window.electronAPI.terminal.onExit(
      ({ sessionId, exitCode }: { sessionId: string; exitCode: number; signal?: number }) => {
        logger.info('[TerminalPanel] Session exited:', { sessionId, exitCode });

        // 해당 PTY 세션과 연결된 Terminal Session 찾기
        const session = (store as any).sessions?.find((s: any) => s.ptySessionId === sessionId);
        if (!session) {
          return;
        }

        // 해당 세션의 가장 최근 블록에 exitCode 설정
        const sessionBlocks = terminalBlocks.filter((b: any) => b.sessionId === session.id);
        const lastBlock = sessionBlocks[sessionBlocks.length - 1];

        if (lastBlock && lastBlock.exitCode === undefined) {
          updateTerminalBlock(lastBlock.id, {
            exitCode,
          });
        }
      }
    );

    // terminal:ai-stream 이벤트 리스너 (AI 명령어 생성 스트리밍)
    const aiStreamHandler = window.electronAPI.terminal.onAIStream(
      ({ chunk, conversationId }: { chunk: string; conversationId: string }) => {
        logger.info('[TerminalPanel] AI stream chunk:', {
          conversationId,
          chunkLength: chunk.length,
        });
        // TODO: AI 생성 중인 텍스트를 UI에 표시
        console.log('[AI Stream]', chunk);
      }
    );

    // Cleanup
    return () => {
      if (window.electronAPI?.terminal?.removeListener) {
        window.electronAPI.terminal.removeListener('terminal:data', dataHandler);
        window.electronAPI.terminal.removeListener('terminal:exit', exitHandler);
        window.electronAPI.terminal.removeListener('terminal:ai-stream', aiStreamHandler);
      }
    };
  }, [store, terminalBlocks, updateTerminalBlock]);

  // Working directory 초기화
  useEffect(() => {
    if (workingDirectory && workingDirectory !== currentCwd) {
      setCurrentCwd(workingDirectory);
    }
  }, [workingDirectory, currentCwd, setCurrentCwd]);

  // 초기 세션 자동 생성
  useEffect(() => {
    const initializeSession = async () => {
      const sessions = (store as any).sessions;

      // 이미 세션이 있으면 생성하지 않음
      if (sessions && sessions.length > 0) {
        return;
      }

      // PTY 세션 생성
      if (typeof window !== 'undefined' && window.electronAPI?.terminal) {
        try {
          const result = await window.electronAPI.terminal.createSession(
            workingDirectory || undefined,
            80,
            24
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
              logger.info('[TerminalPanel] Initial session created');
            }
          }
        } catch (error) {
          console.error('[TerminalPanel] Failed to create initial session:', error);
        }
      }
    };

    initializeSession();
  }, []); // Empty dependency array - run once on mount

  // 마지막 블록의 출력 길이 변화를 감지하여 스크롤
  const lastSessionBlock = sessionBlocks[sessionBlocks.length - 1];
  const lastOutputLen = lastSessionBlock?.output?.length || 0;

  // 블록 추가 또는 출력 업데이트 시 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessionBlocks.length, lastOutputLen]);

  // 명령어 실행 (직접 또는 AI 생성)
  const handleExecuteCommand = async (command: string, naturalInput?: string) => {
    logger.info('[TerminalPanel] Executing command:', command);

    // 활성 세션 확인
    const activeSession = (store as any).getActiveTerminalSession
      ? (store as any).getActiveTerminalSession()
      : null;

    if (!activeSession) {
      logger.error('[TerminalPanel] No active session');
      return;
    }

    // 새 블록 생성
    const blockId = addTerminalBlock({
      type: naturalInput ? 'ai-suggestion' : 'command',
      naturalInput,
      command,
      output: '',
      aiGenerated: !!naturalInput,
      cwd: currentCwd || workingDirectory || '',
      sessionId: activeSession.id,
      exitCode: undefined,
    });

    try {
      if (window.electronAPI?.terminal) {
        // PTY 세션에 명령어 전송 (실시간 스트리밍)
        const result = await window.electronAPI.terminal.write(
          activeSession.ptySessionId,
          command + '\r' // \r은 Enter키
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to write command');
        }

        // 출력은 terminal:data 이벤트로 실시간 수신됨
        logger.info('[TerminalPanel] Command sent to PTY session');
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
      if (window.electronAPI?.terminal) {
        // Electron: Terminal Agent 호출
        const result = await window.electronAPI.terminal.aiCommand(
          naturalInput,
          currentCwd || workingDirectory,
          terminalBlocks.slice(-5)
        );

        if (result.success && result.data?.command) {
          // Agent가 제안한 명령어 실행
          await handleExecuteCommand(result.data.command, naturalInput);
        } else if (!result.success) {
          logger.error('[TerminalPanel] AI command failed:', result.error);
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
    const block = terminalBlocks.find((b: any) => b.id === blockId);
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

      {/* 세션 탭 */}
      <SessionTabBar />

      {/* 블록 리스트 */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {sessionBlocks.length === 0 ? (
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
            {sessionBlocks.map((block: any) => (
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
