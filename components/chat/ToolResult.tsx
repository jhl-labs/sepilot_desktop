'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ToolResultProps {
  toolName: string;
  status: 'success' | 'error';
  summary?: string;
  details?: string;
  duration?: number;
}

export function ToolResult({ toolName, status, summary, details, duration }: ToolResultProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isSuccess = status === 'success';
  const hasDetails = details && details.length > 0;

  return (
    <div
      className={cn(
        'rounded-lg border my-2 overflow-hidden transition-colors',
        isSuccess
          ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
          : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-3">
        {/* Icon */}
        <div className="shrink-0 mt-0.5">
          {isSuccess ? (
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Tool Name */}
          <div className="flex items-center gap-2">
            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium font-mono">{toolName}</span>
            {duration && (
              <span className="text-xs text-muted-foreground">({duration}ms)</span>
            )}
          </div>

          {/* Summary */}
          {summary && (
            <p className="text-sm text-muted-foreground mt-1 break-words">{summary}</p>
          )}
        </div>

        {/* Expand Button */}
        {hasDetails && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="shrink-0 h-7 w-7 p-0"
            aria-label={isExpanded ? '세부 정보 숨기기' : '세부 정보 보기'}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && hasDetails && (
        <div className="border-t px-3 py-2 bg-background/50">
          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words">
            {details}
          </pre>
        </div>
      )}
    </div>
  );
}
