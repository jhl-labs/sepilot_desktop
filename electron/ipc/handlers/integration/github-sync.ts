/**
 * GitHub Sync IPC Handlers
 * GitHub Token 기반 동기화 핸들러
 */

import { ipcMain } from 'electron';
import { GitHubSyncClient } from '@/lib/domains/integration/github/client';
import type { GitHubSyncConfig, AppConfig } from '@/types';
import { generateMasterKey } from '@/lib/domains/integration/github/encryption';
import crypto from 'crypto';
import { databaseService } from '../../../services/database';
import { vectorDBService } from '../../../services/vectordb';
import { loadAppConfig, loadRawAppConfig, saveAppConfig } from '../../../services/secure-config';

/**
 * Network 설정을 GitHubSyncConfig에 적용하는 헬퍼 함수
 */
function applyNetworkConfig(config: GitHubSyncConfig): GitHubSyncConfig {
  if (!config.networkConfig) {
    const appConfig = loadRawAppConfig();
    if (appConfig) {
      if (appConfig.network) {
        config.networkConfig = appConfig.network;
      }
    }
  }
  return config;
}

/**
 * GitHub Token 기반 deterministic 마스터 키 생성
 * 여러 기기에서 동일 token/owner/repo를 사용하면 동일 키를 생성
 */
function deriveDeterministicMasterKey(config: GitHubSyncConfig): string {
  const base = [
    'sepilot-github-sync-key-v2',
    config.serverType || 'github.com',
    config.ghesUrl || '',
    config.owner,
    config.repo,
    config.token,
  ].join('|');
  return crypto.createHash('sha256').update(base).digest('hex');
}

function getMasterKeyCandidates(config: GitHubSyncConfig): string[] {
  const deterministicKey = deriveDeterministicMasterKey(config);
  const candidates = [deterministicKey];

  // Legacy support: 기존 로컬 마스터 키도 복호화 후보로 시도
  const legacyKey = databaseService.getSetting('github_sync_master_key');
  if (legacyKey && legacyKey !== deterministicKey) {
    candidates.push(legacyKey);
  }

  return candidates;
}

function buildStoredGitHubSyncConfig(
  existing: GitHubSyncConfig | undefined,
  incoming: GitHubSyncConfig,
  syncMeta: {
    lastSyncAt: number;
    lastSyncStatus: 'success' | 'error';
    lastSyncError?: string;
  }
): GitHubSyncConfig {
  return {
    serverType: incoming.serverType || existing?.serverType || 'github.com',
    ghesUrl: incoming.ghesUrl ?? existing?.ghesUrl,
    token: incoming.token || existing?.token || '',
    owner: incoming.owner,
    repo: incoming.repo,
    branch: incoming.branch || existing?.branch || 'main',
    syncSettings: incoming.syncSettings,
    syncDocuments: incoming.syncDocuments,
    syncImages: incoming.syncImages,
    syncConversations: incoming.syncConversations,
    syncPersonas: incoming.syncPersonas,
    errorReporting: incoming.errorReporting ?? existing?.errorReporting,
    networkConfig: incoming.networkConfig ?? existing?.networkConfig,
    lastSyncAt: syncMeta.lastSyncAt,
    lastSyncStatus: syncMeta.lastSyncStatus,
    lastSyncError: syncMeta.lastSyncError,
  };
}

/**
 * 동기화 상태 업데이트 (민감정보는 secure storage로 위임)
 */
