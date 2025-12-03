'use client';

import { Bot, Layers, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ScrollArea } from '@/components/ui/scroll-area';

export function SidebarPresentation() {
  const { presentationChatMessages, presentationSlides, clearPresentationSession } = useChatStore();

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">AI Presentation Lab</p>
            <p className="text-xs text-muted-foreground">대화 히스토리 및 슬라이드 관리</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="border-b px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border bg-muted/40 p-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Bot className="h-3 w-3" />
              <span>대화</span>
            </div>
            <p className="mt-1 text-lg font-semibold">{presentationChatMessages.length}</p>
          </div>
          <div className="rounded-md border bg-muted/40 p-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Layers className="h-3 w-3" />
              <span>슬라이드</span>
            </div>
            <p className="mt-1 text-lg font-semibold">{presentationSlides.length}장</p>
          </div>
        </div>
      </div>

      {/* Chat History */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {presentationChatMessages.length === 0 ? (
            <div className="rounded-lg border bg-muted/20 p-3 text-center text-sm text-muted-foreground">
              메인 화면에서 대화를 시작하세요
            </div>
          ) : (
            presentationChatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-lg border p-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-muted/30 border-muted'
                }`}
              >
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {msg.role === 'user' ? 'You' : 'AI'}
                </div>
                <div className="line-clamp-3 text-xs leading-relaxed">{msg.content || '...'}</div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="shrink-0 border-t p-2">
        <div className="flex gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (presentationSlides.length > 0 || presentationChatMessages.length > 0) {
                if (window.confirm('모든 슬라이드와 대화 내용이 삭제됩니다. 계속하시겠습니까?')) {
                  clearPresentationSession();
                }
              } else {
                clearPresentationSession();
              }
            }}
            title="새 프레젠테이션"
            className="flex-1"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
