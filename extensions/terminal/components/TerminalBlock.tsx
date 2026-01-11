/**
 * Terminal Block Component
 *
 * Warp Terminal 스타일의 명령어 블록 UI
 */

'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  RotateCw,
  Trash,
  Copy,
  ChevronRight,
  Sparkles,
  AlertCircle,
  Check,
  Terminal as TerminalIcon,
  X,
  Star,
  Maximize2,
  Minimize2,
  Keyboard,
  Eye,
} from 'lucide-react';
// Dialog 제거 - CSS 기반 전체화면 사용
import { AnsiDisplay } from '@/components/ui/ansi-display';
import { cn } from '@/lib/utils';
import { InteractiveTerminal } from './InteractiveTerminal';
import { useChatStore } from '@/lib/store/chat-store';

import type { TerminalBlock as TerminalBlockType } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

interface TerminalBlockProps {
  block: TerminalBlockType;
  isActive: boolean;
  isLastBlock?: boolean; // 마지막 블록 여부 - 마지막 블록만 InteractiveTerminal 사용
  onSelect: () => void;
  onRerun: () => void;
  onDelete: () => void;
  onCancel?: () => void;
  onBookmark?: () => void;
  onExecuteSuggestion?: (command: string) => void;
}

/**
 * InteractiveTerminal Wrapper
 * sessionId로 ptySessionId를 찾아서 InteractiveTerminal에 전달
 * 기본: ReadOnly 모드 (스크롤만 가능)
 * Interactive 모드: 키 입력 가능
 * 전체화면: CSS로 기존 터미널을 확대
 */
function InteractiveTerminalWrapper({
  blockId,
  sessionId,
  initialOutput,
  pendingCommand,
}: {
  blockId: string;
  sessionId: string;
  initialOutput?: string; // 마운트 시 표시할 캡처된 output
  pendingCommand?: string; // 초기화 완료 후 실행할 명령어
}) {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isReadOnly, setIsReadOnly] = React.useState(true); // 기본: 읽기 전용
  const [commandSent, setCommandSent] = React.useState(false); // 명령어 전송 완료 여부
  const store = useChatStore();
  const sessions = (store as any).sessions || [];
  const session = sessions.find((s: any) => s.id === sessionId);

  // ESC 키로 전체화면 종료 또는 Interactive 모드 종료
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else if (!isReadOnly) {
          setIsReadOnly(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, isReadOnly]);

  if (!session) {
    return (
      <div className="mb-2 p-3 rounded bg-destructive/5 border border-destructive/20 text-xs text-destructive">
        Error: Session not found (ID: {sessionId})
      </div>
    );
  }

  // 높이 결정: 전체화면이면 100vh, 아니면 적절한 크기
  const height = isFullscreen ? '100vh' : '280px';

  return (
    <div
      className={cn(
        'mb-2 rounded border border-border overflow-hidden relative transition-all duration-200',
        isFullscreen && 'fixed inset-0 z-50 rounded-none border-none',
        !isReadOnly && !isFullscreen && 'ring-2 ring-primary/50' // Interactive 모드 표시
      )}
      style={{ height }}
    >
      <InteractiveTerminal
        sessionId={sessionId}
        ptySessionId={session.ptySessionId}
        readOnly={isReadOnly}
        initialOutput={initialOutput}
        pendingCommand={commandSent ? undefined : pendingCommand}
        onCommandSent={() => setCommandSent(true)}
      />

      {/* 컨트롤 버튼들 */}
      <div className="absolute top-2 right-2 flex gap-1 z-10">
        {/* Interactive/ReadOnly 토글 버튼 */}
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'h-7 w-7 bg-background/80 hover:bg-background',
            !isReadOnly && 'bg-primary/20 text-primary'
          )}
          onClick={() => setIsReadOnly(!isReadOnly)}
          title={isReadOnly ? 'Interactive 모드로 전환' : 'ReadOnly 모드로 전환 (ESC)'}
        >
          {isReadOnly ? <Keyboard className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </Button>

        {/* Fullscreen 토글 버튼 */}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 bg-background/80 hover:bg-background"
          onClick={() => setIsFullscreen(!isFullscreen)}
          title={isFullscreen ? '전체화면 종료 (ESC)' : '전체화면'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
      </div>

      {/* 모드 안내 */}
      {!isFullscreen && (
        <div className="absolute bottom-2 left-2 text-[10px] text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded">
          {isReadOnly ? '읽기 전용 (🎹 클릭하여 입력 모드)' : '입력 모드 (ESC로 종료)'}
        </div>
      )}

      {/* 전체화면 안내 */}
      {isFullscreen && (
        <div className="absolute bottom-4 left-4 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
          ESC로 종료 | {isReadOnly ? '🎹 입력 모드' : '👁 읽기 전용'}
        </div>
      )}
    </div>
  );
}

