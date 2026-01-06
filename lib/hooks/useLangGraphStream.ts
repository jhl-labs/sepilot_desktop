/**
 * useLangGraphStream Hook
 *
 * LangGraph 스트리밍 로직을 재사용하기 위한 Custom Hook
 * EditorChatContainer, BrowserChatContainer, SimpleChatInput 등에서 공통으로 사용
 */

import { useRef, useCallback } from 'react';
import { isElectron } from '@/lib/platform';
import { getWebLLMClient } from '@/lib/llm/web-client';
import type { Message } from '@/types';

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

interface UseLangGraphStreamOptions {
  /**
   * Chat mode: 'editor', 'browser', etc.
   */
  mode: 'editor' | 'browser';

  /**
   * Conversation ID for this stream
   */
  conversationId: string;

  /**
   * Working directory (for editor mode)
   */
  workingDirectory?: string;

  /**
   * Messages accessor (function to get current messages)
   */
  getMessages: () => Message[];

  /**
   * Update message function
   */
  updateMessage: (messageId: string, updates: Partial<Message>) => void;

  /**
   * Agent progress callback
   */
  onAgentProgress?: (progress: {
    iteration: number;
    maxIterations: number;
    status: string;
    message: string;
  }) => void;

  /**
   * Stream cleanup callback (for persistent event handlers)
   */
  onSetCleanup?: (cleanup: (() => void) | null) => void;

  /**
   * Get stream cleanup function (for checking if cleanup exists)
   */
  getCleanup?: () => (() => void) | null;

  /**
   * Tool approval request callback (for Editor Agent)
   */
  onToolApprovalRequest?: (data: {
    conversationId: string;
    messageId: string;
    toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  }) => void;

  /**
   * Tool approval result callback (for Editor Agent)
   */
  onToolApprovalResult?: (approved: boolean) => void;

  /**
   * Always approve tools for session (for Editor Agent)
   */
  alwaysApproveToolsForSession?: boolean;
}

