'use client';

import { Layers, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { PresentationChat } from '@/components/presentation/PresentationChat';

export function SidebarPresentation() {
  const { presentationViewMode, setPresentationViewMode, clearPresentationSession } =
    useChatStore();

  return (
    <div className="flex h-full w-full flex-col">
      {/* Content Area */}
      <div className="flex-1 min-h-0">
        {presentationViewMode === 'chat' ? (
          <PresentationChat />
        ) : presentationViewMode === 'settings' ? (
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-2">Presentation 설정</h3>
            <p className="text-sm text-muted-foreground">설정 UI는 추후 추가 예정</p>
          </div>
        ) : (
          <PresentationChat />
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t p-2">
        <div className="flex gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (window.confirm('모든 슬라이드와 대화 내용이 삭제됩니다. 계속하시겠습니까?')) {
                clearPresentationSession();
                setPresentationViewMode('chat');
              }
            }}
            title="새 프레젠테이션"
            className="flex-1"
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPresentationViewMode('outline')}
            title="슬라이드 미리보기"
            className="flex-1"
          >
            <Layers className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPresentationViewMode('settings')}
            title="설정"
            className="flex-1"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
