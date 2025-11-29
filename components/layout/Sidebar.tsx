'use client';

import { Plus, Settings, Trash, FileText, Image, ChevronDown, MessageSquare, Code, Search, Globe, Camera, Album, Bookmark, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { useState } from 'react';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ChatHistory } from './ChatHistory';
import { FileExplorer } from './FileExplorer';
import { SearchPanel } from '@/components/editor/SearchPanel';
import { SimpleChatArea } from '@/components/browser/SimpleChatArea';
import { SimpleChatInput } from '@/components/browser/SimpleChatInput';
import { SnapshotsList } from '@/components/browser/SnapshotsList';
import { BookmarksList } from '@/components/browser/BookmarksList';
import { BrowserSettings } from '@/components/browser/BrowserSettings';
import { isElectron } from '@/lib/platform';
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
    clearBrowserChat,
    showTerminalPanel,
    setShowTerminalPanel,
    browserViewMode,
    setBrowserViewMode,
    workingDirectory,
  } = useChatStore();

  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const modeLabel = appMode === 'chat' ? 'Chat' : appMode === 'editor' ? 'Editor' : 'Browser';

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
        ) : appMode === 'editor' ? (
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
        ) : null}
      </div>

      {/* Content Area - Conditionally render based on mode and tab */}
      {appMode === 'chat' ? (
        <ChatHistory onConversationClick={onConversationClick} />
      ) : appMode === 'editor' ? (
        activeEditorTab === 'files' ? (
          <FileExplorer />
        ) : (
          <SearchPanel />
        )
      ) : appMode === 'browser' ? (
        browserViewMode === 'chat' ? (
          <>
            <SimpleChatArea />
            <SimpleChatInput />
          </>
        ) : browserViewMode === 'snapshots' ? (
          <SnapshotsList />
        ) : browserViewMode === 'bookmarks' ? (
          <BookmarksList />
        ) : browserViewMode === 'settings' ? (
          <BrowserSettings />
        ) : null
      ) : null}

      {/* Footer */}
      <div className="border-t p-2">
        {appMode === 'browser' ? (
          // Browser 모드 전용 툴바
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (confirm('현재 대화 내역을 모두 삭제하시겠습니까?')) {
                  clearBrowserChat();
                  setBrowserViewMode('chat');
                }
              }}
              title="새 대화"
              className="flex-1"
            >
              <Plus className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                if (!isElectron() || !window.electronAPI) {
                  console.warn('[Sidebar] Not in Electron environment');
                  return;
                }

                try {
                  console.log('[Sidebar] Capturing current page...');
                  const result = await window.electronAPI.browserView.capturePage();

                  if (result.success) {
                    console.log('[Sidebar] Page captured successfully:', result.data);
                    alert('페이지가 스냅샷으로 저장되었습니다.');
                  } else {
                    console.error('[Sidebar] Failed to capture page:', result.error);
                    alert(`페이지 캡처 실패: ${result.error}`);
                  }
                } catch (error) {
                  console.error('[Sidebar] Error capturing page:', error);
                  alert('페이지 캡처 중 오류가 발생했습니다.');
                }
              }}
              title="페이지 캡처"
              className="flex-1"
            >
              <Camera className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setBrowserViewMode('snapshots');
              }}
              title="스냅샷 관리"
              className="flex-1"
            >
              <Album className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setBrowserViewMode('bookmarks');
              }}
              title="북마크"
              className="flex-1"
            >
              <Bookmark className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setBrowserViewMode('settings');
              }}
              title="Browser 설정"
              className="flex-1"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        ) : appMode === 'editor' ? (
          // Editor 모드 전용 툴바
          <div className="flex gap-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (workingDirectory) {
                  setShowTerminalPanel(!showTerminalPanel);
                }
              }}
              title={
                !workingDirectory
                  ? 'Working Directory를 먼저 설정해주세요'
                  : showTerminalPanel
                  ? '터미널 숨기기'
                  : '터미널 열기'
              }
              disabled={!workingDirectory}
              className={`flex-1 ${showTerminalPanel ? 'bg-accent' : ''}`}
            >
              <Terminal className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                console.log('[Sidebar] Settings button clicked - hiding BrowserView');
                // Settings 열기 전에 BrowserView 숨김
                if (isElectron() && window.electronAPI) {
                  window.electronAPI.browserView.hideAll().then(() => {
                    console.log('[Sidebar] BrowserView hidden before opening Settings');
                  }).catch((err) => {
                    console.error('[Sidebar] Failed to hide BrowserView:', err);
                  });
                }
                setSettingsOpen(true);
              }}
              title="Editor 설정"
              className="flex-1"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          // Chat 모드 기본 툴바
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
              onClick={() => {
                console.log('[Sidebar] Settings button clicked - hiding BrowserView');
                // Settings 열기 전에 BrowserView 숨김
                if (isElectron() && window.electronAPI) {
                  window.electronAPI.browserView.hideAll().then(() => {
                    console.log('[Sidebar] BrowserView hidden before opening Settings');
                  }).catch((err) => {
                    console.error('[Sidebar] Failed to hide BrowserView:', err);
                  });
                }
                setSettingsOpen(true);
              }}
              title="설정"
              className="flex-1"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
