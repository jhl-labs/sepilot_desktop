'use client';

import { useState, useEffect } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Wrench,
  Terminal,
  FileEdit,
  ShieldAlert,
  Clock3,
  FileText,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import { PendingToolApproval, ToolCall } from '@/types';
import { CodeDiffViewer } from '../../CodeDiffViewer';
import { cn } from '@/lib/utils';

interface ToolApprovalDialogProps {
  pendingApproval?: PendingToolApproval | null;
  onApprove: (toolCalls: ToolCall[]) => void;
  onReject: () => void;
  onAlwaysApprove?: (toolCalls: ToolCall[]) => void; // Always approve for this session
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onClearError?: () => void;
}

interface FileToolContent {
  filePath: string;
  oldContent: string;
  newContent: string;
}

const COMMAND_RISK_PATTERNS: RegExp[] = [
  /rm\s+-rf/gi,
  /git\s+reset\s+--hard/gi,
  /curl\s+[^|]+\|\s*(bash|sh)/gi,
  /wget\s+[^|]+\|\s*(bash|sh)/gi,
  /\b(sudo|chmod\s+777|chown\s+root)\b/gi,
  /\b(npm\s+install|pnpm\s+add|yarn\s+add)\b/gi,
];

function getRiskSegments(command: string): Array<{ text: string; risk: boolean }> {
  if (!command) {
    return [];
  }

  const matches: Array<{ start: number; end: number }> = [];
  for (const pattern of COMMAND_RISK_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match = regex.exec(command);
    while (match) {
      matches.push({ start: match.index, end: match.index + match[0].length });
      match = regex.exec(command);
    }
  }

  if (matches.length === 0) {
    return [{ text: command, risk: false }];
  }

  matches.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const current of matches) {
    const prev = merged[merged.length - 1];
    if (!prev || current.start > prev.end) {
      merged.push({ ...current });
    } else if (current.end > prev.end) {
      prev.end = current.end;
    }
  }

  const segments: Array<{ text: string; risk: boolean }> = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) {
      segments.push({ text: command.slice(cursor, range.start), risk: false });
    }
    segments.push({ text: command.slice(range.start, range.end), risk: true });
    cursor = range.end;
  }
  if (cursor < command.length) {
    segments.push({ text: command.slice(cursor), risk: false });
  }
  return segments;
}

