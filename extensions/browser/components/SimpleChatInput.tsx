'use client';

import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Square } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { useLangGraphStream } from '@/lib/hooks/useLangGraphStream';

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

  const { addBrowserChatMessage, updateBrowserChatMessage, browserChatMessages } = useChatStore();

  // Use LangGraph stream hook
  const { startStream, stopStream } = useLangGraphStream({
    mode: 'browser',
    conversationId: 'browser-chat-temp',
    getMessages: () => useChatStore.getState().browserChatMessages,
    updateMessage: updateBrowserChatMessage,
    onAgentProgress: setAgentProgress,
  });

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleStop = async () => {
    await stopStream();
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

      // Start streaming (Hook handles all stream logic)
      await startStream(userMessage, 'browser-agent');
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
      {/* Simplified Agent Status - 상세 로그는 SimpleChatArea에 표시 */}
      {agentProgress && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span>Agent 실행 중...</span>
            <span className="text-muted-foreground">
              ({agentProgress.iteration}/{agentProgress.maxIterations})
            </span>
          </div>
          <Button
            onClick={handleStop}
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 text-xs"
            title="중단 (Esc)"
          >
            중단
          </Button>
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
          placeholder="메시지를 입력하세요..."
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
