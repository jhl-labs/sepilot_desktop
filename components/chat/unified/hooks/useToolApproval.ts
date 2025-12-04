/**
 * useToolApproval Hook
 *
 * Tool approval 관리 (Human-in-the-loop)
 */

import { useCallback } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';
import type { ToolCall } from '@/types';

export function useToolApproval() {
  const { pendingToolApproval, clearPendingToolApproval, setAlwaysApproveToolsForSession } =
    useChatStore();

  // Handle tool approval
  const handleToolApprove = useCallback(
    async (toolCalls: ToolCall[]) => {
      if (!pendingToolApproval) {
        return;
      }

      console.log(
        '[useToolApproval] Approving tools:',
        toolCalls.map((tc) => tc.name)
      );

      try {
        if (isElectron() && window.electronAPI?.langgraph) {
          await window.electronAPI.langgraph.respondToolApproval(
            pendingToolApproval.conversationId,
            true
          );
        }
      } catch (error) {
        console.error('[useToolApproval] Failed to respond to tool approval:', error);
      }

      clearPendingToolApproval();
    },
    [pendingToolApproval, clearPendingToolApproval]
  );

  // Handle tool rejection
  const handleToolReject = useCallback(async () => {
    if (!pendingToolApproval) {
      return;
    }

    console.log('[useToolApproval] Rejecting tools');

    try {
      if (isElectron() && window.electronAPI?.langgraph) {
        await window.electronAPI.langgraph.respondToolApproval(
          pendingToolApproval.conversationId,
          false
        );
      }
    } catch (error) {
      console.error('[useToolApproval] Failed to respond to tool rejection:', error);
    }

    clearPendingToolApproval();
  }, [pendingToolApproval, clearPendingToolApproval]);

  // Handle always approve (session-wide)
  const handleToolAlwaysApprove = useCallback(
    async (_toolCalls: ToolCall[]) => {
      if (!pendingToolApproval) {
        return;
      }

      console.log('[useToolApproval] Always approving tools for session');

      // Set session-wide auto-approval
      setAlwaysApproveToolsForSession(true);

      // Approve current tools
      try {
        if (isElectron() && window.electronAPI?.langgraph) {
          await window.electronAPI.langgraph.respondToolApproval(
            pendingToolApproval.conversationId,
            true
          );
        }
      } catch (error) {
        console.error('[useToolApproval] Failed to respond to tool approval:', error);
      }

      clearPendingToolApproval();
    },
    [pendingToolApproval, clearPendingToolApproval, setAlwaysApproveToolsForSession]
  );

  return {
    pendingToolApproval,
    handleToolApprove,
    handleToolReject,
    handleToolAlwaysApprove,
  };
}
