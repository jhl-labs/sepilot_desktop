/**
 * Config IPC Handlers
 * 앱 설정 관리를 위한 IPC 핸들러
 */

import { databaseService } from '../../services/database';
import { logger } from '../../services/logger';
import { AppConfig } from '../../../types';
import { registerHandlers, removeHandlerIfExists } from '../utils';

/**
 * Default app configuration
 */
const DEFAULT_CONFIG: Partial<AppConfig> = {
  llm: {
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4',
    temperature: 0,
    maxTokens: 4096,
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

export function setupConfigHandlers() {
  // Remove existing handlers (for hot reload)
  const channels = ['load-config', 'save-config', 'update-setting', 'get-setting'];
  channels.forEach(removeHandlerIfExists);

  registerHandlers([
    {
      channel: 'load-config',
      handler: () => {
        const configStr = databaseService.getSetting('app_config');

        if (!configStr) {
          return DEFAULT_CONFIG;
        }

        const config = JSON.parse(configStr) as AppConfig;
        logger.debug('Loaded config');
        return config;
      },
    },
    {
      channel: 'save-config',
      handler: (config: AppConfig) => {
        const configStr = JSON.stringify(config);
        databaseService.setSetting('app_config', configStr);
        logger.info('Saved config');
      },
    },
    {
      channel: 'update-setting',
      handler: (key: string, value: unknown) => {
        databaseService.setSetting(key, JSON.stringify(value));
        logger.debug('Updated setting', { key });
      },
    },
    {
      channel: 'get-setting',
      handler: (key: string) => {
        const value = databaseService.getSetting(key);
        return value ? JSON.parse(value) : null;
      },
    },
  ]);

  logger.info('Config IPC handlers registered');
}