export function TerminalBlock({
  block,
  isActive,
  isLastBlock = false,
  onSelect,
  onRerun,
  onDelete,
  onCancel,
  onBookmark,
  onExecuteSuggestion,
}: TerminalBlockProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(block.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isError = block.exitCode !== undefined && block.exitCode !== 0;

  return (
    <div
      onClick={onSelect}
      className={cn(
        'terminal-block group relative rounded-lg border p-4 mb-3 transition-all duration-200 cursor-pointer hover:shadow-md',
        isActive && 'border-primary ring-2 ring-primary/20',
        isError && !isActive && 'border-destructive/50',
        !isActive && !isError && 'border-border hover:border-primary/50'
      )}
    >
      {/* 헤더: 시간, CWD, 액션 버튼 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <TerminalIcon className="w-3.5 h-3.5" />
          <span className="font-mono">{block.cwd}</span>
          <span>•</span>
          <span>{formatDistanceToNow(block.timestamp, { addSuffix: true, locale: ko })}</span>
          {block.duration && (
            <>
              <span>•</span>
              <span>{block.duration}ms</span>
            </>
          )}
        </div>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* 취소 버튼 (실행 중일 때만 표시) */}
          {block.isRunning && onCancel && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive animate-pulse"
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              title="취소 (Ctrl+C)"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            title="명령어 복사"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
          {onBookmark && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onBookmark();
              }}
              title="북마크 추가"
            >
              <Star className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onRerun();
            }}
            title="다시 실행"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="삭제"
          >
            <Trash className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* 자연어 입력 (있는 경우) */}
      {block.naturalInput && (
        <div className="mb-2 p-2 bg-muted/50 rounded text-sm text-muted-foreground italic">
          💬 &quot;{block.naturalInput}&quot;
        </div>
      )}

      {/* 명령어 */}
      <div className="flex items-start gap-2 mb-2">
        <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
        <code className="flex-1 text-sm font-mono break-all">{block.command}</code>
        {block.aiGenerated && (
          <Badge variant="secondary" className="shrink-0">
            <Sparkles className="w-3 h-3 mr-1" />
            AI
          </Badge>
        )}
      </div>

      {/* 출력 */}
      {block.isInteractive && isLastBlock ? (
        /* Interactive Terminal (xterm.js) - 마지막 블록만 사용 (PTY 세션 공유 문제 해결) */
        <InteractiveTerminalWrapper
          blockId={block.id}
          sessionId={block.sessionId}
          initialOutput={block.output}
          pendingCommand={block.isRunning ? block.command : undefined}
        />
      ) : (
        /* 이전 블록 또는 비-인터랙티브 출력 - AnsiDisplay로 캡처된 output 표시 */
        block.output && (
          <div
            className={cn(
              'mb-2 p-3 rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto',
              isError ? 'bg-destructive/5 border border-destructive/20' : 'bg-muted/50'
            )}
          >
            <AnsiDisplay text={block.output} />
          </div>
        )
      )}

      {/* Exit Code */}
      {block.exitCode !== undefined && (
        <div
          className={cn(
            'text-xs font-mono mb-2',
            block.exitCode === 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'
          )}
        >
          Exit code: {block.exitCode}
        </div>
      )}

      {/* AI 분석 */}
      {block.aiAnalysis && (
        <div className="border-t pt-3 mt-2">
          {/* 요약 */}
          {block.aiAnalysis.summary && (
            <div className="flex items-start gap-2 mb-2 text-sm">
              <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
              <span>{block.aiAnalysis.summary}</span>
            </div>
          )}

          {/* 에러 분석 */}
          {block.aiAnalysis.error && (
            <Alert variant="destructive" className="mb-3">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>에러 분석</AlertTitle>
              <AlertDescription className="mt-2 space-y-2">
                <div>
                  <strong className="text-xs">원인:</strong>
                  <p className="text-xs mt-1">{block.aiAnalysis.error.cause}</p>
                </div>
                {block.aiAnalysis.error.solutions.length > 0 && (
                  <div>
                    <strong className="text-xs">해결 방법:</strong>
                    <ul className="list-disc list-inside text-xs mt-1 space-y-1">
                      {block.aiAnalysis.error.solutions.map((solution, i) => (
                        <li key={i}>{solution}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* 다음 작업 제안 */}
          {block.aiAnalysis.suggestions && block.aiAnalysis.suggestions.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-2">다음 작업 제안:</div>
              <div className="flex flex-wrap gap-2">
                {block.aiAnalysis.suggestions.map((suggestion, i) => (
                  <Button
                    key={i}
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExecuteSuggestion?.(suggestion);
                    }}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
