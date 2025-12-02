'use client';

/**
 * ToolApprovalPlugin
 *
 * Tool Approval Dialog (Human-in-the-loop)
 * Main, Editor 모드에서 사용
 */

import { ToolApprovalDialog } from '../../ToolApprovalDialog';
import type { PluginProps } from '../types';
import type { PendingToolApproval } from '@/types';

interface ToolApprovalPluginProps extends PluginProps {
  pendingApproval: PendingToolApproval | null;
  onApprove: (approved: boolean, alwaysApprove?: boolean) => void;
}

export function ToolApprovalPlugin({
  pendingApproval,
  onApprove,
}: ToolApprovalPluginProps) {
  if (!pendingApproval) {
    return null;
  }

  return (
    <ToolApprovalDialog
      open={!!pendingApproval}
      toolCalls={pendingApproval.toolCalls}
      onApprove={(alwaysApprove) => onApprove(true, alwaysApprove)}
      onReject={() => onApprove(false)}
    />
  );
}
