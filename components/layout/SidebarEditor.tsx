'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  Terminal,
  FileText,
  Database,
  Wrench,
  Presentation,
  Sparkles,
  MessageSquarePlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useChatStore } from '@/lib/store/chat-store';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { FileExplorer } from './FileExplorer';
import { SearchPanel } from '@/components/editor/SearchPanel';
import { EditorChatContainer } from '@/components/editor/EditorChatContainer';
import { EditorSettings } from '@/components/editor/EditorSettings';
import { ToolApprovalDialog } from '@/components/chat/ToolApprovalDialog';
import { isElectron } from '@/lib/platform';
import { BetaConfig } from '@/types';
import { cn } from '@/lib/utils';

interface SidebarEditorProps {
  onDocumentsClick?: () => void;
}

export function SidebarEditor({ onDocumentsClick }: SidebarEditorProps = {}) {
  const { t } = useTranslation();
  const {
    editorViewMode,
    setEditorViewMode,
    showTerminalPanel,
    setShowTerminalPanel,
    workingDirectory,
    editorUseRagInAutocomplete,
    setEditorUseRagInAutocomplete,
    editorUseToolsInAutocomplete,
    setEditorUseToolsInAutocomplete,
    pendingToolApproval,
    clearPendingToolApproval,
    setAlwaysApproveToolsForSession,
    setAppMode,
    clearEditorChat,
  } = useChatStore();

  const [betaConfig, setBetaConfig] = useState<BetaConfig>({ enablePresentationMode: false });

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

  // Tool approval handlers
  const handleApprove = async () => {
    if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.langgraph) {
      try {
        await window.electronAPI.langgraph.respondToolApproval('editor-chat-temp', true);
      } catch (error) {
        console.error('[SidebarEditor] Failed to approve tools:', error);
      }
    }
    clearPendingToolApproval();
  };

  const handleReject = async () => {
    if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.langgraph) {
      try {
        await window.electronAPI.langgraph.respondToolApproval('editor-chat-temp', false);
      } catch (error) {
        console.error('[SidebarEditor] Failed to reject tools:', error);
      }
    }
    clearPendingToolApproval();
  };

  const handleAlwaysApprove = async () => {
    setAlwaysApproveToolsForSession(true);
    if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.langgraph) {
      try {
        await window.electronAPI.langgraph.respondToolApproval('editor-chat-temp', true);
      } catch (error) {
        console.error('[SidebarEditor] Failed to always approve tools:', error);
      }
    }
    clearPendingToolApproval();
  };

  const handleNewChat = () => {
    const confirmed = window.confirm(t('sidebar.editor.confirmations.clearChat'));
    if (confirmed) {
      clearEditorChat();
      setEditorViewMode('chat');
    }
  };

  const handleAiAssistantClick = () => {
    setEditorViewMode('chat');
  };

  const terminalButtonTitle = !workingDirectory
    ? t('sidebar.editor.tooltips.setWorkingDirectoryFirst')
    : showTerminalPanel
      ? t('sidebar.editor.tooltips.hideTerminal')
      : t('sidebar.editor.tooltips.openTerminal');

  return (
    <>
      <div className="flex h-full w-full flex-col">
        {/* Content Area */}
        <div className="flex-1 min-h-0">
          {editorViewMode === 'files' ? (
            <FileExplorer />
          ) : editorViewMode === 'search' ? (
            <SearchPanel />
          ) : editorViewMode === 'settings' ? (
            <EditorSettings />
          ) : (
            <div className="flex h-full flex-col">
              <EditorChatContainer />
            </div>
          )}
        </div>

        {/* Footer - Quick Actions */}
        <div className="shrink-0 border-t p-2">
          <TooltipProvider delayDuration={300}>
            <div className="flex gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-shrink-0">
                    <ThemeToggle />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{t('sidebar.editor.tooltips.toggleTheme')}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleAiAssistantClick}
                    className={cn('flex-1', editorViewMode === 'chat' && 'bg-accent')}
                    title={t('sidebar.editor.tooltips.aiAssistant')}
                  >
                    <Sparkles className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{t('sidebar.editor.tooltips.aiAssistant')}</p>
                </TooltipContent>
              </Tooltip>

              {editorViewMode === 'chat' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleNewChat}
                      className="flex-1"
                      title={t('sidebar.editor.tooltips.newChat')}
                    >
                      <MessageSquarePlus className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>{t('sidebar.editor.tooltips.newChat')}</p>
                  </TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditorUseToolsInAutocomplete(!editorUseToolsInAutocomplete)}
                    className={cn(
                      'flex-1',
                      editorUseToolsInAutocomplete
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground'
                    )}
                    title={t('sidebar.editor.tooltips.autocompleteToolsStatus', {
                      status: editorUseToolsInAutocomplete
                        ? t('sidebar.editor.status.enabled')
                        : t('sidebar.editor.status.disabled'),
                    })}
                  >
                    <Wrench className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>
                    {t('sidebar.editor.tooltips.autocompleteToolsStatus', {
                      status: editorUseToolsInAutocomplete
                        ? t('sidebar.editor.status.enabled')
                        : t('sidebar.editor.status.disabled'),
                    })}
                  </p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditorUseRagInAutocomplete(!editorUseRagInAutocomplete)}
                    className={cn(
                      'flex-1',
                      editorUseRagInAutocomplete
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground'
                    )}
                    title={t('sidebar.editor.tooltips.autocompleteRagStatus', {
                      status: editorUseRagInAutocomplete
                        ? t('sidebar.editor.status.enabled')
                        : t('sidebar.editor.status.disabled'),
                    })}
                  >
                    <Database className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>
                    {t('sidebar.editor.tooltips.autocompleteRagStatus', {
                      status: editorUseRagInAutocomplete
                        ? t('sidebar.editor.status.enabled')
                        : t('sidebar.editor.status.disabled'),
                    })}
                  </p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onDocumentsClick}
                    className="flex-1"
                    title={t('sidebar.editor.tooltips.documentManagement')}
                  >
                    <FileText className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{t('sidebar.editor.tooltips.documentManagement')}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (workingDirectory) {
                        setShowTerminalPanel(!showTerminalPanel);
                      }
                    }}
                    disabled={!workingDirectory}
                    className={cn('flex-1', showTerminalPanel && 'bg-accent')}
                    title={terminalButtonTitle}
                  >
                    <Terminal className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>
                    {!workingDirectory
                      ? t('sidebar.editor.tooltips.workingDirectoryRequired')
                      : showTerminalPanel
                        ? t('sidebar.editor.tooltips.hideTerminal')
                        : t('sidebar.editor.tooltips.openTerminal')}
                  </p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditorViewMode('settings')}
                    className={cn('flex-1', editorViewMode === 'settings' && 'bg-accent')}
                    title={t('sidebar.editor.tooltips.settings')}
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{t('sidebar.editor.tooltips.editorSettings')}</p>
                </TooltipContent>
              </Tooltip>

              {betaConfig.enablePresentationMode && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setAppMode('presentation')}
                      className="flex-1"
                      title={t('sidebar.editor.tooltips.presentationMode')}
                    >
                      <Presentation className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>{t('sidebar.editor.tooltips.presentationMode')}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>
      </div>

      {/* Tool Approval Dialog */}
      {pendingToolApproval && (
        <ToolApprovalDialog
          onApprove={handleApprove}
          onReject={handleReject}
          onAlwaysApprove={handleAlwaysApprove}
        />
      )}
    </>
  );
}
