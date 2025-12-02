'use client';

/**
 * UnifiedChatInput Component
 *
 * 통합 입력 영역 - 사용자 입력 처리
 * Main Chat, Browser Chat, Editor Chat 모두에서 사용
 */

import { useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Square } from 'lucide-react';
import { useChatInput } from './hooks/useChatInput';
import type { ChatConfig } from './types';

interface UnifiedChatInputProps {
  config: ChatConfig;
  onSendMessage?: (message: string) => Promise<void>;
  onStopStreaming?: () => void;
}

export function UnifiedChatInput({
  config,
  onSendMessage,
  onStopStreaming,
}: UnifiedChatInputProps) {
  const { mode, features, style, dataSource } = config;
  const {
    input,
    setInput,
    isComposing,
    setIsComposing,
    textareaRef,
    handleKeyDown,
    clearInput,
    focusInput,
  } = useChatInput();

  const isStreaming = !!dataSource.streamingState;

  // Handle Esc key to stop streaming
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isStreaming && onStopStreaming) {
        onStopStreaming();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStreaming, onStopStreaming]);

  // Listen for interactive component events (select/input)
  useEffect(() => {
    const handleInteractiveSelect = async (e: CustomEvent<{ value: string }>) => {
      const { value } = e.detail;
      setInput(value);
      // Auto-send after a short delay
      setTimeout(async () => {
        if (onSendMessage) {
          await onSendMessage(value);
          clearInput();
          setTimeout(() => focusInput(), 100);
        }
      }, 100);
    };

    const handleInteractiveInput = async (e: CustomEvent<{ value: string }>) => {
      const { value } = e.detail;
      setInput(value);
      // Auto-send after a short delay
      setTimeout(async () => {
        if (onSendMessage) {
          await onSendMessage(value);
          clearInput();
          setTimeout(() => focusInput(), 100);
        }
      }, 100);
    };

    const handleToolApproval = async (
      e: CustomEvent<{ messageId: string; approved: boolean }>
    ) => {
      const { messageId, approved } = e.detail;
      console.log('[UnifiedChatInput] Tool approval event:', { messageId, approved });

      // Dispatch to Electron via IPC
      if (window.electronAPI?.langgraph) {
        try {
          await window.electronAPI.langgraph.respondToolApproval(
            dataSource.conversationId || '',
            approved
          );
        } catch (error) {
          console.error('[UnifiedChatInput] Failed to respond tool approval:', error);
        }
      }
    };

    window.addEventListener('sepilot:interactive-select', handleInteractiveSelect as EventListener);
    window.addEventListener('sepilot:interactive-input', handleInteractiveInput as EventListener);
    window.addEventListener('sepilot:tool-approval', handleToolApproval as EventListener);

    return () => {
      window.removeEventListener(
        'sepilot:interactive-select',
        handleInteractiveSelect as EventListener
      );
      window.removeEventListener(
        'sepilot:interactive-input',
        handleInteractiveInput as EventListener
      );
      window.removeEventListener('sepilot:tool-approval', handleToolApproval as EventListener);
    };
  }, [onSendMessage, clearInput, focusInput, setInput, dataSource.conversationId]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) {
      return;
    }

    const message = input.trim();
    clearInput();

    if (onSendMessage) {
      await onSendMessage(message);
    }

    // Auto-focus after send
    setTimeout(() => focusInput(), 100);
  };

  const handleStop = () => {
    if (onStopStreaming) {
      onStopStreaming();
    }
  };

  // Determine compact styling
  const compact = style?.compact ?? false;
  const placeholderText = isStreaming
    ? '응답 생성 중... (ESC로 중단 가능)'
    : compact
      ? '메시지 입력...'
      : '메시지를 입력하세요...';

  return (
    <div className={`shrink-0 border-t bg-background ${compact ? 'p-1.5' : 'p-2'}`}>
      {/* Agent Progress Plugin Mount Point */}
      {features.enableAgentProgress && (
        <div className="mb-2">
          {/* AgentProgressPlugin will render here */}
        </div>
      )}

      <div
        className={`relative flex items-end gap-${compact ? '1.5' : '2'} rounded-${compact ? 'md' : 'lg'} border border-input bg-background`}
      >
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, handleSend)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder={placeholderText}
          className={`flex-1 ${compact ? 'min-h-[36px] max-h-[100px]' : 'min-h-[40px] max-h-[120px]'} resize-none border-0 bg-transparent px-${compact ? '2' : '3'} py-${compact ? '1.5' : '2'} ${
            compact ? 'text-[11px]' : 'text-xs'
          } focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60`}
          disabled={isStreaming}
          rows={1}
        />
        <div className={`flex items-center pb-1 pr-1`}>
          {isStreaming ? (
            <Button
              onClick={handleStop}
              variant={compact ? 'ghost' : 'destructive'}
              size="icon"
              className={`${compact ? 'h-6 w-6 rounded-sm' : 'h-7 w-7 rounded-md'} shrink-0`}
              title="중지 (Esc)"
            >
              <Square className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} ${compact ? '' : 'fill-current'}`} />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              size="icon"
              className={`${compact ? 'h-6 w-6 rounded-sm' : 'h-7 w-7 rounded-md'} shrink-0 bg-primary hover:bg-primary/90 disabled:opacity-50`}
              title="전송 (Enter)"
            >
              <Send className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />
            </Button>
          )}
        </div>
      </div>

      {/* Image Attachment Plugin Mount Point */}
      {features.enableImageUpload && mode === 'main' && (
        <div className="mt-2">
          {/* ImageAttachmentPlugin will render here */}
        </div>
      )}

      {/* File Upload Plugin Mount Point */}
      {features.enableFileUpload && mode === 'main' && (
        <div className="mt-2">
          {/* FileUploadPlugin will render here */}
        </div>
      )}

      {/* Thinking Mode Selector Plugin Mount Point */}
      {features.enableThinkingModeSelector && mode === 'main' && (
        <div className="mt-2">
          {/* ThinkingModePlugin will render here */}
        </div>
      )}
    </div>
  );
}
