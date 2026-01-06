'use client';

/**
 * BrowserChatContainer
 *
 * Browser Chat용 컨테이너 (Unified Chat 사용)
 * Compact 모드, Agent Logs, Agent Progress 포함
 */

import { useState, useCallback, useRef } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { UnifiedChatArea } from '@/components/chat/unified/UnifiedChatArea';
import { UnifiedChatInput } from '@/components/chat/unified/UnifiedChatInput';
import { AgentLogsPlugin } from '@/components/chat/unified/plugins/AgentLogsPlugin';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { ChatConfig } from '@/components/chat/unified/types';
import { useLangGraphStream } from '@/lib/hooks/useLangGraphStream';
import { isElectron } from '@/lib/platform';
import { getWebLLMClient } from '@/lib/llm/web-client';

// Stream event types (duplicated from useLangGraphStream for type safety)
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

  // Use LangGraph stream hook
  const { startStream, stopStream } = useLangGraphStream({
    mode: 'browser',
    conversationId: 'browser-chat-temp',
    getMessages: () => useChatStore.getState().browserChatMessages,
    updateMessage: updateBrowserChatMessage,
    onAgentProgress: setAgentProgress,
    onSetCleanup: setBrowserAgentStreamCleanup,
    getCleanup: () => browserAgentStreamCleanup,
  });

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
    await stopStream();
    setAgentProgress(null);
    setBrowserAgentIsRunning(false);
  }, [stopStream, setBrowserAgentIsRunning]);

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
      }
    },
    [
      browserAgentIsRunning,
      browserAgentStreamCleanup,
      addBrowserChatMessage,
      updateBrowserChatMessage,
      setBrowserAgentIsRunning,
      setBrowserAgentStreamCleanup,
      startStream,
    ]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Chat Area (Compact) with Agent Logs */}
      <div className="flex-1 overflow-y-auto">
        <ErrorBoundary>
          <UnifiedChatArea config={chatConfig} />
        </ErrorBoundary>

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
