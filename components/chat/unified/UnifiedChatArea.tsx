'use client';

/**
 * UnifiedChatArea Component
 *
 * 통합 채팅 영역 - 메시지 목록 표시
 * Main, Browser, Editor 모드 모두 지원
 */

import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare } from 'lucide-react';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { MessageBubble } from '../MessageBubble';
import { useChatMessages } from './hooks/useChatMessages';
import type { ChatConfig } from './types';

interface UnifiedChatAreaProps {
  config: ChatConfig;
}

export function UnifiedChatArea({ config }: UnifiedChatAreaProps) {
  const { mode, features, style, dataSource } = config;
  const { messages, isStreaming, scrollRef } = useChatMessages(dataSource);

  // Empty state message based on mode
  const getEmptyStateMessage = () => {
    switch (mode) {
      case 'browser':
        return {
          title: 'Browser Agent 도구',
          items: [
            '• 페이지 이동 • 내용 읽기 • 요소 클릭',
            '• 텍스트 입력 • 스크롤 • 탭 관리',
            '• 스크린샷 • 텍스트 요약',
          ],
        };
      case 'editor':
        return {
          title: 'Editor Agent 도구',
          items: [
            '• 파일 읽기/쓰기 • 코드 편집',
            '• 파일 검색 • 명령 실행',
            '• Git 작업 • 코드 분석',
          ],
        };
      default:
        return {
          title: 'SEPilot에 오신 것을 환영합니다',
          subtitle: '새 대화를 시작하거나 기존 대화를 선택하세요',
        };
    }
  };

  const emptyState = getEmptyStateMessage();

  // Apply style based on mode
  const containerClass = style?.compact
    ? 'px-2 py-1.5 space-y-2'
    : 'mx-auto max-w-4xl';

  const fontSize = style?.fontSize || (style?.compact ? '11px' : '14px');

  // Empty state
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground px-3">
        <MessageSquare
          className={`mb-3 opacity-10 ${style?.compact ? 'h-8 w-8' : 'h-16 w-16'}`}
        />
        {mode === 'main' ? (
          <>
            <h2 className="mb-2 text-xl font-semibold">{emptyState.title}</h2>
            <p className="text-center text-sm">{emptyState.subtitle}</p>
          </>
        ) : (
          <div className="text-[10px] font-medium text-center space-y-1">
            <p className="text-[11px] mb-2 font-semibold">{emptyState.title}</p>
            {emptyState.items?.map((item, i) => (
              <p key={i}>{item}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <ScrollArea ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className={containerClass} style={{ fontSize }}>
        {messages.map((message, index) => {
          const isLastAssistantMessage =
            message.role === 'assistant' && index === messages.length - 1;
          const isMessageStreaming = isStreaming && isLastAssistantMessage;

          // Main mode: Use full MessageBubble with all features
          if (mode === 'main') {
            return (
              <MessageBubble
                key={message.id}
                message={message}
                onEdit={features.enableEdit ? undefined : undefined} // Will be passed via props later
                onRegenerate={features.enableRegenerate ? undefined : undefined}
                isLastAssistantMessage={isLastAssistantMessage}
                isStreaming={isMessageStreaming}
                activePersona={config.activePersona}
              />
            );
          }

          // Browser/Editor mode: Simplified message display
          return (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`${
                  mode === 'browser' ? 'max-w-[90%]' : 'max-w-[85%]'
                } rounded-lg px-${style?.compact ? '2' : '2.5'} py-${style?.compact ? '1.5' : '1.5'} text-${style?.compact ? '[11px]' : 'xs'} ${
                  message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                {message.role === 'user' ? (
                  <p className="whitespace-pre-wrap break-words leading-tight">
                    {message.content}
                  </p>
                ) : (
                  <div className="prose prose-xs dark:prose-invert max-w-none">
                    <MarkdownRenderer
                      content={message.content}
                      className={style?.compact ? 'text-[11px] leading-tight' : ''}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Browser mode: Agent logs display (will be moved to plugin) */}
        {mode === 'browser' && dataSource.agentLogs && dataSource.agentLogs.length > 0 && (
          <div className="flex justify-start">
            <div className="max-w-[95%] rounded-md px-2 py-1.5 bg-muted/50 border border-muted-foreground/10">
              <div className="flex items-center gap-1.5 mb-1 text-[10px] font-semibold text-muted-foreground">
                <MessageSquare className="h-2.5 w-2.5" />
                <span>실행 과정</span>
              </div>
              <div className="space-y-0.5 text-[10px]">
                {dataSource.agentLogs.slice(-3).map((log) => (
                  <div key={log.id} className="flex items-start gap-1.5">
                    <div className="flex-1 min-w-0 leading-tight">
                      <span className="text-foreground/70">{log.message}</span>
                      {log.details?.toolName && (
                        <span className="ml-1 text-muted-foreground/60">
                          ({log.details.toolName})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Streaming indicator for compact modes */}
        {(mode === 'browser' || mode === 'editor') && isStreaming && (
          <div className="flex justify-start">
            <div className="rounded-lg px-2.5 py-1.5 text-xs bg-muted/50 border border-primary/20">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-muted-foreground">AI 응답 생성 중...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
