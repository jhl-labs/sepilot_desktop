'use client';

import { Plus, Settings, Trash, FileText, Image, ChevronDown, MessageSquare, Code, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { useState } from 'react';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ChatHistory } from './ChatHistory';
import { FileExplorer } from './FileExplorer';
import { SearchPanel } from '@/components/editor/SearchPanel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
    activeEditorTab,
    setActiveEditorTab,
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

  const modeLabel = appMode === 'chat' ? 'Chat' : 'Editor';

  return (
    <div className="flex h-full w-full flex-col border-r bg-background">
      {/* Header with Mode Selector Dropdown */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 text-lg font-semibold hover:text-primary transition-colors">
              {modeLabel}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setAppMode('chat')}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Chat
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAppMode('editor')}>
              <Code className="mr-2 h-4 w-4" />
              Editor
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Action Buttons (Chat mode) / Tab Buttons (Editor mode) */}
        {appMode === 'chat' ? (
          <div className="flex gap-1">
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
        ) : (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActiveEditorTab('files')}
              title="파일 탐색기"
              className={activeEditorTab === 'files' ? 'bg-accent' : ''}
            >
              <FileText className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActiveEditorTab('search')}
              title="전체 검색"
              className={activeEditorTab === 'search' ? 'bg-accent' : ''}
            >
              <Search className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>

      {/* Content Area - Conditionally render based on mode and tab */}
      {appMode === 'chat' ? (
        <ChatHistory onConversationClick={onConversationClick} />
      ) : (
        activeEditorTab === 'files' ? (
          <FileExplorer />
        ) : (
          <SearchPanel />
        )
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
