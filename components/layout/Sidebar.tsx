'use client';

import {
  ChevronDown,
  MessageSquare,
  Code,
  Globe,
  Plus,
  Trash,
  FileText,
  Search,
  FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { useState } from 'react';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { SidebarChat } from './SidebarChat';
import { SidebarEditor } from './SidebarEditor';
import { SidebarBrowser } from './SidebarBrowser';
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

export function Sidebar({
  onDocumentsClick,
  onGalleryClick,
  onConversationClick,
}: SidebarProps = {}) {
  const {
    appMode,
    setAppMode,
    conversations,
    createConversation,
    deleteConversation,
    editorViewMode,
    setEditorViewMode,
    setChatViewMode,
    clearEditorChat,
  } = useChatStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const modeLabel = appMode === 'chat' ? 'Chat' : appMode === 'editor' ? 'Editor' : 'Browser';

  const handleDeleteAll = async () => {
    if (conversations.length === 0) {
      return;
    }

    if (
      window.confirm(
        `모든 대화(${conversations.length}개)를 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.`
      )
    ) {
      // 먼저 새 대화를 생성하여 activeConversationId가 null이 되는 것을 방지
      const newConversationId = await createConversation();

      // 그 다음 기존 대화들을 삭제 (새로 만든 대화는 제외)
      for (const conversation of conversations) {
        if (conversation.id !== newConversationId) {
          await deleteConversation(conversation.id);
        }
      }
    }
  };

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
            <DropdownMenuItem onClick={() => setAppMode('browser')}>
              <Globe className="mr-2 h-4 w-4" />
              Browser
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Mode-specific Action Buttons */}
        {appMode === 'chat' && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await createConversation();
                setChatViewMode('history');
              }}
              title="새 대화"
            >
              <Plus className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDeleteAll} title="전체 대화 삭제">
              <Trash className="h-5 w-5" />
            </Button>
          </div>
        )}
        {appMode === 'editor' && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (editorViewMode === 'chat') {
                  if (window.confirm('현재 대화 내역을 모두 삭제하시겠습니까?')) {
                    clearEditorChat();
                    setEditorViewMode('chat');
                  }
                } else {
                  setEditorViewMode('chat');
                }
              }}
              title={editorViewMode === 'chat' ? '새 대화' : 'AI 코딩 어시스턴트'}
              className={editorViewMode === 'chat' ? 'bg-accent' : ''}
            >
              {editorViewMode === 'chat' ? (
                <Plus className="h-5 w-5" />
              ) : (
                <MessageSquare className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditorViewMode('files')}
              title="파일 탐색기"
              className={editorViewMode === 'files' ? 'bg-accent' : ''}
            >
              <FolderOpen className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditorViewMode('search')}
              title="전체 검색"
              className={editorViewMode === 'search' ? 'bg-accent' : ''}
            >
              <Search className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>

      {/* Render mode-specific component */}
      <div className="flex-1 min-h-0">
        {appMode === 'chat' && (
          <SidebarChat
            onGalleryClick={onGalleryClick}
            onConversationClick={onConversationClick}
            onSettingsClick={() => setSettingsOpen(true)}
            onDocumentsClick={onDocumentsClick}
          />
        )}
        {appMode === 'editor' && <SidebarEditor onDocumentsClick={onDocumentsClick} />}
        {appMode === 'browser' && <SidebarBrowser />}
      </div>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
