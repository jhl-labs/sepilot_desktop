'use client';

/**
 * UnifiedChatArea Component
 *
 * 통합 채팅 영역 - 메시지 목록 표시
 * Main Chat, Browser Chat, Editor Chat 모두에서 사용
 */

import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare } from 'lucide-react';
import { MessageBubble } from '../MessageBubble';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { useChatMessages } from './hooks/useChatMessages';
import type { ChatConfig } from './types';

interface UnifiedChatAreaProps {
  config: ChatConfig;
  onEdit?: (messageId: string, newContent: string) => Promise<void>;
  onRegenerate?: (messageId: string) => Promise<void>;
}

export function UnifiedChatArea({ config, onEdit, onRegenerate }: UnifiedChatAreaProps) {
  const { mode, features, style, dataSource, activePersona } = config;
  const { messages, isStreaming, scrollRef } = useChatMessages(dataSource);

  // Empty state
  if (messages.length === 0) {
    return (
      <div
        className={`flex h-full flex-col items-center justify-center text-muted-foreground ${
          style?.compact ? 'px-3 py-4' : 'px-4'
        }`}
      >
        <MessageSquare
          className={`mb-${style?.compact ? '3' : '4'} opacity-10 ${
            style?.compact ? 'h-8 w-8' : 'h-16 w-16'
          }`}
        />
        {mode === 'main' && (
          <div className="text-center">
            <p className={`font-medium ${style?.compact ? 'text-sm' : 'text-base'}`}>
              메시지를 입력하여 대화를 시작하세요
            </p>
            <p
              className={`mt-1 opacity-60 ${style?.compact ? 'text-xs' : 'text-sm'}`}
            >
              AI 어시스턴트가 도와드리겠습니다
            </p>
          </div>
        )}
        {mode === 'browser' && (
          <div className={`text-center space-y-1 ${style?.compact ? 'text-[10px]' : 'text-xs'}`}>
            <p className={`font-semibold mb-2 ${style?.compact ? 'text-[11px]' : 'text-sm'}`}>
              Browser Agent 도구
            </p>
            <p>• 페이지 이동 • 내용 읽기 • 요소 클릭</p>
            <p>• 텍스트 입력 • 스크롤 • 탭 관리</p>
            <p>• 스크린샷 • 텍스트 요약</p>
          </div>
        )}
        {mode === 'editor' && (
          <div className="w-full max-w-md">
            {/* EditorToolsList will be rendered by plugin */}
          </div>
        )}
      </div>
    );
  }

  // Determine base font size
  const baseFontSize = style?.fontSize || (style?.compact ? '11px' : '14px');
  const maxWidth = style?.maxWidth || (style?.compact ? '95%' : '4xl');

  return (
    <ScrollArea ref={scrollRef} className="flex-1 overflow-y-auto">
      <div
        className={`${style?.compact ? 'px-2 py-1.5 space-y-2' : 'mx-auto max-w-4xl'}`}
        style={{ fontSize: baseFontSize }}
      >
        {messages.map((message, index) => {
          const isLastAssistantMessage =
            message.role === 'assistant' && index === messages.length - 1;
          const isMessageStreaming = isStreaming && isLastAssistantMessage;

          // Main mode: Use full MessageBubble with all features
          if (mode === 'main' && !style?.compact) {
            return (
              <MessageBubble
                key={message.id}
                message={message}
                onEdit={features.enableEdit ? onEdit : undefined}
                onRegenerate={features.enableRegenerate ? onRegenerate : undefined}
                isLastAssistantMessage={isLastAssistantMessage}
                isStreaming={isMessageStreaming}
                activePersona={activePersona}
              />
            );
          }

          // Compact mode (Browser/Editor): Simple bubble
          return (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[${maxWidth}] rounded-lg px-${style?.compact ? '2' : '2.5'} py-${style?.compact ? '1.5' : '1.5'} ${
                  style?.compact ? 'text-[11px]' : 'text-xs'
                } ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {message.role === 'assistant' ? (
                  <div className={`prose ${style?.compact ? 'prose-xs' : 'prose-sm'} dark:prose-invert max-w-none`}>
                    <MarkdownRenderer
                      content={message.content}
                      className={style?.compact ? 'text-[11px] leading-tight' : undefined}
                    />
                  </div>
                ) : (
                  <p
                    className={`whitespace-pre-wrap break-words ${style?.compact ? 'leading-tight' : ''}`}
                  >
                    {message.content}
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {/* Streaming indicator for compact modes */}
        {isStreaming && style?.compact && (
          <div className="flex justify-start">
            <div className={`rounded-lg px-2.5 py-1.5 ${style?.compact ? 'text-xs' : 'text-sm'} bg-muted/50 border border-primary/20`}>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-muted-foreground">AI 응답 생성 중...</span>
              </div>
            </div>
          </div>
        )}

        {/* Agent logs plugin mount point */}
        {features.enableAgentLogs && dataSource.agentLogs && dataSource.agentLogs.length > 0 && (
          <div className="flex justify-start">
            {/* AgentLogsPlugin will render here */}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
