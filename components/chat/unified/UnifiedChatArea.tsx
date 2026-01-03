'use client';

/**
 * UnifiedChatArea Component
 *
 * 통합 채팅 영역 - 메시지 목록 표시
 * Main Chat, Browser Chat, Editor Chat 모두에서 사용
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Bug, Copy, Check, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageBubble } from '../MessageBubble';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { useChatMessages } from './hooks/useChatMessages';
import type { ChatConfig } from './types';
import { parseInteractiveContent } from '@/lib/utils/interactive-parser';
import { ToolResult } from '../ToolResult';
import { InteractiveSelect } from '../InteractiveSelect';
import { InteractiveInput } from '../InteractiveInput';
import { ToolApprovalRequest } from '../ToolApprovalRequest';
import { ConversationReportDialog } from '@/components/ConversationReportDialog';
import { isErrorReportingEnabled } from '@/lib/error-reporting';
import { copyToClipboard } from '@/lib/utils/clipboard';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface UnifiedChatAreaProps {
  config: ChatConfig;
  onEdit?: (messageId: string, newContent: string) => Promise<void>;
  onRegenerate?: (messageId: string) => Promise<void>;
}

export function UnifiedChatArea({ config, onEdit, onRegenerate }: UnifiedChatAreaProps) {
  const { t } = useTranslation();
  const { mode, features, style, dataSource, activePersona, conversationId } = config;
  const { messages, isStreaming, scrollRef } = useChatMessages(dataSource);

  // 대화 리포트 다이얼로그 상태
  const [showReportDialog, setShowReportDialog] = useState(false);

  // 메시지별 복사 상태 및 hover 상태
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  // 대화 리포트 전송 핸들러
  const handleSendReport = async (issue: string, additionalInfo?: string) => {
    try {
      if (typeof window === 'undefined' || !window.electronAPI) {
        throw new Error('Electron API를 사용할 수 없습니다.');
      }

      const result = await window.electronAPI.errorReporting.sendConversation({
        issue,
        messages,
        conversationId,
        additionalInfo,
      });

      if (result.success) {
        console.error('[ConversationReport] Report sent successfully:', result.data?.issueUrl);
        setShowReportDialog(false);
      } else {
        throw new Error(result.error || '리포트 전송 실패');
      }
    } catch (error) {
      console.error('[ConversationReport] Failed to send report:', error);
      window.alert(
        `리포트 전송 실패: ${error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'}`
      );
    }
  };

  // 에러 발생 여부 확인
  const hasError = messages.some((msg) => {
    if (msg.role === 'assistant') {
      const content = msg.content.toLowerCase();
      return (
        content.includes('error:') ||
        content.includes('오류:') ||
        content.includes('실패:') ||
        content.includes('failed:') ||
        content.includes('exception:') ||
        content.includes('cannot') ||
        content.includes('할 수 없습니다')
      );
    }
    return false;
  });

  // 리포트 버튼 클릭 핸들러
  const handleReportClick = async () => {
    const enabled = await isErrorReportingEnabled();
    if (!enabled) {
      window.alert(
        '에러 리포팅 비활성화됨. Settings > System > GitHub Sync에서 에러 리포팅을 활성화해주세요.'
      );
      return;
    }

    setShowReportDialog(true);
  };

  // 메시지 복사 핸들러
  const handleCopyMessage = async (messageId: string, content: string) => {
    const success = await copyToClipboard(content);
    if (success) {
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    }
  };

  // Document로 저장 핸들러
  const handleSaveAsDocument = async (content: string) => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      window.alert('Document 저장은 Electron 환경에서만 사용 가능합니다.');
      return;
    }

    try {
      const title = `Chat Message - ${new Date().toLocaleString('ko-KR')}`;
      // @ts-expect-error: RAG API is available but not in type definition
      const result = await window.electronAPI.rag?.addDocument({
        title,
        content,
        source: 'browser-chat',
      });

      if (result?.success) {
        window.alert('메시지가 Document로 저장되었습니다.');
      } else {
        window.alert(`Document 저장 실패: ${result?.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      console.error('[UnifiedChatArea] Failed to save as document:', error);
      window.alert('Document 저장 중 오류가 발생했습니다.');
    }
  };

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
            <p className={`mt-1 opacity-60 ${style?.compact ? 'text-xs' : 'text-sm'}`}>
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
          <div className="w-full max-w-md">{/* EditorToolsList will be rendered by plugin */}</div>
        )}
      </div>
    );
  }

  // Determine base font size
  const baseFontSize = style?.fontSize || (style?.compact ? '11px' : '14px');
  const maxWidth = style?.maxWidth || (style?.compact ? '95%' : '4xl');

  return (
    <>
      {/* 대화 리포트 다이얼로그 */}
      <ConversationReportDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        messages={messages}
        conversationId={config.conversationId}
        onConfirm={handleSendReport}
        onCancel={() => setShowReportDialog(false)}
      />

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

            // Compact mode (Browser/Editor): Parse interactive components with copy button and context menu
            return (
              <ContextMenu key={message.id}>
                <ContextMenuTrigger asChild>
                  <div
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} group relative`}
                    onMouseEnter={() => setHoveredMessageId(message.id)}
                    onMouseLeave={() => setHoveredMessageId(null)}
                  >
                    <div
                      className={`max-w-[${maxWidth}] rounded-lg px-${style?.compact ? '2' : '2.5'} py-${style?.compact ? '1.5' : '1.5'} ${
                        style?.compact ? 'text-[11px]' : 'text-xs'
                      } ${message.role === 'user' ? 'bg-primary text-primary-foreground' : ''}`}
                    >
                      {message.role === 'assistant' ? (
                        <>
                          {/* Parse and render interactive components */}
                          {(() => {
                            const parsed = parseInteractiveContent(message.content);
                            return parsed.segments.map((segment, segIndex) => {
                              if (segment.type === 'text') {
                                return (
                                  <div
                                    key={segIndex}
                                    className={`prose ${style?.compact ? 'prose-xs' : 'prose-sm'} dark:prose-invert max-w-none`}
                                  >
                                    <MarkdownRenderer
                                      content={segment.content as string}
                                      className={
                                        style?.compact ? 'text-[11px] leading-tight' : undefined
                                      }
                                    />
                                  </div>
                                );
                              } else {
                                // Render interactive component
                                const block = segment.content as any;

                                if (block.type === 'interactive-select') {
                                  return (
                                    <InteractiveSelect
                                      key={segIndex}
                                      title={block.title}
                                      options={block.options}
                                    />
                                  );
                                } else if (block.type === 'interactive-input') {
                                  return (
                                    <InteractiveInput
                                      key={segIndex}
                                      title={block.title}
                                      placeholder={block.placeholder}
                                      multiline={block.multiline}
                                    />
                                  );
                                } else if (block.type === 'tool-result') {
                                  return (
                                    <ToolResult
                                      key={segIndex}
                                      toolName={block.toolName}
                                      status={block.status}
                                      summary={block.summary}
                                      details={block.details}
                                      duration={block.duration}
                                    />
                                  );
                                } else if (block.type === 'tool-approval') {
                                  return (
                                    <ToolApprovalRequest
                                      key={segIndex}
                                      messageId={block.messageId}
                                      toolCalls={block.toolCalls}
                                    />
                                  );
                                }

                                return null;
                              }
                            });
                          })()}
                        </>
                      ) : (
                        <p
                          className={`whitespace-pre-wrap break-words ${style?.compact ? 'leading-tight' : ''}`}
                        >
                          {message.content}
                        </p>
                      )}
                    </div>

                    {/* Copy button (shown on hover) */}
                    {features.enableCopy && hoveredMessageId === message.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopyMessage(message.id, message.content)}
                        className="absolute right-2 top-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="복사"
                      >
                        {copiedMessageId === message.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuItem onClick={() => handleCopyMessage(message.id, message.content)}>
                    <Copy className="mr-2 h-4 w-4" />
                    <span>복사</span>
                  </ContextMenuItem>
                  {message.role === 'assistant' && (
                    <ContextMenuItem onClick={() => handleSaveAsDocument(message.content)}>
                      <FileText className="mr-2 h-4 w-4" />
                      <span>Document로 저장</span>
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}

          {/* Streaming indicator for compact modes */}
          {isStreaming && style?.compact && (
            <div className="flex justify-start">
              <div
                className={`rounded-lg px-2.5 py-1.5 ${style?.compact ? 'text-xs' : 'text-sm'} bg-muted/50 border border-primary/20`}
              >
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-muted-foreground">{t('chat.generating')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Agent logs plugin mount point */}
          {features.enableAgentLogs && dataSource.agentLogs && dataSource.agentLogs.length > 0 && (
            <div className="flex justify-start">{/* AgentLogsPlugin will render here */}</div>
          )}

          {/* 대화 리포트 버튼 - 에러 발생 시에만 표시 */}
          {messages.length > 0 && !style?.compact && hasError && (
            <div className="flex justify-center mt-6 pb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReportClick}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <Bug className="mr-2 h-3 w-3" />
                {t('chat.report.buttonText')}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
