'use client';

import { Settings, Terminal, MessageSquare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { FileExplorer } from './FileExplorer';
import { SearchPanel } from '@/components/editor/SearchPanel';
import { EditorChatArea } from '@/components/editor/EditorChatArea';
import { EditorChatInput } from '@/components/editor/EditorChatInput';
import { EditorSettings } from '@/components/editor/EditorSettings';

export function SidebarEditor() {
  const {
    editorViewMode,
    setEditorViewMode,
    showTerminalPanel,
    setShowTerminalPanel,
    workingDirectory,
    clearEditorChat,
  } = useChatStore();

  return (
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
          <div className="flex h-full flex-col overflow-y-auto">
            <EditorChatArea />
            <EditorChatInput />
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
            onClick={() => {
              if (editorViewMode === 'chat') {
                if (window.confirm('현재 대화 내역을 모두 삭제하시겠습니까?')) {
                  clearEditorChat();
                  setEditorViewMode('chat');
                }
              } else {
                setEditorViewMode('chat');
              }
            }}
            title={editorViewMode === 'chat' ? '새 대화' : 'AI 코딩 어시스턴트'}
            className="flex-1"
          >
            {editorViewMode === 'chat' ? (
              <Plus className="h-5 w-5" />
            ) : (
              <MessageSquare className="h-5 w-5" />
            )}
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
  );
}
