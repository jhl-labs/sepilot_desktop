'use client';

/**
 * BrowserChatContainer
 *
 * Browser Chat용 컨테이너 (Unified Chat 사용)
 * Compact 모드, Agent Logs, Agent Progress 포함
 */

import { useChatStore } from '@/lib/store/chat-store';
import { UnifiedChatArea } from '../chat/unified/UnifiedChatArea';
import { SimpleChatInput } from './SimpleChatInput';
import { AgentLogsPlugin } from '../chat/unified/plugins/AgentLogsPlugin';
import type { ChatConfig } from '../chat/unified/types';

export function BrowserChatContainer() {
  const {
    browserChatMessages,
    browserChatFontConfig,
    browserAgentLogs,
    browserAgentIsRunning,
  } = useChatStore();

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
        // Handled by SimpleChatInput
        return { id: '', role: 'user', content: '', created_at: 0 };
      },
      updateMessage: () => {
        // Handled by SimpleChatInput
      },
      clearMessages: () => {
        // Not implemented
      },
      startStreaming: () => {},
      stopStreaming: () => {},
    },
  };

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

      {/* Browser Chat Input */}
      <SimpleChatInput />
    </div>
  );
}
