/**
 * GitHub Sync IPC Handlers
 * GitHub Token 기반 동기화 핸들러
 */

import { ipcMain } from 'electron';
import { GitHubSyncClient } from '../../../lib/github/client';
import type { GitHubSyncConfig, AppConfig } from '../../../types';
import { generateMasterKey } from '../../../lib/github/encryption';
import { databaseService } from '../../services/database';
import { getAllDocuments, exportDocuments } from '../../../lib/vectordb/client';

/**
 * Network 설정을 GitHubSyncConfig에 적용하는 헬퍼 함수
 */
function applyNetworkConfig(config: GitHubSyncConfig): GitHubSyncConfig {
  if (!config.networkConfig) {
    const appConfigStr = databaseService.getSetting('app_config');
    if (appConfigStr) {
      const appConfig: AppConfig = JSON.parse(appConfigStr);
      if (appConfig.network) {
        config.networkConfig = appConfig.network;
      }
    }
  }
  return config;
}

export function setupGitHubSyncHandlers() {
  /**
   * 마스터 암호화 키 생성 또는 가져오기
   */
  ipcMain.handle('github-sync-get-master-key', async () => {
    try {
      let masterKey = databaseService.getSetting('github_sync_master_key');

      if (!masterKey) {
        // 새로운 마스터 키 생성
        masterKey = generateMasterKey();
        databaseService.updateSetting('github_sync_master_key', masterKey);
      }

      return {
        success: true,
        data: masterKey,
      };
    } catch (error: any) {
      console.error('[GitHubSync] Failed to get master key:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  /**
   * GitHub 레포지토리 연결 테스트
   */
  ipcMain.handle('github-sync-test-connection', async (_event, config: GitHubSyncConfig) => {
    try {
      config = applyNetworkConfig(config);
      const client = new GitHubSyncClient(config);
      const result = await client.testConnection();

      return result;
    } catch (error: any) {
      console.error('[GitHubSync] Connection test failed:', error);
      return {
        success: false,
        message: '연결 테스트 실패',
        error: error.message,
      };
    }
  });

  /**
   * 설정 동기화
   */
  ipcMain.handle('github-sync-settings', async (_event, config: GitHubSyncConfig) => {
    try {
      config = applyNetworkConfig(config);

      // 마스터 키 가져오기
      const masterKey = databaseService.getSetting('github_sync_master_key');
      if (!masterKey) {
        throw new Error('암호화 키가 설정되지 않았습니다.');
      }

      // 현재 설정 로드
      const appConfigStr = databaseService.getSetting('app_config');
      if (!appConfigStr) {
        throw new Error('설정이 존재하지 않습니다.');
      }

      const appConfig: AppConfig = JSON.parse(appConfigStr);

      // GitHub Sync 클라이언트 생성
      const client = new GitHubSyncClient(config);

      // 설정 동기화
      const result = await client.syncSettings(appConfig, masterKey);

      // 마지막 동기화 정보 업데이트
      if (result.success) {
        const updatedConfig: AppConfig = {
          ...appConfig,
          githubSync: {
            ...config,
            lastSyncAt: Date.now(),
            lastSyncStatus: 'success',
          },
        };
        databaseService.updateSetting('app_config', JSON.stringify(updatedConfig));
      }

      return result;
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync settings:', error);
      return {
        success: false,
        message: '설정 동기화 실패',
        error: error.message,
      };
    }
  });

  /**
   * 문서 동기화
   */
  ipcMain.handle('github-sync-documents', async (_event, config: GitHubSyncConfig) => {
    try {
      config = applyNetworkConfig(config);

      // VectorDB에서 모든 문서 가져오기
      const documents = await getAllDocuments();

      // GitHub Sync 클라이언트 생성
      const client = new GitHubSyncClient(config);

      // 문서 동기화
      const result = await client.syncDocuments(documents);

      // 마지막 동기화 정보 업데이트
      if (result.success) {
        const appConfigStr = databaseService.getSetting('app_config');
        if (appConfigStr) {
          const appConfig: AppConfig = JSON.parse(appConfigStr);
          const updatedConfig: AppConfig = {
            ...appConfig,
            githubSync: {
              ...config,
              lastSyncAt: Date.now(),
              lastSyncStatus: 'success',
            },
          };
          databaseService.updateSetting('app_config', JSON.stringify(updatedConfig));
        }
      }

      return result;
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync documents:', error);
      return {
        success: false,
        message: '문서 동기화 실패',
        error: error.message,
      };
    }
  });

  /**
   * 이미지 동기화
   */
  ipcMain.handle('github-sync-images', async (_event, config: GitHubSyncConfig) => {
    try {
      config = applyNetworkConfig(config);

      // 데이터베이스에서 모든 대화와 메시지 가져오기
      const conversations = databaseService.getAllConversations();

      const allImages: any[] = [];

      for (const conversation of conversations) {
        const messages = databaseService.getMessages(conversation.id);

        for (const message of messages) {
          if (message.images) {
            try {
              for (const img of message.images) {
                if (img.base64) {
                  allImages.push({
                    ...img,
                    conversationId: conversation.id,
                    conversationTitle: conversation.title,
                    messageId: message.id,
                    createdAt: message.created_at,
                    type: message.role === 'user' ? 'pasted' : 'generated',
                  });
                }
              }
            } catch (error) {
              console.error('[GitHubSync] Failed to parse images:', error);
            }
          }
        }
      }

      // GitHub Sync 클라이언트 생성
      const client = new GitHubSyncClient(config);

      // 이미지 동기화
      const result = await client.syncImages(allImages);

      // 마지막 동기화 정보 업데이트
      if (result.success) {
        const appConfigStr = databaseService.getSetting('app_config');
        if (appConfigStr) {
          const appConfig: AppConfig = JSON.parse(appConfigStr);
          const updatedConfig: AppConfig = {
            ...appConfig,
            githubSync: {
              ...config,
              lastSyncAt: Date.now(),
              lastSyncStatus: 'success',
            },
          };
          databaseService.updateSetting('app_config', JSON.stringify(updatedConfig));
        }
      }

      return result;
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync images:', error);
      return {
        success: false,
        message: '이미지 동기화 실패',
        error: error.message,
      };
    }
  });

  /**
   * 대화 내역 동기화
   */
  ipcMain.handle('github-sync-conversations', async (_event, config: GitHubSyncConfig) => {
    try {
      config = applyNetworkConfig(config);

      // 데이터베이스에서 모든 대화와 메시지 가져오기
      const conversations = databaseService.getAllConversations();

      const allMessages: any[] = [];

      for (const conversation of conversations) {
        const messages = databaseService.getMessages(conversation.id);
        allMessages.push(...messages);
      }

      // 백업 데이터 생성
      const backupData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        conversations,
        messages: allMessages,
      };

      // GitHub Sync 클라이언트 생성
      const client = new GitHubSyncClient(config);

      // 대화 동기화
      const result = await client.syncConversations(backupData);

      // 마지막 동기화 정보 업데이트
      if (result.success) {
        const appConfigStr = databaseService.getSetting('app_config');
        if (appConfigStr) {
          const appConfig: AppConfig = JSON.parse(appConfigStr);
          const updatedConfig: AppConfig = {
            ...appConfig,
            githubSync: {
              ...config,
              lastSyncAt: Date.now(),
              lastSyncStatus: 'success',
            },
          };
          databaseService.updateSetting('app_config', JSON.stringify(updatedConfig));
        }
      }

      return result;
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync conversations:', error);
      return {
        success: false,
        message: '대화 동기화 실패',
        error: error.message,
      };
    }
  });

  /**
   * AI 페르소나 동기화
   */
  ipcMain.handle('github-sync-personas', async (_event, config: GitHubSyncConfig) => {
    try {
      config = applyNetworkConfig(config);

      // 데이터베이스에서 모든 페르소나 가져오기
      const personas = databaseService.getAllPersonas();

      // GitHub Sync 클라이언트 생성
      const client = new GitHubSyncClient(config);

      // 페르소나 동기화
      const result = await client.syncPersonas(personas);

      // 마지막 동기화 정보 업데이트
      if (result.success) {
        const appConfigStr = databaseService.getSetting('app_config');
        if (appConfigStr) {
          const appConfig: AppConfig = JSON.parse(appConfigStr);
          const updatedConfig: AppConfig = {
            ...appConfig,
            githubSync: {
              ...config,
              lastSyncAt: Date.now(),
              lastSyncStatus: 'success',
            },
          };
          databaseService.updateSetting('app_config', JSON.stringify(updatedConfig));
        }
      }

      return result;
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync personas:', error);
      return {
        success: false,
        message: 'AI 페르소나 동기화 실패',
        error: error.message,
      };
    }
  });

  /**
   * 모든 데이터 동기화 (한 번에)
   */
  ipcMain.handle('github-sync-all', async (_event, config: GitHubSyncConfig) => {
    try {
      config = applyNetworkConfig(config);

      const results = {
        settings: { success: false, message: '' },
        documents: { success: false, message: '' },
        images: { success: false, message: '' },
        conversations: { success: false, message: '' },
        personas: { success: false, message: '' },
      };

      const client = new GitHubSyncClient(config);
      const masterKey = databaseService.getSetting('github_sync_master_key');

      // 설정 동기화
      if (config.syncSettings && masterKey) {
        const appConfigStr = databaseService.getSetting('app_config');
        if (appConfigStr) {
          const appConfig: AppConfig = JSON.parse(appConfigStr);
          results.settings = await client.syncSettings(appConfig, masterKey);
        }
      }

      // 문서 동기화
      if (config.syncDocuments) {
        const documents = await getAllDocuments();
        results.documents = await client.syncDocuments(documents);
      }

      // AI 페르소나 동기화
      if (config.syncPersonas) {
        const personas = databaseService.getAllPersonas();
        results.personas = await client.syncPersonas(personas);
      }

      // 이미지는 동기화하지 않음 (용량 문제)
      // 대화 내역은 동기화하지 않음 (개인정보)

      // 마지막 동기화 정보 업데이트
      const appConfigStr = databaseService.getSetting('app_config');
      if (appConfigStr) {
        const appConfig: AppConfig = JSON.parse(appConfigStr);
        const allSuccess =
          results.settings.success && results.documents.success && results.personas.success;
        const updatedConfig: AppConfig = {
          ...appConfig,
          githubSync: {
            ...config,
            lastSyncAt: Date.now(),
            lastSyncStatus: allSuccess ? 'success' : 'error',
            lastSyncError: allSuccess
              ? undefined
              : `설정: ${results.settings.message}, 문서: ${results.documents.message}, 페르소나: ${results.personas.message}`,
          },
        };
        databaseService.updateSetting('app_config', JSON.stringify(updatedConfig));
      }

      return {
        success: results.settings.success || results.documents.success || results.personas.success,
        message: '동기화 완료',
        data: results,
      };
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync all:', error);
      return {
        success: false,
        message: '전체 동기화 실패',
        error: error.message,
      };
    }
  });
}
