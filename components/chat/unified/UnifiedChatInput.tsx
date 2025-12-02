'use client';

/**
 * UnifiedChatInput Component
 *
 * 통합 입력 영역 - 사용자 입력 처리
 * Main, Browser, Editor 모드 모두 지원
 */

import { useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Square } from 'lucide-react';
import { useChatInput } from './hooks/useChatInput';
import type { ChatConfig } from './types';

interface UnifiedChatInputProps {
  config: ChatConfig;
  onSendMessage?: (content: string) => Promise<void>;
  onStopStreaming?: () => void;
}

export function UnifiedChatInput({
  config,
  onSendMessage,
  onStopStreaming,
}: UnifiedChatInputProps) {
  const { mode, style, dataSource } = config;
  const { input, setInput, isComposing, setIsComposing, textareaRef, handleKeyDown, clearInput } =
    useChatInput();

  const isStreaming = !!dataSource.streamingState;

  // Handle send
  const handleSend = async () => {
    if (!input.trim() || isStreaming) {
      return;
    }

    const messageContent = input.trim();
    clearInput();

    try {
      if (onSendMessage) {
        await onSendMessage(messageContent);
      } else {
        // Default behavior: add message directly
        await dataSource.addMessage({
          role: 'user',
          content: messageContent,
        });
      }
    } catch (error) {
      console.error('[UnifiedChatInput] Send error:', error);
    }
  };

  // Handle stop
  const handleStop = () => {
    if (onStopStreaming) {
      onStopStreaming();
    } else {
      dataSource.stopStreaming();
    }
  };

  // Handle Esc key to stop streaming
  useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isStreaming) {
        handleStop();
      }
    };

    window.addEventListener('keydown', handleKeyDownGlobal);
    return () => window.removeEventListener('keydown', handleKeyDownGlobal);
  }, [isStreaming]);

  // Apply style based on mode
  const containerPadding = style?.compact ? 'p-1.5' : 'p-2';
  const textareaClass = style?.compact
    ? 'min-h-[36px] max-h-[100px] text-[11px] px-2 py-1.5'
    : 'min-h-[40px] max-h-[120px] text-xs px-3 py-2';
  const buttonSize = style?.compact ? 'h-6 w-6' : 'h-7 w-7';
  const iconSize = style?.compact ? 'h-3 w-3' : 'h-3.5 w-3.5';

  const placeholder = isStreaming
    ? '응답 생성 중... (ESC로 중단 가능)'
    : mode === 'browser'
      ? '메시지 입력...'
      : '메시지를 입력하세요...';

  return (
    <div className={`shrink-0 border-t bg-background ${containerPadding}`}>
      {/* Plugin mount point: Agent Progress (will be added in Phase 3) */}
      {/* {features.enableAgentProgress && <AgentProgressPlugin />} */}

      <div
        className={`relative flex items-end gap-${style?.compact ? '1.5' : '2'} rounded-${style?.compact ? 'md' : 'lg'} border border-input bg-background`}
      >
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, handleSend)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder={placeholder}
          className={`flex-1 ${textareaClass} resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60`}
          disabled={isStreaming}
          rows={1}
        />
        <div className="flex items-center pb-1 pr-1">
          {isStreaming ? (
            <Button
              onClick={handleStop}
              variant={mode === 'main' ? 'destructive' : 'ghost'}
              size="icon"
              className={`${buttonSize} ${style?.compact ? 'rounded-sm' : 'rounded-md'} shrink-0`}
              title="중지 (Esc)"
            >
              <Square className={`${iconSize} ${mode === 'main' ? 'fill-current' : ''}`} />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              size="icon"
              className={`${buttonSize} ${style?.compact ? 'rounded-sm' : 'rounded-md'} shrink-0 bg-primary hover:bg-primary/90 disabled:opacity-50`}
              title="전송 (Enter)"
            >
              <Send className={iconSize} />
            </Button>
          )}
        </div>
      </div>

      {/* Plugin mount points (will be added in Phase 3) */}
      {/* {features.enableImageUpload && <ImageAttachmentPlugin />} */}
      {/* {features.enableFileUpload && <FileUploadPlugin />} */}
      {/* {features.enableFontScale && <FontScalePlugin />} */}
      {/* {features.enablePersona && <PersonaPlugin />} */}
      {/* {features.enableThinkingModeSelector && <ThinkingModeSelector />} */}
    </div>
  );
}
