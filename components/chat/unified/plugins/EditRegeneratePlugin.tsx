'use client';

/**
 * EditRegeneratePlugin
 *
 * 메시지 수정 및 재생성 기능 (Main 모드 전용)
 * Integrated into MessageBubble, this is a placeholder for future extensions
 */

import type { PluginProps } from '../types';

interface EditRegeneratePluginProps extends PluginProps {
  onEdit?: (messageId: string, content: string) => void;
  onRegenerate?: (messageId: string) => void;
}

export function EditRegeneratePlugin({}: EditRegeneratePluginProps) {
  // This plugin is integrated into MessageBubble component
  // No separate UI needed, just provides callbacks
  return null;
}
