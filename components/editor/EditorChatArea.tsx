'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { EditorToolsList } from './EditorToolsList';

export function EditorChatArea() {
  const { editorChatMessages, editorChatStreaming } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [editorChatMessages]);

  if (editorChatMessages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground px-3 py-4 overflow-y-auto">
        <MessageSquare className="mb-3 h-10 w-10 opacity-10" />
        <div className="w-full max-w-md">
          <EditorToolsList />
        </div>
      </div>
    );
  }

  return (
    <ScrollArea ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="px-2 py-2 space-y-2">
        {editorChatMessages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${
                message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
            >
              {message.role === 'assistant' ? (
                <div className="prose prose-xs dark:prose-invert max-w-none">
                  <MarkdownRenderer content={message.content} />
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              )}
            </div>
          </div>
        ))}
        {/* 백그라운드 스트리밍 중 표시 */}
        {editorChatStreaming && (
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
