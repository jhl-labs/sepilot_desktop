'use client';

import { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './MessageBubble';
import { useChatStore } from '@/lib/store/chat-store';
import { MessageSquare } from 'lucide-react';
import { GraphFactory } from '@/lib/langgraph';
import { Message } from '@/types';

export function ChatArea() {
  const { messages, activeConversationId, graphType, updateMessage, deleteMessage, addMessage, startStreaming, stopStreaming, streamingConversations } = useChatStore();

  // Get streaming state for current conversation
  const streamingMessageId = activeConversationId ? streamingConversations.get(activeConversationId) || null : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Handle drag events for text files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const textContents: string[] = [];
    const imageFiles: { filename: string; mimeType: string; base64: string }[] = [];

    for (const file of files) {
      // 텍스트 파일인지 확인
      const isTextFile =
        file.type.startsWith('text/') ||
        file.name.endsWith('.txt') ||
        file.name.endsWith('.md') ||
        file.name.endsWith('.json') ||
        file.name.endsWith('.js') ||
        file.name.endsWith('.ts') ||
        file.name.endsWith('.tsx') ||
        file.name.endsWith('.jsx') ||
        file.name.endsWith('.css') ||
        file.name.endsWith('.html') ||
        file.name.endsWith('.xml') ||
        file.name.endsWith('.yaml') ||
        file.name.endsWith('.yml') ||
        file.name.endsWith('.py') ||
        file.name.endsWith('.java') ||
        file.name.endsWith('.c') ||
        file.name.endsWith('.cpp') ||
        file.name.endsWith('.h') ||
        file.name.endsWith('.sh') ||
        file.name.endsWith('.sql') ||
        file.name.endsWith('.csv');

      if (isTextFile) {
        try {
          const text = await file.text();
          textContents.push(`📄 **${file.name}**\n\`\`\`\n${text}\n\`\`\``);
        } catch (error) {
          console.error(`Failed to read file ${file.name}:`, error);
        }
      } else if (file.type.startsWith('image/')) {
        // 이미지 파일 처리
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          imageFiles.push({
            filename: file.name,
            mimeType: file.type,
            base64,
          });
        } catch (error) {
          console.error(`Failed to read image ${file.name}:`, error);
        }
      }
    }

    // Dispatch custom event to InputBox
    if (textContents.length > 0 || imageFiles.length > 0) {
      window.dispatchEvent(
        new CustomEvent('sepilot:file-drop', {
          detail: {
            textContents,
            imageFiles,
          },
        })
      );
    }
  };

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

      startStreaming(activeConversationId, assistantMessageId);

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
      stopStreaming(activeConversationId);
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
    <div
      ref={dropZoneRef}
      className={`flex flex-1 flex-col overflow-hidden relative transition-colors ${
        isDragging ? 'bg-primary/5' : ''
      }`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg z-10 pointer-events-none m-4">
          <div className="text-center">
            <MessageSquare className="mx-auto mb-2 h-12 w-12 text-primary opacity-60" />
            <p className="text-sm font-medium text-primary">텍스트 파일을 여기에 드롭하세요</p>
            <p className="text-xs text-muted-foreground mt-1">.txt, .md, .json, .js, .ts 등</p>
          </div>
        </div>
      )}
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
