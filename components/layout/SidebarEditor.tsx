'use client';

import { useState, useEffect } from 'react';
import { Settings, Terminal, FileText, Database, Wrench, Presentation } from 'lucide-react';
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
                  <p>테마 전환</p>
                </TooltipContent>
              </Tooltip>

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
                  >
                    <Wrench className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Autocomplete Tools {editorUseToolsInAutocomplete ? '(켜짐)' : '(꺼짐)'}</p>
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
                  >
                    <Database className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Autocomplete RAG {editorUseRagInAutocomplete ? '(켜짐)' : '(꺼짐)'}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={onDocumentsClick} className="flex-1">
                    <FileText className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>문서 관리 (RAG)</p>
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
                  >
                    <Terminal className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>
                    {!workingDirectory
                      ? 'Working Directory 설정 필요'
                      : showTerminalPanel
                        ? '터미널 숨기기'
                        : '터미널 열기'}
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
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>에디터 설정</p>
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
                    >
                      <Presentation className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Presentation 모드 (Beta)</p>
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
