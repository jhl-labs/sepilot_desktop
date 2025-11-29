'use client';

import { useEffect, useRef } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { ChevronDown, ChevronUp, X, Brain, Wrench, CheckCircle2, XCircle, AlertCircle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BrowserAgentLogEntry, BrowserAgentLogLevel } from '@/types/browser-agent';
import { cn } from '@/lib/utils';

/**
 * Browser Agent 실행 과정 가시성 패널
 *
 * Agent의 사고 과정, 도구 호출, 결과, 결정을 실시간으로 표시
 */
export function BrowserAgentLog() {
  const {
    browserAgentLogs,
    browserAgentIsRunning,
    showBrowserAgentLogs,
    setShowBrowserAgentLogs,
    clearBrowserAgentLogs,
  } = useChatStore();

  const logContainerRef = useRef<HTMLDivElement>(null);

  // 자동 스크롤 (새 로그가 추가되면 아래로)
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [browserAgentLogs]);

  if (!showBrowserAgentLogs) {
    // 축소 상태: 하단에 작은 버튼만 표시
    return (
      <div className="border-t p-2 bg-muted/30">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowBrowserAgentLogs(true)}
          className="w-full justify-between text-xs"
        >
          <div className="flex items-center gap-2">
            <Brain className="h-3 w-3" />
            <span>Agent 로그</span>
            {browserAgentIsRunning && (
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{browserAgentLogs.length}개</span>
            <ChevronUp className="h-3 w-3" />
          </div>
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t flex flex-col max-h-[300px]">
      {/* Header */}
      <div className="p-2 border-b bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          <span className="text-sm font-medium">Agent 실행 로그</span>
          {browserAgentIsRunning && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              실행 중
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={clearBrowserAgentLogs}
            title="로그 지우기"
          >
            <X className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowBrowserAgentLogs(false)}
            title="축소"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Logs */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto p-2 space-y-2 text-xs font-mono"
      >
        {browserAgentLogs.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">
            Agent 실행 로그가 여기에 표시됩니다
          </div>
        ) : (
          browserAgentLogs.map((log) => <LogEntry key={log.id} log={log} />)
        )}
      </div>
    </div>
  );
}

/**
 * 개별 로그 엔트리 컴포넌트
 */
function LogEntry({ log }: { log: BrowserAgentLogEntry }) {
  const icon = getLogIcon(log.phase);
  const levelColor = getLevelColor(log.level);
  const phaseLabel = getPhaseLabel(log.phase);

  return (
    <div className={cn('p-2 rounded border-l-2', levelColor)}>
      {/* Header */}
      <div className="flex items-start gap-2 mb-1">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold">{phaseLabel}</span>
            {log.details?.iteration !== undefined && (
              <span className="text-muted-foreground">
                [{log.details.iteration}/{log.details.maxIterations}]
              </span>
            )}
            <span className="text-muted-foreground text-[10px]">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <div className="text-foreground/90">{log.message}</div>
        </div>
      </div>

      {/* Details */}
      {log.details && (
        <div className="ml-6 mt-1 space-y-1">
          {/* Thinking */}
          {log.details.reasoning && (
            <div className="text-muted-foreground italic">
              💭 {log.details.reasoning}
            </div>
          )}

          {/* Tool Call */}
          {log.details.toolName && (
            <div className="bg-muted/50 p-1.5 rounded">
              <div className="flex items-center gap-2 mb-1">
                <Wrench className="h-3 w-3" />
                <span className="font-semibold">{log.details.toolName}</span>
              </div>
              {log.details.toolArgs && (
                <pre className="text-[10px] text-muted-foreground overflow-x-auto">
                  {JSON.stringify(log.details.toolArgs, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Tool Result */}
          {log.details.toolResult && (
            <div className="bg-green-500/10 p-1.5 rounded border border-green-500/20">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                <span className="text-green-700 dark:text-green-400 font-semibold">결과</span>
              </div>
              <pre className="text-[10px] text-foreground/80 overflow-x-auto max-h-20">
                {log.details.toolResult.substring(0, 500)}
                {log.details.toolResult.length > 500 && '...'}
              </pre>
            </div>
          )}

          {/* Tool Error */}
          {log.details.toolError && (
            <div className="bg-red-500/10 p-1.5 rounded border border-red-500/20">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="h-3 w-3 text-red-600" />
                <span className="text-red-700 dark:text-red-400 font-semibold">오류</span>
              </div>
              <pre className="text-[10px] text-red-600 dark:text-red-400">
                {log.details.toolError}
              </pre>
            </div>
          )}

          {/* Decision */}
          {log.details.decision && (
            <div className="flex items-center gap-2">
              <Zap className="h-3 w-3 text-yellow-600" />
              <span>
                다음: <span className="font-semibold">{log.details.decision === 'continue' ? '계속 진행' : '완료'}</span>
              </span>
              {log.details.nextAction && (
                <span className="text-muted-foreground">→ {log.details.nextAction}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 페이즈별 아이콘
 */
function getLogIcon(phase: BrowserAgentLogEntry['phase']) {
  switch (phase) {
    case 'thinking':
      return <Brain className="h-3 w-3 text-blue-600" />;
    case 'tool_call':
      return <Wrench className="h-3 w-3 text-purple-600" />;
    case 'tool_result':
      return <CheckCircle2 className="h-3 w-3 text-green-600" />;
    case 'decision':
      return <Zap className="h-3 w-3 text-yellow-600" />;
    case 'completion':
      return <CheckCircle2 className="h-3 w-3 text-green-600" />;
    case 'error':
      return <XCircle className="h-3 w-3 text-red-600" />;
    default:
      return <AlertCircle className="h-3 w-3 text-gray-600" />;
  }
}

/**
 * 레벨별 색상
 */
function getLevelColor(level: BrowserAgentLogLevel) {
  switch (level) {
    case 'info':
      return 'border-l-blue-500 bg-blue-500/5';
    case 'success':
      return 'border-l-green-500 bg-green-500/5';
    case 'warning':
      return 'border-l-yellow-500 bg-yellow-500/5';
    case 'error':
      return 'border-l-red-500 bg-red-500/5';
    case 'thinking':
      return 'border-l-purple-500 bg-purple-500/5';
    default:
      return 'border-l-gray-500 bg-gray-500/5';
  }
}

/**
 * 페이즈별 라벨
 */
function getPhaseLabel(phase: BrowserAgentLogEntry['phase']) {
  switch (phase) {
    case 'thinking':
      return '🧠 사고 중';
    case 'tool_call':
      return '🔧 도구 호출';
    case 'tool_result':
      return '✅ 도구 결과';
    case 'decision':
      return '⚡ 결정';
    case 'completion':
      return '🎉 완료';
    case 'error':
      return '❌ 오류';
    default:
      return '📝 로그';
  }
}
