'use client';

import { Plus, Settings, Camera, Album, Bookmark, ScrollText, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { SimpleChatArea } from '@/components/browser/SimpleChatArea';
import { SimpleChatInput } from '@/components/browser/SimpleChatInput';
import { SnapshotsList } from '@/components/browser/SnapshotsList';
import { BookmarksList } from '@/components/browser/BookmarksList';
import { BrowserSettings } from '@/components/browser/BrowserSettings';
import { BrowserAgentLog } from '@/components/browser/BrowserAgentLog';
import { BrowserAgentLogsView } from '@/components/browser/BrowserAgentLogsView';
import { BrowserToolsList } from '@/components/browser/BrowserToolsList';
import { isElectron } from '@/lib/platform';

export function SidebarBrowser() {
  const {
    clearBrowserChat,
    browserViewMode,
    setBrowserViewMode,
  } = useChatStore();

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header - chat 모드에서만 표시 */}
      {browserViewMode === 'chat' && (
        <div className="border-b p-2 bg-muted/20">
          <div className="flex gap-1 justify-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                console.warn('[SidebarBrowser] Tools button clicked - hiding BrowserView');
                if (isElectron() && window.electronAPI) {
                  window.electronAPI.browserView.hideAll().catch((err) => {
                    console.error('[SidebarBrowser] Failed to hide BrowserView:', err);
                  });
                }
                setBrowserViewMode('tools');
              }}
              title="사용 가능한 도구 보기"
              className="h-8 w-8"
            >
              <Wrench className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                console.warn('[SidebarBrowser] Logs button clicked - hiding BrowserView');
                if (isElectron() && window.electronAPI) {
                  window.electronAPI.browserView.hideAll().catch((err) => {
                    console.error('[SidebarBrowser] Failed to hide BrowserView:', err);
                  });
                }
                setBrowserViewMode('logs');
              }}
              title="Agent 실행 로그 보기"
              className="h-8 w-8"
            >
              <ScrollText className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto flex flex-col">
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
        ) : browserViewMode === 'logs' ? (
          <BrowserAgentLogsView />
        ) : browserViewMode === 'tools' ? (
          <BrowserToolsList />
        ) : null}

        {/* Agent Log Panel (chat 모드에서만 표시) */}
        {browserViewMode === 'chat' && <BrowserAgentLog />}
      </div>

      {/* Footer (logs, tools 모드에서는 숨김) */}
      {browserViewMode !== 'logs' && browserViewMode !== 'tools' && (
        <div className="shrink-0 border-t p-2">
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
            onClick={() => setBrowserViewMode('settings')}
            title="Browser 설정"
            className="flex-1"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}
