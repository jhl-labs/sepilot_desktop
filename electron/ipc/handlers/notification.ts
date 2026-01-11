/**
 * Notification IPC Handlers
 * 시스템 알림 표시 및 클릭 처리
 */

import { ipcMain, Notification, BrowserWindow, app } from 'electron';
import path from 'path';
import { logger } from '../../services/logger';

const isDev = process.env.NODE_ENV === 'development';
const isWindows = process.platform === 'win32';

let getMainWindowFunc: () => BrowserWindow | null;

import { NotificationWindowManager } from '../../services/notification-window';

export function setupNotificationHandlers(getMainWindow: () => BrowserWindow | null) {
  getMainWindowFunc = getMainWindow;

  // Remove existing handlers to prevent "second handler" errors on hot reload
  ipcMain.removeHandler('notification:show');
  ipcMain.removeHandler('notification:click');
  ipcMain.removeHandler('notification:close');
  ipcMain.removeHandler('notification:ready');

  ipcMain.handle(
    'notification:show',
    async (
      event,
      options: {
        conversationId: string;
        title: string;
        body: string;
        html?: string;
        imageUrl?: string;
        type?: 'os' | 'application'; // Add type parameter
      }
    ) => {
      const { conversationId, title, body, html, imageUrl, type = 'os' } = options;

      try {
        logger.info(`[Notification] Showing ${type} notification for: ${conversationId}`);

        if (type === 'application') {
          // Show Custom Window Notification
          NotificationWindowManager.getInstance().show({
            conversationId,
            title,
            body,
            html,
            imageUrl,
          });
          return { success: true };
        }

        // --- OS Notification Logic (Existing) ---

        // Get icon path (same as main window icon)
        let iconPath: string;
        if (isDev) {
          // Development: use icon from assets directory
          iconPath = isWindows
            ? path.join(app.getAppPath(), 'assets', 'icon.ico')
            : path.join(app.getAppPath(), 'assets', 'icon.png');
        } else {
          // Production: use packaged icon
          iconPath = isWindows
            ? path.join(process.resourcesPath, 'assets', 'icon.ico')
            : path.join(process.resourcesPath, 'assets', 'icon.png');
        }

        // Create notification
        const notification = new Notification({
          title,
          body,
          icon: iconPath,
          silent: false, // Play sound
          urgency: 'normal' as const,
        });

        // Handle notification click
        notification.on('click', () => {
          handleNotificationClick(conversationId);
        });

        // Show notification
        notification.show();
        logger.info('[Notification] Notification shown successfully');

        return { success: true };
      } catch (error: any) {
        logger.error('[Notification] Failed to show notification:', error);
        return { success: false, error: error.message };
      }
    }
  );

  // New handler for custom window clicks
  ipcMain.handle('notification:click', (event, conversationId: string) => {
    handleNotificationClick(conversationId);
    // Constructively hide the notification window
    NotificationWindowManager.getInstance().hide();
  });

  // New handler for closing custom window
  // New handler for closing custom window
  ipcMain.handle('notification:close', () => {
    NotificationWindowManager.getInstance().hide();
  });

  // New handler for notification ready signal (Handshake)
  ipcMain.handle('notification:ready', () => {
    logger.info('[Notification] Received ready signal from window');
    NotificationWindowManager.getInstance().resendContent();
  });

  logger.info('[Notification] Handlers registered');
}

function handleNotificationClick(conversationId: string) {
  logger.info(`[Notification] Clicked for conversation: ${conversationId}`);

  const mainWindow = getMainWindowFunc();
  if (mainWindow) {
    // Restore window if minimized
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    // Show and focus window
    mainWindow.show();
    mainWindow.focus();

    // Send message to renderer to switch conversation
    mainWindow.webContents.send('notification:click', conversationId);
    logger.info(`[Notification] Sent conversation switch request: ${conversationId}`);
  } else {
    logger.warn('[Notification] Main window not found');
  }
}
