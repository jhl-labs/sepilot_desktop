'use client';

import { SimpleChatArea } from './SimpleChatArea';
import { SimpleChatInput } from './SimpleChatInput';

/**
 * Browser Chat Component
 * Browser Agent와의 대화를 위한 통합 컴포넌트
 */
export function BrowserChat() {
  return (
    <>
      <SimpleChatArea />
      <SimpleChatInput />
    </>
  );
}
