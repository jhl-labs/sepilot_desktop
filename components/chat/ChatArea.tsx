'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './MessageBubble';
import { useChatStore } from '@/lib/store/chat-store';
import { MessageSquare } from 'lucide-react';
import { GraphFactory } from '@/lib/langgraph';
import { Message } from '@/types';

export function ChatArea() {
  const { messages, activeConversationId, graphType, updateMessage, deleteMessage, addMessage, setStreaming, setStreamingMessageId, streamingMessageId } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Handle message edit
  const handleEdit = async (messageId: string, newContent: string) => {
    // Update message content in store and database
    updateMessage(messageId, { content: newContent });

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

    // TODO: Optionally regenerate response if it's a user message
    // For now, we just update the content
  };

  // Handle message regeneration
  const handleRegenerate = async (messageId: string) => {
    if (!activeConversationId) return;

    // Variables for streaming animation
    let accumulatedContent = '';
    let accumulatedMessage: Partial<Message> = {};
    let pendingUpdate = false;
    let rafId: number | null = null;

    try {
      // 1. Find the assistant message to regenerate
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1 || messages[messageIndex].role !== 'assistant') return;

      // 2. Delete the assistant message
      await deleteMessage(messageId);

      // 3. Find all messages before the deleted assistant message
      const previousMessages = messages.slice(0, messageIndex);

      // 4. Create empty assistant message for streaming
      const assistantMessage = await addMessage({
        role: 'assistant',
        content: '',
      });

      const assistantMessageId = assistantMessage.id;

      // requestAnimationFrame을 사용한 부드러운 UI 업데이트
      const scheduleUpdate = (messageUpdates: Partial<Message>, force = false) => {
        accumulatedMessage = { ...accumulatedMessage, ...messageUpdates };

        if (force) {
          // 강제 업데이트 (스트리밍 완료 시)
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          updateMessage(assistantMessageId, accumulatedMessage);
          pendingUpdate = false;
          return;
        }

        // 이미 예약된 업데이트가 있으면 스킵 (다음 프레임에서 처리됨)
        if (pendingUpdate) {
          return;
        }

        pendingUpdate = true;
        rafId = requestAnimationFrame(() => {
          updateMessage(assistantMessageId, accumulatedMessage);
          pendingUpdate = false;
          rafId = null;
        });
      };

      setStreaming(true);
      setStreamingMessageId(assistantMessageId);

      // 5. Stream response from LangGraph
      for await (const event of GraphFactory.stream(graphType, previousMessages)) {
        // 각 노드의 실행 결과에서 메시지 업데이트
        if (event.type === 'node' && event.data?.messages) {
          const newMessages = event.data.messages;
          if (newMessages && newMessages.length > 0) {
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage.role === 'assistant') {
              // 전체 메시지 객체에서 필요한 필드만 추출하여 업데이트
              const { content, referenced_documents } = lastMessage;
              scheduleUpdate({ content, referenced_documents });
            }
          }
        }

        // 에러 처리
        if (event.type === 'error') {
          throw new Error(event.error || 'Regeneration failed');
        }
      }

      // Final update to ensure all content is displayed
      scheduleUpdate({}, true);

      // Save final message to database
      if (window.electronAPI) {
        const finalMessage: Message = {
          id: assistantMessageId,
          conversation_id: activeConversationId,
          role: 'assistant',
          content: accumulatedMessage.content || accumulatedContent,
          created_at: Date.now(),
          referenced_documents: accumulatedMessage.referenced_documents,
        };
        await window.electronAPI.chat.saveMessage(finalMessage);
      }
    } catch (error: any) {
      console.error('Regeneration error:', error);
    } finally {
      // Cleanup: cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      setStreaming(false);
      setStreamingMessageId(null);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!activeConversationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <MessageSquare className="mb-4 h-16 w-16 opacity-20" />
        <h2 className="mb-2 text-xl font-semibold">SEPilot에 오신 것을 환영합니다</h2>
        <p className="text-center text-sm">
          새 대화를 시작하거나 기존 대화를 선택하세요
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ScrollArea ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground px-4">
            <MessageSquare className="mb-4 h-16 w-16 opacity-10" />
            <p className="text-sm font-medium">메시지를 입력하여 대화를 시작하세요</p>
            <p className="text-xs mt-1 opacity-60">AI 어시스턴트가 도와드리겠습니다</p>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl">
            {messages.map((message, index) => {
              // Determine if this is the last assistant message
              const isLastAssistantMessage =
                message.role === 'assistant' &&
                index === messages.length - 1;

              // Check if this message is currently streaming
              const isMessageStreaming = streamingMessageId === message.id;

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onEdit={handleEdit}
                  onRegenerate={handleRegenerate}
                  isLastAssistantMessage={isLastAssistantMessage}
                  isStreaming={isMessageStreaming}
                />
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
