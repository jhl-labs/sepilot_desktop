'use client';

/**
 * EditorChatContainer
 *
 * Editor Chat용 컨테이너 (Unified Chat 사용)
 * Compact 모드, Agent Progress, Tool Approval 포함
 */

import { useState, useRef, useCallback } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { UnifiedChatArea } from '../chat/unified/UnifiedChatArea';
import { UnifiedChatInput } from '../chat/unified/UnifiedChatInput';
import type { ChatConfig } from '../chat/unified/types';
import { isElectron } from '@/lib/platform';
import { getWebLLMClient } from '@/lib/llm/web-client';

export function EditorChatContainer() {
  const {
    editorChatMessages,
    editorChatStreaming,
    addEditorChatMessage,
    updateEditorChatMessage,
    workingDirectory,
    editorAgentMode,
    setEditorChatStreaming,
    setPendingToolApproval,
    clearPendingToolApproval,
    alwaysApproveToolsForSession,
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
    mode: 'editor',
    features: {
      enableEdit: false,
      enableRegenerate: false,
      enableCopy: true,
    },
    style: {
      compact: true,
      fontSize: '12px',
    },
    dataSource: {
      messages: editorChatMessages,
      streamingState: editorChatStreaming ? 'streaming' : null,
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
    // Abort stream via IPC
    if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.langgraph) {
      try {
        await window.electronAPI.langgraph.abort('editor-chat-temp');
      } catch (error) {
        console.error('[EditorChatContainer] Failed to abort stream:', error);
      }
    }

    // Abort stream controller
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setEditorChatStreaming(false);
    setAgentProgress(null);
  }, [setEditorChatStreaming]);

  // Handle send message
  const handleSendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || editorChatStreaming) {
        return;
      }

      setEditorChatStreaming(true);

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      try {
        // Add user message
        addEditorChatMessage({
          role: 'user',
          content: userMessage,
        });

        // Create empty assistant message for streaming
        addEditorChatMessage({
          role: 'assistant',
          content: '',
        });

        // Stream accumulator
        let accumulatedContent = '';

        if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.langgraph) {
          // Electron: Use selected Agent mode (Editor or Coding)
          const graphConfig = {
            thinkingMode:
              editorAgentMode === 'coding' ? ('coding' as const) : ('editor-agent' as const),
            enableRAG: false,
            enableTools: true,
            enableImageGeneration: false,
          };

          // Prepare system message based on agent mode
          const systemMessageContent =
            editorAgentMode === 'coding'
              ? `You are SE Pilot, a highly skilled autonomous coding assistant with comprehensive planning and verification capabilities.

**Available Tools:**
- **File Operations**: file_read, file_write, file_edit, file_list, grep_search
- **Command Execution**: command_execute (build, test, git operations)
- **Git Operations**: git_status, git_diff, git_log, git_branch
- **Web Research**: web_search, web_fetch (for documentation and examples)

**Your Role:**
- Plan complex tasks with step-by-step breakdown
- Execute user requests using appropriate tools
- Read files before making modifications
- Verify your work after changes
- Track file changes throughout the workflow
- Provide clear feedback about completed actions
- Working directory: ${workingDirectory || 'not set'}

**Workflow:**
1. Understand the task and plan your approach
2. Use tools to explore the codebase
3. Make necessary changes with proper verification
4. Confirm results and provide summary

Use ReAct pattern: Think → Act → Observe → Repeat until task is complete.`
              : `You are an AI-powered Editor Agent with advanced file management and code assistance capabilities.

**Available Tools:**
- **File Operations**: read_file, write_file, edit_file, list_files, search_files, delete_file
- **Tab Management**: list_open_tabs, open_tab, close_tab, switch_tab, get_active_file
- **Terminal**: run_command (실행 명령어)
- **Git**: git_status, git_diff, git_log, git_branch
- **Code Analysis**: get_file_context, search_similar_code, get_documentation, find_definition

**Your Role:**
- Execute user requests by using appropriate tools
- For file creation requests, use write_file tool with complete content
- For file modifications, use edit_file or read_file + write_file
- Always provide clear feedback about completed actions
- Working directory: ${workingDirectory || 'not set'}

**Example Workflow for "Create TEST.md about DevOps":**
1. Use write_file tool with filePath: "TEST.md" and content: [DevOps 내용]
2. Confirm the file was created successfully
3. Summarize what was written

Execute tasks step by step and use tools proactively.`;

          const systemMessage = {
            id: 'system',
            role: 'system' as const,
            content: systemMessageContent,
            created_at: Date.now(),
          };

          const allMessages = [
            systemMessage,
            ...editorChatMessages,
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

              // Cast to any for event property access
              const evt = event as {
                type?: string;
                chunk?: string;
                conversationId?: string;
                messageId?: string;
                toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
                approved?: boolean;
                data?: {
                  messages?: Array<{ role: string; content?: string }>;
                  iteration?: number;
                  maxIterations?: number;
                  status?: string;
                  message?: string;
                };
              };

              // Filter events by conversationId - only handle events for editor-chat-temp
              if (evt.conversationId && evt.conversationId !== 'editor-chat-temp') {
                return;
              }

              if (abortControllerRef.current?.signal.aborted) {
                return;
              }

              // Handle progress events
              if (evt.type === 'progress' && evt.data) {
                setAgentProgress({
                  iteration: evt.data.iteration || 0,
                  maxIterations: evt.data.maxIterations || 50,
                  status: evt.data.status || 'working',
                  message: evt.data.message || 'AI 작업 중...',
                });
                return;
              }

              // Handle real-time streaming chunks from LLM
              if (evt.type === 'streaming' && evt.chunk) {
                accumulatedContent += evt.chunk;
                // Update the last assistant message
                const messages = useChatStore.getState().editorChatMessages;
                const lastMessage = messages[messages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                  updateEditorChatMessage(lastMessage.id, { content: accumulatedContent });
                }
                return;
              }

              // Handle tool approval request (Human-in-the-loop)
              if (evt.type === 'tool_approval_request') {
                console.error(
                  '[EditorChatContainer] Tool approval request received:',
                  evt.toolCalls
                );

                // Auto-approve if session-wide approval is enabled
                if (alwaysApproveToolsForSession) {
                  console.error(
                    '[EditorChatContainer] Auto-approving tools (session-wide approval enabled)'
                  );
                  (async () => {
                    try {
                      if (isElectron() && window.electronAPI?.langgraph) {
                        await window.electronAPI.langgraph.respondToolApproval(
                          'editor-chat-temp',
                          true
                        );
                      }
                    } catch (error) {
                      console.error('[EditorChatContainer] Failed to auto-approve tools:', error);
                    }
                  })();
                  return;
                }

                // Show approval dialog
                if (evt.conversationId && evt.messageId && evt.toolCalls) {
                  setPendingToolApproval({
                    conversationId: evt.conversationId,
                    messageId: evt.messageId,
                    toolCalls: evt.toolCalls,
                    timestamp: Date.now(),
                  });

                  // Append approval waiting message only if not already present
                  const approvalMessage = '🔔 도구 실행 승인을 기다리는 중...';
                  if (!accumulatedContent.includes(approvalMessage)) {
                    accumulatedContent += `\n\n${approvalMessage}`;
                    const messages = useChatStore.getState().editorChatMessages;
                    const lastMessage = messages[messages.length - 1];
                    if (lastMessage && lastMessage.role === 'assistant') {
                      updateEditorChatMessage(lastMessage.id, { content: accumulatedContent });
                    }
                  }
                }
                return;
              }

              // Handle tool approval result
              if (evt.type === 'tool_approval_result') {
                console.error('[EditorChatContainer] Tool approval result:', evt.approved);
                clearPendingToolApproval();
                if (!evt.approved) {
                  accumulatedContent += '\n\n❌ 도구 실행이 거부되었습니다.';
                  const messages = useChatStore.getState().editorChatMessages;
                  const lastMessage = messages[messages.length - 1];
                  if (lastMessage && lastMessage.role === 'assistant') {
                    updateEditorChatMessage(lastMessage.id, { content: accumulatedContent });
                  }
                }
                return;
              }

              // Handle node execution results
              if (evt.type === 'node' && evt.data?.messages) {
                const allMessages = evt.data.messages;
                if (allMessages && allMessages.length > 0) {
                  const lastMsg = allMessages[allMessages.length - 1];
                  if (lastMsg.role === 'assistant' && lastMsg.content) {
                    const messages = useChatStore.getState().editorChatMessages;
                    const lastMessage = messages[messages.length - 1];
                    if (lastMessage && lastMessage.role === 'assistant') {
                      updateEditorChatMessage(lastMessage.id, { content: lastMsg.content });
                    }
                  }
                }
              }
            } catch (error) {
              console.error('[EditorChatContainer] Stream event error:', error);
            }
          });

          // Start streaming via IPC (using standard stream method)
          await window.electronAPI.langgraph.stream(
            graphConfig,
            allMessages,
            'editor-chat-temp', // Temporary conversation ID for editor chat
            undefined, // comfyUIConfig
            undefined, // networkConfig
            workingDirectory || undefined // workingDirectory for editor agent
          );

          // Cleanup event listener (스트림 완료 후에만)
          if (eventHandler) {
            eventHandler();
          }
        } else {
          // Web: WebLLMClient directly (fallback without tools)
          const webClient = getWebLLMClient();
          const historyMessages = [
            ...editorChatMessages.map((m) => ({
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
              const messages = useChatStore.getState().editorChatMessages;
              const lastMessage = messages[messages.length - 1];
              if (lastMessage && lastMessage.role === 'assistant') {
                updateEditorChatMessage(lastMessage.id, { content: accumulatedContent });
              }
            }
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get response';
        console.error('Editor chat error:', error);
        // Update last message with error
        const messages = useChatStore.getState().editorChatMessages;
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          updateEditorChatMessage(lastMessage.id, {
            content: `Error: ${errorMessage}`,
          });
        }
      } finally {
        setEditorChatStreaming(false);
        setAgentProgress(null);
        abortControllerRef.current = null;
      }
    },
    [
      editorChatStreaming,
      editorChatMessages,
      workingDirectory,
      editorAgentMode,
      addEditorChatMessage,
      updateEditorChatMessage,
      setEditorChatStreaming,
      setPendingToolApproval,
      clearPendingToolApproval,
      alwaysApproveToolsForSession,
    ]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Chat Area (Compact) */}
      <UnifiedChatArea config={chatConfig} />

      {/* Unified Chat Input */}
      <UnifiedChatInput
        config={chatConfig}
        onSendMessage={handleSendMessage}
        onStopStreaming={handleStopStreaming}
        isStreaming={editorChatStreaming}
        agentProgress={agentProgress}
      />
    </div>
  );
}
