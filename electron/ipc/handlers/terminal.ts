/**
 * Terminal IPC Handlers
 *
 * Handles IPC communication between renderer and PTY manager.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { getPTYManager } from '../../services/pty-manager';
import { logger } from '../../services/logger';

let mainWindowRef: BrowserWindow | null = null;

export function setupTerminalHandlers(mainWindow?: BrowserWindow) {
  if (mainWindow) {
    mainWindowRef = mainWindow;
  }

  const ptyManager = getPTYManager(mainWindowRef || undefined);

  /**
   * 터미널 세션 생성
   */
  ipcMain.handle('terminal:create-session', async (_event, cwd?: string, cols?: number, rows?: number) => {
    try {
      logger.info('[Terminal IPC] Creating session:', { cwd, cols, rows });

      const result = ptyManager.createSession({ cwd, cols, rows });

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      logger.error('[Terminal IPC] Error creating session:', error);
      return {
        success: false,
        error: error.message || 'Failed to create terminal session',
      };
    }
  });

  /**
   * 터미널에 데이터 쓰기
   */
  ipcMain.handle('terminal:write', async (_event, sessionId: string, data: string) => {
    try {
      const success = ptyManager.writeData(sessionId, data);

      return {
        success,
        error: success ? undefined : 'Failed to write data',
      };
    } catch (error: any) {
      logger.error('[Terminal IPC] Error writing data:', error);
      return {
        success: false,
        error: error.message || 'Failed to write data',
      };
    }
  });

  /**
   * 터미널 리사이즈
   */
  ipcMain.handle('terminal:resize', async (_event, sessionId: string, cols: number, rows: number) => {
    try {
      const success = ptyManager.resize(sessionId, cols, rows);

      return {
        success,
        error: success ? undefined : 'Failed to resize terminal',
      };
    } catch (error: any) {
      logger.error('[Terminal IPC] Error resizing terminal:', error);
      return {
        success: false,
        error: error.message || 'Failed to resize terminal',
      };
    }
  });

  /**
   * 터미널 세션 종료
   */
  ipcMain.handle('terminal:kill-session', async (_event, sessionId: string) => {
    try {
      logger.info('[Terminal IPC] Killing session:', sessionId);

      const success = ptyManager.killSession(sessionId);

      return {
        success,
        error: success ? undefined : 'Failed to kill session',
      };
    } catch (error: any) {
      logger.error('[Terminal IPC] Error killing session:', error);
      return {
        success: false,
        error: error.message || 'Failed to kill session',
      };
    }
  });

  /**
   * 활성 세션 목록 조회
   */
  ipcMain.handle('terminal:get-sessions', async () => {
    try {
      const sessions = ptyManager.getSessions();

      return {
        success: true,
        data: sessions,
      };
    } catch (error: any) {
      logger.error('[Terminal IPC] Error getting sessions:', error);
      return {
        success: false,
        error: error.message || 'Failed to get sessions',
      };
    }
  });

  logger.info('[Terminal IPC] Terminal handlers registered');
}
