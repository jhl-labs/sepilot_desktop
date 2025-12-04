'use client';

/**
 * ToolApprovalPlugin
 *
 * Tool approval dialog 플러그인 (Human-in-the-loop)
 * Main Chat, Editor Chat에서 사용
 *
 * Note: 이 플러그인은 기존 ToolApprovalDialog 컴포넌트를 재사용합니다.
 */

import { ToolApprovalDialog } from '@/components/chat/ToolApprovalDialog';
import type { PendingToolApproval, ToolCall } from '@/types';

interface ToolApprovalPluginProps {
  pendingApproval: PendingToolApproval | null;
  onApprove: (toolCalls: ToolCall[]) => void;
  onReject: () => void;
  onAlwaysApprove: (toolCalls: ToolCall[]) => void;
}

export function ToolApprovalPlugin({
  pendingApproval,
  onApprove,
  onReject,
  onAlwaysApprove,
}: ToolApprovalPluginProps) {
  if (!pendingApproval) {
    return null;
  }

  return (
    <ToolApprovalDialog
      onApprove={onApprove}
      onReject={onReject}
      onAlwaysApprove={onAlwaysApprove}
    />
  );
}
