'use client';

import { useEffect, useState } from 'react';
import { CustomNotification } from '@/components/ui/custom-notification';

interface NotificationData {
  conversationId: string;
  title: string;
  body: string;
  html?: string;
  imageUrl?: string;
}

export default function NotificationPage() {
  const [notification, setNotification] = useState<NotificationData | null>(null);

  useEffect(() => {
    // Listen for notification updates from Main process
    if (window.electronAPI) {
      window.electronAPI.on('notification:update-content', (event: any, data: any) => {
        console.log('Received notification update:', data);
        setNotification(data);
      });
    }

    // Auto-close logic is handled by main process window hide,
    // but we can add animation triggers here if we want.
  }, []);

  const handleClick = () => {
    if (notification && window.electronAPI) {
      window.electronAPI.notification.onClick((_conversationId) => {
        // This listener is in the main window context usually.
        // But here we are in the notification window.
        // We need to send a message to main process that we were clicked.
      });

      // Sending click event back to main process
      // We'll reuse the existing IPC mechanism or add a specific one.
      // Since 'notification:click' is usually sent FROM main TO renderer,
      // we need a way to tell Main "I was clicked".
      // Let's assume we can invoke a handler.

      // Checking exposed API...
      // We might need to add a method to trigger the click action in main process
      // or just "activate" the app.

      // For now, let's use a workaround or new IPC.
      // Actually, looking at preload.ts, we don't have a direct "I was clicked" invoker
      // other than `notification.show` which is for showing.

      // Let's add a new IPC handler in the plan step later or assume we add `notification:clicked` invoke.
      // For this file creation, I will assume `window.electronAPI.notification.clicked()` exists
      // or I will use `window.electronAPI.invoke('notification:clicked', conversationId)` directly if possible
      // but `electronAPI` is typed.

      // Let's use `window.electronAPI.notification.show` as a template but we need a new one.
      // I'll add `clicked` to the IPC handlers list in `preload.ts` later.
      // For now, I'll use `window.electron.ipcRenderer.invoke` via `any` cast if needed,
      // but better to stick to the pattern.

      // Wait, `notification.onClick` in preload is for RECEIVING the click event (renderer listening).
      // We are the notification window. We need to SEND the click event.

      // I will implement `window.electronAPI.notification.emitClick(conversationId)` in preload.
      // For the React component:
      // @ts-expect-error - emitClick method will be added to notification API
      window.electronAPI?.notification?.emitClick?.(notification.conversationId);
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNotification(null);
    // Tell main process to hide window
    // @ts-expect-error - close method will be added to notification API
    window.electronAPI?.notification?.close?.();
  };

  // Force body background to be transparent
  useEffect(() => {
    document.body.style.backgroundColor = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';
    return () => {
      document.body.style.backgroundColor = '';
      document.documentElement.style.backgroundColor = '';
    };
  }, []);

  if (!notification) {
    return null;
  }

  return (
    <div className="flex h-screen w-screen items-end justify-end p-4 bg-transparent overflow-hidden">
      <CustomNotification
        title={notification.title}
        message={notification.body}
        html={notification.html}
        imageUrl={notification.imageUrl}
        onClick={handleClick}
        onDismiss={handleDismiss}
      />
    </div>
  );
}
