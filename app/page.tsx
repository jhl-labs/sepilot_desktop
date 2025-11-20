'use client';

import { MainLayout } from '@/components/layout/MainLayout';
import { ChatArea } from '@/components/chat/ChatArea';
import { InputBox } from '@/components/chat/InputBox';

export default function Home() {
  return (
    <MainLayout>
      <div className="flex h-full flex-col">
        <ChatArea />
        <InputBox />
      </div>
    </MainLayout>
  );
}
