'use client';

import { ChevronDown, MessageSquare, Code, Globe, Plus, Trash, FileText, Search, History } from 'lucide-react';
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

export function Sidebar({ onDocumentsClick, onGalleryClick, onConversationClick }: SidebarProps = {}) {
  const {
    appMode,
    setAppMode,
    conversations,
    createConversation,
    deleteConversation,
    editorViewMode,
    setEditorViewMode,
    chatViewMode,
    setChatViewMode,
  } = useChatStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const modeLabel = appMode === 'chat' ? 'Chat' : appMode === 'editor' ? 'Editor' : 'Browser';

  const handleDeleteAll = async () => {
    if (conversations.length === 0) {return;}

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
              onClick={() => setChatViewMode('history')}
              title="대화 기록"
              className={chatViewMode === 'history' ? 'bg-accent' : ''}
            >
              <History className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChatViewMode('chat')}
              title="AI 어시스턴트"
              className={chatViewMode === 'chat' ? 'bg-accent' : ''}
            >
              <MessageSquare className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChatViewMode('documents')}
              title="문서 관리"
              className={chatViewMode === 'documents' ? 'bg-accent' : ''}
            >
              <FileText className="h-5 w-5" />
            </Button>
          </div>
        )}
        {appMode === 'editor' && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditorViewMode('files')}
              title="파일 탐색기"
              className={editorViewMode === 'files' ? 'bg-accent' : ''}
            >
              <FileText className="h-5 w-5" />
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
          />
        )}
        {appMode === 'editor' && (
          <SidebarEditor onSettingsClick={() => setSettingsOpen(true)} />
        )}
        {appMode === 'browser' && <SidebarBrowser />}
      </div>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
