'use client';

/**
 * UnifiedChatContainer Component
 *
 * 통합 Chat 컨테이너 - Area + Input 조합
 * 모든 Chat 모드의 최상위 컴포넌트
 */

import { UnifiedChatArea } from './UnifiedChatArea';
import { UnifiedChatInput } from './UnifiedChatInput';
import type { ChatConfig } from './types';

interface UnifiedChatContainerProps {
  config: ChatConfig;
  onSendMessage?: (content: string) => Promise<void>;
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
