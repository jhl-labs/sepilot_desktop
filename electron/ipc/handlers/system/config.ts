/**
 * Config IPC Handlers
 * 앱 설정 관리를 위한 IPC 핸들러
 */

import { databaseService } from '../../../services/database';
import { logger } from '../../../services/logger';
import { AppConfig } from '@/types';
import { registerHandlers, removeHandlerIfExists } from '@/electron/ipc/utils';
import { loadAppConfig, saveAppConfig } from '../../../services/secure-config';

/**
 * Default app configuration
 */
const DEFAULT_CONFIG: Partial<AppConfig> = {
  notification: {
    type: 'os',
  },
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
  mcp: [
    {
      name: 'context7',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      env: {},
      enabled: true,
    },
  ],
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

/**
 * 마이그레이션: 기존 설정에 context7 MCP 추가
 */
function ensureContext7MCP(config: AppConfig): void {
  const context7Exists = config.mcp?.some((server) => server.name === 'context7');

  if (!context7Exists) {
    if (!config.mcp) {
      config.mcp = [];
    }

    config.mcp.push({
      name: 'context7',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      env: {},
      enabled: true,
    });

    logger.info('[Migration] Added context7 MCP to config');
  }
}

/**
 * 마이그레이션: 알림 설정 기본값 보장
 */
function ensureNotificationConfig(config: AppConfig): void {
  if (
    !config.notification ||
    (config.notification.type !== 'os' && config.notification.type !== 'application')
  ) {
    config.notification = { type: 'os' };
    logger.info('[Migration] Added default notification config');
  }
}

export function setupConfigHandlers() {
  // Remove existing handlers (for hot reload)
  const channels = [
    'load-config',
    'save-config',
    'update-setting',
    'get-setting',
    'get-network-env-vars',
  ];
  channels.forEach(removeHandlerIfExists);

  registerHandlers([
    {
      channel: 'load-config',
      handler: async () => {
        const config = await loadAppConfig({ includeTokens: true });
        if (!config) {
          return DEFAULT_CONFIG;
        }

        // context7 MCP가 없으면 추가
        ensureContext7MCP(config);
        ensureNotificationConfig(config);

        logger.debug('Loaded config');
        return config;
      },
    },
    {
      channel: 'save-config',
      handler: async (config: AppConfig) => {
        await saveAppConfig(config);
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
    {
      channel: 'get-network-env-vars',
      handler: () => {
        // 환경 변수는 앱 시작 시 삭제되므로 항상 빈 객체 반환
        logger.debug('Network environment variables are not used (always cleared on startup)');
        return {};
      },
    },
  ]);

  logger.info('Config IPC handlers registered');
}
