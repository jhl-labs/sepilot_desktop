import { app, BrowserWindow, Notification } from 'electron';
import path from 'path';
import { loadRawAppConfig } from './secure-config';
import { logger } from './logger';
import { NotificationWindowManager } from './notification-window';

export type NotificationType = 'os' | 'application';

interface NotificationPayload {
  conversationId: string;
  title: string;
  body: string;
  html?: string;
  imageUrl?: string;
  type?: NotificationType;
}

interface ShowNotificationOptions {
  mainWindow?: BrowserWindow | null;
  onClick?: (conversationId: string) => void;
}

function isNotificationType(value: unknown): value is NotificationType {
  return value === 'os' || value === 'application';
}

export function getGlobalNotificationType(): NotificationType {
  try {
    const config = loadRawAppConfig();
    const savedType = config?.notification?.type;

    return isNotificationType(savedType) ? savedType : 'os';
  } catch (error) {
    logger.warn('[NotificationService] Failed to read global notification type, using os', error);
    return 'os';
  }
}

export function focusMainWindowForNotification(
  mainWindow: BrowserWindow | null | undefined,
  conversationId?: string
): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    logger.warn('[NotificationService] Main window not found for notification click');
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();

  if (conversationId) {
    mainWindow.webContents.send('notification:click', conversationId);
  }
}

function getMainWindowByTitle(): BrowserWindow | null {
  return (
    BrowserWindow.getAllWindows().find(
      (window) => !window.isDestroyed() && window.getTitle() === 'SEPilot Desktop'
    ) ?? null
  );
}

function getNotificationIconPath(): string {
  const isWindows = process.platform === 'win32';
  const iconFilename = isWindows ? 'icon.ico' : 'icon.png';

  if (!app.isPackaged) {
    return path.join(app.getAppPath(), 'assets', iconFilename);
  }

  return path.join(process.resourcesPath, 'assets', iconFilename);
}

export async function showAppNotification(
  payload: NotificationPayload,
  options: ShowNotificationOptions = {}
): Promise<{ success: boolean; error?: string; type: NotificationType }> {
  const type =
    payload.type && isNotificationType(payload.type) ? payload.type : getGlobalNotificationType();

  try {
    if (type === 'application') {
      await NotificationWindowManager.getInstance().show({
        conversationId: payload.conversationId,
        title: payload.title,
        body: payload.body,
        html: payload.html,
        imageUrl: payload.imageUrl,
      });
      return { success: true, type };
    }

    if (!Notification.isSupported()) {
      return { success: false, type, error: 'OS notifications are not supported on this platform' };
    }

    const notification = new Notification({
      title: payload.title,
      body: payload.body,
      icon: getNotificationIconPath(),
      silent: false,
      urgency: 'normal',
    });

    notification.on('click', () => {
      if (options.onClick) {
        options.onClick(payload.conversationId);
        return;
      }

      const mainWindow = options.mainWindow ?? getMainWindowByTitle();
      focusMainWindowForNotification(mainWindow, payload.conversationId);
    });

    notification.show();
    return { success: true, type };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[NotificationService] Failed to show notification:', error);
    return { success: false, type, error: message };
  }
}
