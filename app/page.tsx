'use client';

import { MainLayout } from '@/components/layout/MainLayout';
import { ChatArea } from '@/components/chat/ChatArea';
import { InputBox } from '@/components/chat/InputBox';
import { WorkingDirectoryIndicator } from '@/components/chat/WorkingDirectoryIndicator';
import { UpdateNotificationDialog } from '@/components/UpdateNotificationDialog';

export default function Home() {
  return (
    <MainLayout>
      <div className="flex h-full flex-col">
        <ChatArea />
        <WorkingDirectoryIndicator />
        <InputBox />
      </div>
      <UpdateNotificationDialog />
    </MainLayout>
  );
}
