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
    {
      channel: 'get-network-env-vars',
      handler: () => {
        // HTTP/HTTPS 통신 관련 환경 변수 수집
        const envVars: Record<string, string | undefined> = {
          // Proxy 설정
          HTTPS_PROXY: process.env.HTTPS_PROXY,
          https_proxy: process.env.https_proxy,
          HTTP_PROXY: process.env.HTTP_PROXY,
          http_proxy: process.env.http_proxy,
          ALL_PROXY: process.env.ALL_PROXY,
          all_proxy: process.env.all_proxy,
          NO_PROXY: process.env.NO_PROXY,
          no_proxy: process.env.no_proxy,

          // SSL/TLS 설정
          NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
          NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS,
          SSL_CERT_FILE: process.env.SSL_CERT_FILE,
          SSL_CERT_DIR: process.env.SSL_CERT_DIR,

          // 기타 네트워크 설정
          NODE_OPTIONS: process.env.NODE_OPTIONS,
          HTTP_TIMEOUT: process.env.HTTP_TIMEOUT,
          HTTPS_TIMEOUT: process.env.HTTPS_TIMEOUT,
        };

        logger.debug('Retrieved network environment variables');
        return envVars;
      },
    },
  ]);

  logger.info('Config IPC handlers registered');
}
