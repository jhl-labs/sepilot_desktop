/**
 * LangGraph IPC Handlers
 * LangGraph 실행을 Main Process에서 처리하여 CORS 문제 해결
 */

import { ipcMain, BrowserWindow } from 'electron';
import { Message, ToolCall, ImageGenConfig, NetworkConfig } from '@/types';
import { GraphFactory } from '@/lib/domains/agent';
import type { GraphConfig } from '@/lib/domains/agent/types';
import {
  analyzeToolApprovalRisk,
  buildToolApprovalNote,
} from '@/lib/domains/agent/utils/tool-approval-risk';
import { logger } from '../../../services/logger';
import {
  setStreamingCallback,
  setImageProgressCallback,
  setCurrentConversationId,
  setCurrentGraphConfig,
  setCurrentComfyUIConfig,
  setCurrentImageGenConfig,
  setCurrentNetworkConfig,
  setCurrentWorkingDirectory,
  clearConversationCallbacks,
  setAbortSignal,
} from '@/lib/domains/llm/streaming-callback';

// Tool approval state management
// Map of conversationId -> { resolve, reject } for pending approvals
const pendingToolApprovals = new Map<
  string,
  {
    resolve: (approved: boolean) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();

// Discuss input state management (Cowork [DISCUSS] step)
// Map of conversationId -> { resolve, reject } for pending discuss inputs
const pendingDiscussInputs = new Map<
  string,
  {
    resolve: (value: string) => void;
    reject: (reason?: any) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();

// Streaming abort controllers
// Map of conversationId -> AbortController for cancelling streams
const streamingAbortControllers = new Map<string, AbortController>();

// Track previous message content for each conversation to extract streaming chunks
// Map of conversationId -> previous content string
const previousMessageContent = new Map<string, string>();

/**
 * Request tool approval from the user
 * Returns a promise that resolves when the user approves or rejects
 */
export function requestToolApproval(
  sender: Electron.WebContents,
  conversationId: string,
  messageId: string,
  toolCalls: ToolCall[]
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const risk = analyzeToolApprovalRisk(toolCalls);

    // Set a timeout (5 minutes) to prevent hanging indefinitely
    const timeoutId = setTimeout(
      () => {
        if (pendingToolApprovals.has(conversationId)) {
          pendingToolApprovals.delete(conversationId);
          reject(new Error('Tool approval timeout'));
        }
      },
      5 * 60 * 1000
    );

    // Store the promise callbacks with timeout ID for cleanup
    pendingToolApprovals.set(conversationId, { resolve, reject, timeoutId });

    const event = {
      type: 'tool_approval_request',
      conversationId,
      messageId,
      toolCalls,
      note: buildToolApprovalNote(toolCalls),
      riskLevel: risk.riskLevel,
    };

    // DEBUG: Log the event being sent
    logger.info(`[LangGraph IPC] DEBUG: Sending tool_approval_request event`, {
      conversationId,
      messageId,
      toolCallsCount: toolCalls.length,
      toolNames: toolCalls.map((tc) => tc.name),
      event,
    });

    // Send approval request to renderer via stream event (consistent with other events)
    sender.send('langgraph-stream-event', event);

    logger.info(`[LangGraph IPC] Tool approval request sent for ${conversationId}`);
  });
}

/**
 * Request discuss input from the user (Cowork [DISCUSS] step)
 * Returns a promise that resolves with the user's text input
 */
function requestDiscussInput(
  sender: Electron.WebContents,
  conversationId: string,
  stepIndex: number,
  question: string
): Promise<string> {
  return new Promise((resolve, _reject) => {
    // Timeout after 10 minutes - resolve with empty string (skip)
    const timeoutId = setTimeout(
      () => {
        if (pendingDiscussInputs.has(conversationId)) {
          pendingDiscussInputs.delete(conversationId);
          resolve(''); // 타임아웃 = 건너뛰기
        }
      },
      10 * 60 * 1000
    );

    // Store the promise callbacks with timeout ID for cleanup
    pendingDiscussInputs.set(conversationId, { resolve, reject: _reject, timeoutId });

    sender.send('langgraph-stream-event', {
      type: 'cowork_discuss_request',
      conversationId,
      stepIndex,
      question,
    });

    logger.info(
      `[LangGraph IPC] Discuss input request sent for ${conversationId}, step ${stepIndex}`
    );
  });
}

