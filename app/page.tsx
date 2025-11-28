'use client';

import { useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ChatArea } from '@/components/chat/ChatArea';
import { InputBox } from '@/components/chat/InputBox';
import { WorkingDirectoryIndicator } from '@/components/chat/WorkingDirectoryIndicator';
import { UpdateNotificationDialog } from '@/components/UpdateNotificationDialog';
import { CodeEditor } from '@/components/editor/Editor';
import { useChatStore } from '@/lib/store/chat-store';

export default function Home() {
  const { appMode, createConversation, setActiveConversation } = useChatStore();

  // Quick Input에서 메시지를 받아 새 대화 생성 및 전송
  useEffect(() => {
    console.log('[Home] Setting up quick input listener');

    if (typeof window === 'undefined' || !window.electronAPI) {
      console.warn('[Home] electronAPI not available');
      return;
    }

    const handleQuickInput = async (message: unknown) => {
      console.log('[Home] Received quick input message:', message);

      if (typeof message !== 'string') {
        console.error('[Home] Invalid message type:', typeof message);
        return;
      }

      try {
        // 새 대화 생성
        console.log('[Home] Creating new conversation...');
        const conversationId = await createConversation();
        console.log('[Home] Created conversation:', conversationId);

        // 새 대화 활성화
        console.log('[Home] Activating conversation:', conversationId);
        await setActiveConversation(conversationId);
        console.log('[Home] Conversation activated');

        // UI가 업데이트될 시간을 주고 메시지 전송
        setTimeout(() => {
          console.log('[Home] Dispatching custom event to InputBox');
          window.dispatchEvent(
            new CustomEvent('sepilot:quick-input-message', {
              detail: { message },
            })
          );
          console.log('[Home] Event dispatched successfully');
        }, 200);
      } catch (error) {
        console.error('[Home] Failed to handle quick input:', error);
      }
    };

    // IPC 이벤트 리스너 등록
    console.log('[Home] Registering IPC event listener');
    window.electronAPI.on('create-new-chat-with-message', handleQuickInput);

    return () => {
      console.log('[Home] Removing IPC event listener');
      window.electronAPI.removeListener('create-new-chat-with-message', handleQuickInput);
    };
  }, [createConversation, setActiveConversation]);

  return (
    <MainLayout>
      <div className="flex h-full flex-col">
        {appMode === 'chat' ? (
          <>
            <ChatArea />
            <WorkingDirectoryIndicator />
            <InputBox />
          </>
        ) : (
          <CodeEditor />
        )}
      </div>
      <UpdateNotificationDialog />
    </MainLayout>
  );
}
