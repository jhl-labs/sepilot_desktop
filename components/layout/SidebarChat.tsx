'use client';

import { FileText, Image, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ChatHistory } from './ChatHistory';
import { isElectron } from '@/lib/platform';

interface SidebarChatProps {
  onDocumentsClick?: () => void;
  onGalleryClick?: () => void;
  onConversationClick?: () => void;
  onSettingsClick?: () => void;
}

export function SidebarChat({
  onDocumentsClick,
  onGalleryClick,
  onConversationClick,
  onSettingsClick
}: SidebarChatProps) {
  return (
    <div className="flex h-full w-full flex-col">
      {/* Content Area */}
      <ChatHistory onConversationClick={onConversationClick} />

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
            onClick={() => {
              console.log('[SidebarChat] Settings button clicked - hiding BrowserView');
              // Settings 열기 전에 BrowserView 숨김
              if (isElectron() && window.electronAPI) {
                window.electronAPI.browserView.hideAll().then(() => {
                  console.log('[SidebarChat] BrowserView hidden before opening Settings');
                }).catch((err) => {
                  console.error('[SidebarChat] Failed to hide BrowserView:', err);
                });
              }
              onSettingsClick?.();
            }}
            title="설정"
            className="flex-1"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