export function setupLangGraphHandlers() {
  // 기존 핸들러 제거 (핫 리로드 대비)
  ipcMain.removeHandler('langgraph-stream');
  ipcMain.removeHandler('langgraph-tool-approval-response');
  ipcMain.removeHandler('langgraph-discuss-input-response');
  ipcMain.removeHandler('langgraph-abort');

  /**
   * Handle tool approval response from renderer
   */
  ipcMain.handle(
    'langgraph-tool-approval-response',
    async (event, conversationId: string, approved: boolean) => {
      const pending = pendingToolApprovals.get(conversationId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pendingToolApprovals.delete(conversationId);
        pending.resolve(approved);
        logger.info(
          `[LangGraph IPC] Tool approval response: ${approved ? 'approved' : 'rejected'} for ${conversationId}`
        );

        // Send approval result via stream event for consistent event handling
        event.sender.send('langgraph-stream-event', {
          type: 'tool_approval_result',
          conversationId,
          approved,
        });

        return { success: true };
      } else {
        logger.warn(`[LangGraph IPC] No pending approval for ${conversationId}`);
        return { success: false, error: 'No pending approval' };
      }
    }
  );

  /**
   * Handle discuss input response from renderer (Cowork [DISCUSS] step)
   */
  ipcMain.handle(
    'langgraph-discuss-input-response',
    async (event, conversationId: string, userInput: string) => {
      const pending = pendingDiscussInputs.get(conversationId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pendingDiscussInputs.delete(conversationId);
        pending.resolve(userInput);
        logger.info(
          `[LangGraph IPC] Discuss input response received for ${conversationId}: ${userInput ? 'with input' : 'skipped'}`
        );

        event.sender.send('langgraph-stream-event', {
          type: 'cowork_discuss_response',
          conversationId,
        });

        return { success: true };
      } else {
        logger.warn(`[LangGraph IPC] No pending discuss input for ${conversationId}`);
        return { success: false, error: 'No pending discuss input' };
      }
    }
  );

  /**
   * LangGraph 스트리밍 실행 (CORS 없이 Main Process에서 실행)
   * conversationId를 통해 각 대화별로 스트리밍을 격리
   */
  ipcMain.handle(
    'langgraph-stream',
    async (
      event,
      graphConfig: GraphConfig,
      messages: Message[],
      conversationId?: string,
      imageGenConfig?: ImageGenConfig,
      networkConfig?: NetworkConfig,
      workingDirectory?: string
    ) => {
      // conversationId가 없으면 임시 ID 생성
      const streamId = conversationId || `stream-${Date.now()}`;

      try {
        logger.info(
          `[LangGraph IPC] Starting stream with config: ${graphConfig.thinkingMode}, conversationId: ${streamId}`
        );

        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) {
          throw new Error('Window not found');
        }

        // Create AbortController for this stream
        const abortController = new AbortController();
        streamingAbortControllers.set(streamId, abortController);

        // Set current conversation ID for streaming context
        setCurrentConversationId(streamId);

        // Initialize previous content tracking for this conversation
        previousMessageContent.set(streamId, '');

        // Register abort signal so emitStreamingChunk can check it
        setAbortSignal(abortController.signal, streamId);

        // Set current graph config for nodes to access
        // This allows generateWithToolsNode to check enableImageGeneration
        setCurrentGraphConfig(graphConfig, streamId);

        // Set ImageGen config for image generation in Main Process
        if (imageGenConfig) {
          setCurrentImageGenConfig(imageGenConfig, streamId);
          // Also set legacy ComfyUI config for backward compatibility
          if (imageGenConfig.provider === 'comfyui' && imageGenConfig.comfyui) {
            setCurrentComfyUIConfig(imageGenConfig.comfyui, streamId);
          } else {
            setCurrentComfyUIConfig(null, streamId);
          }
          logger.info(`[LangGraph IPC] ImageGen config set: provider=${imageGenConfig.provider}`);
        } else {
          setCurrentImageGenConfig(null, streamId);
          setCurrentComfyUIConfig(null, streamId);
        }
        if (networkConfig) {
          setCurrentNetworkConfig(networkConfig, streamId);
        } else {
          setCurrentNetworkConfig(null, streamId);
        }

        // Set working directory for Coding Agent file operations
        if (workingDirectory) {
          setCurrentWorkingDirectory(workingDirectory, streamId);
          logger.info(`[LangGraph IPC] Working directory set: ${workingDirectory}`);
        } else {
          setCurrentWorkingDirectory(null, streamId);
        }

        // Set up streaming callback to send chunks directly to renderer
        // Include conversationId in the event for client-side filtering
        setStreamingCallback((chunk: string) => {
          logger.info(`[LangGraph IPC] Sending streaming chunk for ${streamId}:`, {
            chunkLength: chunk.length,
            preview: chunk.substring(0, 50),
          });
          event.sender.send('langgraph-stream-event', {
            type: 'streaming',
            chunk,
            conversationId: streamId,
          });

          // Update previousMessageContent to prevent duplication when node event arrives
          // The node event logic calculates diff based on previousMessageContent
          const current = previousMessageContent.get(streamId) || '';
          previousMessageContent.set(streamId, current + chunk);
        }, streamId);

        // Set up image progress callback
        setImageProgressCallback((progress) => {
          event.sender.send('langgraph-stream-event', {
            type: 'image_progress',
            progress,
            conversationId: streamId,
          });
        }, streamId);

        // Create tool approval callback for Human-in-the-loop
        const toolApprovalCallback = async (
          toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
        ): Promise<boolean> => {
          logger.info(
            `[LangGraph IPC] Tool approval callback called for ${toolCalls.length} tools`
          );

          // Request approval from user and wait for response
          const approved = await requestToolApproval(
            event.sender,
            streamId,
            `msg-${Date.now()}`,
            toolCalls
          );

          logger.info(
            `[LangGraph IPC] Tool approval result: ${approved ? 'approved' : 'rejected'}`
          );
          return approved;
        };

        // Create discuss input callback for Cowork [DISCUSS] step
        const discussInputCallback = async (
          stepIndex: number,
          question: string
        ): Promise<string> => {
          logger.info(`[LangGraph IPC] Discuss input callback called for step ${stepIndex}`);
          return await requestDiscussInput(event.sender, streamId, stepIndex, question);
        };

        // Stream events to renderer
        try {
          // Inject workingDirectory into graphConfig so GraphFactory can use it
          const configWithWD = { ...graphConfig, workingDirectory };

          for await (const streamEvent of GraphFactory.streamWithConfig(configWithWD, messages, {
            toolApprovalCallback,
            discussInputCallback,
            conversationId: streamId,
          })) {
            // Check if stream was aborted
            if (abortController.signal.aborted) {
              logger.info(`[LangGraph IPC] Stream aborted for conversationId: ${streamId}`);
              break;
            }

            // Guard: Skip null/undefined events
            if (!streamEvent) {
              logger.warn(
                `[LangGraph IPC] Received null/undefined streamEvent for conversationId: ${streamId}`
              );
              continue;
            }

            // Skip tool_approval_request and tool_approval_result events
            // These are handled internally by the callback
            if (
              streamEvent.type === 'tool_approval_request' ||
              streamEvent.type === 'tool_approval_result'
            ) {
              // Send to renderer for UI update
              event.sender.send('langgraph-stream-event', {
                ...streamEvent,
                conversationId: streamId,
              });
              continue;
            }

            // Skip cowork_discuss events - handled internally by the callback
            if (
              streamEvent.type === 'cowork_discuss_request' ||
              streamEvent.type === 'cowork_discuss_response'
            ) {
              // Already sent to renderer via requestDiscussInput
              continue;
            }

            // Handle node events with messages - extract streaming chunks for real-time UI updates
            // This is similar to how Editor Chat works - extract chunks from node events
            if (streamEvent.type === 'node' && streamEvent.data?.messages) {
              const messages = streamEvent.data.messages;
              // Find the last assistant message and extract new content and referenced documents
              const lastMessage = messages[messages.length - 1];
              if (lastMessage?.role === 'assistant') {
                // Send referenced_documents if present (especially important for RAG)
                if (
                  lastMessage.referenced_documents &&
                  lastMessage.referenced_documents.length > 0
                ) {
                  logger.info(
                    `[LangGraph IPC] Sending referenced_documents for (${lastMessage.referenced_documents.length} documents)`
                  );
                  event.sender.send('langgraph-stream-event', {
                    type: 'referenced_documents',
                    referenced_documents: lastMessage.referenced_documents,
                    conversationId: streamId,
                  });
                }

                if (lastMessage.content) {
                  const content = lastMessage.content;
                  // Get previous content for this conversation
                  const previousContent = previousMessageContent.get(streamId) || '';

                  // Check for duplication caused by setStreamingCallback appending new message to old message
                  // If previousContent contains the entire current content at the end, it means we already streamed it
                  if (
                    previousContent.length > content.length &&
                    previousContent.endsWith(content)
                  ) {
                    // Just reset the tracking to the current content (dropping the old prefix)
                    previousMessageContent.set(streamId, content);
                    continue;
                  }

                  // Only send if content has changed and grown (new chunks arrived)
                  if (content !== previousContent && content.length > previousContent.length) {
                    const newChunk = content.substring(previousContent.length);
                    if (newChunk) {
                      // Send as streaming event for real-time UI updates (like Editor Chat)
                      // This ensures one character at a time streaming
                      event.sender.send('langgraph-stream-event', {
                        type: 'streaming',
                        chunk: newChunk,
                        conversationId: streamId,
                      });
                      // Streaming chunk sent successfully
                    }
                    // Update previous content
                    previousMessageContent.set(streamId, content);
                  } else if (content.length < previousContent.length) {
                    // Content decreased - this is a new message (e.g., reporter summary)
                    // Send a separator and the new content to preserve intermediate content
                    event.sender.send('langgraph-stream-event', {
                      type: 'streaming',
                      chunk: '\n\n' + content,
                      conversationId: streamId,
                    });
                    // Reset tracking with the new content
                    previousMessageContent.set(streamId, content);
                  }
                }
              }
            }

            // Send each event to renderer with conversationId
            event.sender.send('langgraph-stream-event', {
              ...streamEvent,
              conversationId: streamId,
            });
          }

          // Send completion event (skip if already sent by abort handler)
          if (!abortController.signal.aborted) {
            event.sender.send('langgraph-stream-done', { conversationId: streamId });
          }

          // Clean up previous content tracking
          previousMessageContent.delete(streamId);

          return {
            success: true,
            conversationId: streamId,
          };
        } catch (streamError: any) {
          // Log full error with stack trace for debugging
          logger.error('[LangGraph IPC] Stream error:', {
            message: streamError.message,
            stack: streamError.stack,
            name: streamError.name,
          });
          // Clean up previous content tracking on error
          previousMessageContent.delete(streamId);
          // Send error event with conversationId - include stack trace for debugging
          const errorMessage = streamError.stack
            ? `${streamError.message}\n\nStack trace:\n${streamError.stack}`
            : streamError.message;
          event.sender.send('langgraph-stream-error', {
            error: errorMessage,
            conversationId: streamId,
          });
          throw streamError;
        } finally {
          // Clear the callbacks for this conversation
          clearConversationCallbacks(streamId);
          // Resolve pending promises to prevent hangs, then clean up
          const pendingApproval = pendingToolApprovals.get(streamId);
          if (pendingApproval) {
            clearTimeout(pendingApproval.timeoutId);
            pendingApproval.resolve(false); // treat as rejected
          }
          pendingToolApprovals.delete(streamId);
          const pendingDiscuss = pendingDiscussInputs.get(streamId);
          if (pendingDiscuss) {
            clearTimeout(pendingDiscuss.timeoutId);
            pendingDiscuss.resolve(''); // treat as skip
          }
          pendingDiscussInputs.delete(streamId);
          // Clean up abort controller
          streamingAbortControllers.delete(streamId);
        }
      } catch (error: any) {
        logger.error('[LangGraph IPC] Error:', error);
        clearConversationCallbacks(streamId);
        // Clean up previous content tracking on error
        previousMessageContent.delete(streamId);
        return {
          success: false,
          error: error.message || 'Failed to execute LangGraph',
          conversationId: streamId,
        };
      }
    }
  );

  /**
   * Handle streaming abort request
   */
  ipcMain.handle('langgraph-abort', async (_event, conversationId: string) => {
    try {
      logger.info(`[LangGraph IPC] Abort requested for conversationId: ${conversationId}`);

      const abortController = streamingAbortControllers.get(conversationId);
      if (abortController) {
        abortController.abort();
        streamingAbortControllers.delete(conversationId);

        // Clear callbacks and resolve pending promises to prevent hangs
        clearConversationCallbacks(conversationId);
        const pendingApproval = pendingToolApprovals.get(conversationId);
        if (pendingApproval) {
          clearTimeout(pendingApproval.timeoutId);
          pendingApproval.resolve(false); // treat abort as rejection
        }
        pendingToolApprovals.delete(conversationId);
        const pendingDiscuss = pendingDiscussInputs.get(conversationId);
        if (pendingDiscuss) {
          clearTimeout(pendingDiscuss.timeoutId);
          pendingDiscuss.resolve(''); // treat abort as skip
        }
        pendingDiscussInputs.delete(conversationId);
        // Clean up previous content tracking
        previousMessageContent.delete(conversationId);

        // Send done event immediately so frontend can clean up without waiting
        // for the streaming loop to break naturally
        _event.sender.send('langgraph-stream-done', { conversationId, aborted: true });

        logger.info(`[LangGraph IPC] Stream aborted for conversationId: ${conversationId}`);
        return { success: true };
      } else {
        logger.warn(`[LangGraph IPC] No active stream found for conversationId: ${conversationId}`);
        return { success: false, error: 'No active stream found' };
      }
    } catch (error: any) {
      logger.error(`[LangGraph IPC] Abort error:`, error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Stop Browser Agent
   */
  ipcMain.handle('langgraph-stop-browser-agent', async (_event, conversationId: string) => {
    try {
      logger.info(
        `[LangGraph IPC] Stop Browser Agent requested for conversationId: ${conversationId}`
      );

      const { GraphFactory } = await import('@/lib/domains/agent');
      const stopped = GraphFactory.stopBrowserAgent(conversationId);

      if (stopped) {
        logger.info(`[LangGraph IPC] Browser Agent stopped for conversationId: ${conversationId}`);
        return { success: true };
      } else {
        logger.warn(
          `[LangGraph IPC] No active Browser Agent found for conversationId: ${conversationId}`
        );
        return { success: false, error: 'No active Browser Agent found' };
      }
    } catch (error: any) {
      logger.error(`[LangGraph IPC] Stop Browser Agent error:`, error);
      return { success: false, error: error.message };
    }
  });

  logger.info('LangGraph IPC handlers registered');
}