export function useLangGraphStream(options: UseLangGraphStreamOptions) {
  const {
    mode,
    conversationId,
    workingDirectory,
    getMessages,
    updateMessage,
    onAgentProgress,
    onSetCleanup,
    getCleanup,
    onToolApprovalRequest,
    onToolApprovalResult,
    alwaysApproveToolsForSession,
  } = options;

  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Start streaming with LangGraph
   */
  const startStream = useCallback(
    async (
      userMessage: string,
      thinkingMode: 'editor-agent' | 'coding' | 'browser-agent'
    ): Promise<void> => {
      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      // Stream accumulator
      let accumulatedContent = '';

      if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.langgraph) {
        // Electron: Use LangGraph Agent
        const graphConfig = {
          thinkingMode,
          enableRAG: false,
          enableTools: true,
          enableImageGeneration: false,
        };

        // Prepare messages for LLM
        const allMessages = [
          ...getMessages(),
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

            const evt = event as StreamEvent;

            // Filter events by conversationId
            if (evt.conversationId && evt.conversationId !== conversationId) {
              return;
            }

            if (abortControllerRef.current?.signal.aborted) {
              return;
            }

            // Handle progress events
            if (evt.type === 'progress') {
              if (onAgentProgress) {
                onAgentProgress({
                  iteration: evt.data.iteration,
                  maxIterations: evt.data.maxIterations,
                  status: evt.data.status,
                  message: evt.data.message,
                });
              }
              return;
            }

            // Handle real-time streaming chunks from LLM
            if (evt.type === 'streaming') {
              accumulatedContent += evt.chunk;
              // Update the last assistant message
              const messages = getMessages();
              const lastMessage = messages[messages.length - 1];
              if (lastMessage && lastMessage.role === 'assistant') {
                updateMessage(lastMessage.id, { content: accumulatedContent });
              }
              return;
            }

            // Handle node execution results
            if (evt.type === 'node') {
              const allMessages = evt.data?.messages;
              if (allMessages && allMessages.length > 0) {
                const lastMsg = allMessages[allMessages.length - 1];
                if (lastMsg.role === 'assistant' && lastMsg.content) {
                  const messages = getMessages();
                  const lastMessage = messages[messages.length - 1];
                  if (lastMessage && lastMessage.role === 'assistant') {
                    updateMessage(lastMessage.id, { content: lastMsg.content });
                  }
                }
              }
              return;
            }

            // Handle tool approval request (Editor Agent only)
            if ((evt as any).type === 'tool_approval_request') {
              const toolEvent = evt as any;

              // Auto-approve if session-wide approval is enabled
              if (alwaysApproveToolsForSession) {
                console.log(
                  '[useLangGraphStream] Auto-approving tools (session-wide approval enabled)'
                );
                if (isElectron() && window.electronAPI?.langgraph) {
                  (async () => {
                    try {
                      await window.electronAPI.langgraph.respondToolApproval(conversationId, true);
                    } catch (error) {
                      console.error('[useLangGraphStream] Failed to auto-approve tools:', error);
                    }
                  })();
                }
                return;
              }

              // Show approval dialog via callback
              if (
                onToolApprovalRequest &&
                toolEvent.conversationId &&
                toolEvent.messageId &&
                toolEvent.toolCalls
              ) {
                onToolApprovalRequest({
                  conversationId: toolEvent.conversationId,
                  messageId: toolEvent.messageId,
                  toolCalls: toolEvent.toolCalls,
                });

                // Append approval waiting message
                const approvalMessage = '🔔 도구 실행 승인을 기다리는 중...';
                if (!accumulatedContent.includes(approvalMessage)) {
                  accumulatedContent += `\n\n${approvalMessage}`;
                  const messages = getMessages();
                  const lastMessage = messages[messages.length - 1];
                  if (lastMessage && lastMessage.role === 'assistant') {
                    updateMessage(lastMessage.id, { content: accumulatedContent });
                  }
                }
              }
              return;
            }

            // Handle tool approval result (Editor Agent only)
            if ((evt as any).type === 'tool_approval_result') {
              const toolEvent = evt as any;
              console.log('[useLangGraphStream] Tool approval result:', toolEvent.approved);

              if (onToolApprovalResult) {
                onToolApprovalResult(toolEvent.approved);
              }

              if (!toolEvent.approved) {
                accumulatedContent += '\n\n❌ 도구 실행이 거부되었습니다.';
                const messages = getMessages();
                const lastMessage = messages[messages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                  updateMessage(lastMessage.id, { content: accumulatedContent });
                }
              }
              return;
            }

            // Handle full message response (Editor Agent)
            if ((evt as any).type === 'message' && (evt as any).message) {
              const msg = (evt as any).message;
              if (msg.role === 'assistant' && msg.content) {
                const messages = getMessages();
                const lastMessage = messages[messages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                  updateMessage(lastMessage.id, { content: msg.content });
                }
              }
              return;
            }
          } catch (error) {
            console.error(`[useLangGraphStream:${mode}] Stream event error:`, error);
          }
        });

        // Store cleanup function (for persistent event handlers)
        if (onSetCleanup) {
          onSetCleanup(eventHandler);
        }

        try {
          // Start streaming via IPC
          await window.electronAPI.langgraph.stream(
            graphConfig,
            allMessages,
            conversationId,
            undefined, // comfyUIConfig
            undefined, // networkConfig
            workingDirectory // workingDirectory for editor agent
          );

          // Stream completed successfully - cleanup event handler
          if (eventHandler) {
            eventHandler();
            if (onSetCleanup) {
              onSetCleanup(null);
            }
          }
        } catch (streamError) {
          console.error(`[useLangGraphStream:${mode}] Stream error:`, streamError);
          // Cleanup on error
          if (eventHandler) {
            eventHandler();
            if (onSetCleanup) {
              onSetCleanup(null);
            }
          }
          throw streamError;
        }
      } else {
        // Web: WebLLMClient directly
        const webClient = getWebLLMClient();
        const historyMessages = [
          ...getMessages().map((m) => ({
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
            const messages = getMessages();
            const lastMessage = messages[messages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              updateMessage(lastMessage.id, { content: accumulatedContent });
            }
          }
        }
      }
    },
    [
      mode,
      conversationId,
      workingDirectory,
      getMessages,
      updateMessage,
      onAgentProgress,
      onSetCleanup,
    ]
  );

  /**
   * Stop streaming
   */
  const stopStream = useCallback(async () => {
    // Stop Agent (if running)
    if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.langgraph) {
      try {
        if (mode === 'browser') {
          await window.electronAPI.langgraph.stopBrowserAgent(conversationId);
        } else if (mode === 'editor') {
          await window.electronAPI.langgraph.abort(conversationId);
        }
      } catch (error) {
        console.error(`[useLangGraphStream:${mode}] Failed to stop agent:`, error);
      }
    }

    // Abort stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Cleanup stream handler from store
    if (getCleanup && onSetCleanup) {
      const cleanup = getCleanup();
      if (cleanup) {
        cleanup();
        onSetCleanup(null);
      }
    }
  }, [mode, conversationId, getCleanup, onSetCleanup]);

  return {
    startStream,
    stopStream,
    abortControllerRef,
  };
}
