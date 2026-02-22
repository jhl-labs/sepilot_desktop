'use client';

/**
 * ToolApprovalPlugin
 *
 * Tool approval dialog 플러그인 (Human-in-the-loop)
 * Main Chat, Editor Chat에서 사용
 *
 * Note: 이 플러그인은 기존 ToolApprovalDialog 컴포넌트를 재사용합니다.
 */

import { ToolApprovalDialog } from './ToolApprovalDialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { PendingToolApproval, ToolCall } from '@/types';

interface ToolApprovalPluginProps {
  pendingApproval: PendingToolApproval | null;
  onApprove: (toolCalls: ToolCall[]) => void;
  onReject: () => void;
  onAlwaysApprove: (toolCalls: ToolCall[]) => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onClearError?: () => void;
}

export function ToolApprovalPlugin({
  pendingApproval,
  onApprove,
  onReject,
  onAlwaysApprove,
  isSubmitting,
  errorMessage,
  onClearError,
}: ToolApprovalPluginProps) {
  if (!pendingApproval) {
    return null;
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="fixed bottom-4 right-4 z-50 w-[min(520px,calc(100vw-1.5rem))]">
          <div className="space-y-2 rounded-lg border border-destructive bg-destructive/5 p-6 text-center shadow-xl">
            <p className="text-sm font-medium text-destructive">도구 승인 다이얼로그 오류</p>
            <p className="text-xs text-muted-foreground">
              도구 승인 화면을 표시하는 중 오류가 발생했습니다.
            </p>
            <button
              onClick={onReject}
              className="mt-4 rounded bg-destructive px-4 py-2 text-xs text-destructive-foreground hover:bg-destructive/90"
            >
              취소
            </button>
          </div>
        </div>
      }
    >
      <ToolApprovalDialog
        pendingApproval={pendingApproval}
        onApprove={onApprove}
        onReject={onReject}
        onAlwaysApprove={onAlwaysApprove}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
        onClearError={onClearError}
      />
    </ErrorBoundary>
  );
}
