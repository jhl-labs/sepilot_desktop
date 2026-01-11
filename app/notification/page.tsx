'use client';

import { useEffect, useState } from 'react';
import { X, MessageSquare } from 'lucide-react';

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
    // 1. Setup Background (Transparent)
    document.body.style.backgroundColor = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';

    // 2. Setup IPC
    if (window.electronAPI) {
      window.electronAPI.on('notification:update-content', (data: any) => {
        setNotification(data);
      });

      // Signal Ready
      // @ts-expect-error - ready method will be added to notification API
      window.electronAPI.notification?.ready?.();
    }

    return () => {
      document.body.style.backgroundColor = '';
      document.documentElement.style.backgroundColor = '';
    };
  }, []);

  const handleClick = () => {
    if (notification && window.electronAPI) {
      // @ts-expect-error - emitClick method will be added to notification API
      window.electronAPI.notification?.emitClick?.(notification.conversationId);
    }
  };

  const handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setNotification(null);
    // @ts-expect-error - close method will be added to notification API
    window.electronAPI?.notification?.close?.();
  };

  if (!notification) {
    return null;
  }

  return (
    <div className="flex h-screen w-screen items-end justify-end p-4 bg-transparent overflow-hidden">
      <div
        className="group relative flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-white/20 bg-white/90 dark:bg-gray-900/90 shadow-2xl backdrop-blur-md cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] ring-1 ring-black/5 dark:ring-white/10"
        onClick={handleClick}
        role="alert"
      >
        {/* Progress Bar (Optional, can add later) */}

        <div className="flex w-full p-4 gap-4">
          {/* Icon Section */}
          <div className="flex-shrink-0 pt-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-sm text-white">
              <MessageSquare className="h-5 w-5" />
            </div>
          </div>

          {/* Content Section */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-start justify-between">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {notification.title}
              </p>

              {/* Timestamp or Secondary Info could go here */}
            </div>

            {notification.html ? (
              <div
                className="text-sm text-gray-600 dark:text-gray-300 prose-sm line-clamp-2"
                dangerouslySetInnerHTML={{ __html: notification.html }}
              />
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 leading-relaxed">
                {notification.body}
              </p>
            )}

            {notification.imageUrl && (
              <div className="mt-3 relative rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm group-hover:shadow-md transition-shadow">
                {}
                <img
                  src={notification.imageUrl}
                  alt="Attachment"
                  className="w-full h-auto object-cover max-h-48"
                />
              </div>
            )}
          </div>

          {/* Close Button */}
          <div className="flex-shrink-0 -mr-1 -mt-1">
            <button
              onClick={handleClose}
              className="p-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
