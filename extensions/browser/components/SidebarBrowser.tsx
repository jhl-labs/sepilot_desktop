'use client';

import { useTranslation } from 'react-i18next';
import { Plus, Settings, Camera, Album, Bookmark, Wrench, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { BrowserChat } from './BrowserChat';
import { SnapshotsList } from './SnapshotsList';
import { BookmarksList } from './BookmarksList';
import { BrowserSettings } from './BrowserSettings';
import { BrowserToolsList } from './BrowserToolsList';
import { BrowserAgentLogsView } from './BrowserAgentLogsView';
import { isElectron } from '@/lib/platform';

export function SidebarBrowser() {
  const { t } = useTranslation();
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
              title={t('browser.sidebar.agentLogs')}
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
              title={t('browser.sidebar.viewTools')}
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
          <BrowserChat />
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
                if (window.confirm(t('browser.sidebar.clearChatConfirm'))) {
                  clearBrowserChat();
                  setBrowserViewMode('chat');
                }
              }}
              title={t('browser.sidebar.newChat')}
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
                    window.alert(t('browser.sidebar.pageCaptureSuccess'));
                  } else {
                    console.error('[SidebarBrowser] Failed to capture page:', result.error);
                    window.alert(t('browser.sidebar.pageCaptureFailed', { error: result.error }));
                  }
                } catch (error) {
                  console.error('[SidebarBrowser] Error capturing page:', error);
                  window.alert(t('browser.sidebar.pageCaptureError'));
                }
              }}
              title={t('browser.sidebar.pageCapture')}
              className="flex-1"
            >
              <Camera className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setBrowserViewMode('snapshots')}
              title={t('browser.sidebar.snapshots')}
              className="flex-1"
            >
              <Album className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setBrowserViewMode('bookmarks')}
              title={t('browser.sidebar.bookmarks')}
              className="flex-1"
            >
              <Bookmark className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setBrowserViewMode('settings')}
              title={t('browser.sidebar.settings')}
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
