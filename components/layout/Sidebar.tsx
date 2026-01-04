'use client';

import { ChevronDown, MessageSquare, Plus, Trash, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { useState, useEffect } from 'react';
import { BetaConfig } from '@/types';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { SidebarChat } from './SidebarChat';
import { useExtension, useExtensions } from '@/lib/extensions/use-extensions';
import * as LucideIcons from 'lucide-react';
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

export function Sidebar({
  onDocumentsClick,
  onGalleryClick,
  onConversationClick,
}: SidebarProps = {}) {
  const {
    appMode,
    setAppMode,
    conversations,
    createConversation,
    deleteConversation,
    setChatViewMode,
  } = useChatStore();

  // Get current extension for dynamic sidebar rendering
  const currentExtension = useExtension(appMode);
  const { activeExtensions: allExtensions } = useExtensions();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [betaConfig, setBetaConfig] = useState<BetaConfig>({});

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

  // Get mode label (chat built-in, others from extension)
  const getModeLabel = () => {
    if (appMode === 'chat') {
      return 'Chat';
    }
    return currentExtension?.manifest.name || appMode;
  };
  const modeLabel = getModeLabel();

  const handleDeleteAll = async () => {
    if (conversations.length === 0) {
      return;
    }

    if (
      window.confirm(
        `모든 대화(${conversations.length}개)를 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.`
      )
    ) {
      // 먼저 새 대화를 생성하여 activeConversationId가 null이 되는 것을 방지
      const newConversationId = await createConversation();

      // 그 다음 기존 대화들을 삭제 (새로 만든 대화는 제외)
      for (const conversation of conversations) {
        if (conversation.id !== newConversationId) {
          await deleteConversation(conversation.id);
        }
      }
    }
  };

  return (
    <div className="flex h-full w-full flex-col border-r bg-background">
      {/* Header with Mode Selector Dropdown */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1 text-lg font-semibold hover:text-primary transition-colors"
              data-testid="mode-selector"
            >
              {modeLabel}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {/* Chat mode (built-in) */}
            <DropdownMenuItem onClick={() => setAppMode('chat')} data-testid="mode-chat">
              <MessageSquare className="mr-2 h-4 w-4" />
              Chat
            </DropdownMenuItem>

            {/* All other modes (Extension-based) */}
            {allExtensions
              .filter((ext) => {
                // Check beta flag if exists
                if (ext.manifest.betaFlag) {
                  return betaConfig[ext.manifest.betaFlag as keyof BetaConfig] === true;
                }
                return true;
              })
              .sort((a, b) => (a.manifest.order || 999) - (b.manifest.order || 999))
              .map((ext) => {
                const IconComponent: React.ComponentType<{ className?: string }> =
                  (LucideIcons[ext.manifest.icon as keyof typeof LucideIcons] as any) || Bot;
                return (
                  <DropdownMenuItem
                    key={ext.manifest.id}
                    onClick={() => setAppMode(ext.manifest.mode as any)}
                    data-testid={`mode-${ext.manifest.id}`}
                  >
                    <IconComponent className="mr-2 h-4 w-4" />
                    {ext.manifest.name}
                  </DropdownMenuItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Mode-specific Action Buttons */}
        {appMode === 'chat' && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await createConversation();
                setChatViewMode('history');
              }}
              title="새 대화"
            >
              <Plus className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDeleteAll} title="전체 대화 삭제">
              <Trash className="h-5 w-5" />
            </Button>
          </div>
        )}
        {/* Extension-based action buttons */}
        {currentExtension?.HeaderActionsComponent &&
          (() => {
            const HeaderActions = currentExtension.HeaderActionsComponent;
            return <HeaderActions />;
          })()}
      </div>

      {/* Render mode-specific component */}
      <div className="flex-1 min-h-0">
        {appMode === 'chat' && (
          <SidebarChat
            onGalleryClick={onGalleryClick}
            onConversationClick={onConversationClick}
            onSettingsClick={() => setSettingsOpen(true)}
            onDocumentsClick={onDocumentsClick}
          />
        )}
        {/* Extension-based sidebar rendering (Editor, Browser, Presentation 등) */}
        {appMode !== 'chat' &&
          currentExtension?.SidebarComponent &&
          (() => {
            const ExtensionSidebar = currentExtension.SidebarComponent;
            return <ExtensionSidebar />;
          })()}
      </div>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
