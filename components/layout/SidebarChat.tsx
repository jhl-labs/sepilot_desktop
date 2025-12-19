'use client';

import { useState, useEffect } from 'react';
import { Image, Settings, User, FileText, Presentation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ChatHistory } from './ChatHistory';
import { PersonaDialog } from '@/components/persona/PersonaDialog';
import { isElectron } from '@/lib/platform';
import { BetaConfig } from '@/types';
import { useChatStore } from '@/lib/store/chat-store';
import { useTranslation } from 'react-i18next';

interface SidebarChatProps {
  onGalleryClick?: () => void;
  onConversationClick?: () => void;
  onSettingsClick?: () => void;
  onDocumentsClick?: () => void;
}

export function SidebarChat({
  onGalleryClick,
  onConversationClick,
  onSettingsClick,
  onDocumentsClick,
}: SidebarChatProps) {
  const { t } = useTranslation();
  const [personaDialogOpen, setPersonaDialogOpen] = useState(false);
  const [betaConfig, setBetaConfig] = useState<BetaConfig>({ enablePresentationMode: false });
  const { setAppMode } = useChatStore();

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
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        <ChatHistory onConversationClick={onConversationClick} />
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t p-2">
        <div className="flex gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setPersonaDialogOpen(true);
            }}
            title={t('app.sidebarChat.personaManagement')}
            className="flex-1"
          >
            <User className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDocumentsClick}
            title={t('app.sidebarChat.documentManagement')}
            className="flex-1"
            data-testid="sidebar-documents-btn"
          >
            <FileText className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              // Gallery 열기 전에 BrowserView 숨김
              if (isElectron() && window.electronAPI) {
                window.electronAPI.browserView.hideAll().catch((err) => {
                  console.error('[SidebarChat] Failed to hide BrowserView:', err);
                });
              }
              onGalleryClick?.();
            }}
            title={t('app.sidebarChat.imageGallery')}
            className="flex-1"
          >
            <Image className="h-5 w-5" />
          </Button>
          {betaConfig.enablePresentationMode && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAppMode('presentation')}
              title={t('app.sidebarChat.presentationMode')}
              className="flex-1"
            >
              <Presentation className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              // Settings 열기 전에 BrowserView 숨김
              if (isElectron() && window.electronAPI) {
                window.electronAPI.browserView.hideAll().catch((err) => {
                  console.error('[SidebarChat] Failed to hide BrowserView:', err);
                });
              }
              onSettingsClick?.();
            }}
            title={t('app.sidebarChat.settings')}
            className="flex-1"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Persona Dialog */}
      <PersonaDialog open={personaDialogOpen} onOpenChange={setPersonaDialogOpen} />
    </div>
  );
}
