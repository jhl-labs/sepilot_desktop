'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Settings, Camera, Album, Bookmark, Wrench, ScrollText, Bot } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { BrowserChat } from './BrowserChat';
import { SnapshotsList } from './SnapshotsList';
import { BookmarksList } from './BookmarksList';
import { BrowserSettings } from './BrowserSettings';
import { BrowserToolsList } from './BrowserToolsList';
import { BrowserAgentLogsView } from './BrowserAgentLogsView';
import { isElectron } from '@/lib/platform';
import { BetaConfig } from '@/types';
import { useExtensions } from '@/lib/extensions/use-extensions';

export function SidebarBrowser() {
  const { t } = useTranslation();
  const {
    clearBrowserChat,
    browserViewMode,
    setBrowserViewMode,
    browserAgentIsRunning,
    setAppMode,
  } = useChatStore();
  const [betaConfig, setBetaConfig] = useState<BetaConfig>({});
  const allExtensions = useExtensions();

  // Load beta config
  useEffect(() => {
    const loadBetaConfig = () => {
      if (typeof window === 'undefined') {
        return;
      }
      try {
        const savedBetaConfig = localStorage.getItem('sepilot_beta_config');
        if (savedBetaConfig) {
          setBetaConfig(JSON.parse(savedBetaConfig));
        }
      } catch (error) {
        console.error('Failed to load beta config:', error);
      }
    };

    loadBetaConfig();

    // Listen for config updates
    const handleConfigUpdate = (event: CustomEvent) => {
      if (event.detail?.beta) {
        setBetaConfig(event.detail.beta);
      }
    };

    window.addEventListener('sepilot:config-updated', handleConfigUpdate as EventListener);
    return () => {
      window.removeEventListener('sepilot:config-updated', handleConfigUpdate as EventListener);
    };
  }, []);

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

            {/* Extension 버튼 동적 생성 */}
            {allExtensions
              .filter((ext) => {
                // Beta flag 체크
                if (ext.manifest.betaFlag) {
                  return betaConfig[ext.manifest.betaFlag] === true;
                }
                return true;
              })
              .filter((ext) => ext.manifest.showInSidebar && ext.manifest.mode !== 'browser')
              .sort((a, b) => (a.manifest.order || 999) - (b.manifest.order || 999))
              .map((ext) => {
                const IconComponent: React.ComponentType<{ className?: string }> =
                  (LucideIcons[ext.manifest.icon as keyof typeof LucideIcons] as any) || Bot;
                return (
                  <Button
                    key={ext.manifest.id}
                    variant="ghost"
                    size="icon"
                    onClick={() => setAppMode(ext.manifest.mode as any)}
                    title={ext.manifest.name}
                    className="flex-1"
                  >
                    <IconComponent className="h-5 w-5" />
                  </Button>
                );
              })}

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
