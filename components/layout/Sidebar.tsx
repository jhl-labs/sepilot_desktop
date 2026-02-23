'use client';

import { ChevronDown, MessageSquare, Plus, Trash, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { useState, useEffect } from 'react';
import { BetaConfig } from '@/types';
import { SidebarChat } from './SidebarChat';
import { useExtensions } from '@/lib/extensions/use-extensions';
import { isElectron } from '@/lib/platform';
import * as LucideIcons from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

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
  const { t } = useTranslation();
  const { appMode, setAppMode, createConversation, deleteAllConversations, setChatViewMode } =
    useChatStore(
      useShallow((state) => ({
        appMode: state.appMode,
        setAppMode: state.setAppMode,
        createConversation: state.createConversation,
        deleteAllConversations: state.deleteAllConversations,
        setChatViewMode: state.setChatViewMode,
      }))
    );

  // Get current extension for dynamic sidebar rendering
  // useExtensions()는 extensionsVersion을 구독하므로 Extension 로드 시 자동 업데이트됨
  // useExtension()은 mode 변경 시에만 재실행되므로 Extension 로딩 타이밍 이슈가 있음
  const { activeExtensions: allExtensions } = useExtensions();
  const currentExtension = allExtensions.find((ext) => ext.manifest.mode === appMode) ?? null;
  const [betaConfig, setBetaConfig] = useState<BetaConfig>({});

  // Load beta config
  useEffect(() => {
    const loadBetaConfig = async () => {
      if (typeof window === 'undefined') {
        return;
      }
      try {
        // First try to load from localStorage
        const savedBetaConfig = localStorage.getItem('sepilot_beta_config');
        if (savedBetaConfig) {
          setBetaConfig(JSON.parse(savedBetaConfig));
        }

        // In Electron, also load from DB and sync to localStorage
        if (isElectron() && window.electronAPI) {
          const result = await window.electronAPI.config.load();
          if (result.success && result.data?.beta) {
            setBetaConfig(result.data.beta);
            // Sync to localStorage for consistent state
            localStorage.setItem('sepilot_beta_config', JSON.stringify(result.data.beta));
          }
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
    const { conversations } = useChatStore.getState();
    if (conversations.length === 0) {
      return;
    }

    if (
      window.confirm(
        `모든 대화(${conversations.length}개)를 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.`
      )
    ) {
      await deleteAllConversations();
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
              title={t('chat.newConversation')}
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
        <ErrorBoundary
          fallback={
            <div className="flex h-full items-center justify-center p-4">
              <div className="max-w-sm space-y-2 text-center">
                <p className="text-sm font-medium text-destructive">사이드바 오류</p>
                <p className="text-xs text-muted-foreground">
                  사이드바를 표시하는 중 오류가 발생했습니다.
                </p>
              </div>
            </div>
          }
        >
          {appMode === 'chat' && (
            <SidebarChat
              onGalleryClick={onGalleryClick}
              onConversationClick={onConversationClick}
              onSettingsClick={() => {
                window.dispatchEvent(new CustomEvent('sepilot:open-settings'));
              }}
              onDocumentsClick={onDocumentsClick}
            />
          )}
          {/* Extension-based sidebar rendering (Editor, Browser, Presentation 등) */}
          {appMode !== 'chat' &&
            currentExtension?.SidebarComponent &&
            (() => {
              const ExtensionSidebar = currentExtension.SidebarComponent as React.ComponentType<{
                onDocumentsClick?: () => void;
              }>;
              return <ExtensionSidebar onDocumentsClick={onDocumentsClick} />;
            })()}
        </ErrorBoundary>
      </div>
    </div>
  );
}
