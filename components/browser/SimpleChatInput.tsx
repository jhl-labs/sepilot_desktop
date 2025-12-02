'use client';

import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Square } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';
import { getWebLLMClient } from '@/lib/llm/web-client';

// Stream event types
interface StreamEventProgress {
  type: 'progress';
  data: {
    iteration: number;
    maxIterations: number;
    status: string;
    message: string;
  };
}

interface StreamEventStreaming {
  type: 'streaming';
  chunk: string;
}

interface StreamEventNode {
  type: 'node';
  data: {
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
  };
}

type StreamEvent = StreamEventProgress | StreamEventStreaming | StreamEventNode;

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

  const {
    addBrowserChatMessage,
    updateBrowserChatMessage,
    browserChatMessages,
    setBrowserAgentIsRunning,
    setBrowserAgentStreamCleanup,
    browserAgentStreamCleanup,
  } = useChatStore();

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

    // Cleanup stream handler from store
    if (browserAgentStreamCleanup) {
      browserAgentStreamCleanup();
      setBrowserAgentStreamCleanup(null);
    }

    setIsStreaming(false);
    setAgentProgress(null);
    setBrowserAgentIsRunning(false);
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) {
      return;
    }

    // Cleanup previous stream if exists
    if (browserAgentStreamCleanup) {
      browserAgentStreamCleanup();
      setBrowserAgentStreamCleanup(null);
    }

    const userMessage = input.trim();
    setInput('');
    setIsStreaming(true);
    setBrowserAgentIsRunning(true);

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

        // Setup stream event listener (persistent across component lifecycle)
        const eventHandler = window.electronAPI.langgraph.onStreamEvent((event: unknown) => {
          try {
            if (!event) {
              return;
            }

            if (abortControllerRef.current?.signal.aborted) {
              return;
            }

            const evt = event as StreamEvent;

            // Handle progress events
            if (evt.type === 'progress') {
              setAgentProgress({
                iteration: evt.data.iteration,
                maxIterations: evt.data.maxIterations,
                status: evt.data.status,
                message: evt.data.message,
              });
              return;
            }

            // Handle real-time streaming chunks from LLM
            if (evt.type === 'streaming') {
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
            if (evt.type === 'node') {
              const allMessages = evt.data?.messages;
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

        // Store cleanup function in Zustand (persists across component lifecycle)
        setBrowserAgentStreamCleanup(eventHandler);

        try {
          // Start streaming via IPC (without conversationId for simple mode)
          await window.electronAPI.langgraph.stream(
            graphConfig,
            allMessages,
            'browser-chat-temp', // Temporary conversation ID for browser chat
            undefined, // comfyUIConfig
            undefined, // networkConfig
            undefined // workingDirectory
          );
        } catch (streamError) {
          console.error('[SimpleChatInput] Stream error:', streamError);
          // Cleanup on error
          if (eventHandler) {
            eventHandler();
            setBrowserAgentStreamCleanup(null);
          }
          throw streamError;
        }

        // Stream completed successfully - cleanup
        if (eventHandler) {
          eventHandler();
          setBrowserAgentStreamCleanup(null);
        }
        if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
          abortControllerRef.current.abort();
        }
        abortControllerRef.current = null;
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

      // Cleanup on error
      if (browserAgentStreamCleanup) {
        browserAgentStreamCleanup();
        setBrowserAgentStreamCleanup(null);
      }

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
      setBrowserAgentIsRunning(false);
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

  // Cleanup on unmount only if component is being destroyed (not just hidden)
  // NOTE: We intentionally DO NOT cleanup stream handler on unmount to allow
  // background processing when user switches to other tabs/modes
  useEffect(() => {
    return () => {
      // Only cleanup local state, not the global stream handler
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
      // Stream handler cleanup is managed by handleStop() or stream completion
    };
  }, []);

  return (
    <div className="shrink-0 border-t bg-background p-1.5">
      {/* Simplified Agent Status - 압축된 형태 */}
      {agentProgress && (
        <div className="mb-1.5 flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-primary">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span>실행 중</span>
            <span className="text-muted-foreground">
              ({agentProgress.iteration}/{agentProgress.maxIterations})
            </span>
          </div>
          <Button
            onClick={handleStop}
            variant="ghost"
            size="sm"
            className="h-5 px-2 shrink-0 text-[10px]"
            title="중단 (Esc)"
          >
            중단
          </Button>
        </div>
      )}

      <div className="relative flex items-end gap-1.5 rounded-md border border-input bg-background">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder="메시지 입력..."
          className="flex-1 min-h-[36px] max-h-[100px] resize-none border-0 bg-transparent px-2 py-1.5 text-[11px] focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
          disabled={isStreaming}
          rows={1}
        />
        <div className="flex items-center pb-1 pr-1">
          {isStreaming ? (
            <Button
              onClick={handleStop}
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-sm shrink-0"
              title="중지 (Esc)"
            >
              <Square className="h-3 w-3" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!input.trim()}
              size="icon"
              className="h-6 w-6 rounded-sm shrink-0 bg-primary hover:bg-primary/90 disabled:opacity-50"
              title="전송 (Enter)"
            >
              <Send className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
