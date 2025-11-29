'use client';

import { Plus, Settings, Camera, Album, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { SimpleChatArea } from '@/components/browser/SimpleChatArea';
import { SimpleChatInput } from '@/components/browser/SimpleChatInput';
import { SnapshotsList } from '@/components/browser/SnapshotsList';
import { BookmarksList } from '@/components/browser/BookmarksList';
import { BrowserSettings } from '@/components/browser/BrowserSettings';
import { isElectron } from '@/lib/platform';

export function SidebarBrowser() {
  const {
    clearBrowserChat,
    browserViewMode,
    setBrowserViewMode,
  } = useChatStore();

  return (
    <div className="flex h-full w-full flex-col">
      {/* Content Area */}
      {browserViewMode === 'chat' ? (
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
      ) : null}

      {/* Footer */}
      <div className="border-t p-2">
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
                console.warn('[SidebarBrowser] Not in Electron environment');
                return;
              }

              try {
                console.log('[SidebarBrowser] Capturing current page...');
                const result = await window.electronAPI.browserView.capturePage();

                if (result.success) {
                  console.log('[SidebarBrowser] Page captured successfully:', result.data);
                  alert('페이지가 스냅샷으로 저장되었습니다.');
                } else {
                  console.error('[SidebarBrowser] Failed to capture page:', result.error);
                  alert(`페이지 캡처 실패: ${result.error}`);
                }
              } catch (error) {
                console.error('[SidebarBrowser] Error capturing page:', error);
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
              console.log('[SidebarBrowser] Snapshots button clicked - hiding BrowserView');
              // 스냅샷 보기 전에 BrowserView 숨김
              if (isElectron() && window.electronAPI) {
                window.electronAPI.browserView.hideAll().then(() => {
                  console.log('[SidebarBrowser] BrowserView hidden before showing Snapshots');
                }).catch((err) => {
                  console.error('[SidebarBrowser] Failed to hide BrowserView:', err);
                });
              }
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
              console.log('[SidebarBrowser] Bookmarks button clicked - hiding BrowserView');
              // 북마크 보기 전에 BrowserView 숨김
              if (isElectron() && window.electronAPI) {
                window.electronAPI.browserView.hideAll().then(() => {
                  console.log('[SidebarBrowser] BrowserView hidden before showing Bookmarks');
                }).catch((err) => {
                  console.error('[SidebarBrowser] Failed to hide BrowserView:', err);
                });
              }
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
              console.log('[SidebarBrowser] Settings button clicked - hiding BrowserView');
              // Settings 열기 전에 BrowserView 숨김
              if (isElectron() && window.electronAPI) {
                window.electronAPI.browserView.hideAll().then(() => {
                  console.log('[SidebarBrowser] BrowserView hidden before opening Settings');
                }).catch((err) => {
                  console.error('[SidebarBrowser] Failed to hide BrowserView:', err);
                });
              }
              setBrowserViewMode('settings');
            }}
            title="Browser 설정"
            className="flex-1"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
