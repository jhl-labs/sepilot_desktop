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

export function setupNotificationHandlers(getMainWindow: () => BrowserWindow | null) {
  getMainWindowFunc = getMainWindow;

  // Remove existing handler for hot reload
  ipcMain.removeHandler('notification:show');

  ipcMain.handle(
    'notification:show',
    async (
      event,
      options: {
        conversationId: string;
        title: string;
        body: string;
      }
    ) => {
      const { conversationId, title, body } = options;

      try {
        logger.info(`[Notification] Showing notification for conversation: ${conversationId}`);

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

  logger.info('[Notification] Handlers registered');
}
