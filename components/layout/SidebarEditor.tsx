'use client';

import { Settings, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { FileExplorer } from './FileExplorer';
import { SearchPanel } from '@/components/editor/SearchPanel';
import { isElectron } from '@/lib/platform';

interface SidebarEditorProps {
  onSettingsClick?: () => void;
}

export function SidebarEditor({ onSettingsClick }: SidebarEditorProps) {
  const {
    activeEditorTab,
    showTerminalPanel,
    setShowTerminalPanel,
    workingDirectory,
  } = useChatStore();

  return (
    <div className="flex h-full w-full flex-col">
      {/* Content Area */}
      {activeEditorTab === 'files' ? (
        <FileExplorer />
      ) : (
        <SearchPanel />
      )}

      {/* Footer */}
      <div className="border-t p-2">
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
              console.log('[SidebarEditor] Settings button clicked - hiding BrowserView');
              // Settings 열기 전에 BrowserView 숨김
              if (isElectron() && window.electronAPI) {
                window.electronAPI.browserView.hideAll().then(() => {
                  console.log('[SidebarEditor] BrowserView hidden before opening Settings');
                }).catch((err) => {
                  console.error('[SidebarEditor] Failed to hide BrowserView:', err);
                });
              }
              onSettingsClick?.();
            }}
            title="Editor 설정"
            className="flex-1"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