export function ToolApprovalDialog({
  pendingApproval,
  onApprove,
  onReject,
  onAlwaysApprove,
  isSubmitting = false,
  errorMessage,
  onClearError,
}: ToolApprovalDialogProps) {
  const { pendingToolApproval, pendingToolApprovalQueue } = useChatStore();
  const activeApproval = pendingApproval ?? pendingToolApproval;
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [fileContents, setFileContents] = useState<Map<string, FileToolContent>>(new Map());
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const isCommandTool = (toolName: string): boolean =>
    toolName === 'command_execute' || toolName === 'execute_command';

  // Helper: Check if tool is a file editing tool
  const isFileEditTool = (toolName: string): boolean => {
    return toolName === 'file_edit' || toolName === 'file_write';
  };

  // Helper: Load file content for diff display
  useEffect(() => {
    if (!activeApproval) {
      return;
    }

    let isMounted = true;
    const toolCalls = activeApproval.toolCalls;

    const loadFileContents = async () => {
      const newContents = new Map<string, FileToolContent>();
      const loading = new Set<string>();

      for (const tool of toolCalls) {
        if (!isFileEditTool(tool.name)) {
          continue;
        }

        loading.add(tool.id);

        try {
          const args = tool.arguments as any;
          const filePath = args.path || args.file_path;

          if (!filePath) {
            continue;
          }

          // Read existing file content (may fail if file doesn't exist)
          let oldContent = '';
          try {
            oldContent = await window.electronAPI.file.read(filePath);
          } catch {
            // File doesn't exist yet (for file_write this is OK)
            oldContent = '';
          }

          let newContent = '';

          if (tool.name === 'file_edit') {
            // For file_edit, apply the edit
            const oldStr = args.old_str || '';
            const newStr = args.new_str || '';
            newContent = oldContent.replace(oldStr, newStr);
          } else if (tool.name === 'file_write') {
            // For file_write, use the provided content
            newContent = args.content || '';
          }

          newContents.set(tool.id, {
            filePath,
            oldContent,
            newContent,
          });
        } catch (error) {
          console.error(`Failed to load file content for tool ${tool.id}:`, error);
        }

        loading.delete(tool.id);
      }

      // Only update state if component is still mounted
      if (isMounted) {
        setFileContents(newContents);
        setLoadingFiles(loading);
      }
    };

    loadFileContents();

    return () => {
      isMounted = false;
    };
  }, [activeApproval]);

  useEffect(() => {
    if (!activeApproval) {
      return;
    }

    setIsCollapsed(false);
    setExpandedTools(new Set());
    setNow(Date.now());
  }, [activeApproval?.messageId, activeApproval?.riskLevel]);

  useEffect(() => {
    if (!activeApproval) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeApproval?.messageId]);

  useEffect(() => {
    if (!activeApproval || isSubmitting) {
      return;
    }

    const toolCalls = activeApproval.toolCalls as ToolCall[];
    const handleKeyDown = (event: KeyboardEvent) => {
      const hasShortcutModifier = event.metaKey || event.ctrlKey;
      if (hasShortcutModifier && event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey && onAlwaysApprove) {
          onAlwaysApprove(toolCalls);
        } else {
          onApprove(toolCalls);
        }
      } else if (event.key === 'Escape' && !isCollapsed) {
        event.preventDefault();
        setIsCollapsed(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeApproval, isCollapsed, isSubmitting, onAlwaysApprove, onApprove]);

  if (!activeApproval) {
    return null;
  }

  const approvalQueue =
    Array.isArray(pendingToolApprovalQueue) && pendingToolApprovalQueue.length > 0
      ? pendingToolApprovalQueue
      : pendingToolApproval
        ? [pendingToolApproval]
        : [activeApproval];

  const getApprovalIdentity = (approval: PendingToolApproval): string =>
    approval.requestKey || `${approval.conversationId}:${approval.messageId}`;

  const formatRisk = (risk?: 'low' | 'medium' | 'high'): string =>
    risk === 'high' ? '높음' : risk === 'medium' ? '보통' : '낮음';

  const activeApprovalIdentity = getApprovalIdentity(activeApproval);
  const queuedApprovals = approvalQueue.filter(
    (approval) => getApprovalIdentity(approval) !== activeApprovalIdentity
  );

  const getQueuePreview = (approval: PendingToolApproval): string => {
    const firstTool = approval.toolCalls?.[0]?.name || 'tool';
    const extra = Math.max((approval.toolCalls?.length || 0) - 1, 0);
    return extra > 0 ? `${firstTool} +${extra}` : firstTool;
  };

  const toolCalls = activeApproval.toolCalls as ToolCall[];
  const commandCalls = toolCalls.filter((tool: ToolCall) => isCommandTool(tool.name));
  const fileEditCalls = toolCalls.filter((tool: ToolCall) => isFileEditTool(tool.name));
  const waitingSeconds = Math.max(0, Math.floor((now - (activeApproval.timestamp || now)) / 1000));
  const impactedPaths = Array.from(
    new Set(
      fileEditCalls
        .map((tool) => {
          const args = tool.arguments as Record<string, unknown>;
          return (args.path || args.file_path || '') as string;
        })
        .filter((value) => typeof value === 'string' && value.length > 0)
    )
  );
  const commandPreviews = commandCalls
    .map((tool) => {
      const args = tool.arguments as Record<string, unknown>;
      return typeof args.command === 'string' ? args.command : '';
    })
    .filter((command) => command.length > 0);

  const riskLevel = activeApproval.riskLevel || 'low';
  const riskLabel =
    riskLevel === 'high' ? '높음' : riskLevel === 'medium' ? '보통 (설치/네트워크)' : '낮음';

  const getToolPreview = (tool: ToolCall): string => {
    const args = (tool.arguments || {}) as Record<string, unknown>;
    if (isCommandTool(tool.name) && typeof args.command === 'string') {
      return args.command;
    }
    if (typeof args.path === 'string') {
      return args.path;
    }
    if (typeof args.file_path === 'string') {
      return args.file_path;
    }
    if (typeof args.pattern === 'string') {
      return args.pattern;
    }
    return '';
  };

  const toggleToolExpand = (toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const formatArguments = (args: Record<string, unknown>): string => {
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-[min(560px,calc(100vw-1.5rem))]">
      <div
        className={cn(
          'pointer-events-auto overflow-hidden rounded-2xl border bg-background/95 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/90 animate-in slide-in-from-bottom-2 duration-200',
          riskLevel === 'high'
            ? 'border-red-200/80 shadow-red-500/10 dark:border-red-900/80'
            : 'border-border shadow-black/10'
        )}
      >
        {/* Header */}
        <div className="border-b px-4 py-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                riskLevel === 'high' ? 'bg-red-500/10' : 'bg-amber-500/10'
              )}
            >
              {riskLevel === 'high' ? (
                <ShieldAlert className="h-4 w-4 text-red-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">도구 실행 승인 필요</h2>
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    riskLevel === 'high'
                      ? 'border-red-300 bg-red-100 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
                      : 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
                  )}
                >
                  위험도 {riskLabel}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                AI가 {toolCalls.length}개의 도구를 실행하려고 합니다. 입력은 계속 가능하고 승인하면
                즉시 이어집니다.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
                  <Clock3 className="h-3 w-3" />
                  대기 {waitingSeconds}s
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
                  <Terminal className="h-3 w-3" />
                  명령 {commandCalls.length}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
                  <FileEdit className="h-3 w-3" />
                  파일 {fileEditCalls.length}
                </span>
                {approvalQueue.length > 1 && (
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
                    <Wrench className="h-3 w-3" />
                    인박스 {approvalQueue.length}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="h-8 w-8 shrink-0"
              title={isCollapsed ? '상세 보기' : '요약으로 접기'}
              disabled={isSubmitting}
            >
              {isCollapsed ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {activeApproval.note && (
          <div
            className={cn(
              'mx-4 mt-3 rounded-md border px-3 py-2 text-xs',
              riskLevel === 'high'
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300'
            )}
          >
            {activeApproval.note}
          </div>
        )}

        {errorMessage && (
          <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
            <div className="font-medium">승인 응답 전송 실패</div>
            <div className="mt-1">{errorMessage}</div>
            {onClearError && (
              <button
                className="mt-2 underline underline-offset-2 hover:opacity-80"
                onClick={onClearError}
              >
                닫기
              </button>
            )}
          </div>
        )}

        {queuedApprovals.length > 0 && (
          <div className="mx-4 mt-3 rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground/90">Review Inbox</p>
              <p className="text-[11px] text-muted-foreground">대기 {queuedApprovals.length}건</p>
            </div>
            <div className="mt-2 space-y-1">
              {queuedApprovals.slice(0, 3).map((approval) => (
                <div
                  key={getApprovalIdentity(approval)}
                  className="flex items-center justify-between rounded bg-background px-2 py-1 text-[11px]"
                >
                  <span className="truncate text-foreground/90">{getQueuePreview(approval)}</span>
                  <span className="text-muted-foreground">
                    위험도 {formatRisk(approval.riskLevel)}
                  </span>
                </div>
              ))}
              {queuedApprovals.length > 3 && (
                <p className="text-[11px] text-muted-foreground">
                  +{queuedApprovals.length - 3}건 더 대기 중
                </p>
              )}
            </div>
          </div>
        )}

        {isCollapsed ? (
          <div className="px-4 pb-4 pt-3">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={onReject}
                className="gap-2"
                disabled={isSubmitting}
                size="sm"
              >
                <X className="h-4 w-4" />
                아니오 (거부)
              </Button>
              <Button
                variant="outline"
                onClick={() => onApprove(toolCalls)}
                className="gap-2"
                disabled={isSubmitting}
                size="sm"
              >
                <Check className="h-4 w-4" />예 (이번 1회)
              </Button>
              {onAlwaysApprove && (
                <Button
                  onClick={() => onAlwaysApprove(toolCalls)}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                  disabled={isSubmitting}
                  size="sm"
                >
                  <Check className="h-4 w-4" />
                  항상 예 (이번 세션)
                </Button>
              )}
            </div>
            <p className="mt-2 text-right text-[11px] text-muted-foreground">
              단축키: {onAlwaysApprove ? 'Cmd/Ctrl+Enter, Cmd/Ctrl+Shift+Enter' : 'Cmd/Ctrl+Enter'}
            </p>
          </div>
        ) : (
          <>
            {/* Tool List */}
            <ScrollArea className="max-h-[52vh]">
              <div className="space-y-2 p-4">
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="mb-2 text-xs font-semibold text-foreground/90">실행 미리보기</p>
                  {commandPreviews.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-muted-foreground">명령 실행</p>
                      {commandPreviews.slice(0, 3).map((command, index) => (
                        <code
                          key={`${command}-${index}`}
                          className="block overflow-x-auto rounded bg-background px-2 py-1 text-[11px]"
                        >
                          {getRiskSegments(command).map((segment, segmentIndex) => (
                            <span
                              key={`${index}-${segmentIndex}`}
                              className={
                                segment.risk ? 'bg-red-500/20 text-red-600 dark:text-red-300' : ''
                              }
                            >
                              {segment.text}
                            </span>
                          ))}
                        </code>
                      ))}
                    </div>
                  )}
                  {impactedPaths.length > 0 && (
                    <div className={cn('space-y-1.5', commandPreviews.length > 0 && 'mt-2')}>
                      <p className="text-[11px] text-muted-foreground">파일 변경 영향</p>
                      <div className="space-y-1">
                        {impactedPaths.slice(0, 4).map((filePath) => (
                          <div
                            key={filePath}
                            className="flex items-center gap-1.5 rounded bg-background px-2 py-1 text-[11px] text-foreground/90"
                          >
                            <FileText className="h-3 w-3 text-blue-500" />
                            <span className="truncate">{filePath}</span>
                          </div>
                        ))}
                        {impactedPaths.length > 4 && (
                          <p className="text-[11px] text-muted-foreground">
                            +{impactedPaths.length - 4}개 파일 더 있음
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {activeApproval.traceMetrics && (
                    <div className="mt-2 rounded bg-background px-2 py-1.5 text-[11px] text-muted-foreground">
                      최근 도구 성공률:{' '}
                      {activeApproval.traceMetrics.toolStats.total > 0
                        ? `${Math.round(
                            (activeApproval.traceMetrics.toolStats.success /
                              activeApproval.traceMetrics.toolStats.total) *
                              100
                          )}%`
                        : 'N/A'}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded border bg-muted/20 px-2 py-1.5">
                    <div className="text-muted-foreground">전체 도구</div>
                    <div className="font-semibold">{toolCalls.length}개</div>
                  </div>
                  <div className="rounded border bg-muted/20 px-2 py-1.5">
                    <div className="text-muted-foreground">명령 실행</div>
                    <div className="font-semibold">{commandCalls.length}개</div>
                  </div>
                  <div className="rounded border bg-muted/20 px-2 py-1.5">
                    <div className="text-muted-foreground">파일 변경</div>
                    <div className="font-semibold">{fileEditCalls.length}개</div>
                  </div>
                </div>

                {toolCalls.map((tool: ToolCall) => {
                  const isExpanded = expandedTools.has(tool.id);
                  const preview = getToolPreview(tool);
                  return (
                    <div key={tool.id} className="overflow-hidden rounded-lg border bg-muted/30">
                      {/* Tool Header */}
                      <button
                        onClick={() => toggleToolExpand(tool.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        {isCommandTool(tool.name) ? (
                          <Terminal className="h-4 w-4 text-orange-500" />
                        ) : isFileEditTool(tool.name) ? (
                          <FileEdit className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Wrench className="h-4 w-4 text-orange-500" />
                        )}
                        <span className="font-medium">{tool.name}</span>
                        {preview && (
                          <span className="truncate text-xs text-muted-foreground" title={preview}>
                            {preview}
                          </span>
                        )}
                      </button>

                      {/* Tool Arguments (Expanded) */}
                      {isExpanded && (
                        <div className="border-t bg-muted/20 px-3 py-2">
                          {isFileEditTool(tool.name) && fileContents.has(tool.id) ? (
                            // Show diff viewer for file editing tools
                            <div className="mt-2">
                              <CodeDiffViewer
                                filePath={fileContents.get(tool.id)!.filePath}
                                oldContent={fileContents.get(tool.id)!.oldContent}
                                newContent={fileContents.get(tool.id)!.newContent}
                              />
                            </div>
                          ) : loadingFiles.has(tool.id) ? (
                            // Loading state
                            <p className="text-xs text-muted-foreground">파일 내용 로딩 중...</p>
                          ) : (
                            // Default: Show JSON arguments
                            <>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                인자 (Arguments):
                              </p>
                              <pre className="overflow-x-auto rounded bg-background p-2 text-xs">
                                {formatArguments(tool.arguments)}
                              </pre>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Footer - Claude Code style: No / Yes / Always Yes */}
            <div className="border-t px-4 py-3">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={onReject}
                  className="gap-2"
                  disabled={isSubmitting}
                  size="sm"
                >
                  <X className="h-4 w-4" />
                  아니오 (거부)
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onApprove(toolCalls)}
                  className="gap-2"
                  disabled={isSubmitting}
                  size="sm"
                >
                  <Check className="h-4 w-4" />예 (이번 1회)
                </Button>
                {onAlwaysApprove && (
                  <Button
                    onClick={() => onAlwaysApprove(toolCalls)}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                    disabled={isSubmitting}
                    size="sm"
                  >
                    <Check className="h-4 w-4" />
                    항상 예 (이번 세션)
                  </Button>
                )}
              </div>
              <p className="mt-2 text-right text-[11px] text-muted-foreground">
                단축키:{' '}
                {onAlwaysApprove ? 'Cmd/Ctrl+Enter, Cmd/Ctrl+Shift+Enter' : 'Cmd/Ctrl+Enter'}
              </p>
            </div>
          </>
        )}
        {isSubmitting && (
          <div className="border-t px-4 py-2 text-right text-xs text-muted-foreground">
            승인 응답을 전송하는 중...
          </div>
        )}
      </div>
    </div>
  );
}
