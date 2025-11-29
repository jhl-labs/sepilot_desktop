'use client';

import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Square } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';
import { getWebLLMClient } from '@/lib/llm/web-client';

export function SimpleChatInput() {
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [agentProgress, setAgentProgress] = useState<{
    iteration: number;
    maxIterations: number;
    status: string;
    message: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { addBrowserChatMessage, updateBrowserChatMessage, browserChatMessages } = useChatStore();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleStop = async () => {
    // Stop Browser Agent (if running)
    if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.langgraph) {
      try {
        await window.electronAPI.langgraph.stopBrowserAgent('browser-chat-temp');
      } catch (error) {
        console.error('[SimpleChatInput] Failed to stop Browser Agent:', error);
      }
    }

    // Abort stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsStreaming(false);
    setAgentProgress(null);
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) {
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setIsStreaming(true);

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      // Add user message
      addBrowserChatMessage({
        role: 'user',
        content: userMessage,
      });

      // Create empty assistant message for streaming
      addBrowserChatMessage({
        role: 'assistant',
        content: '',
      });

      // Stream accumulator
      let accumulatedContent = '';

      if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.langgraph) {
        // Electron: Use Browser Agent with Browser Control Tools
        const graphConfig = {
          thinkingMode: 'browser-agent' as const,
          enableRAG: false,
          enableTools: true, // Enable Browser Control Tools
          enableImageGeneration: false,
        };

        // Prepare messages for LLM
        const allMessages = [
          ...browserChatMessages,
          {
            id: 'temp',
            role: 'user' as const,
            content: userMessage,
            created_at: Date.now(),
          },
        ];

        // Setup stream event listener
        const eventHandler = window.electronAPI.langgraph.onStreamEvent((event: unknown) => {
          try {
            if (!event) {
              return;
            }

            if (abortControllerRef.current?.signal.aborted) {
              return;
            }

            // Cast to any for event property access
            const evt = event as {
              type?: string;
              chunk?: string;
              data?: {
                messages?: Array<{ role: string; content?: string }>;
                iteration?: number;
                maxIterations?: number;
                status?: string;
                message?: string;
              }
            };

            // Handle progress events
            if (evt.type === 'progress' && evt.data) {
              setAgentProgress({
                iteration: evt.data.iteration || 0,
                maxIterations: evt.data.maxIterations || 30,
                status: evt.data.status || 'working',
                message: evt.data.message || 'AI 작업 중...',
              });
              return;
            }

            // Handle real-time streaming chunks from LLM
            if (evt.type === 'streaming' && evt.chunk) {
              accumulatedContent += evt.chunk;
              // Update the last assistant message
              const messages = useChatStore.getState().browserChatMessages;
              const lastMessage = messages[messages.length - 1];
              if (lastMessage && lastMessage.role === 'assistant') {
                updateBrowserChatMessage(lastMessage.id, { content: accumulatedContent });
              }
              return;
            }

            // Handle node execution results
            if (evt.type === 'node' && evt.data?.messages) {
              const allMessages = evt.data.messages;
              if (allMessages && allMessages.length > 0) {
                const lastMsg = allMessages[allMessages.length - 1];
                if (lastMsg.role === 'assistant' && lastMsg.content) {
                  const messages = useChatStore.getState().browserChatMessages;
                  const lastMessage = messages[messages.length - 1];
                  if (lastMessage && lastMessage.role === 'assistant') {
                    updateBrowserChatMessage(lastMessage.id, { content: lastMsg.content });
                  }
                }
              }
            }
          } catch (error) {
            console.error('[SimpleChatInput] Stream event error:', error);
          }
        });

        try {
          // Start streaming via IPC (without conversationId for simple mode)
          await window.electronAPI.langgraph.stream(
            graphConfig,
            allMessages,
            'browser-chat-temp', // Temporary conversation ID for browser chat
            undefined, // comfyUIConfig
            undefined, // networkConfig
            undefined  // workingDirectory
          );
        } finally {
          // Cleanup event listener
          if (eventHandler) {
            eventHandler();
          }
        }
      } else {
        // Web: WebLLMClient directly
        const webClient = getWebLLMClient();
        const historyMessages = [
          ...browserChatMessages.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          })),
          {
            role: 'user' as const,
            content: userMessage,
          },
        ];

        for await (const chunk of webClient.stream(historyMessages)) {
          if (abortControllerRef.current?.signal.aborted) {
            break;
          }

          if (!chunk.done && chunk.content) {
            accumulatedContent += chunk.content;
            const messages = useChatStore.getState().browserChatMessages;
            const lastMessage = messages[messages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              updateBrowserChatMessage(lastMessage.id, { content: accumulatedContent });
            }
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get response';
      console.error('Browser chat error:', error);
      // Update last message with error
      const messages = useChatStore.getState().browserChatMessages;
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        updateBrowserChatMessage(lastMessage.id, {
          content: `Error: ${errorMessage}`,
        });
      }
    } finally {
      setIsStreaming(false);
      setAgentProgress(null);
      abortControllerRef.current = null;
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle Esc key to stop streaming
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isStreaming) {
        handleStop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStreaming]);

  return (
    <div className="shrink-0 border-t bg-background p-2">
      {/* Agent Progress Display */}
      {agentProgress && (
        <div className="mb-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span>
                  {agentProgress.status === 'thinking' && '🤔 생각 중...'}
                  {agentProgress.status === 'executing' && '⚙️ 실행 중...'}
                  {agentProgress.status !== 'thinking' && agentProgress.status !== 'executing' && '🔄 작업 중...'}
                </span>
                <span className="text-muted-foreground">
                  ({agentProgress.iteration}/{agentProgress.maxIterations})
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground truncate">
                {agentProgress.message}
              </p>
            </div>
            <Button
              onClick={handleStop}
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 text-xs"
              title="중단"
            >
              중단
            </Button>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${(agentProgress.iteration / agentProgress.maxIterations) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="relative flex items-end gap-2 rounded-lg border border-input bg-background">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder={`사용 가능한 Browser Agent 도구:
• 페이지 이동 • 페이지 내용 읽기 • 클릭 가능 요소 찾기
• 요소 클릭 • 텍스트 입력 • 스크롤
• 새 탭 열기 • 탭 전환 • 탭 닫기 • 탭 목록
• 스크린샷 + 텍스트 요약 • 선택 텍스트 읽기`}
          className="flex-1 min-h-[40px] max-h-[120px] resize-none border-0 bg-transparent px-3 py-2 text-xs focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
          disabled={isStreaming}
          rows={1}
        />
        <div className="flex items-center pb-1 pr-1">
          {isStreaming ? (
            <Button
              onClick={handleStop}
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md shrink-0"
              title="중지 (Esc)"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!input.trim()}
              size="icon"
              className="h-7 w-7 rounded-md shrink-0 bg-primary hover:bg-primary/90 disabled:opacity-50"
              title="전송 (Enter)"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
