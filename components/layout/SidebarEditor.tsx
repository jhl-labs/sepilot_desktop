'use client';

import { Settings, Terminal, FileText, Database, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { FileExplorer } from './FileExplorer';
import { SearchPanel } from '@/components/editor/SearchPanel';
import { EditorChatContainer } from '@/components/editor/EditorChatContainer';
import { EditorSettings } from '@/components/editor/EditorSettings';
import { ToolApprovalDialog } from '@/components/chat/ToolApprovalDialog';
import { isElectron } from '@/lib/platform';

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
  } = useChatStore();

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

        {/* Footer */}
        <div className="shrink-0 border-t p-2">
          <div className="flex gap-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditorUseToolsInAutocomplete(!editorUseToolsInAutocomplete)}
              title={
                editorUseToolsInAutocomplete
                  ? 'Autocomplete에서 Tools 사용 중 (클릭하여 비활성화)'
                  : 'Autocomplete에서 Tools 사용 안함 (클릭하여 활성화)'
              }
              className={`flex-1 ${editorUseToolsInAutocomplete ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
            >
              <Wrench className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditorUseRagInAutocomplete(!editorUseRagInAutocomplete)}
              title={
                editorUseRagInAutocomplete
                  ? 'Autocomplete에서 RAG 문서 사용 중 (클릭하여 비활성화)'
                  : 'Autocomplete에서 RAG 문서 사용 안함 (클릭하여 활성화)'
              }
              className={`flex-1 ${editorUseRagInAutocomplete ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
            >
              <Database className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDocumentsClick}
              title="문서 관리 (RAG)"
              className="flex-1"
            >
              <FileText className="h-5 w-5" />
            </Button>
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
              onClick={() => setEditorViewMode('settings')}
              title="설정"
              className="flex-1"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
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
