/**
 * Notification IPC Handlers
 * 시스템 알림 표시 및 클릭 처리
 */

import { ipcMain, BrowserWindow } from 'electron';
import { logger } from '../../../services/logger';
import {
  showAppNotification,
  focusMainWindowForNotification,
} from '../../../services/notification-service';

let getMainWindowFunc: () => BrowserWindow | null;

import { NotificationWindowManager } from '../../../services/notification-window';

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
      const { conversationId, title, body, html, imageUrl, type } = options;

      try {
        const result = await showAppNotification(
          {
            conversationId,
            title,
            body,
            html,
            imageUrl,
            type,
          },
          {
            mainWindow: getMainWindowFunc(),
            onClick: handleNotificationClick,
          }
        );

        if (result.success) {
          logger.info(
            `[Notification] Showing ${result.type} notification for conversation: ${conversationId}`
          );
        } else {
          logger.warn(`[Notification] Failed to show ${result.type} notification: ${result.error}`);
        }

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('[Notification] Failed to show notification:', error);
        return { success: false, error: message, type: type || 'os' };
      }
    }
  );

  // New handler for custom window clicks
  ipcMain.handle('notification:click', (event, conversationId: string) => {
    handleNotificationClick(conversationId);
    // Constructively hide the notification window
    NotificationWindowManager.getInstance().hide();
    return { success: true };
  });

  // New handler for closing custom window
  ipcMain.handle('notification:close', () => {
    NotificationWindowManager.getInstance().hide();
    return { success: true };
  });

  // New handler for notification ready signal (Handshake)
  ipcMain.handle('notification:ready', () => {
    logger.info('[Notification] Received ready signal from window');
    NotificationWindowManager.getInstance().resendContent();
    return { success: true };
  });

  logger.info('[Notification] Handlers registered');
}

function handleNotificationClick(conversationId: string) {
  logger.info(`[Notification] Clicked for conversation: ${conversationId}`);

  const mainWindow = getMainWindowFunc();
  if (!mainWindow) {
    logger.warn('[Notification] Main window not found');
    return;
  }

  focusMainWindowForNotification(mainWindow, conversationId);
  logger.info(`[Notification] Sent conversation switch request: ${conversationId}`);
}
