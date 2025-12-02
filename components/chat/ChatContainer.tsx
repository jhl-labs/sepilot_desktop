'use client';

/**
 * ChatContainer
 *
 * Main Chat용 컨테이너 (Unified Chat 사용)
 * 기존 ChatArea + InputBox를 통합 아키텍처로 대체
 */

import { useCallback } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { UnifiedChatArea } from './unified/UnifiedChatArea';
import { MainChatInput } from './MainChatInput';
import { useMessageStreaming } from './unified/hooks/useMessageStreaming';
import { useToolApproval } from './unified/hooks/useToolApproval';
import { useConfigLoader } from './unified/hooks/useConfigLoader';
import { isElectron } from '@/lib/platform';
import type { ChatConfig } from './unified/types';
import type { ImageAttachment } from '@/types';

export function ChatContainer() {
  const {
    messages,
    activeConversationId,
    streamingConversations,
    personas,
    activePersonaId,
    conversations,
    updateMessage,
    deleteMessage,
    addMessage,
  } = useChatStore();

  // Load LLM and ImageGen config
  const { imageGenAvailable, mounted } = useConfigLoader();

  // Message streaming hook
  const { executeStreaming, stopCurrentStreaming } = useMessageStreaming();

  // Tool approval hook (unused in container, handled by ToolApprovalDialog)
  const _toolApprovalHooks = useToolApproval();

  // Get current conversation's persona
  const currentConversation = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)
    : null;
  const conversationPersonaId = currentConversation?.personaId;
  const effectivePersonaId = conversationPersonaId || activePersonaId;
  const activePersona = personas.find((p) => p.id === effectivePersonaId);

  // Get streaming state
  const streamingMessageId = activeConversationId
    ? streamingConversations.get(activeConversationId) || null
    : null;
  const isStreaming = !!streamingMessageId;

  // Build ChatConfig for UnifiedChatArea
  const chatConfig: ChatConfig = {
    mode: 'main',
    features: {
      enableEdit: true,
      enableRegenerate: true,
      enableCopy: true,
      enableFontScale: true,
    },
    dataSource: {
      messages,
      streamingState: streamingMessageId,
      addMessage: async (msg) => {
        return await addMessage(msg, activeConversationId || undefined);
      },
      updateMessage: (id, updates) => {
        updateMessage(id, updates, activeConversationId || undefined);
      },
      clearMessages: () => {
        // Not implemented for Main Chat
      },
      startStreaming: () => {},
      stopStreaming: () => {},
    },
    conversationId: activeConversationId || undefined,
    activePersona,
  };

  // Handle send message
  const handleSendMessage = useCallback(
    async (userMessage: string, images?: ImageAttachment[]) => {
      if (!activeConversationId) {
        return;
      }

      // Get system message from Quick Input (if any)
      const systemMessage = sessionStorage.getItem('sepilot_quick_system_message');
      if (systemMessage) {
        sessionStorage.removeItem('sepilot_quick_system_message');
      }

      // Get persona system prompt
      const personaSystemPrompt = activePersona?.systemPrompt || null;

      // Execute streaming
      await executeStreaming({
        conversationId: activeConversationId,
        userMessage,
        images,
        systemMessage,
        personaSystemPrompt,
      });
    },
    [activeConversationId, activePersona, executeStreaming]
  );

  // Handle stop streaming
  const handleStopStreaming = useCallback(async () => {
    if (!activeConversationId) {
      return;
    }

    // Abort IPC stream
    if (isElectron() && window.electronAPI?.langgraph) {
      try {
        await window.electronAPI.langgraph.abort(activeConversationId);
      } catch (error) {
        console.error('[ChatContainer] Failed to abort stream:', error);
      }
      window.electronAPI.langgraph.removeAllStreamListeners();
    }

    // Stop streaming via hook
    stopCurrentStreaming();
  }, [activeConversationId, stopCurrentStreaming]);

  // Handle message edit (from MessageBubble)
  const handleEdit = useCallback(
    async (messageId: string, newContent: string) => {
      updateMessage(messageId, { content: newContent }, activeConversationId || undefined);

      // Save to database
      if (window.electronAPI && activeConversationId) {
        const message = messages.find((m) => m.id === messageId);
        if (message) {
          await window.electronAPI.chat.saveMessage({
            ...message,
            content: newContent,
          });
        }
      }
    },
    [activeConversationId, messages, updateMessage]
  );

  // Handle message regeneration (from MessageBubble)
  const handleRegenerate = useCallback(
    async (messageId: string) => {
      if (!activeConversationId) {
        return;
      }

      // Find the assistant message to regenerate
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1 || messages[messageIndex].role !== 'assistant') {
        return;
      }

      // Delete the assistant message
      await deleteMessage(messageId);

      // Find the user message before it
      const previousMessages = messages.slice(0, messageIndex);
      const lastUserMessage = [...previousMessages].reverse().find((m) => m.role === 'user');

      if (!lastUserMessage) {
        return;
      }

      // Re-send the user message
      await handleSendMessage(lastUserMessage.content, lastUserMessage.images);
    },
    [activeConversationId, messages, deleteMessage, handleSendMessage]
  );

  if (!activeConversationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <h2 className="mb-2 text-xl font-semibold">SEPilot에 오신 것을 환영합니다</h2>
        <p className="text-center text-sm">새 대화를 시작하거나 기존 대화를 선택하세요</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chat Area */}
      <UnifiedChatArea
        config={chatConfig}
        onEdit={handleEdit}
        onRegenerate={handleRegenerate}
      />

      {/* Main Chat Input */}
      <MainChatInput
        onSendMessage={handleSendMessage}
        onStopStreaming={handleStopStreaming}
        isStreaming={isStreaming}
        imageGenAvailable={imageGenAvailable}
        mounted={mounted}
      />
    </div>
  );
}
