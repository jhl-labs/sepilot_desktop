'use client';

import { logger } from '@/lib/utils/logger';
/**
 * EditorChatContainer
 *
 * Editor Chat용 컨테이너 (Unified Chat 사용)
 * Compact 모드, Agent Progress, Tool Approval 포함
 */

import { useState, useCallback, useRef } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { UnifiedChatArea } from '@/components/chat/unified/UnifiedChatArea';
import { UnifiedChatInput } from '@/components/chat/unified/UnifiedChatInput';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { ChatConfig } from '@/components/chat/unified/types';
import { useLangGraphStream } from '@/lib/hooks/useLangGraphStream';
import { isElectron } from '@/lib/platform';
import { getWebLLMClient } from '@/lib/llm';

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
    openFiles,
    activeFilePath,
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
            enableTools: editorAgentMode === 'coding',
            enableMCPTools: true, // MCP Tools 활성화 (GitHub, Filesystem, Brave Search 등) ⭐ v0.7.6
            enablePlanning: true, // Planning Pipeline 활성화 ⭐ v0.7.6
            enableVerification: true, // Verification System 활성화 ⭐ v0.7.6
            enableImageGeneration: false,
          };

          // Prepare system message based on agent mode
          // Build current file context
          const activeFile = activeFilePath
            ? openFiles.find((f) => f.path === activeFilePath)
            : null;
          const currentFileContext = activeFile
            ? `\n**Currently Active Tab:**
- File: ${activeFile.filename}
- Path: ${activeFile.path}
- Language: ${activeFile.language || 'unknown'}
- Status: ${activeFile.isDirty ? 'modified (unsaved)' : 'saved'}

**IMPORTANT:** If the user does not explicitly specify a file name or path in their request, assume they are referring to the currently active tab (${activeFile.filename}). Apply all modifications to this file unless otherwise specified.`
            : openFiles.length > 0
              ? `\n**Open Tabs:**
${openFiles.map((f) => `- ${f.filename} (${f.path})`).join('\n')}

**Note:** No file is currently active. If the user does not specify a file, ask which file they want to work with.`
              : '\n**Note:** No files are currently open.';

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
${currentFileContext}

**Workflow:**
1. Understand the task and plan your approach
2. Use tools to explore the codebase
3. Make necessary changes with proper verification
4. Confirm results and provide summary

Use ReAct pattern: Think → Act → Observe → Repeat until task is complete.`
              : `You are a helpful AI coding assistant.
              
**Your Role:**
- Answer questions about the user's code.
- Provide explanations, examples, and refactoring suggestions.
- Analyze the code provided in the context.
- **You cannot directly execute commands or modify files**. You can only provide the code snippets for the user to apply.
- Context is limited to the active file or open tabs.

**Context:**
- Working directory: ${workingDirectory || 'not set'}
${currentFileContext}

Answer the user's request based on the provided code context.`;

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
                logger.info('[EditorChatContainer] Tool approval request received:', evt.toolCalls);

                // Auto-approve if session-wide approval is enabled
                if (alwaysApproveToolsForSession) {
                  logger.info(
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
                logger.info('[EditorChatContainer] Tool approval result:', evt.approved);
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

              // Handle full message response (Editor Agent)
              if (evt.type === 'message' && (evt as any).message) {
                const msg = (evt as any).message;
                if (msg.role === 'assistant' && msg.content) {
                  const messages = useChatStore.getState().editorChatMessages;
                  const lastMessage = messages[messages.length - 1];
                  if (lastMessage && lastMessage.role === 'assistant') {
                    updateEditorChatMessage(lastMessage.id, { content: msg.content });
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
      <ErrorBoundary>
        <UnifiedChatArea config={chatConfig} />
      </ErrorBoundary>

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
