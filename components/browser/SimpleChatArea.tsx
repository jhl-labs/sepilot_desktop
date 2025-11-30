'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Brain, Wrench, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';

export function SimpleChatArea() {
  const { browserChatMessages, browserChatFontConfig, browserAgentLogs, browserAgentIsRunning } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages or logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [browserChatMessages, browserAgentLogs]);

  if (browserChatMessages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground px-4">
        <MessageSquare className="mb-4 h-12 w-12 opacity-10" />
        <div className="text-xs font-medium text-center space-y-2">
          <p className="text-sm mb-3">사용 가능한 Browser Agent 도구</p>
          <p>• 페이지 이동</p>
          <p>• 페이지 내용 읽기</p>
          <p>• 클릭 가능 요소 찾기</p>
          <p>• 요소 클릭</p>
          <p>• 텍스트 입력</p>
          <p>• 스크롤</p>
          <p>• 새 탭 열기</p>
          <p>• 탭 전환</p>
          <p>• 탭 닫기</p>
          <p>• 탭 목록</p>
          <p>• 스크린샷 + 텍스트 요약</p>
          <p>• 선택 텍스트 읽기</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="px-3 py-2 space-y-3">
        {browserChatMessages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
              style={{
                fontFamily: browserChatFontConfig.fontFamily,
                fontSize: `${browserChatFontConfig.fontSize}px`,
              }}
            >
              {message.role === 'user' ? (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              ) : (
                <MarkdownRenderer content={message.content} />
              )}
            </div>
          </div>
        ))}

        {/* Agent 실행 로그 표시 */}
        {browserAgentLogs.length > 0 && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-3 py-2 bg-muted/50 border border-muted-foreground/20">
              <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground">
                <Brain className="h-3 w-3" />
                <span>Agent 실행 과정</span>
                {browserAgentIsRunning && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
              </div>
              <div className="space-y-1.5 text-xs">
                {browserAgentLogs.slice(-5).map((log) => (
                  <div key={log.id} className="flex items-start gap-2">
                    {log.phase === 'thinking' && <Brain className="h-3 w-3 mt-0.5 text-blue-500 shrink-0" />}
                    {log.phase === 'tool_call' && <Wrench className="h-3 w-3 mt-0.5 text-purple-500 shrink-0" />}
                    {log.phase === 'tool_result' && <CheckCircle2 className="h-3 w-3 mt-0.5 text-green-500 shrink-0" />}
                    {log.phase === 'error' && <XCircle className="h-3 w-3 mt-0.5 text-red-500 shrink-0" />}
                    {log.phase === 'completion' && <CheckCircle2 className="h-3 w-3 mt-0.5 text-green-500 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground/80">{log.message}</span>
                      {log.details?.toolName && (
                        <span className="ml-1 text-muted-foreground">({log.details.toolName})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
