'use client';

/**
 * EditRegeneratePlugin
 *
 * 메시지 수정/재생성 플러그인
 * Main Chat에서 사용 (MessageBubble 통합)
 *
 * Note: 이 플러그인은 기존 MessageBubble 컴포넌트를 재사용합니다.
 * MessageBubble 내부에 이미 Edit/Regenerate 기능이 구현되어 있습니다.
 */

import type { Message } from '@/types';
import type { Persona } from '@/types/persona';

interface EditRegeneratePluginProps {
  message: Message;
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onRegenerate: (messageId: string) => Promise<void>;
  isLastAssistantMessage: boolean;
  isStreaming: boolean;
  activePersona?: Persona | null;
}

/**
 * This plugin is a passthrough that enables Edit/Regenerate functionality
 * by providing the necessary callbacks to MessageBubble.
 *
 * The actual implementation is in MessageBubble component.
 */
export function EditRegeneratePlugin(_props: EditRegeneratePluginProps) {
  // This plugin doesn't render anything directly
  // It's used to pass props to MessageBubble in UnifiedChatArea
  return null;
}

// Export a utility function to check if Edit/Regenerate should be enabled
export function shouldEnableEditRegenerate(message: Message): {
  canEdit: boolean;
  canRegenerate: boolean;
} {
  return {
    canEdit: message.role === 'user',
    canRegenerate: message.role === 'assistant',
  };
}
