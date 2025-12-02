'use client';

/**
 * EditorChatContainer
 *
 * Editor Chat용 컨테이너 (Unified Chat 사용)
 * Compact 모드, Agent Progress, Tool Approval 포함
 */

import { useChatStore } from '@/lib/store/chat-store';
import { UnifiedChatArea } from '../chat/unified/UnifiedChatArea';
import { EditorChatInput } from './EditorChatInput';
import type { ChatConfig } from '../chat/unified/types';

export function EditorChatContainer() {
  const { editorChatMessages, editorChatStreaming } = useChatStore();

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
      maxWidth: '85%',
    },
    dataSource: {
      messages: editorChatMessages,
      streamingState: editorChatStreaming ? 'streaming' : null,
      addMessage: async () => {
        // Handled by EditorChatInput
        return { id: '', role: 'user', content: '', created_at: 0 };
      },
      updateMessage: () => {
        // Handled by EditorChatInput
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
      {/* Chat Area (Compact) */}
      <UnifiedChatArea config={chatConfig} />

      {/* Editor Chat Input */}
      <EditorChatInput />
    </div>
  );
}
