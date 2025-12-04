'use client';

import { useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { WorkingDirectoryIndicator } from '@/components/chat/WorkingDirectoryIndicator';
import { UpdateNotificationDialog } from '@/components/UpdateNotificationDialog';
import { EditorWithTerminal } from '@/components/editor/EditorWithTerminal';
import { BrowserPanel } from '@/components/browser/BrowserPanel';
import { PresentationStudio } from '@/components/presentation/PresentationStudio';
import { useChatStore } from '@/lib/store/chat-store';
import { useSessionRestore } from '@/lib/auth/use-session-restore';

export default function Home() {
  const { appMode, createConversation, setActiveConversation, setAppMode, setActiveEditorTab } =
    useChatStore();

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
      // Both Quick Input and Quick Question send simple strings
      if (typeof data !== 'string') {
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
            new CustomEvent('sepilot:auto-send-message', {
              detail: { userMessage: data },
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

  // Test Dashboard 관련 IPC 이벤트 리스너
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      console.warn('[Home] electronAPI not available for test dashboard');
      return;
    }

    const handleOpenTestDashboard = () => {
      console.log('[Home] Opening test dashboard...');
      window.location.href = '/test-dashboard';
    };

    const handleRunAllTests = () => {
      console.log('[Home] Run all tests triggered from menu, opening dashboard...');
      window.location.href = '/test-dashboard';
      // 페이지 이동 후 테스트 실행 이벤트를 다시 발행
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('test:run-all-from-menu'));
      }, 500);
    };

    const handleHealthCheck = () => {
      console.log('[Home] Health check triggered from menu, opening dashboard...');
      window.location.href = '/test-dashboard';
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('test:health-check-from-menu'));
      }, 500);
    };

    const handleRunLLM = () => {
      console.log('[Home] LLM test triggered from menu, opening dashboard...');
      window.location.href = '/test-dashboard';
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('test:run-llm-from-menu'));
      }, 500);
    };

    const handleRunDatabase = () => {
      console.log('[Home] Database test triggered from menu, opening dashboard...');
      window.location.href = '/test-dashboard';
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('test:run-database-from-menu'));
      }, 500);
    };

    const handleRunMCP = () => {
      console.log('[Home] MCP test triggered from menu, opening dashboard...');
      window.location.href = '/test-dashboard';
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('test:run-mcp-from-menu'));
      }, 500);
    };

    // IPC 이벤트 리스너 등록
    console.log('[Home] Registering test dashboard listeners');
    window.electronAPI.on('test:open-dashboard', handleOpenTestDashboard);
    window.electronAPI.on('test:run-all-from-menu', handleRunAllTests);
    window.electronAPI.on('test:health-check-from-menu', handleHealthCheck);
    window.electronAPI.on('test:run-llm-from-menu', handleRunLLM);
    window.electronAPI.on('test:run-database-from-menu', handleRunDatabase);
    window.electronAPI.on('test:run-mcp-from-menu', handleRunMCP);

    return () => {
      window.electronAPI.removeListener('test:open-dashboard', handleOpenTestDashboard);
      window.electronAPI.removeListener('test:run-all-from-menu', handleRunAllTests);
      window.electronAPI.removeListener('test:health-check-from-menu', handleHealthCheck);
      window.electronAPI.removeListener('test:run-llm-from-menu', handleRunLLM);
      window.electronAPI.removeListener('test:run-database-from-menu', handleRunDatabase);
      window.electronAPI.removeListener('test:run-mcp-from-menu', handleRunMCP);
    };
  }, []);

  return (
    <MainLayout>
      <div className="flex h-full flex-col">
        {appMode === 'chat' ? (
          <>
            <ChatContainer />
            <WorkingDirectoryIndicator />
          </>
        ) : appMode === 'editor' ? (
          <EditorWithTerminal />
        ) : appMode === 'presentation' ? (
          <PresentationStudio />
        ) : (
          <BrowserPanel />
        )}
      </div>
      <UpdateNotificationDialog />
    </MainLayout>
  );
}
