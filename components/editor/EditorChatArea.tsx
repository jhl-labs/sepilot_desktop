'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { EditorToolsList } from './EditorToolsList';

export function EditorChatArea() {
  const { editorChatMessages } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [editorChatMessages]);

  if (editorChatMessages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground px-4 py-6 overflow-y-auto">
        <MessageSquare className="mb-4 h-12 w-12 opacity-10" />
        <div className="w-full max-w-md">
          <EditorToolsList />
        </div>
      </div>
    );
  }

  return (
    <ScrollArea ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="px-3 py-2 space-y-3">
        {editorChatMessages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
            >
              {message.role === 'assistant' ? (
                <MarkdownRenderer content={message.content} />
              ) : (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
