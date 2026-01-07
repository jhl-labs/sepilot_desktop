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
} from 'lucide-react';
import { AnsiDisplay } from '@/components/ui/ansi-display';
import { cn } from '@/lib/utils';

import type { TerminalBlock as TerminalBlockType } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

interface TerminalBlockProps {
  block: TerminalBlockType;
  isActive: boolean;
  onSelect: () => void;
  onRerun: () => void;
  onDelete: () => void;
  onExecuteSuggestion?: (command: string) => void;
}

export function TerminalBlock({
  block,
  isActive,
  onSelect,
  onRerun,
  onDelete,
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
      {block.output && (
        <div
          className={cn(
            'mb-2 p-3 rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto',
            isError ? 'bg-destructive/5 border border-destructive/20' : 'bg-muted/50'
          )}
        >
          <AnsiDisplay text={block.output} />
        </div>
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
