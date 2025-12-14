'use client';

import { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './MessageBubble';
import { useChatStore } from '@/lib/store/chat-store';
import { MessageSquare, ZoomIn } from 'lucide-react';
import { Message } from '@/types';
import { isTextFile } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const FONT_SCALE_KEY = 'sepilot-chat-font-scale';
const DEFAULT_FONT_SCALE = '100';
const FONT_SCALE_OPTIONS = [
  '50',
  '60',
  '70',
  '80',
  '90',
  '100',
  '110',
  '120',
  '130',
  '140',
  '150',
  '160',
  '170',
  '180',
  '190',
  '200',
];

export function ChatArea() {
  const {
    messages,
    activeConversationId,
    getGraphConfig,
    updateMessage,
    deleteMessage,
    addMessage,
    startStreaming,
    stopStreaming,
    streamingConversations,
    workingDirectory,
    personas,
    activePersonaId,
    conversations,
  } = useChatStore();

  // Get current conversation's persona (conversation-specific persona takes precedence)
  const currentConversation = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)
    : null;
  const conversationPersonaId = currentConversation?.personaId;
  const effectivePersonaId = conversationPersonaId || activePersonaId;
  const activePersona = personas.find((p) => p.id === effectivePersonaId);

  // Get streaming state for current conversation
  const streamingMessageId = activeConversationId
    ? streamingConversations.get(activeConversationId) || null
    : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null); // RAF cleanup for handleRegenerate
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
    if (files.length === 0) {
      return;
    }

    const textContents: string[] = [];
    const imageFiles: { filename: string; mimeType: string; base64: string }[] = [];
    const failedFiles: string[] = [];

    for (const file of files) {
      // 텍스트 파일인지 확인
      if (isTextFile(file)) {
        try {
          const text = await file.text();
          textContents.push(`📄 **${file.name}**\n\`\`\`\n${text}\n\`\`\``);
        } catch (error) {
          console.error(`Failed to read file ${file.name}:`, error);
          failedFiles.push(file.name);
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
          failedFiles.push(file.name);
        }
      }
    }

    // Show error notification for failed files
    if (failedFiles.length > 0) {
      window.alert(`다음 파일을 읽을 수 없습니다:\n${failedFiles.join('\n')}`);
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

  // Font scale state with localStorage persistence
  const [fontScale, setFontScale] = useState<string>(DEFAULT_FONT_SCALE);

  // Load font scale from localStorage on mount
  useEffect(() => {
    const savedScale = localStorage.getItem(FONT_SCALE_KEY);
    if (savedScale && FONT_SCALE_OPTIONS.includes(savedScale)) {
      setFontScale(savedScale);
    }
  }, []);

  // Handle font scale change
  const handleFontScaleChange = (value: string) => {
    setFontScale(value);
    localStorage.setItem(FONT_SCALE_KEY, value);
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
    if (!activeConversationId) {
      return;
    }

    // Capture conversationId at function start to prevent race conditions
    const conversationId = activeConversationId;

    // Variables for streaming animation
    let accumulatedContent = '';
    let accumulatedMessage: Partial<Message> = {};
    let pendingUpdate = false;

    try {
      // 1. Find the assistant message to regenerate
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1 || messages[messageIndex].role !== 'assistant') {
        return;
      }

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
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
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
        rafIdRef.current = requestAnimationFrame(() => {
          updateMessage(assistantMessageId, accumulatedMessage);
          pendingUpdate = false;
          rafIdRef.current = null;
        });
      };

      startStreaming(conversationId, assistantMessageId);

      // 5. Stream response from LangGraph via IPC
      if (window.electronAPI?.langgraph) {
        const graphConfig = getGraphConfig();

        // Setup stream event listener
        const eventHandler = window.electronAPI.langgraph.onStreamEvent((event: any) => {
          try {
            // Guard: Check if event exists
            if (!event) {
              return;
            }

            // Filter events by conversationId
            if (event.conversationId && event.conversationId !== conversationId) {
              return;
            }

            // Handle real-time streaming chunks from LLM
            if (event.type === 'streaming' && event.chunk) {
              accumulatedContent += event.chunk;
              scheduleUpdate({ content: accumulatedContent });
              return;
            }

            // Handle node execution results
            if (event.type === 'node' && event.data?.messages) {
              const allMessages = event.data.messages;
              if (allMessages && allMessages.length > 0) {
                // Convert all messages to a single display content (Claude Code style)
                let displayContent = '';

                for (let i = 0; i < allMessages.length; i++) {
                  const msg = allMessages[i];

                  // Skip user messages (already displayed separately)
                  if (msg.role === 'user') {
                    continue;
                  }

                  // Assistant message with tool calls - Only show thinking, not tool names
                  if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                    if (msg.content) {
                      // Truncate long thinking content
                      const thinkingContent =
                        msg.content.length > 300
                          ? `${msg.content.substring(0, 300)}...`
                          : msg.content;
                      displayContent += `💭 ${thinkingContent}\n\n`;
                    }
                    // Don't show tool calls here - they'll be shown with results
                    continue;
                  }

                  // Tool result messages - Show tool call + result together
                  if (msg.role === 'tool' && msg.tool_call_id) {
                    const toolName = msg.name || 'tool';

                    // Find the corresponding tool call to get arguments
                    let toolArgs: any = null;
                    for (let j = i - 1; j >= 0; j--) {
                      const prevMsg = allMessages[j];
                      if (prevMsg.role === 'assistant' && prevMsg.tool_calls) {
                        const toolCall = prevMsg.tool_calls.find(
                          (tc: any) => tc.id === msg.tool_call_id
                        );
                        if (toolCall) {
                          toolArgs = toolCall.arguments;
                          break;
                        }
                      }
                    }

                    // Check if there's an error in the content
                    const hasError =
                      msg.content &&
                      (msg.content.toLowerCase().includes('error:') ||
                        msg.content.toLowerCase().includes('failed to') ||
                        msg.content.toLowerCase().includes('enoent') ||
                        msg.content.toLowerCase().includes('eacces'));

                    // Start with tool name and args
                    displayContent += `🔧 ${toolName}`;
                    if (toolArgs) {
                      if (toolArgs.command) {
                        displayContent += ` \`${toolArgs.command}\``;
                      } else if (toolArgs.path) {
                        displayContent += ` \`${toolArgs.path}\``;
                      } else if (toolArgs.pattern) {
                        displayContent += ` \`${toolArgs.pattern}\``;
                      }
                    }
                    displayContent += '\n';

                    if (hasError) {
                      // Show error details
                      const errorLines = msg.content.split('\n');
                      const linesToShow = errorLines.slice(0, 10);
                      let errorMsg = linesToShow.join('\n');

                      if (errorMsg.length > 800) {
                        errorMsg = `${errorMsg.substring(0, 800)}\n... (truncated)`;
                      }

                      const indentedError = errorMsg
                        .split('\n')
                        .map((line: string) => `   ❌ ${line}`)
                        .join('\n');
                      displayContent += `${indentedError}\n\n`;
                    } else {
                      // Show success with summary
                      let summary = '';

                      if (toolName === 'file_write' || toolName === 'file_edit') {
                        // Show file modification summary
                        if (toolArgs?.path) {
                          summary = `Modified ${toolArgs.path}`;
                          if (msg.content.includes('lines changed')) {
                            const match = msg.content.match(/(\d+)\s+lines?\s+changed/);
                            if (match) {
                              summary = `${match[1]} lines changed`;
                            }
                          }
                        } else {
                          summary = msg.content.split('\n')[0].substring(0, 60);
                        }
                      } else if (toolName === 'file_read') {
                        const lineCount = msg.content.split('\n').length;
                        summary = `Read ${lineCount} lines`;
                      } else if (toolName === 'file_list') {
                        const files = msg.content
                          .split('\n')
                          .filter((l: string) => l.trim()).length;
                        summary = `Found ${files} items`;
                      } else if (toolName === 'command_execute') {
                        // Show stdout (first few lines)
                        const contentLines = msg.content.split('\n').slice(0, 5);
                        let output = contentLines.join('\n');
                        if (output.length > 200) {
                          output = `${output.substring(0, 200)}...`;
                        }
                        if (output.trim()) {
                          summary = output;
                        } else {
                          summary = 'Success (no output)';
                        }
                      } else if (toolName === 'grep_search') {
                        const matches = msg.content
                          .split('\n')
                          .filter((l: string) => l.trim()).length;
                        summary = `Found ${matches} matches`;
                      } else {
                        // Generic summary - first line
                        summary = msg.content.split('\n')[0].substring(0, 60);
                      }

                      displayContent += `   ✅ ${summary}\n\n`;
                    }
                    continue;
                  }

                  // Final assistant message (no tool calls)
                  if (
                    msg.role === 'assistant' &&
                    (!msg.tool_calls || msg.tool_calls.length === 0)
                  ) {
                    if (msg.content) {
                      displayContent += `${msg.content}\n\n`;
                    }
                  }
                }

                // Update with formatted content
                scheduleUpdate({
                  content: displayContent.trim(),
                  referenced_documents: allMessages[allMessages.length - 1]?.referenced_documents,
                });
              }
            }

            // Handle errors
            if (event.type === 'error') {
              throw new Error(event.error || 'Regeneration failed');
            }
          } catch (error) {
            console.error('[ChatArea] Stream event error:', error);
          }
        });

        try {
          // Start streaming via IPC
          await window.electronAPI.langgraph.stream(
            graphConfig,
            previousMessages,
            conversationId,
            undefined, // comfyUIConfig
            undefined, // networkConfig
            workingDirectory || undefined // workingDirectory for Coding Agent
          );
        } finally {
          // Cleanup event listener
          if (eventHandler) {
            eventHandler();
          }
        }
      }

      // Final update to ensure all content is displayed
      scheduleUpdate({}, true);

      // Save final message to database
      if (window.electronAPI) {
        const finalMessage: Message = {
          id: assistantMessageId,
          conversation_id: conversationId,
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
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      stopStreaming(conversationId);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  if (!activeConversationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <MessageSquare className="mb-4 h-16 w-16 opacity-20" />
        <h2 className="mb-2 text-xl font-semibold">SEPilot에 오신 것을 환영합니다</h2>
        <p className="text-center text-sm">새 대화를 시작하거나 기존 대화를 선택하세요</p>
      </div>
    );
  }

  return (
    <div
      ref={dropZoneRef}
      className={`relative flex flex-1 flex-col overflow-hidden transition-colors ${
        isDragging ? 'bg-primary/5' : ''
      }`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Floating Font Scale Selector */}
      <div className="absolute right-4 bottom-4 z-10">
        <Select value={fontScale} onValueChange={handleFontScaleChange}>
          <SelectTrigger className="h-8 w-[90px] bg-background/80 backdrop-blur-sm text-xs">
            <ZoomIn className="h-3.5 w-3.5 mr-1 opacity-60" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_SCALE_OPTIONS.map((scale) => (
              <SelectItem key={scale} value={scale} className="text-xs">
                {scale}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
          <div
            className="mx-auto max-w-4xl"
            style={{ fontSize: `${parseInt(fontScale) / 100}rem` }}
          >
            {messages.map((message, index) => {
              // Determine if this is the last assistant message
              const isLastAssistantMessage =
                message.role === 'assistant' && index === messages.length - 1;

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
                  activePersona={activePersona}
                />
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
