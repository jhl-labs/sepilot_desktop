'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Terminal, FileText, Database, Wrench, Bot } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useChatStore } from '@/lib/store/chat-store';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { FileExplorer } from './FileExplorer';
import { SearchPanel } from './SearchPanel';
import { EditorChatContainer } from './EditorChatContainer';
import { EditorSettings } from './EditorSettings';
import { EditorToolsList } from './EditorToolsList';
import { ToolApprovalDialog } from '@/components/chat/ToolApprovalDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { OverflowToolbar } from '@/components/ui/overflow-toolbar';
import { Switch } from '@/components/ui/switch';
import { isElectron } from '@/lib/platform';
import { BetaConfig } from '@/types';
import { cn } from '@/lib/utils';
import { useExtensions } from '@/lib/extensions/use-extensions';

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
    loadWorkingDirectory,
    editorChatUseRag,
    setEditorChatUseRag,
    editorChatUseTools,
    setEditorChatUseTools,
    editorChatEnabledTools,
    toggleEditorChatTool,
    pendingToolApproval,
    clearPendingToolApproval,
    setAlwaysApproveToolsForSession,
    setAppMode,
  } = useChatStore();

  const [betaConfig, setBetaConfig] = useState<BetaConfig>({});
  const allExtensions = useExtensions();

  // Load working directory on mount
  useEffect(() => {
    loadWorkingDirectory();
  }, [loadWorkingDirectory]);

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
          {editorViewMode === 'files' || editorViewMode === 'wiki' ? (
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

        <div className="shrink-0 border-t p-2">
          <TooltipProvider delayDuration={300}>
            <OverflowToolbar className="gap-1 justify-center" itemWidth={40}>
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

              <Popover>
                <PopoverTrigger asChild>
                  <div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'text-muted-foreground',
                            editorChatUseTools && 'bg-accent text-accent-foreground'
                          )}
                        >
                          <Wrench className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>
                          {t('sidebar.editor.tooltips.chatToolsStatus', {
                            status: editorChatUseTools
                              ? t('sidebar.editor.status.enabled')
                              : t('sidebar.editor.status.disabled'),
                          })}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </PopoverTrigger>
                <PopoverContent side="top" className="w-80 p-0" align="start">
                  <div className="p-4 border-b">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium leading-none">Editor Tools</h4>
                      <Switch
                        checked={editorChatUseTools}
                        onCheckedChange={setEditorChatUseTools}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">Enable tools for Editor Chat</p>
                  </div>
                  <div className="p-2 max-h-[400px] overflow-y-auto">
                    <EditorToolsList
                      selectable
                      selectedTools={editorChatEnabledTools}
                      onToggleTool={toggleEditorChatTool}
                    />
                  </div>
                </PopoverContent>
              </Popover>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditorChatUseRag(!editorChatUseRag)}
                    className={cn(
                      editorChatUseRag
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground'
                    )}
                    title={t('sidebar.editor.tooltips.chatRagStatus', {
                      status: editorChatUseRag
                        ? t('sidebar.editor.status.enabled')
                        : t('sidebar.editor.status.disabled'),
                    })}
                  >
                    <Database className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>
                    {t('sidebar.editor.tooltips.chatRagStatus', {
                      status: editorChatUseRag
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
                    className={cn(showTerminalPanel && 'bg-accent')}
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
                    className={cn(editorViewMode === 'settings' && 'bg-accent')}
                    title={t('sidebar.editor.tooltips.settings')}
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{t('sidebar.editor.tooltips.editorSettings')}</p>
                </TooltipContent>
              </Tooltip>

              {/* Extension 버튼 동적 생성 */}
              {allExtensions
                .filter((ext) => {
                  // Beta flag 체크
                  if (ext.manifest.betaFlag) {
                    return betaConfig[ext.manifest.betaFlag] === true;
                  }
                  return true;
                })
                .filter((ext) => ext.manifest.showInSidebar && ext.manifest.mode !== 'editor')
                .sort((a, b) => (a.manifest.order || 999) - (b.manifest.order || 999))
                .map((ext) => {
                  const IconComponent: React.ComponentType<{ className?: string }> =
                    (LucideIcons[ext.manifest.icon as keyof typeof LucideIcons] as any) || Bot;
                  return (
                    <Tooltip key={ext.manifest.id}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setAppMode(ext.manifest.mode as any)}
                          title={ext.manifest.name}
                        >
                          <IconComponent className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>{ext.manifest.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
            </OverflowToolbar>
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
