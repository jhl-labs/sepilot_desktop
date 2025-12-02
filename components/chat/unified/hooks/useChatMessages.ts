/**
 * useChatMessages Hook
 *
 * 메시지 관리 로직을 캡슐화
 */

import { useRef, useEffect } from 'react';
import type { ChatDataSource } from '../types';

export function useChatMessages(dataSource: ChatDataSource) {
  const { messages, streamingState } = dataSource;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isStreaming = !!streamingState;

  return {
    messages,
    isStreaming,
    scrollRef,
    addMessage: dataSource.addMessage,
    updateMessage: dataSource.updateMessage,
    clearMessages: dataSource.clearMessages,
  };
}
