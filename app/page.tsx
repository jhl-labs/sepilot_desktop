'use client';

import { useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ChatArea } from '@/components/chat/ChatArea';
import { InputBox } from '@/components/chat/InputBox';
import { WorkingDirectoryIndicator } from '@/components/chat/WorkingDirectoryIndicator';
import { UpdateNotificationDialog } from '@/components/UpdateNotificationDialog';
import { EditorWithTerminal } from '@/components/editor/EditorWithTerminal';
import { BrowserPanel } from '@/components/editor/BrowserPanel';
import { useChatStore } from '@/lib/store/chat-store';
import { QuickInputMessageData } from '@/types';
import { useSessionRestore } from '@/lib/auth/use-session-restore';

export default function Home() {
  const { appMode, createConversation, setActiveConversation, setAppMode, setActiveEditorTab } = useChatStore();

  // 앱 시작 시 세션 자동 복원
  const { user, isLoading: isRestoringSession } = useSessionRestore();

  // 세션 복원 완료 시 로그 출력
  useEffect(() => {
    if (!isRestoringSession && user) {
      console.warn('[Home] Session restored for user:', user.login);
    }
  }, [isRestoringSession, user]);

  // Quick Input에서 메시지를 받아 새 대화 생성 및 전송
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      return;
    }

    const handleQuickInput = async (data: unknown) => {
      // Support both string (legacy Quick Input) and object (Quick Question with system message)
      let messageData: QuickInputMessageData;

      if (typeof data === 'string') {
        // Legacy Quick Input: just user message
        messageData = { userMessage: data };
      } else if (typeof data === 'object' && data !== null && 'userMessage' in data) {
        // Quick Question: system message + user message
        messageData = data as QuickInputMessageData;
      } else {
        console.warn('[Home] Invalid quick input data:', data);
        return;
      }

      try {
        // 새 대화 생성
        const conversationId = await createConversation();

        // 새 대화 활성화
        await setActiveConversation(conversationId);

        // UI가 업데이트될 시간을 주고 메시지 전송
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('sepilot:quick-input-message', {
              detail: messageData,
            })
          );
        }, 200);
      } catch (error) {
        console.error('[Home] Failed to handle quick input:', error);
      }
    };

    // IPC 이벤트 리스너 등록
    window.electronAPI.on('create-new-chat-with-message', handleQuickInput);

    return () => {
      window.electronAPI.removeListener('create-new-chat-with-message', handleQuickInput);
    };
  }, [createConversation, setActiveConversation]);

  // Ctrl+Shift+F to open search in Editor mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();

        // Switch to Editor mode and activate Search tab
        setAppMode('editor');
        setActiveEditorTab('search');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setAppMode, setActiveEditorTab]);

  return (
    <MainLayout>
      <div className="flex h-full flex-col">
        {appMode === 'chat' ? (
          <>
            <ChatArea />
            <WorkingDirectoryIndicator />
            <InputBox />
          </>
        ) : appMode === 'editor' ? (
          <EditorWithTerminal />
        ) : (
          <BrowserPanel />
        )}
      </div>
      <UpdateNotificationDialog />
    </MainLayout>
  );
}
