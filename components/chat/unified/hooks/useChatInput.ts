/**
 * useChatInput Hook
 *
 * 입력 상태 관리 (textarea, composition, keyboard)
 */

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';

export function useChatInput() {
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  /**
   * Keyboard event handler
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>, onSend: () => void) => {
      if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
        e.preventDefault();
        onSend();
      }
    },
    [isComposing]
  );

  /**
   * 입력 초기화
   */
  const clearInput = useCallback(() => {
    setInput('');
  }, []);

  /**
   * 포커스
   */
  const focusInput = useCallback(() => {
    textareaRef.current?.focus();
  }, []);

  return {
    input,
    setInput,
    isComposing,
    setIsComposing,
    textareaRef,
    handleKeyDown,
    clearInput,
    focusInput,
  };
}
