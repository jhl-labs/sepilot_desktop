/**
 * Terminal Panel Component
 *
 * Warp Terminal 스타일의 블록 기반 터미널 UI
 */

'use client';

import React, { useEffect, useRef, useMemo, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Trash2, History, Settings, LayoutGrid, Terminal as TerminalIcon } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { TerminalBlock } from './TerminalBlock';
import { AICommandInput } from './AICommandInput';
import { SessionTabBar } from './SessionTabBar';
import { InteractiveTerminal } from './InteractiveTerminal';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/utils/logger';

interface TerminalPanelProps {
  workingDirectory?: string;
}

// 인터랙티브 명령어 목록 (자동 모드 전환용)
const INTERACTIVE_COMMANDS = [
  'vim',
  'vi',
  'nano',
  'emacs',
  'top',
  'htop',
  'less',
  'more',
  'man',
  'ssh',
  'tail',
  'watch',
];

export function TerminalPanel({ workingDirectory }: TerminalPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // 뷰 모드 상태 (Blocks or Interactive)
  const [viewMode, setViewMode] = useState<'blocks' | 'interactive'>('blocks');

  // Store에서 상태 가져오기
  const store = useChatStore();
  // ... (lines 29-44) ...
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
  } = store as any; // Type assertion

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

  const isInitializing = useRef(false);

  // 초기 세션 자동 생성
  useEffect(() => {
    const initializeSession = async () => {
      // 이미 초기화 진행 중이거나 세션이 있으면 중단
      if (
        isInitializing.current ||
        ((store as any).sessions && (store as any).sessions.length > 0)
      ) {
        return;
      }

      isInitializing.current = true;
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
    // 약간의 지연을 주어 렌더링 완료 후 스크롤
    const timer = setTimeout(() => {
      if (scrollAnchorRef.current) {
        scrollAnchorRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      }
    }, 10);
    return () => clearTimeout(timer);
  }, [sessionBlocks.length, lastOutputLen, activeBlockId]);

  // 명령어 실행 (직접 또는 AI 생성)
  const handleExecuteCommand = async (command: string, naturalInput?: string) => {
    logger.info('[TerminalPanel] Executing command:', command);

    // 인터랙티브 명령어 감지 → 자동으로 Interactive 모드로 전환
    const firstCommand = command.trim().split(/\s+/)[0];
    if (INTERACTIVE_COMMANDS.includes(firstCommand)) {
      logger.info('[TerminalPanel] Detected interactive command, switching to interactive mode');
      setViewMode('interactive');
    }

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

        logger.info('[TerminalPanel] Command sent to PTY session');

        // CD 명령어 감지 및 CWD 업데이트 (Optimistic but Validated)
        if (command.trim().startsWith('cd ')) {
          const args = command.trim().substring(3).trim();
          if (args) {
            const currentSessionCwd = activeSession.cwd || '';
            let targetPath = args;

            try {
              // 1. Resolve Path via Backend (handles .., ., and absolute paths correctly)
              // If args is absolute, resolvePath usually handles it if backend uses path.resolve
              // But strictly path.resolve(base, abs) -> abs. So it works.

              const resolveResult = await window.electronAPI.fs.resolvePath(
                currentSessionCwd,
                args
              );
              if (resolveResult.success && resolveResult.data) {
                targetPath = resolveResult.data;

                // 2. Validate existence
                const statResult = await window.electronAPI.fs.getFileStat(targetPath);
                if (statResult.success && statResult.data?.isDirectory) {
                  // 3. Update Store only if valid directory
                  const updateTerminalSession = (store as any).updateTerminalSession;
                  if (updateTerminalSession) {
                    updateTerminalSession(activeSession.id, { cwd: targetPath });
                  }
                }
              }
            } catch (err) {
              // Ignore validation errors - just don't update optimistic CWD
              console.warn('[TerminalPanel] Failed to validate CWD update:', err);
            }
          }
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
        } else if (result.success && result.data?.textResponse) {
          // Agent가 명령어 대신 텍스트 응답만 제공한 경우
          logger.info('[TerminalPanel] AI returned text response (no command)');
          if (addTerminalBlock) {
            addTerminalBlock({
              id: crypto.randomUUID(),
              type: 'text',
              role: 'assistant',
              naturalInput,
              output: `\x1b[36m[AI]\x1b[0m ${result.data.textResponse}`,
              timestamp: Date.now(),
              cwd: currentCwd || workingDirectory,
            });
          }
        } else if (!result.success) {
          logger.error('[TerminalPanel] AI command failed:', result.error);

          // 에러 메시지를 터미널 블록으로 표시
          if (addTerminalBlock) {
            addTerminalBlock({
              id: crypto.randomUUID(),
              type: 'text',
              role: 'assistant',
              output: `\x1b[31m[AI Error]\x1b[0m ${result.error || 'Failed to generate command.'}`,
              timestamp: Date.now(),
              cwd: currentCwd || workingDirectory,
            });
          }
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

  const [isTerminalFocused, setIsTerminalFocused] = React.useState(false);
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  // ... (previous code)

  // 터미널 직접 입력 처리 (Interactive Mode)
  const handleTerminalKeyDown = async (e: React.KeyboardEvent) => {
    if (!activeSessionId) return;

    // AI Input에 포커스가 있거나 조합키(Ctrl/Meta) 사용 시 기본 동작 허용 (단, Ctrl+C 등은 터미널로 보내야 함)
    // 하지만 여기서 포커스가 터미널 컨테이너에 있을 때만 작동하므로 안전함.

    e.preventDefault();
    e.stopPropagation();

    const key = e.key;
    let dataToSend = key;

    // 특수 키 매핑
    if (key === 'Enter') dataToSend = '\r';
    else if (key === 'Backspace') dataToSend = '\x7f';
    else if (key === 'Tab') dataToSend = '\t';
    else if (key === 'Escape') dataToSend = '\x1b';
    else if (key === 'ArrowUp') dataToSend = '\x1b[A';
    else if (key === 'ArrowDown') dataToSend = '\x1b[B';
    else if (key === 'ArrowRight') dataToSend = '\x1b[C';
    else if (key === 'ArrowLeft') dataToSend = '\x1b[D';
    else if (key.length > 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // 다른 특수키는 무시하거나 추가 매핑 필요 (Home, End, PageUp 등)
      return;
    }

    // Ctrl 조합키 처리
    if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      if (key.length === 1) {
        const charCode = key.toLowerCase().charCodeAt(0);
        if (charCode >= 97 && charCode <= 122) {
          dataToSend = String.fromCharCode(charCode - 96);
        }
      }
    }

    if (dataToSend) {
      // 활성 세션 찾기
      const activeSession = (store as any).getActiveTerminalSession
        ? (store as any).getActiveTerminalSession()
        : null;
      if (activeSession && window.electronAPI?.terminal) {
        await window.electronAPI.terminal.write(activeSession.ptySessionId, dataToSend);
      }
    }
  };

  return (
    <div
      className="flex h-full flex-col bg-background outline-none"
      tabIndex={-1} // 포커스 관리는 내부 컨테이너에서
    >
      {/* 헤더 */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">AI Terminal</h2>
          <span className="text-xs text-muted-foreground font-mono">
            {currentCwd || workingDirectory || '~'}
          </span>
          {isTerminalFocused && (
            <span className="text-[10px] bg-accent text-accent-foreground px-1.5 py-0.5 rounded animate-pulse">
              Interactive Mode
            </span>
          )}
        </div>
        {/* ... buttons ... */}
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

      {/* 블록 리스트 - 포커스 가능 영역 */}
      <div
        className={cn(
          'flex-1 relative outline-none ring-offset-background transition-colors min-h-0',
          isTerminalFocused ? 'ring-2 ring-primary/20 bg-accent/5' : ''
        )}
        tabIndex={0}
        ref={terminalContainerRef}
        onFocus={() => setIsTerminalFocused(true)}
        onBlur={() => setIsTerminalFocused(false)}
        onKeyDown={handleTerminalKeyDown}
        onClick={() => terminalContainerRef.current?.focus()}
      >
        <ScrollArea className="h-full p-4" ref={scrollRef}>
          {/* ... contents ... */}
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
          <div ref={scrollAnchorRef} />
        </ScrollArea>

        {/* 포커스 안내 오버레이 (마우스 오버 시 또는 포커스 없을 때) */}
        {!isTerminalFocused && sessionBlocks.length > 0 && (
          <div className="absolute top-2 right-2 pointer-events-none opacity-50">
            <span className="text-[10px] bg-muted px-1 rounded border">Click to interact</span>
          </div>
        )}
      </div>

      {/* 입력 창 */}
      <AICommandInput
        onSubmit={handleSubmit}
        isLoading={terminalAgentIsRunning}
        currentCwd={currentCwd || workingDirectory || ''}
      />
    </div>
  );
}
