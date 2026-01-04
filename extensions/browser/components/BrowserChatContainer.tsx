'use client';

/**
 * BrowserChatContainer
 *
 * Browser Chat용 컨테이너 (Unified Chat 사용)
 * Compact 모드, Agent Logs, Agent Progress 포함
 */

import { useState, useRef, useCallback } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { UnifiedChatArea } from '@/components/chat/unified/UnifiedChatArea';
import { UnifiedChatInput } from '@/components/chat/unified/UnifiedChatInput';
import { AgentLogsPlugin } from '@/components/chat/unified/plugins/AgentLogsPlugin';
import type { ChatConfig } from '@/components/chat/unified/types';
import { isElectron } from '@/lib/platform';
import { getWebLLMClient } from '@/lib/llm/web-client';

// Stream event types
interface StreamEventProgress {
  type: 'progress';
  conversationId?: string;
  data: {
    iteration: number;
    maxIterations: number;
    status: string;
    message: string;
  };
}

interface StreamEventStreaming {
  type: 'streaming';
  conversationId?: string;
  chunk: string;
}

interface StreamEventNode {
  type: 'node';
  conversationId?: string;
  data: {
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
  };
}

type StreamEvent = StreamEventProgress | StreamEventStreaming | StreamEventNode;

export function BrowserChatContainer() {
  const {
    browserChatMessages,
    browserChatFontConfig,
    browserAgentLogs,
    browserAgentIsRunning,
    addBrowserChatMessage,
    updateBrowserChatMessage,
    setBrowserAgentIsRunning,
    setBrowserAgentStreamCleanup,
    browserAgentStreamCleanup,
  } = useChatStore();

  const [agentProgress, setAgentProgress] = useState<{
    iteration: number;
    maxIterations: number;
    status: string;
    message: string;
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Build ChatConfig for UnifiedChatArea (compact mode)
  const chatConfig: ChatConfig = {
    mode: 'browser',
    features: {
      enableEdit: false,
      enableRegenerate: false,
      enableCopy: true,
      enableAgentLogs: true,
    },
    style: {
      compact: true,
      fontSize: `${Math.max(10, browserChatFontConfig.fontSize - 2)}px`,
      maxWidth: '90%',
    },
    dataSource: {
      messages: browserChatMessages,
      streamingState: null,
      agentLogs: browserAgentLogs,
      addMessage: async () => {
        // Handled by handleSendMessage
        return { id: '', role: 'user', content: '', created_at: 0 };
      },
      updateMessage: () => {
        // Handled by handleSendMessage
      },
      clearMessages: () => {
        // Not implemented
      },
      startStreaming: () => {},
      stopStreaming: () => {},
    },
  };

  // Handle stop streaming
  const handleStopStreaming = useCallback(async () => {
    // Stop Browser Agent (if running)
    if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.langgraph) {
      try {
        await window.electronAPI.langgraph.stopBrowserAgent('browser-chat-temp');
      } catch (error) {
        console.error('[BrowserChatContainer] Failed to stop Browser Agent:', error);
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

    setAgentProgress(null);
    setBrowserAgentIsRunning(false);
  }, [browserAgentStreamCleanup, setBrowserAgentStreamCleanup, setBrowserAgentIsRunning]);

  // Handle send message
  const handleSendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || browserAgentIsRunning) {
        return;
      }

      // Cleanup previous stream if exists
      if (browserAgentStreamCleanup) {
        browserAgentStreamCleanup();
        setBrowserAgentStreamCleanup(null);
      }

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

              const evt = event as StreamEvent;

              // Filter events by conversationId - only handle events for browser-chat-temp
              if (evt.conversationId && evt.conversationId !== 'browser-chat-temp') {
                return;
              }

              if (abortControllerRef.current?.signal.aborted) {
                return;
              }

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
              console.error('[BrowserChatContainer] Stream event error:', error);
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
            console.error('[BrowserChatContainer] Stream error:', streamError);
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
        setAgentProgress(null);
        setBrowserAgentIsRunning(false);
        abortControllerRef.current = null;
      }
    },
    [
      browserAgentIsRunning,
      browserAgentStreamCleanup,
      browserChatMessages,
      addBrowserChatMessage,
      updateBrowserChatMessage,
      setBrowserAgentIsRunning,
      setBrowserAgentStreamCleanup,
    ]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Chat Area (Compact) with Agent Logs */}
      <div className="flex-1 overflow-y-auto">
        <UnifiedChatArea config={chatConfig} />

        {/* Agent Logs (at the bottom of chat area) */}
        {browserAgentLogs.length > 0 && (
          <div className="px-2 pb-2">
            <AgentLogsPlugin
              logs={browserAgentLogs}
              isRunning={browserAgentIsRunning}
              maxLogs={3}
            />
          </div>
        )}
      </div>

      {/* Unified Chat Input */}
      <UnifiedChatInput
        config={chatConfig}
        onSendMessage={handleSendMessage}
        onStopStreaming={handleStopStreaming}
        isStreaming={browserAgentIsRunning}
        agentProgress={agentProgress}
      />
    </div>
  );
}
