'use client';

import { Plus, Settings, Camera, Album, Bookmark, Wrench, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { SimpleChatArea } from '@/components/browser/SimpleChatArea';
import { SimpleChatInput } from '@/components/browser/SimpleChatInput';
import { SnapshotsList } from '@/components/browser/SnapshotsList';
import { BookmarksList } from '@/components/browser/BookmarksList';
import { BrowserSettings } from '@/components/browser/BrowserSettings';
import { BrowserToolsList } from '@/components/browser/BrowserToolsList';
import { BrowserAgentLogsView } from '@/components/browser/BrowserAgentLogsView';
import { isElectron } from '@/lib/platform';

export function SidebarBrowser() {
  const { clearBrowserChat, browserViewMode, setBrowserViewMode, browserAgentIsRunning } =
    useChatStore();

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header - chat 모드에서만 표시 */}
      {(browserViewMode === 'chat' || browserViewMode === 'logs') && (
        <div className="border-b p-2 bg-muted/20">
          <div className="flex gap-1 justify-end">
            <Button
              variant={browserViewMode === 'logs' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setBrowserViewMode('logs')}
              title="Agent 실행 로그"
              className="h-8 w-8 relative"
            >
              <ScrollText className="h-4 w-4" />
              {browserAgentIsRunning && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setBrowserViewMode('tools')}
              title="사용 가능한 도구 보기"
              className="h-8 w-8"
            >
              <Wrench className="h-4 w-4" />
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
        ) : browserViewMode === 'tools' ? (
          <BrowserToolsList />
        ) : browserViewMode === 'logs' ? (
          <BrowserAgentLogsView />
        ) : null}
      </div>

      {/* Footer (tools 모드에서는 숨김) */}
      {browserViewMode !== 'tools' && (
        <div className="shrink-0 border-t p-2">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (window.confirm('현재 대화 내역을 모두 삭제하시겠습니까?')) {
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
                  const result = await window.electronAPI.browserView.capturePage();

                  if (result.success) {
                    window.alert('페이지가 스냅샷으로 저장되었습니다.');
                  } else {
                    console.error('[SidebarBrowser] Failed to capture page:', result.error);
                    window.alert(`페이지 캡처 실패: ${result.error}`);
                  }
                } catch (error) {
                  console.error('[SidebarBrowser] Error capturing page:', error);
                  window.alert('페이지 캡처 중 오류가 발생했습니다.');
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
              onClick={() => setBrowserViewMode('snapshots')}
              title="스냅샷 관리"
              className="flex-1"
            >
              <Album className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setBrowserViewMode('bookmarks')}
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
