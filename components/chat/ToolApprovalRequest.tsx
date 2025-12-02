'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Wrench, AlertCircle } from 'lucide-react';

export interface ToolApprovalRequestProps {
  messageId: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  onApprove?: () => void;
  onReject?: () => void;
  disabled?: boolean;
}

export function ToolApprovalRequest({
  messageId,
  toolCalls,
  onApprove,
  onReject,
  disabled = false,
}: ToolApprovalRequestProps) {
  const [responded, setResponded] = useState(false);
  const [approved, setApproved] = useState<boolean | null>(null);

  const handleApprove = () => {
    if (disabled || responded) {
      return;
    }

    setResponded(true);
    setApproved(true);

    // Dispatch custom event to notify approval
    window.dispatchEvent(
      new CustomEvent('sepilot:tool-approval', {
        detail: {
          messageId,
          approved: true,
        },
      })
    );

    // Call optional callback
    if (onApprove) {
      onApprove();
    }
  };

  const handleReject = () => {
    if (disabled || responded) {
      return;
    }

    setResponded(true);
    setApproved(false);

    // Dispatch custom event to notify rejection
    window.dispatchEvent(
      new CustomEvent('sepilot:tool-approval', {
        detail: {
          messageId,
          approved: false,
        },
      })
    );

    // Call optional callback
    if (onReject) {
      onReject();
    }
  };

  return (
    <div
      className={cn(
        'my-4 rounded-lg border p-4',
        responded
          ? approved
            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
            : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
          : 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="shrink-0">
          {responded ? (
            approved ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            )
          ) : (
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold">
            {responded
              ? approved
                ? '✅ 도구 실행 승인됨'
                : '❌ 도구 실행 거부됨'
              : '🔔 도구 실행 승인이 필요합니다'}
          </h4>
          {!responded && (
            <p className="text-xs text-muted-foreground mt-0.5">
              AI가 다음 도구를 실행하려고 합니다. 승인하시겠습니까?
            </p>
          )}
        </div>
      </div>

      {/* Tool List */}
      <div className="space-y-2 mb-4">
        {toolCalls.map((toolCall, index) => (
          <div
            key={toolCall.id || index}
            className="rounded-md border bg-background/50 p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium font-mono">{toolCall.name}</span>
            </div>
            {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
              <div className="ml-6">
                <p className="text-xs text-muted-foreground mb-1">Arguments:</p>
                <pre className="text-xs font-mono bg-muted/50 rounded p-2 overflow-x-auto">
                  {JSON.stringify(toolCall.arguments, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      {!responded && (
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReject}
            disabled={disabled}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
          >
            <XCircle className="h-4 w-4 mr-1" />
            거부
          </Button>
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={disabled}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            승인
          </Button>
        </div>
      )}

      {/* Response Indicator */}
      {responded && (
        <p className="text-xs text-muted-foreground italic text-right mt-2">
          {approved ? '사용자가 승인했습니다' : '사용자가 거부했습니다'}
        </p>
      )}
    </div>
  );
}
