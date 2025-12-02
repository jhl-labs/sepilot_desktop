'use client';

/**
 * UnifiedChatContainer Component
 *
 * 통합 채팅 컨테이너 - Area + Input 조합 및 플러그인 관리
 * Main Chat, Browser Chat, Editor Chat 모두에서 사용
 */

import { UnifiedChatArea } from './UnifiedChatArea';
import { UnifiedChatInput } from './UnifiedChatInput';
import type { ChatConfig } from './types';

interface UnifiedChatContainerProps {
  config: ChatConfig;
  onSendMessage?: (message: string) => Promise<void>;
  onStopStreaming?: () => void;
}

export function UnifiedChatContainer({
  config,
  onSendMessage,
  onStopStreaming,
}: UnifiedChatContainerProps) {
  return (
    <div className="flex flex-col h-full">
      <UnifiedChatArea config={config} />
      <UnifiedChatInput
        config={config}
        onSendMessage={onSendMessage}
        onStopStreaming={onStopStreaming}
      />
    </div>
  );
}
