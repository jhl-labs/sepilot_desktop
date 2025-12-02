'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Brain, Wrench, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';

export function SimpleChatArea() {
  const { browserChatMessages, browserChatFontConfig, browserAgentLogs, browserAgentIsRunning } =
    useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages or logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [browserChatMessages, browserAgentLogs]);

  if (browserChatMessages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground px-3">
        <MessageSquare className="mb-3 h-8 w-8 opacity-10" />
        <div className="text-[10px] font-medium text-center space-y-1">
          <p className="text-[11px] mb-2 font-semibold">Browser Agent 도구</p>
          <p>• 페이지 이동 • 내용 읽기 • 요소 클릭</p>
          <p>• 텍스트 입력 • 스크롤 • 탭 관리</p>
          <p>• 스크린샷 • 텍스트 요약</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="px-2 py-1.5 space-y-2">
        {browserChatMessages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-lg px-2 py-1.5 text-[11px] ${
                message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
              style={{
                fontFamily: browserChatFontConfig.fontFamily,
                fontSize: `${Math.max(10, browserChatFontConfig.fontSize - 2)}px`,
              }}
            >
              {message.role === 'user' ? (
                <p className="whitespace-pre-wrap break-words leading-tight">{message.content}</p>
              ) : (
                <MarkdownRenderer content={message.content} className="text-[11px] leading-tight" />
              )}
            </div>
          </div>
        ))}

        {/* Agent 실행 로그 표시 - 압축된 형태 */}
        {browserAgentLogs.length > 0 && (
          <div className="flex justify-start">
            <div className="max-w-[95%] rounded-md px-2 py-1.5 bg-muted/50 border border-muted-foreground/10">
              <div className="flex items-center gap-1.5 mb-1 text-[10px] font-semibold text-muted-foreground">
                <Brain className="h-2.5 w-2.5" />
                <span>실행 과정</span>
                {browserAgentIsRunning && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
              </div>
              <div className="space-y-0.5 text-[10px]">
                {browserAgentLogs.slice(-3).map((log) => (
                  <div key={log.id} className="flex items-start gap-1.5">
                    {log.phase === 'thinking' && (
                      <Brain className="h-2.5 w-2.5 mt-0.5 text-blue-500 shrink-0" />
                    )}
                    {log.phase === 'tool_call' && (
                      <Wrench className="h-2.5 w-2.5 mt-0.5 text-purple-500 shrink-0" />
                    )}
                    {log.phase === 'tool_result' && (
                      <CheckCircle2 className="h-2.5 w-2.5 mt-0.5 text-green-500 shrink-0" />
                    )}
                    {log.phase === 'error' && (
                      <XCircle className="h-2.5 w-2.5 mt-0.5 text-red-500 shrink-0" />
                    )}
                    {log.phase === 'completion' && (
                      <CheckCircle2 className="h-2.5 w-2.5 mt-0.5 text-green-500 shrink-0" />
                    )}
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
      </div>
    </ScrollArea>
  );
}
