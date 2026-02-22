import { useCallback, useEffect, useState } from 'react';
import { logger } from '@/lib/utils/logger';

export type NotificationType = 'os' | 'application';
export const NOTIFICATION_TYPE_KEY = 'sepilot_notification_type';

function isNotificationType(value: unknown): value is NotificationType {
  return value === 'os' || value === 'application';
}

type NotificationResult = {
  success: boolean;
  error?: string;
  type?: NotificationType;
};

export function useNotification() {
  const [notificationType, setNotificationType] = useState<NotificationType>('os');

  useEffect(() => {
    let mounted = true;

    const applyType = (type: NotificationType) => {
      if (!mounted) {
        return;
      }
      setNotificationType(type);
    };

    const loadInitialType = async () => {
      try {
        if (window.electronAPI?.config) {
          const configResult = await window.electronAPI.config.load();
          const configType = configResult?.success
            ? configResult.data?.notification?.type
            : undefined;
          if (isNotificationType(configType)) {
            applyType(configType);
            localStorage.setItem(NOTIFICATION_TYPE_KEY, configType);
            return;
          }
        }
      } catch (error) {
        logger.warn('[useNotification] Failed to load global notification setting:', error);
      }

      const savedType = localStorage.getItem(NOTIFICATION_TYPE_KEY);
      if (isNotificationType(savedType)) {
        applyType(savedType);
      }
    };

    void loadInitialType();

    // Listen for storage events
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === NOTIFICATION_TYPE_KEY && isNotificationType(e.newValue)) {
        setNotificationType(e.newValue);
      }
    };

    const handleCustomEvent = (e: CustomEvent<NotificationType>) => {
      if (isNotificationType(e.detail)) {
        setNotificationType(e.detail);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('sepilot:notification-type-change', handleCustomEvent as EventListener);

    return () => {
      mounted = false;
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
      html,
      imageUrl,
      type,
    }: {
      conversationId: string;
      title: string;
      body: string;
      html?: string;
      imageUrl?: string;
      type?: NotificationType;
    }): Promise<NotificationResult> => {
      try {
        if (!window.electronAPI?.notification) {
          logger.warn('[useNotification] Electron notification API not available');
          return { success: false, error: 'Electron notification API not available' };
        }

        // Delegate to main process, passing the type
        const result = await window.electronAPI.notification.show({
          conversationId,
          title,
          body,
          html,
          imageUrl,
          ...(type ? { type } : {}),
        });

        if (!result?.success) {
          logger.warn('[useNotification] Failed to show notification:', result?.error);
          return {
            success: false,
            error: result?.error || 'Failed to show notification',
            type: type || notificationType,
          };
        }

        return {
          success: true,
          type: (result.type as NotificationType | undefined) || type || notificationType,
        };
      } catch (error) {
        logger.error('[useNotification] Failed to show notification:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          type: type || notificationType,
        };
      }
    },
    [notificationType]
  );

  return {
    notificationType,
    setNotificationType: (type: NotificationType) => {
      if (!isNotificationType(type)) {
        return;
      }
      setNotificationType(type);
      localStorage.setItem(NOTIFICATION_TYPE_KEY, type);
      window.dispatchEvent(new CustomEvent('sepilot:notification-type-change', { detail: type }));
    },
    showNotification,
  };
}
