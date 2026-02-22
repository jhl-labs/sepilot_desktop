import { logger } from '@/lib/utils/logger';
/**
 * useToolApproval Hook
 *
 * Tool approval 관리 (Human-in-the-loop)
 */

import { useCallback, useState } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';
import type { ToolCall } from '@/types';

export function useToolApproval() {
  const {
    pendingToolApproval,
    clearPendingToolApprovalForConversation,
    setAlwaysApproveToolsForSession,
  } = useChatStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const respond = useCallback(
    async (approved: boolean, alwaysApprove = false) => {
      if (!pendingToolApproval || isSubmitting) {
        return false;
      }

      setIsSubmitting(true);
      setErrorMessage(null);
      const targetConversationId = pendingToolApproval.conversationId;

      try {
        if (isElectron() && window.electronAPI?.langgraph) {
          await window.electronAPI.langgraph.respondToolApproval(targetConversationId, approved);
        }

        if (alwaysApprove && approved) {
          setAlwaysApproveToolsForSession(true);
        }

        clearPendingToolApprovalForConversation(targetConversationId);
        return true;
      } catch (error) {
        console.error('[useToolApproval] Failed to respond to tool approval:', error);
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('No pending approval')) {
          clearPendingToolApprovalForConversation(targetConversationId);
        }
        setErrorMessage(
          message.includes('No pending approval')
            ? '승인 요청이 만료되었습니다. 다시 실행하면 새 승인 요청이 생성됩니다.'
            : error instanceof Error
              ? error.message
              : '승인 응답을 전송하지 못했습니다. 네트워크/IPC 상태를 확인하세요.'
        );
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      pendingToolApproval,
      isSubmitting,
      setAlwaysApproveToolsForSession,
      clearPendingToolApprovalForConversation,
    ]
  );

  // Handle tool approval
  const handleToolApprove = useCallback(
    async (toolCalls: ToolCall[]) => {
      if (!pendingToolApproval) {
        return;
      }

      logger.info(
        '[useToolApproval] Approving tools:',
        toolCalls.map((tc) => tc.name)
      );
      await respond(true);
    },
    [pendingToolApproval, respond]
  );

  // Handle tool rejection
  const handleToolReject = useCallback(async () => {
    if (!pendingToolApproval) {
      return;
    }

    logger.info('[useToolApproval] Rejecting tools');
    await respond(false);
  }, [pendingToolApproval, respond]);

  // Handle always approve (session-wide)
  const handleToolAlwaysApprove = useCallback(
    async (_toolCalls: ToolCall[]) => {
      if (!pendingToolApproval) {
        return;
      }

      logger.info('[useToolApproval] Always approving tools for session');
      await respond(true, true);
    },
    [pendingToolApproval, respond]
  );

  return {
    pendingToolApproval,
    handleToolApprove,
    handleToolReject,
    handleToolAlwaysApprove,
    isSubmitting,
    errorMessage,
    clearError: () => setErrorMessage(null),
  };
}
