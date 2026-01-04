'use client';

import { Plus, MessageSquare, Bot, FolderOpen, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';

/**
 * Editor Extension Header Actions
 *
 * Provides action buttons for the Editor mode sidebar header:
 * - AI Chat toggle
 * - Agent/Chat mode toggle
 * - File explorer
 * - Search
 */
export function EditorHeaderActions() {
  const {
    editorViewMode,
    setEditorViewMode,
    clearEditorChat,
    editorAgentMode,
    setEditorAgentMode,
  } = useChatStore();

  return (
    <div className="flex gap-1">
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
        className={editorViewMode === 'chat' ? 'bg-accent' : ''}
      >
        {editorViewMode === 'chat' ? (
          <Plus className="h-5 w-5" />
        ) : (
          <MessageSquare className="h-5 w-5" />
        )}
      </Button>
      {editorViewMode === 'chat' && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setEditorAgentMode(editorAgentMode === 'editor' ? 'coding' : 'editor')}
          title={
            editorAgentMode === 'editor'
              ? 'Chat 모드 (클릭하여 Agent 모드로 전환)'
              : 'Agent 모드 (클릭하여 Chat 모드로 전환)'
          }
          className={
            editorAgentMode === 'coding'
              ? 'bg-primary text-primary-foreground'
              : 'bg-accent text-accent-foreground'
          }
        >
          {editorAgentMode === 'editor' ? (
            <MessageSquare className="h-5 w-5" />
          ) : (
            <Bot className="h-5 w-5" />
          )}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setEditorViewMode('files')}
        title="파일 탐색기"
        className={editorViewMode === 'files' ? 'bg-accent' : ''}
      >
        <FolderOpen className="h-5 w-5" />
      </Button>

      {editorViewMode !== 'chat' && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setEditorViewMode('search')}
          title="전체 검색"
          className={editorViewMode === 'search' ? 'bg-accent' : ''}
        >
          <Search className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
