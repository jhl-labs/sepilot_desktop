'use client';

import { Plus, MessageSquare, Bot, FolderOpen, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
            if (window.confirm(t('ext.editor.header.clearChatConfirm'))) {
              clearEditorChat();
              setEditorViewMode('chat');
            }
          } else {
            setEditorViewMode('chat');
          }
        }}
        title={
          editorViewMode === 'chat'
            ? t('ext.editor.header.newChat')
            : t('ext.editor.header.aiAssistant')
        }
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
              ? t('ext.editor.header.chatMode')
              : t('ext.editor.header.agentMode')
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
        title={t('ext.editor.header.fileExplorer')}
        className={editorViewMode === 'files' ? 'bg-accent' : ''}
      >
        <FolderOpen className="h-5 w-5" />
      </Button>

      {editorViewMode !== 'chat' && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setEditorViewMode('search')}
          title={t('ext.editor.header.search')}
          className={editorViewMode === 'search' ? 'bg-accent' : ''}
        >
          <Search className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
