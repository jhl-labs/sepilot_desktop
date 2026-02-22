'use client';

/**
 * UnifiedChatArea Component
 *
 * 통합 채팅 영역 - 메시지 목록 표시
 * Main Chat, Browser Chat, Editor Chat 모두에서 사용
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { logger } from '@/lib/utils/logger';

// Chat width setting
const CHAT_WIDTH_KEY = 'sepilot_chat_message_width';
const DEFAULT_CHAT_WIDTH = 896; // max-w-4xl = 56rem = 896px
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare,
  Bug,
  Copy,
  Check,
  FileText,
  Search,
  X as XIcon,
  ChevronUp,
  ChevronDown,
  ArrowDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageBubble } from './components/MessageBubble';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useChatMessages } from './hooks/useChatMessages';
import type { ChatConfig } from './types';
import { parseInteractiveContent } from '@/lib/utils/interactive-parser';
import { ToolResult } from './components/ToolResult';
import { InteractiveSelect } from './components/InteractiveSelect';
import { InteractiveInput } from './components/InteractiveInput';
import { ToolApprovalRequest } from './components/ToolApprovalRequest';
import { ConversationReportDialog } from '@/components/ConversationReportDialog';
import { CoworkPanel } from './plugins/CoworkPanel';
import { useChatStore } from '@/lib/store/chat-store';
import { isErrorReportingEnabled } from '@/lib/error-reporting';
import { copyToClipboard } from '@/lib/utils/clipboard';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { memo } from 'react';

// Cowork Panel connector — subscribes to cowork store state
function CoworkPanelConnector() {
  const coworkPlan = useChatStore((s: any) => s.coworkPlan);
  const coworkTeamStatus = useChatStore((s: any) => s.coworkTeamStatus);
  const coworkTokensConsumed = useChatStore((s: any) => s.coworkTokensConsumed);
  const coworkTotalTokenBudget = useChatStore((s: any) => s.coworkTotalTokenBudget);
  const thinkingMode = useChatStore((s: any) => s.thinkingMode);

  if (thinkingMode !== 'cowork' || !coworkPlan) {
    return null;
  }

  return (
    <div className="px-4 pt-2">
      <CoworkPanel
        plan={coworkPlan}
        teamStatus={coworkTeamStatus}
        tokensConsumed={coworkTokensConsumed}
        totalTokenBudget={coworkTotalTokenBudget}
      />
    </div>
  );
}

// Optimized Message List component to prevent full area re-renders
const MessageList = memo(function MessageList({
  messages,
  isStreaming,
  onEdit,
  onRegenerate,
  activePersona,
  onCodeRun,
  features,
}: {
  messages: any[];
  isStreaming: boolean;
  onEdit?: any;
  onRegenerate?: any;
  activePersona?: any;
  onCodeRun?: any;
  features: any;
}) {
  return (
    <>
      {messages.map((message, index) => {
        const isLastAssistantMessage =
          message.role === 'assistant' && index === messages.length - 1;
        const isMessageStreaming = isStreaming && isLastAssistantMessage;

        return (
          <ErrorBoundary
            key={message.id}
            fallback={
              <div className="p-3 border border-destructive rounded-lg bg-destructive/5 text-xs">
                <p className="text-destructive font-medium">메시지 렌더링 오류</p>
                <p className="text-muted-foreground mt-1">
                  이 메시지를 표시하는 중 오류가 발생했습니다.
                </p>
              </div>
            }
          >
            <div data-message-index={index}>
              <MessageBubble
                message={message}
                onEdit={features.enableEdit ? onEdit : undefined}
                onRegenerate={features.enableRegenerate ? onRegenerate : undefined}
                isLastAssistantMessage={isLastAssistantMessage}
                isStreaming={isMessageStreaming}
                activePersona={activePersona}
                onCodeRun={onCodeRun}
              />
            </div>
          </ErrorBoundary>
        );
      })}
    </>
  );
});

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

  // Chat width state with localStorage persistence (only for main mode)
  const [chatWidth, setChatWidth] = useState<number>(DEFAULT_CHAT_WIDTH);

  // 대화 내 검색 상태
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMatches, setSearchMatches] = useState<number[]>([]); // 일치하는 메시지 인덱스 목록
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  // 맨 아래로 이동 버튼 상태
  const [showScrollButton, setShowScrollButton] = useState(false);

  // 스크롤 감지 로직
  useEffect(() => {
    const scrollArea = scrollRef.current;
    if (!scrollArea) {
      return;
    }

    // Radix ScrollArea의 뷰포트 찾기
    const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      // 바닥에서 200px 이상 떨어졌을 때 버튼 표시
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 200;
      setShowScrollButton(!isAtBottom);
    };

    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [scrollRef]);

  const scrollToBottom = useCallback(() => {
    const scrollArea = scrollRef.current;
    if (!scrollArea) {
      return;
    }
    const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [scrollRef]);

  // 검색어 변경 시 일치 항목 찾기
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    const matches: number[] = [];
    const term = searchTerm.toLowerCase();
    messages.forEach((msg, idx) => {
      if (msg.content.toLowerCase().includes(term)) {
        matches.push(idx);
      }
    });
    setSearchMatches(matches);
    setCurrentMatchIndex(matches.length > 0 ? matches.length - 1 : -1); // 가장 최근 메시지부터
  }, [searchTerm, messages]);

  // 검색 결과 이동
  const scrollToMatch = useCallback(
    (matchIdx: number) => {
      if (matchIdx < 0 || matchIdx >= searchMatches.length) {
        return;
      }

      const messageIdx = searchMatches[matchIdx];
      const element = document.querySelector(`[data-message-index="${messageIdx}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 시각적 강조를 위해 잠시 클래스 추가 가능
      }
    },
    [searchMatches]
  );

  useEffect(() => {
    if (currentMatchIndex !== -1) {
      scrollToMatch(currentMatchIndex);
    }
  }, [currentMatchIndex, scrollToMatch]);

  const handleNextMatch = () => {
    setCurrentMatchIndex((prev) => (prev + 1) % searchMatches.length);
  };

  const handlePrevMatch = () => {
    setCurrentMatchIndex((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
  };

  // Load chat width from localStorage on mount and listen for changes
  useEffect(() => {
    if (mode !== 'main' || style?.compact) {
      return;
    }

    const loadChatWidth = () => {
      const savedWidth = localStorage.getItem(CHAT_WIDTH_KEY);
      if (savedWidth) {
        const width = parseInt(savedWidth, 10);
        if (!isNaN(width) && width >= 640 && width <= 1536) {
          setChatWidth(width);
        }
      }
    };

    loadChatWidth();

    // Listen for chat width changes from settings
    const handleChatWidthChange = (event: Event) => {
      const customEvent = event as CustomEvent<number>;
      setChatWidth(customEvent.detail);
    };

    window.addEventListener('sepilot:chat-width-change', handleChatWidthChange);

    return () => {
      window.removeEventListener('sepilot:chat-width-change', handleChatWidthChange);
    };
  }, [mode, style?.compact]);

  // 대화 리포트 전송 핸들러
  const handleSendReport = useCallback(
    async (issue: string, additionalInfo?: string) => {
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
          logger.info('[ConversationReport] Report sent successfully:', result.data?.issueUrl);
          setShowReportDialog(false);
        } else {
          throw new Error(result.error || '리포트 전송 실패');
        }
      } catch (error) {
        logger.error('[ConversationReport] Failed to send report:', error);
        toast.error(
          `리포트 전송 실패: ${error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'}`
        );
      }
    },
    [messages, conversationId]
  );

  // 에러 발생 여부 확인
  const hasError = useMemo(
    () =>
      messages.some((msg) => {
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
      }),
    [messages]
  );

  // 리포트 버튼 클릭 핸들러
  const handleReportClick = useCallback(async () => {
    const enabled = await isErrorReportingEnabled();
    if (!enabled) {
      toast.warning(
        '에러 리포팅 비활성화됨. Settings > System > GitHub Sync에서 에러 리포팅을 활성화해주세요.'
      );
      return;
    }

    setShowReportDialog(true);
  }, []);

  // 메시지 복사 핸들러
  const handleCopyMessage = useCallback(async (messageId: string, content: string) => {
    const success = await copyToClipboard(content);
    if (success) {
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    }
  }, []);

  // Document로 저장 핸들러
  const handleSaveAsDocument = useCallback(async (content: string) => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      toast.warning('Document 저장은 Electron 환경에서만 사용 가능합니다.');
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
        toast.success('메시지가 Document로 저장되었습니다.');
      } else {
        toast.error(`Document 저장 실패: ${result?.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      logger.error('[UnifiedChatArea] Failed to save as document:', error);
      toast.error('Document 저장 중 오류가 발생했습니다.');
    }
  }, []);

  // Determine base font size
  const baseFontSize = style?.fontSize || (style?.compact ? '11px' : '14px');
  const maxWidth = style?.maxWidth || (style?.compact ? '95%' : '4xl');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
        setSearchTerm('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

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
              {t('chat.emptyState.startConversation')}
            </p>
            <p className={`mt-1 opacity-60 ${style?.compact ? 'text-xs' : 'text-sm'}`}>
              {t('chat.emptyState.aiAssistantHelp')}
            </p>
          </div>
        )}
        {mode === 'browser' && (
          <div className={`text-center space-y-1 ${style?.compact ? 'text-[10px]' : 'text-xs'}`}>
            <p className={`font-semibold mb-2 ${style?.compact ? 'text-[11px]' : 'text-sm'}`}>
              {t('browser.emptyState.title')}
            </p>
            <p>{t('browser.emptyState.row1')}</p>
            <p>{t('browser.emptyState.row2')}</p>
            <p>{t('browser.emptyState.row3')}</p>
          </div>
        )}
        {mode === 'editor' && (
          <div className="w-full max-w-md">{/* EditorToolsList will be rendered by plugin */}</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 relative">
      {/* 대화 리포트 다이얼로그 */}
      <ConversationReportDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        messages={messages}
        conversationId={config.conversationId}
        onConfirm={handleSendReport}
        onCancel={() => setShowReportDialog(false)}
      />

      {/* 대화 내 검색 바 */}
      {isSearchOpen && (
        <div className="absolute top-2 right-6 z-50 flex items-center gap-2 bg-background/95 backdrop-blur-sm border shadow-md rounded-lg p-1.5 animate-in slide-in-from-top-2 duration-200">
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="대화 내 검색..."
              className="h-8 pl-8 pr-16 text-xs"
              autoFocus
            />
            {searchMatches.length > 0 && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium">
                {searchMatches.length > 0 ? currentMatchIndex + 1 : 0} / {searchMatches.length}
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5 border-l pl-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={handlePrevMatch}
              disabled={searchMatches.length === 0}
              className="h-7 w-7"
              title="이전 결과"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleNextMatch}
              disabled={searchMatches.length === 0}
              className="h-7 w-7"
              title="다음 결과"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchTerm('');
              }}
              className="h-7 w-7 hover:text-destructive"
              title="닫기"
            >
              <XIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* 검색 열기 버튼 (우측 상단 플로팅) */}
      {!isSearchOpen && messages.length > 0 && (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setIsSearchOpen(true)}
          className="absolute top-2 right-6 z-10 h-8 w-8 rounded-full bg-background/50 backdrop-blur-sm border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          title="대화 내 검색 (Ctrl+F)"
          aria-label="Search in Conversation"
        >
          <Search className="h-4 w-4" />
        </Button>
      )}

      {/* Cowork Task Board */}
      <CoworkPanelConnector />

      <ScrollArea ref={scrollRef} className="flex-1 overflow-y-auto group">
        <div
          className={`${style?.compact ? 'px-2 py-1.5 space-y-2' : 'mx-auto'}`}
          style={{
            fontSize: baseFontSize,
            maxWidth: style?.compact ? undefined : `${chatWidth}px`,
          }}
        >
          {mode === 'main' && !style?.compact ? (
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              onEdit={onEdit}
              onRegenerate={onRegenerate}
              activePersona={activePersona}
              onCodeRun={config.onCodeRun}
              features={features}
            />
          ) : (
            messages.map((message: any, _index: number) => {
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
                                        onCodeBlockRun={config.onCodeRun}
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
            })
          )}

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

      {/* 맨 아래로 이동 버튼 */}
      {showScrollButton && (
        <Button
          size="icon"
          variant="secondary"
          onClick={scrollToBottom}
          className="absolute bottom-4 right-8 z-20 h-10 w-10 rounded-full shadow-lg border border-border animate-in fade-in zoom-in duration-200"
          title="최신 메시지로 이동"
        >
          <ArrowDown className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
