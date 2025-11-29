'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';

export function SimpleChatArea() {
  const { browserChatMessages } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [browserChatMessages]);

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
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              {message.role === 'user' ? (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              ) : (
                <MarkdownRenderer content={message.content} />
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
