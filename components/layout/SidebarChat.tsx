'use client';

import { useState } from 'react';
import { Image, Settings, User, Plus, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ChatHistory } from './ChatHistory';
import { ChatChatArea } from '@/components/chat/ChatChatArea';
import { DocumentList } from '@/components/rag/DocumentList';
import { PersonaDialog } from '@/components/persona/PersonaDialog';
import { isElectron } from '@/lib/platform';
import { useChatStore } from '@/lib/store/chat-store';

interface SidebarChatProps {
  onGalleryClick?: () => void;
  onConversationClick?: () => void;
  onSettingsClick?: () => void;
}

export function SidebarChat({
  onGalleryClick,
  onConversationClick,
  onSettingsClick,
}: SidebarChatProps) {
  const { chatViewMode, setChatViewMode, createConversation, conversations, deleteConversation } = useChatStore();
  const [personaDialogOpen, setPersonaDialogOpen] = useState(false);

  const handleNewConversation = async () => {
    await createConversation();
    // Switch to history view if in documents view
    if (chatViewMode === 'documents') {
      setChatViewMode('history');
    }
  };

  const handleDeleteAll = async () => {
    if (confirm('모든 대화를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      // Delete all conversations
      for (const conversation of conversations) {
        await deleteConversation(conversation.id);
      }
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header - Only show when in history mode */}
      {chatViewMode === 'history' && (
        <div className="shrink-0 border-b p-2">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNewConversation}
              title="새 대화"
              className="flex-1"
            >
              <Plus className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDeleteAll}
              title="전체 대화 삭제"
              className="flex-1"
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {chatViewMode === 'history' ? (
          <ChatHistory onConversationClick={onConversationClick} />
        ) : chatViewMode === 'chat' ? (
          <ChatChatArea />
        ) : (
          <DocumentList />
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
              setPersonaDialogOpen(true);
            }}
            title="AI 페르소나 관리"
            className="flex-1"
          >
            <User className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setChatViewMode(chatViewMode === 'documents' ? 'history' : 'documents');
            }}
            title="문서 관리"
            className={`flex-1 ${chatViewMode === 'documents' ? 'bg-accent' : ''}`}
          >
            <FileText className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              console.log('[SidebarChat] Gallery button clicked - hiding BrowserView');
              // Gallery 열기 전에 BrowserView 숨김
              if (isElectron() && window.electronAPI) {
                window.electronAPI.browserView.hideAll().then(() => {
                  console.log('[SidebarChat] BrowserView hidden before opening Gallery');
                }).catch((err) => {
                  console.error('[SidebarChat] Failed to hide BrowserView:', err);
                });
              }
              onGalleryClick?.();
            }}
            title="이미지 갤러리"
            className="flex-1"
          >
            <Image className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              console.log('[SidebarChat] Settings button clicked - hiding BrowserView');
              // Settings 열기 전에 BrowserView 숨김
              if (isElectron() && window.electronAPI) {
                window.electronAPI.browserView.hideAll().then(() => {
                  console.log('[SidebarChat] BrowserView hidden before opening Settings');
                }).catch((err) => {
                  console.error('[SidebarChat] Failed to hide BrowserView:', err);
                });
              }
              onSettingsClick?.();
            }}
            title="설정"
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
