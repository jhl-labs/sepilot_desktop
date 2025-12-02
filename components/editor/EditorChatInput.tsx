'use client';

import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Square } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';
import { getWebLLMClient } from '@/lib/llm/web-client';

export function EditorChatInput() {
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
    addEditorChatMessage,
    updateEditorChatMessage,
    editorChatMessages,
    workingDirectory,
    setEditorChatStreaming,
  } = useChatStore();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleStop = async () => {
    // Abort stream via IPC
    if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.langgraph) {
      try {
        await window.electronAPI.langgraph.abort('editor-chat-temp');
      } catch (error) {
        console.error('[EditorChatInput] Failed to abort stream:', error);
      }
    }

    // Abort stream controller
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsStreaming(false);
    setEditorChatStreaming(false); // 전역 상태 업데이트
    setAgentProgress(null);
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) {
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setIsStreaming(true);
    setEditorChatStreaming(true); // 전역 상태 업데이트 (백그라운드 스트리밍 지원)

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
        // Electron: Use Editor Agent with Advanced Tools
        const graphConfig = {
          thinkingMode: 'editor-agent' as const,
          enableRAG: false,
          enableTools: true, // Enable Editor Agent Tools
          enableImageGeneration: false,
        };

        // Prepare messages for LLM with system message
        const systemMessage = {
          id: 'system',
          role: 'system' as const,
          content: `You are an AI-powered Editor Agent with advanced file management and code assistance capabilities.

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

Execute tasks step by step and use tools proactively.`,
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
            console.error('[EditorChatInput] Stream event error:', error);
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
      setIsStreaming(false);
      setEditorChatStreaming(false); // 전역 상태 업데이트
      setAgentProgress(null);
      abortControllerRef.current = null;

      // 컴포넌트가 여전히 마운트되어 있을 때만 포커스
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
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
                  {agentProgress.status !== 'thinking' &&
                    agentProgress.status !== 'executing' &&
                    '🔄 작업 중...'}
                </span>
                <span className="text-muted-foreground">
                  ({agentProgress.iteration}/{agentProgress.maxIterations})
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground truncate">{agentProgress.message}</p>
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
          placeholder={isStreaming ? '응답 생성 중... (ESC로 중단 가능)' : '메시지를 입력하세요...'}
          className="flex-1 min-h-[40px] max-h-[120px] resize-none border-0 bg-transparent px-3 py-2 text-xs focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
          rows={1}
        />
        <div className="flex items-center pb-1 pr-1">
          {isStreaming ? (
            <Button
              onClick={handleStop}
              variant="destructive"
              size="icon"
              className="h-7 w-7 rounded-md shrink-0"
              title="중지 (Esc)"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
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
