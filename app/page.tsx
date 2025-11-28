'use client';

import { MainLayout } from '@/components/layout/MainLayout';
import { ChatArea } from '@/components/chat/ChatArea';
import { InputBox } from '@/components/chat/InputBox';
import { WorkingDirectoryIndicator } from '@/components/chat/WorkingDirectoryIndicator';
import { UpdateNotificationDialog } from '@/components/UpdateNotificationDialog';
import { CodeEditor } from '@/components/editor/Editor';
import { useChatStore } from '@/lib/store/chat-store';

export default function Home() {
  const { appMode } = useChatStore();

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
