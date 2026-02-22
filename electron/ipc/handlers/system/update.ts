import { ipcMain } from 'electron';
import { checkForUpdates, UpdateCheckResult } from '@/electron/utils/update-checker';
import { logger } from '../../../services/logger';
import { app } from 'electron';

interface IPCResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export function setupUpdateHandlers() {
  logger.info('[Update] IPC handlers registering...');

  /**
   * Check for updates
   */
  ipcMain.handle('update:check', async (): Promise<IPCResponse<UpdateCheckResult>> => {
    try {
      const currentVersion = app.getVersion();
      const result = await checkForUpdates(currentVersion);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error('[Update] Failed to check for updates:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Get current app version
   */
  ipcMain.handle('update:get-version', async (): Promise<IPCResponse<string>> => {
    try {
      const version = app.getVersion();
      return {
        success: true,
        data: version,
      };
    } catch (error) {
      logger.error('[Update] Failed to get version:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  logger.info('[Update] IPC handlers registered');
}
