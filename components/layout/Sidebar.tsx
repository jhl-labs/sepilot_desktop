'use client';

import { Plus, Settings, Trash, FileText, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ChatHistory } from './ChatHistory';
import { FileExplorer } from './FileExplorer';
import type { AppMode } from '@/lib/store/chat-store';

interface SidebarProps {
  onDocumentsClick?: () => void;
  onGalleryClick?: () => void;
  onConversationClick?: () => void;
}

export function Sidebar({ onDocumentsClick, onGalleryClick, onConversationClick }: SidebarProps = {}) {
  const {
    conversations,
    createConversation,
    deleteConversation,
    appMode,
    setAppMode,
  } = useChatStore();

  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleDeleteAll = async () => {
    if (conversations.length === 0) return;

    if (confirm(`모든 대화(${conversations.length}개)를 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.`)) {
      for (const conversation of conversations) {
        await deleteConversation(conversation.id);
      }
      // 모든 대화 삭제 후 새 대화 자동 생성
      await createConversation();
    }
  };

  return (
    <div className="flex h-full w-full flex-col border-r bg-background">
      {/* Mode Selector Tabs */}
      <div className="flex items-center border-b bg-muted/30">
        <button
          onClick={() => setAppMode('chat')}
          className={cn(
            'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-r hover:bg-accent',
            appMode === 'chat' && 'bg-background text-primary border-b-2 border-b-primary'
          )}
        >
          SEPilot Chat
        </button>
        <button
          onClick={() => setAppMode('editor')}
          className={cn(
            'flex-1 px-4 py-3 text-sm font-semibold transition-colors hover:bg-accent',
            appMode === 'editor' && 'bg-background text-primary border-b-2 border-b-primary'
          )}
        >
          SEPilot Editor
        </button>
      </div>

      {/* Action Bar (Chat mode only) */}
      {appMode === 'chat' && (
        <div className="flex items-center justify-end border-b px-4 py-2 gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={createConversation}
            title="새 대화"
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDeleteAll}
            title="모든 대화 삭제"
            disabled={conversations.length === 0}
            className="text-muted-foreground hover:text-destructive disabled:opacity-30"
          >
            <Trash className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Content Area - Conditionally render based on mode */}
      {appMode === 'chat' ? (
        <ChatHistory onConversationClick={onConversationClick} />
      ) : (
        <FileExplorer />
      )}

      {/* Footer */}
      <div className="border-t p-2">
        <div className="flex gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={onDocumentsClick}
            title="문서 관리"
            className="flex-1"
          >
            <FileText className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onGalleryClick}
            title="이미지 갤러리"
            className="flex-1"
          >
            <Image className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            title="설정"
            className="flex-1"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
