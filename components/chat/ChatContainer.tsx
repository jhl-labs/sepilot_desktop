'use client';

/**
 * ChatContainer
 *
 * Main Chat용 컨테이너 (Unified Chat 사용)
 * 기존 ChatArea + InputBox를 통합 아키텍처로 대체
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '@/lib/store/chat-store';
import { UnifiedChatArea } from './unified/UnifiedChatArea';
import { UnifiedChatInput } from './unified/UnifiedChatInput';
import { useMessageStreaming } from './unified/hooks/useMessageStreaming';
import { useToolApproval } from './unified/hooks/useToolApproval';
import { useConfigLoader } from './unified/hooks/useConfigLoader';
import { isElectron } from '@/lib/platform';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { logger } from '@/lib/utils/logger';
import type { ChatConfig } from './unified/types';
import type { ImageAttachment } from '@/types';

export function ChatContainer() {
  const { t } = useTranslation();
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
    agentProgress,
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

  // Build ChatConfig for Unified Chat (Area + Input)
  const chatConfig: ChatConfig = {
    mode: 'main',
    features: {
      enableEdit: true,
      enableRegenerate: true,
      enableCopy: true,
      enableFontScale: true,
      enableImageUpload: isElectron(),
      enableFileUpload: true,
      enableThinkingModeSelector: true,
      enableRAGToggle: true,
      enableToolsToggle: true,
      enableImageGeneration: imageGenAvailable,
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

  // Get translated systemPrompt for builtin personas
  const getPersonaSystemPrompt = useCallback(
    (persona: typeof activePersona): string | null => {
      if (!persona) {
        return null;
      }

      // For builtin personas, use translation if available
      if (persona.isBuiltin) {
        const translationKey = `persona.builtin.${persona.id}.systemPrompt`;
        const translated = t(translationKey);
        // If translation exists (key !== value), use it; otherwise fallback to original
        return translated !== translationKey ? translated : persona.systemPrompt;
      }

      // For custom personas, use the stored systemPrompt directly
      return persona.systemPrompt;
    },
    [t]
  );

  // Handle send message
  const handleSendMessage = useCallback(
    async (userMessage: string, images?: ImageAttachment[]) => {
      if (!activeConversationId) {
        return;
      }

      // Get persona system prompt (translated for builtin personas)
      const personaSystemPrompt = getPersonaSystemPrompt(activePersona);

      // Execute streaming
      await executeStreaming({
        conversationId: activeConversationId,
        userMessage,
        images,
        systemMessage: null,
        personaSystemPrompt,
      });
    },
    [activeConversationId, activePersona, executeStreaming, getPersonaSystemPrompt]
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
        logger.error('[ChatContainer] Failed to abort stream:', error);
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
        <h2 className="mb-2 text-xl font-semibold">{t('chat.welcome.title')}</h2>
        <p className="text-center text-sm">{t('chat.welcome.subtitle')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chat Area */}
      <ErrorBoundary>
        <UnifiedChatArea config={chatConfig} onEdit={handleEdit} onRegenerate={handleRegenerate} />
      </ErrorBoundary>

      {/* Unified Chat Input */}
      <UnifiedChatInput
        config={chatConfig}
        onSendMessage={handleSendMessage}
        onStopStreaming={handleStopStreaming}
        isStreaming={isStreaming}
        imageGenAvailable={imageGenAvailable}
        mounted={mounted}
        agentProgress={
          activeConversationId ? agentProgress.get(activeConversationId) || null : null
        }
      />
    </div>
  );
}