async function updateSyncStatus(
  config: GitHubSyncConfig,
  syncMeta: {
    lastSyncStatus: 'success' | 'error';
    lastSyncError?: string;
  }
): Promise<void> {
  const appConfig = await loadAppConfig({ includeTokens: true });
  if (appConfig) {
    const updatedConfig: AppConfig = {
      ...appConfig,
      githubSync: buildStoredGitHubSyncConfig(appConfig.githubSync, config, {
        lastSyncAt: Date.now(),
        ...syncMeta,
      }),
    };
    await saveAppConfig(updatedConfig);
  }
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

      // token 기반 deterministic 마스터 키 사용 (멀티 디바이스 동기화)
      const masterKey = deriveDeterministicMasterKey(config);

      // 현재 설정 로드
      const appConfig = loadRawAppConfig();
      if (!appConfig) {
        throw new Error('설정이 존재하지 않습니다.');
      }

      // GitHub Sync 클라이언트 생성
      const client = new GitHubSyncClient(config);

      // 설정 동기화
      const result = await client.syncSettings(appConfig, masterKey);

      // 마지막 동기화 정보 업데이트
      if (result.success) {
        await updateSyncStatus(config, {
          lastSyncStatus: 'success',
        });
      } else {
        await updateSyncStatus(config, {
          lastSyncStatus: 'error',
          lastSyncError: result.error || result.message,
        });
      }

      return result;
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync settings:', error);
      await updateSyncStatus(config, {
        lastSyncStatus: 'error',
        lastSyncError: error.message,
      });
      return {
        success: false,
        message: '설정 동기화 실패',
        error: error.message,
      };
    }
  });

  /**
   * GitHub에서 설정 가져오기 (Pull)
   */
  ipcMain.handle('github-sync-pull-settings', async (_event, config: GitHubSyncConfig) => {
    try {
      config = applyNetworkConfig(config);

      const client = new GitHubSyncClient(config);
      const pullResult = await client.pullSettings(getMasterKeyCandidates(config));

      if (!pullResult.success || !pullResult.config) {
        throw new Error(pullResult.error || pullResult.message || '설정 가져오기 실패');
      }

      const currentConfig = await loadAppConfig({ includeTokens: true });
      const pulledConfig = pullResult.config;

      // 토큰은 GitHub에 REDACTED로 저장되므로 로컬 보안 저장소 값을 우선 보존
      const currentGitHubToken = currentConfig?.githubSync?.token || config.token || '';
      const pulledGitHubToken =
        pulledConfig.githubSync?.token && pulledConfig.githubSync.token !== '[REDACTED]'
          ? pulledConfig.githubSync.token
          : currentGitHubToken;

      const currentTeamDocs = currentConfig?.teamDocs || [];
      const currentTeamDocsById = new Map(currentTeamDocs.map((td) => [td.id, td]));
      const currentTeamDocsByRepo = new Map(
        currentTeamDocs.map((td) => [`${td.owner}/${td.repo}/${td.branch || 'main'}`, td])
      );

      const mergedTeamDocs =
        pulledConfig.teamDocs?.map((td) => {
          const repoKey = `${td.owner}/${td.repo}/${td.branch || 'main'}`;
          const localMatch = currentTeamDocsById.get(td.id) || currentTeamDocsByRepo.get(repoKey);
          const token =
            td.token && td.token !== '[REDACTED]' ? td.token : (localMatch?.token ?? '');
          return {
            ...td,
            token,
          };
        }) || [];

      const pulledGitHubSync = pulledConfig.githubSync;
      const mergedGitHubSyncInput: GitHubSyncConfig = {
        serverType: pulledGitHubSync?.serverType || config.serverType || 'github.com',
        ghesUrl: pulledGitHubSync?.ghesUrl ?? config.ghesUrl,
        token: pulledGitHubToken,
        owner: pulledGitHubSync?.owner || config.owner,
        repo: pulledGitHubSync?.repo || config.repo,
        branch: pulledGitHubSync?.branch || config.branch || 'main',
        syncSettings: pulledGitHubSync?.syncSettings ?? config.syncSettings,
        syncDocuments: pulledGitHubSync?.syncDocuments ?? config.syncDocuments,
        syncImages: pulledGitHubSync?.syncImages ?? config.syncImages,
        syncConversations: pulledGitHubSync?.syncConversations ?? config.syncConversations,
        syncPersonas: pulledGitHubSync?.syncPersonas ?? config.syncPersonas,
        errorReporting: pulledGitHubSync?.errorReporting ?? config.errorReporting,
        networkConfig: config.networkConfig,
      };

      const mergedConfig: AppConfig = {
        ...(currentConfig || ({} as AppConfig)),
        ...pulledConfig,
        githubSync: buildStoredGitHubSyncConfig(currentConfig?.githubSync, mergedGitHubSyncInput, {
          lastSyncAt: Date.now(),
          lastSyncStatus: 'success',
        }),
        teamDocs: mergedTeamDocs,
      };

      // githubSync 토큰은 현재 연결 token 유지
      if (mergedConfig.githubSync) {
        mergedConfig.githubSync.token = pulledGitHubToken;
      }

      await saveAppConfig(mergedConfig);

      return {
        success: true,
        message: pullResult.message || '설정을 GitHub에서 가져왔습니다.',
        data: mergedConfig,
      };
    } catch (error: any) {
      console.error('[GitHubSync] Failed to pull settings:', error);
      await updateSyncStatus(config, {
        lastSyncStatus: 'error',
        lastSyncError: error.message,
      });
      return {
        success: false,
        message: '설정 가져오기 실패',
        error: error.message,
      };
    }
  });

  /**
   * 문서 동기화 (Personal Docs만)
   */
  ipcMain.handle('github-sync-documents', async (_event, config: GitHubSyncConfig) => {
    try {
      config = applyNetworkConfig(config);

      // VectorDB에서 Personal Docs만 가져오기
      const allDocuments = await vectorDBService.getAllDocuments();
      const documents = allDocuments.filter((doc) => doc.metadata?.docGroup === 'personal');

      console.log(
        `[GitHubSync] Syncing ${documents.length} personal documents (filtered from ${allDocuments.length} total)`
      );

      // GitHub Sync 클라이언트 생성
      const client = new GitHubSyncClient(config);

      // 문서 동기화
      const result = await client.syncDocuments(documents);

      // 마지막 동기화 정보 업데이트
      if (result.success) {
        await updateSyncStatus(config, {
          lastSyncStatus: 'success',
        });
      } else {
        await updateSyncStatus(config, {
          lastSyncStatus: 'error',
          lastSyncError: result.error || result.message,
        });
      }

      return result;
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync documents:', error);
      await updateSyncStatus(config, {
        lastSyncStatus: 'error',
        lastSyncError: error.message,
      });
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
        await updateSyncStatus(config, {
          lastSyncStatus: 'success',
        });
      } else {
        await updateSyncStatus(config, {
          lastSyncStatus: 'error',
          lastSyncError: result.error || result.message,
        });
      }

      return result;
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync images:', error);
      await updateSyncStatus(config, {
        lastSyncStatus: 'error',
        lastSyncError: error.message,
      });
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
        await updateSyncStatus(config, {
          lastSyncStatus: 'success',
        });
      } else {
        await updateSyncStatus(config, {
          lastSyncStatus: 'error',
          lastSyncError: result.error || result.message,
        });
      }

      return result;
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync conversations:', error);
      await updateSyncStatus(config, {
        lastSyncStatus: 'error',
        lastSyncError: error.message,
      });
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
        await updateSyncStatus(config, {
          lastSyncStatus: 'success',
        });
      } else {
        await updateSyncStatus(config, {
          lastSyncStatus: 'error',
          lastSyncError: result.error || result.message,
        });
      }

      return result;
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync personas:', error);
      await updateSyncStatus(config, {
        lastSyncStatus: 'error',
        lastSyncError: error.message,
      });
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
        settings: { success: false, message: '비활성화됨' },
        documents: { success: false, message: '비활성화됨' },
        images: { success: false, message: '비활성화됨' },
        conversations: { success: false, message: '비활성화됨' },
        personas: { success: false, message: '비활성화됨' },
      };

      const attempted: Array<keyof typeof results> = [];
      const client = new GitHubSyncClient(config);
      const masterKey = deriveDeterministicMasterKey(config);

      // 설정 동기화
      if (config.syncSettings) {
        attempted.push('settings');
        const appConfig = loadRawAppConfig();
        if (appConfig) {
          results.settings = await client.syncSettings(appConfig, masterKey);
        } else {
          results.settings = {
            success: false,
            message: '설정이 존재하지 않습니다.',
          };
        }
      }

      // 문서 동기화 (Personal Docs만)
      if (config.syncDocuments) {
        attempted.push('documents');
        const allDocuments = await vectorDBService.getAllDocuments();
        const documents = allDocuments.filter((doc) => doc.metadata?.docGroup === 'personal');
        results.documents = await client.syncDocuments(documents);
      }

      // 이미지 동기화
      if (config.syncImages) {
        attempted.push('images');
        const conversations = databaseService.getAllConversations();
        const allImages: any[] = [];
        for (const conversation of conversations) {
          const messages = databaseService.getMessages(conversation.id);
          for (const message of messages) {
            if (message.images) {
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
            }
          }
        }
        results.images = await client.syncImages(allImages);
      }

      // 대화 내역 동기화
      if (config.syncConversations) {
        attempted.push('conversations');
        const conversations = databaseService.getAllConversations();
        const allMessages: any[] = [];
        for (const conversation of conversations) {
          const messages = databaseService.getMessages(conversation.id);
          allMessages.push(...messages);
        }
        const backupData = {
          version: '1.0',
          exportDate: new Date().toISOString(),
          conversations,
          messages: allMessages,
        };
        results.conversations = await client.syncConversations(backupData);
      }

      // AI 페르소나 동기화
      if (config.syncPersonas) {
        attempted.push('personas');
        const personas = databaseService.getAllPersonas();
        results.personas = await client.syncPersonas(personas);
      }

      if (attempted.length === 0) {
        return {
          success: false,
          message: '동기화할 항목이 선택되지 않았습니다.',
          data: results,
        };
      }

      const failed = attempted.filter((key) => !results[key].success);
      const allSuccess = failed.length === 0;
      const errorSummary =
        failed.length > 0
          ? failed.map((key) => `${key}: ${results[key].message}`).join(', ')
          : undefined;

      await updateSyncStatus(config, {
        lastSyncStatus: allSuccess ? 'success' : 'error',
        lastSyncError: errorSummary,
      });

      return {
        success: allSuccess,
        message: allSuccess
          ? `동기화 완료 (${attempted.length}개 항목)`
          : `일부 동기화 실패 (${failed.length}/${attempted.length})`,
        data: results,
        error: errorSummary,
      };
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync all:', error);
      await updateSyncStatus(config, {
        lastSyncStatus: 'error',
        lastSyncError: error.message,
      });
      return {
        success: false,
        message: '전체 동기화 실패',
        error: error.message,
      };
    }
  });

  /**
   * GitHub에서 문서 가져오기 (Pull)
   */
  ipcMain.handle('github-sync-pull-documents', async (_event, config: GitHubSyncConfig) => {
    try {
      config = applyNetworkConfig(config);

      // GitHub Sync 클라이언트 생성
      const client = new GitHubSyncClient(config);

      // 문서 가져오기
      const result = await client.pullDocuments();

      if (!result.success) {
        throw new Error(result.error || '문서 가져오기 실패');
      }

      return {
        success: true,
        documents: result.documents,
        message: result.message,
      };
    } catch (error: any) {
      console.error('[GitHubSync] Failed to pull documents:', error);
      return {
        success: false,
        documents: [],
        message: '문서 가져오기 실패',
        error: error.message,
      };
    }
  });
}
