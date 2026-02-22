/**
 * Webhook IPC Handlers (Task #29)
 *
 * GitHub Webhook 서버 관리 IPC 핸들러
 */

import { ipcMain, BrowserWindow } from 'electron';
import { webhookServer } from '../../../services/webhook-server';

/**
 * Webhook IPC 핸들러 등록
 */
export function registerWebhookHandlers(getMainWindow: () => BrowserWindow | null): void {
  // Webhook 서버 시작
  ipcMain.handle('webhook:start', async (_event, data: { port: number; secret: string }) => {
    try {
      const { port, secret } = data;

      const mainWindow = getMainWindow();
      if (!mainWindow) {
        throw new Error('Main window is not available');
      }

      await webhookServer.start(port, secret, mainWindow);

      return { success: true, data: { port, isRunning: true } };
    } catch (error: any) {
      console.error('[Webhook IPC] Failed to start webhook server:', error);
      return { success: false, error: error.message };
    }
  });

  // Webhook 서버 중지
  ipcMain.handle('webhook:stop', async () => {
    try {
      await webhookServer.stop();

      return { success: true };
    } catch (error: any) {
      console.error('[Webhook IPC] Failed to stop webhook server:', error);
      return { success: false, error: error.message };
    }
  });

  // Webhook 서버 상태 조회
  ipcMain.handle('webhook:status', async () => {
    try {
      const status = webhookServer.getStatus();

      return { success: true, data: status };
    } catch (error: any) {
      console.error('[Webhook IPC] Failed to get webhook status:', error);
      return { success: false, error: error.message };
    }
  });
}
