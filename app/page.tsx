'use client';

import { useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { WorkingDirectoryIndicator } from '@/components/chat/WorkingDirectoryIndicator';
import { UpdateNotificationDialog } from '@/components/UpdateNotificationDialog';
import { useChatStore } from '@/lib/store/chat-store';
import { useSessionRestore } from '@/lib/auth/use-session-restore';
import { useExtensionsInit, useExtension } from '@/lib/extensions/use-extensions';

import { logger } from '@/lib/utils/logger';
export default function Home() {
  const { appMode, createConversation, setActiveConversation, setAppMode, setActiveEditorTab } =
    useChatStore();

  // Extension 시스템 초기화
  const { isLoaded: extensionsLoaded } = useExtensionsInit();

  // 현재 모드에 해당하는 extension 조회
  const currentExtension = useExtension(appMode);

  // 앱 시작 시 세션 자동 복원
  const { user, isLoading: isRestoringSession } = useSessionRestore();

  // 세션 복원 완료 시 로그 출력
  useEffect(() => {
    if (!isRestoringSession && user) {
      logger.warn('[Home] Session restored for user', { login: user.login });
    }
  }, [isRestoringSession, user]);

  // Quick Input에서 메시지를 받아 새 대화 생성 및 전송
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      return;
    }

    const handleQuickInput = async (data: unknown) => {
      logger.info('[Home] handleQuickInput called with data', {
        dataType: typeof data,
        data,
      });

      // Both Quick Input and Quick Question send simple strings
      if (typeof data !== 'string') {
        logger.warn('[Home] Invalid quick input data', { data });
        return;
      }

      try {
        logger.info('[Home] Creating new conversation');
        // 새 대화 생성
        const conversationId = await createConversation();
        logger.info('[Home] New conversation created', { conversationId });

        // 새 대화 활성화
        await setActiveConversation(conversationId);
        logger.info('[Home] Conversation activated');

        // UI가 업데이트될 시간을 주고 메시지 전송
        setTimeout(() => {
          logger.info('[Home] Dispatching sepilot:auto-send-message event', { data });
          window.dispatchEvent(
            new CustomEvent('sepilot:auto-send-message', {
              detail: { userMessage: data },
            })
          );
        }, 200);
      } catch (error) {
        logger.error('[Home] Failed to handle quick input', { error });
      }
    };

    // IPC 이벤트 리스너 등록
    window.electronAPI.on('create-new-chat-with-message', handleQuickInput);

    return () => {
      window.electronAPI.removeListener('create-new-chat-with-message', handleQuickInput);
    };
  }, [createConversation, setActiveConversation]);

  // Window focus 및 알림 클릭 리스너
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      return;
    }

    // Window focus 상태 동기화
    const focusHandler = (data: unknown) => {
      if (typeof data === 'object' && data !== null && 'focused' in data) {
        const focused = (data as { focused: boolean }).focused;
        logger.info(`[Home] Window focus changed: ${focused}`);
        useChatStore.getState().setAppFocused(focused);
      }
    };

    window.electronAPI.on('window:focus-changed', focusHandler);

    // 알림 클릭 리스너
    const notificationCleanup = window.electronAPI.notification?.onClick(
      async (conversationId: string) => {
        logger.info(`[Home] Notification clicked, switching to conversation: ${conversationId}`);
        const store = useChatStore.getState();

        // 1. Chat 모드로 전환
        if (store.appMode !== 'chat') {
          logger.info(`[Home] Switching to chat mode from ${store.appMode}`);
          store.setAppMode('chat');
        }

        // 2. 해당 대화로 전환
        await store.setActiveConversation(conversationId);
        logger.info(`[Home] Switched to conversation: ${conversationId}`);
      }
    );

    return () => {
      window.electronAPI.removeListener('window:focus-changed', focusHandler);
      notificationCleanup?.();
    };
  }, []);

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

  // Extension 컴포넌트 렌더링
  const renderExtensionContent = () => {
    // Chat 모드 (built-in - 특수 처리)
    if (appMode === 'chat') {
      return (
        <>
          <ChatContainer />
          <WorkingDirectoryIndicator />
        </>
      );
    }

    // Extension 기반 모드 (Editor, Browser, Presentation 등 모두 동적 로딩)
    if (extensionsLoaded && currentExtension?.MainComponent) {
      const ExtensionComponent = currentExtension.MainComponent;
      return <ExtensionComponent />;
    }

    // Extension이 로드되지 않았거나 컴포넌트가 없는 경우
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {extensionsLoaded ? `Extension for mode "${appMode}" not found` : 'Loading extensions...'}
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="flex h-full flex-col">{renderExtensionContent()}</div>
      <UpdateNotificationDialog />
    </MainLayout>
  );
}
