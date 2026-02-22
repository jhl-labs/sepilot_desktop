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
import { Bot } from 'lucide-react';
import type { ChatConfig } from './unified/types';
import type { ImageAttachment } from '@/types';
import { useShallow } from 'zustand/react/shallow';

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
  } = useChatStore(
    useShallow((state) => ({
      messages: state.messages,
      activeConversationId: state.activeConversationId,
      streamingConversations: state.streamingConversations,
      personas: state.personas,
      activePersonaId: state.activePersonaId,
      conversations: state.conversations,
      updateMessage: state.updateMessage,
      deleteMessage: state.deleteMessage,
      addMessage: state.addMessage,
      agentProgress: state.agentProgress,
    }))
  );

  // Load LLM and ImageGen config
  const { imageGenAvailable, mounted } = useConfigLoader();

  // Message streaming hook
  const { executeStreaming, stopCurrentStreaming } = useMessageStreaming();

  // Tool approval hook (unused in container, handled by ToolApprovalDialog)
  const _toolApprovalHooks = useToolApproval();

  // Get current conversation's persona
  const currentConversation = activeConversationId
    ? conversations.find((c: any) => c.id === activeConversationId)
    : null;

  // Validate conversation existence
  const isConversationValid = !!currentConversation;

  const conversationPersonaId = currentConversation?.personaId;
  const effectivePersonaId = conversationPersonaId || activePersonaId;
  const activePersona = personas.find((p: any) => p.id === effectivePersonaId);

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

    // 1. Immediately abort frontend (instant UI response)
    stopCurrentStreaming();

    // 2. Tell backend to abort (fire-and-forget for faster response)
    if (isElectron() && window.electronAPI?.langgraph) {
      window.electronAPI.langgraph.abort(activeConversationId).catch((error) => {
        logger.error('[ChatContainer] Failed to abort stream:', error);
      });
      // Note: Don't call removeAllStreamListeners() here.
      // The streaming hook's finally block handles listener cleanup.
    }
  }, [activeConversationId, stopCurrentStreaming]);

  // Handle message edit (from MessageBubble)
  const handleEdit = useCallback(
    async (messageId: string, newContent: string) => {
      updateMessage(messageId, { content: newContent }, activeConversationId || undefined);

      // Save to database
      if (window.electronAPI && activeConversationId) {
        const message = messages.find((m: any) => m.id === messageId);
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
      const messageIndex = messages.findIndex((m: any) => m.id === messageId);
      if (messageIndex === -1 || messages[messageIndex].role !== 'assistant') {
        return;
      }

      // Delete the assistant message
      await deleteMessage(messageId);

      // Find the user message before it
      const previousMessages = messages.slice(0, messageIndex);
      const lastUserMessage = [...previousMessages].reverse().find((m: any) => m.role === 'user');

      if (!lastUserMessage) {
        return;
      }

      // Re-send the user message
      await handleSendMessage(lastUserMessage.content, lastUserMessage.images);
    },
    [activeConversationId, messages, deleteMessage, handleSendMessage]
  );

  if (!activeConversationId || !isConversationValid) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <Bot className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">{t('chat.welcome.title')}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('chat.welcome.subtitle')}
          </p>
          <div className="pt-4 grid grid-cols-1 gap-2">
            <p className="text-xs text-muted-foreground/70 italic">
              사이드바에서 대화를 선택하거나 새 대화를 시작해보세요.
            </p>
          </div>
        </div>
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
      <ErrorBoundary
        fallback={
          <div className="p-4 border-t bg-destructive/5">
            <p className="text-sm text-destructive font-medium">입력 영역 오류</p>
            <p className="text-xs text-muted-foreground mt-1">
              메시지 입력 영역을 표시하는 중 오류가 발생했습니다.
            </p>
          </div>
        }
      >
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
      </ErrorBoundary>
    </div>
  );
}
