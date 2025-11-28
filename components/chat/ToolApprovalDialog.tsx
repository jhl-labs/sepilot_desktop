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
} from 'lucide-react';
import { ToolCall } from '@/types';
import { CodeDiffViewer } from './CodeDiffViewer';

interface ToolApprovalDialogProps {
  onApprove: (toolCalls: ToolCall[]) => void;
  onReject: () => void;
  onAlwaysApprove?: (toolCalls: ToolCall[]) => void; // Always approve for this session
}

interface FileToolContent {
  filePath: string;
  oldContent: string;
  newContent: string;
}

export function ToolApprovalDialog({ onApprove, onReject, onAlwaysApprove }: ToolApprovalDialogProps) {
  const { pendingToolApproval } = useChatStore();
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [fileContents, setFileContents] = useState<Map<string, FileToolContent>>(new Map());
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());

  if (!pendingToolApproval) {
    return null;
  }

  const { toolCalls } = pendingToolApproval;

  // Helper: Check if tool is a file editing tool
  const isFileEditTool = (toolName: string): boolean => {
    return toolName === 'file_edit' || toolName === 'file_write';
  };

  // Helper: Load file content for diff display
  useEffect(() => {
    const loadFileContents = async () => {
      const newContents = new Map<string, FileToolContent>();
      const loading = new Set<string>();

      for (const tool of toolCalls) {
        if (!isFileEditTool(tool.name)) continue;

        loading.add(tool.id);

        try {
          const args = tool.arguments as any;
          const filePath = args.path;

          if (!filePath) continue;

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

      setFileContents(newContents);
      setLoadingFiles(loading);
    };

    loadFileContents();
  }, [toolCalls]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-lg border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h2 className="font-semibold">도구 실행 승인 필요</h2>
            <p className="text-sm text-muted-foreground">
              AI가 {toolCalls.length}개의 도구를 실행하려고 합니다
            </p>
          </div>
        </div>

        {/* Tool List */}
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2 p-4">
            {toolCalls.map((tool) => {
              const isExpanded = expandedTools.has(tool.id);
              return (
                <div
                  key={tool.id}
                  className="rounded-lg border bg-muted/30 overflow-hidden"
                >
                  {/* Tool Header */}
                  <button
                    onClick={() => toggleToolExpand(tool.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Wrench className="h-4 w-4 text-orange-500" />
                    <span className="font-medium">{tool.name}</span>
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
                        <p className="text-xs text-muted-foreground">
                          파일 내용 로딩 중...
                        </p>
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
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button
            variant="outline"
            onClick={onReject}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            아니오
          </Button>
          <Button
            variant="outline"
            onClick={() => onApprove(toolCalls)}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            예
          </Button>
          {onAlwaysApprove && (
            <Button
              onClick={() => onAlwaysApprove(toolCalls)}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              <Check className="h-4 w-4" />
              항상 예 (이번 세션)
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
