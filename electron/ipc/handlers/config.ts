import { ipcMain } from 'electron';
import { databaseService } from '../../services/database';
import { logger } from '../../services/logger';
import { AppConfig } from '../../../types';

export function setupConfigHandlers() {
  // Load config
  ipcMain.handle('load-config', async () => {
    try {
      const configStr = databaseService.getSetting('app_config');

      if (!configStr) {
        // Return default config
        const defaultConfig: Partial<AppConfig> = {
          llm: {
            provider: 'openai',
            baseURL: 'https://api.openai.com/v1',
            apiKey: '',
            model: 'gpt-4',
            temperature: 0.7,
            maxTokens: 2000,
            vision: {
              enabled: false,
              provider: 'openai',
              baseURL: 'https://api.openai.com/v1',
              model: 'gpt-4o-mini',
              maxImageTokens: 4096,
            },
          },
          mcp: [],
          comfyUI: {
            enabled: false,
            httpUrl: 'http://127.0.0.1:8188',
            wsUrl: 'ws://127.0.0.1:8188/ws',
            workflowId: '',
            clientId: '',
            apiKey: '',
            positivePrompt: '',
            negativePrompt: '',
            steps: 30,
            cfgScale: 7,
            seed: -1,
          },
        };

        return { success: true, data: defaultConfig };
      }

      const config = JSON.parse(configStr) as AppConfig;
      logger.debug('Loaded config');
      return { success: true, data: config };
    } catch (error) {
      logger.error('Failed to load config', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Save config
  ipcMain.handle('save-config', async (_, config: AppConfig) => {
    try {
      const configStr = JSON.stringify(config);
      databaseService.setSetting('app_config', configStr);
      logger.info('Saved config');
      return { success: true };
    } catch (error) {
      logger.error('Failed to save config', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Update specific setting
  ipcMain.handle('update-setting', async (_, key: string, value: any) => {
    try {
      databaseService.setSetting(key, JSON.stringify(value));
      logger.debug('Updated setting', { key });
      return { success: true };
    } catch (error) {
      logger.error('Failed to update setting', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Get specific setting
  ipcMain.handle('get-setting', async (_, key: string) => {
    try {
      const value = databaseService.getSetting(key);
      const parsed = value ? JSON.parse(value) : null;
      return { success: true, data: parsed };
    } catch (error) {
      logger.error('Failed to get setting', error);
      return { success: false, error: (error as Error).message };
    }
  });

  logger.info('Config IPC handlers registered');
}
