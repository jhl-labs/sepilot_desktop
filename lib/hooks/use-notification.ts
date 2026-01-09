import { useCallback, useEffect, useState } from 'react';
import { logger } from '@/lib/utils/logger';

export type NotificationType = 'os' | 'application';
export const NOTIFICATION_TYPE_KEY = 'sepilot_notification_type';

export function useNotification() {
  const [notificationType, setNotificationType] = useState<NotificationType>('os');

  useEffect(() => {
    // Initial load
    const savedType = localStorage.getItem(NOTIFICATION_TYPE_KEY) as NotificationType;
    if (savedType) {
      setNotificationType(savedType);
    }

    // Listen for storage events (if changed in settings in another tab/window, though less likely in Electron)
    // or custom events if we dispatch them
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === NOTIFICATION_TYPE_KEY && e.newValue) {
        setNotificationType(e.newValue as NotificationType);
      }
    };

    // Listen for custom event for immediate updates within the same window
    const handleCustomEvent = (e: CustomEvent<NotificationType>) => {
      setNotificationType(e.detail);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('sepilot:notification-type-change', handleCustomEvent as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(
        'sepilot:notification-type-change',
        handleCustomEvent as EventListener
      );
    };
  }, []);

  const showNotification = useCallback(
    async ({
      conversationId,
      title,
      body,
    }: {
      conversationId: string;
      title: string;
      body: string;
    }) => {
      try {
        if (!window.electronAPI?.notification) {
          logger.warn('[useNotification] Electron notification API not available');
          // Fallback handled by UI or ignored
          return;
        }

        // Delegate to main process, passing the type
        await window.electronAPI.notification.show({
          conversationId,
          title,
          body,
          // @ts-expect-error - type param added to IPC in handler
          type: notificationType,
        });
      } catch (error) {
        logger.error('[useNotification] Failed to show notification:', error);
      }
    },
    [notificationType]
  );

  return {
    notificationType,
    setNotificationType: (type: NotificationType) => {
      setNotificationType(type);
      localStorage.setItem(NOTIFICATION_TYPE_KEY, type);
      window.dispatchEvent(new CustomEvent('sepilot:notification-type-change', { detail: type }));
    },
    showNotification,
  };
}
