/**
 * LangGraph IPC Handlers
 * LangGraph 실행을 Main Process에서 처리하여 CORS 문제 해결
 */

import { ipcMain, BrowserWindow } from 'electron';
import { Message, ToolCall, ComfyUIConfig, NetworkConfig } from '../../../types';
import { GraphFactory } from '../../../lib/langgraph';
import type { GraphConfig } from '../../../lib/langgraph/types';
import { logger } from '../../services/logger';
import {
  setStreamingCallback,
  setImageProgressCallback,
  setCurrentConversationId,
  setCurrentGraphConfig,
  setCurrentComfyUIConfig,
  setCurrentNetworkConfig,
  setCurrentWorkingDirectory,
  clearConversationCallbacks,
  setAbortSignal,
} from '../../../lib/llm/streaming-callback';

// Tool approval state management
// Map of conversationId -> { resolve, reject } for pending approvals
const pendingToolApprovals = new Map<
  string,
  {
    resolve: (approved: boolean) => void;
    reject: (error: Error) => void;
  }
>();

// Streaming abort controllers
// Map of conversationId -> AbortController for cancelling streams
const streamingAbortControllers = new Map<string, AbortController>();

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
    // Store the promise callbacks
    pendingToolApprovals.set(conversationId, { resolve, reject });

    // Send approval request to renderer
    sender.send('langgraph-tool-approval-request', {
      conversationId,
      messageId,
      toolCalls,
    });

    // Set a timeout (5 minutes) to prevent hanging indefinitely
    setTimeout(() => {
      if (pendingToolApprovals.has(conversationId)) {
        pendingToolApprovals.delete(conversationId);
        reject(new Error('Tool approval timeout'));
      }
    }, 5 * 60 * 1000);
  });
}

export function setupLangGraphHandlers() {
  // 기존 핸들러 제거 (핫 리로드 대비)
  ipcMain.removeHandler('langgraph-stream');
  ipcMain.removeHandler('langgraph-tool-approval-response');
  ipcMain.removeHandler('langgraph-abort');

  /**
   * Handle tool approval response from renderer
   */
  ipcMain.handle(
    'langgraph-tool-approval-response',
    async (_event, conversationId: string, approved: boolean) => {
      const pending = pendingToolApprovals.get(conversationId);
      if (pending) {
        pendingToolApprovals.delete(conversationId);
        pending.resolve(approved);
        logger.info(`[LangGraph IPC] Tool approval response: ${approved ? 'approved' : 'rejected'} for ${conversationId}`);
        return { success: true };
      } else {
        logger.warn(`[LangGraph IPC] No pending approval for ${conversationId}`);
        return { success: false, error: 'No pending approval' };
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
      comfyUIConfig?: ComfyUIConfig,
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

        // Register abort signal so emitStreamingChunk can check it
        setAbortSignal(abortController.signal, streamId);

        // Set current graph config for nodes to access
        // This allows generateWithToolsNode to check enableImageGeneration
        setCurrentGraphConfig(graphConfig);

        // Set ComfyUI config for image generation in Main Process
        if (comfyUIConfig) {
          setCurrentComfyUIConfig(comfyUIConfig);
          logger.info(`[LangGraph IPC] ComfyUI config set: enabled=${comfyUIConfig.enabled}, url=${comfyUIConfig.httpUrl}`);
        }
        if (networkConfig) {
          setCurrentNetworkConfig(networkConfig);
        }

        // Set working directory for Coding Agent file operations
        if (workingDirectory) {
          setCurrentWorkingDirectory(workingDirectory);
          logger.info(`[LangGraph IPC] Working directory set: ${workingDirectory}`);
        } else {
          setCurrentWorkingDirectory(null);
        }

        // Set up streaming callback to send chunks directly to renderer
        // Include conversationId in the event for client-side filtering
        setStreamingCallback((chunk: string) => {
          event.sender.send('langgraph-stream-event', {
            type: 'streaming',
            chunk,
            conversationId: streamId,
          });
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
          logger.info(`[LangGraph IPC] Tool approval callback called for ${toolCalls.length} tools`);

          // Request approval from user and wait for response
          const approved = await requestToolApproval(
            event.sender,
            streamId,
            `msg-${Date.now()}`,
            toolCalls
          );

          logger.info(`[LangGraph IPC] Tool approval result: ${approved ? 'approved' : 'rejected'}`);
          return approved;
        };

        // Stream events to renderer
        try {
          for await (const streamEvent of GraphFactory.streamWithConfig(
            graphConfig,
            messages,
            { toolApprovalCallback, conversationId: streamId }
          )) {
            // Check if stream was aborted
            if (abortController.signal.aborted) {
              logger.info(`[LangGraph IPC] Stream aborted for conversationId: ${streamId}`);
              event.sender.send('langgraph-stream-error', {
                error: 'Stream aborted by user',
                conversationId: streamId,
              });
              break;
            }

            // Skip tool_approval_request and tool_approval_result events
            // These are handled internally by the callback
            if (streamEvent.type === 'tool_approval_request' || streamEvent.type === 'tool_approval_result') {
              // Send to renderer for UI update
              event.sender.send('langgraph-stream-event', {
                ...streamEvent,
                conversationId: streamId,
              });
              continue;
            }

            // Send each event to renderer with conversationId
            event.sender.send('langgraph-stream-event', {
              ...streamEvent,
              conversationId: streamId,
            });
          }

          // Send completion event with conversationId
          event.sender.send('langgraph-stream-done', { conversationId: streamId });

          return {
            success: true,
            conversationId: streamId,
          };
        } catch (streamError: any) {
          logger.error('[LangGraph IPC] Stream error:', streamError);
          // Send error event with conversationId
          event.sender.send('langgraph-stream-error', {
            error: streamError.message,
            conversationId: streamId,
          });
          throw streamError;
        } finally {
          // Clear the callbacks for this conversation
          clearConversationCallbacks(streamId);
          // Clean up any pending approvals
          pendingToolApprovals.delete(streamId);
          // Clean up abort controller
          streamingAbortControllers.delete(streamId);
        }
      } catch (error: any) {
        logger.error('[LangGraph IPC] Error:', error);
        clearConversationCallbacks(streamId);
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

        // Clear callbacks and pending approvals
        clearConversationCallbacks(conversationId);
        pendingToolApprovals.delete(conversationId);

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

  logger.info('LangGraph IPC handlers registered');
}
