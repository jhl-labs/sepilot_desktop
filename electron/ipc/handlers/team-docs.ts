/**
 * Team Docs IPC Handlers
 * 여러 GitHub Repo에서 Team 문서를 동기화하는 핸들러
 */

import { ipcMain } from 'electron';
import { GitHubSyncClient } from '../../../lib/github/client';
import type { TeamDocsConfig, AppConfig, GitHubSyncConfig } from '../../../types';
import { databaseService } from '../../services/database';
import { vectorDBService } from '../../services/vectordb';

/**
 * Network 설정을 TeamDocsConfig에 적용하는 헬퍼 함수
 */
function applyNetworkConfig(config: TeamDocsConfig): TeamDocsConfig {
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

/**
 * TeamDocsConfig를 GitHubSyncConfig로 변환
 */
function toGitHubSyncConfig(config: TeamDocsConfig): GitHubSyncConfig {
  return {
    serverType: config.serverType || 'github.com',
    ghesUrl: config.ghesUrl,
    token: config.token,
    owner: config.owner,
    repo: config.repo,
    branch: config.branch || 'main',
    syncSettings: false,
    syncDocuments: true,
    syncImages: false,
    syncConversations: false,
    syncPersonas: false,
    networkConfig: config.networkConfig,
  };
}

export function setupTeamDocsHandlers() {
  /**
   * Team Docs 레포지토리 연결 테스트
   */
  ipcMain.handle('team-docs-test-connection', async (_event, config: TeamDocsConfig) => {
    try {
      config = applyNetworkConfig(config);
      const syncConfig = toGitHubSyncConfig(config);
      const client = new GitHubSyncClient(syncConfig);
      const result = await client.testConnection();

      return result;
    } catch (error: any) {
      console.error('[TeamDocs] Connection test failed:', error);
      return {
        success: false,
        message: '연결 테스트 실패',
        error: error.message,
      };
    }
  });

  /**
   * Team Docs 동기화 (GitHub에서 문서 Pull)
   */
  ipcMain.handle('team-docs-sync-documents', async (_event, config: TeamDocsConfig) => {
    try {
      config = applyNetworkConfig(config);
      const syncConfig = toGitHubSyncConfig(config);
      const client = new GitHubSyncClient(syncConfig);

      // 문서 경로 설정 (기본값: sepilot/documents)
      const docsPath = config.docsPath || 'sepilot/documents';

      // GitHub에서 문서 가져오기
      const result = await client.pullDocuments();

      if (!result.success) {
        throw new Error(result.error || '문서 가져오기 실패');
      }

      // VectorDB에 문서 저장 (docGroup='team' 메타데이터 추가)
      const documentsToIndex = result.documents.map((doc) => ({
        id: `team_${config.id}_${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}`,
        content: doc.content,
        metadata: {
          ...doc.metadata,
          docGroup: 'team', // 팀 문서로 표시
          teamDocsId: config.id, // 어느 팀에서 왔는지 기록
          teamName: config.name, // 팀 이름
          source: `${config.owner}/${config.repo}`, // GitHub 소스
        },
      }));

      // 임베딩 설정 로드
      const { initializeEmbedding } = await import('../../../lib/vectordb/embeddings/client');
      const embeddingConfigStr = databaseService.getSetting('app_config');
      if (embeddingConfigStr) {
        const embeddingAppConfig = JSON.parse(embeddingConfigStr);
        if (embeddingAppConfig.embedding) {
          initializeEmbedding(embeddingAppConfig.embedding);
        }
      }

      // VectorDB에 인덱싱 (배치 처리)
      await vectorDBService.indexDocuments(documentsToIndex, {
        chunkSize: 1000,
        chunkOverlap: 200,
        batchSize: 10,
      });

      const indexedCount = documentsToIndex.length;

      // 설정 업데이트 (마지막 동기화 시간)
      const appConfigStr = databaseService.getSetting('app_config');
      if (appConfigStr) {
        const appConfig: AppConfig = JSON.parse(appConfigStr);
        const teamDocs = appConfig.teamDocs || [];

        const updatedTeamDocs = teamDocs.map((td) => {
          if (td.id === config.id) {
            return {
              ...td,
              lastSyncAt: Date.now(),
              lastSyncStatus: 'success' as const,
              lastSyncError: undefined,
            };
          }
          return td;
        });

        appConfig.teamDocs = updatedTeamDocs;
        databaseService.updateSetting('app_config', JSON.stringify(appConfig));
      }

      return {
        success: true,
        message: `${indexedCount}개의 팀 문서를 동기화했습니다.`,
        data: {
          totalDocuments: result.documents.length,
          indexedDocuments: indexedCount,
        },
      };
    } catch (error: any) {
      console.error('[TeamDocs] Failed to sync documents:', error);

      // 에러 상태 기록
      const appConfigStr = databaseService.getSetting('app_config');
      if (appConfigStr) {
        const appConfig: AppConfig = JSON.parse(appConfigStr);
        const teamDocs = appConfig.teamDocs || [];

        const updatedTeamDocs = teamDocs.map((td) => {
          if (td.id === config.id) {
            return {
              ...td,
              lastSyncAt: Date.now(),
              lastSyncStatus: 'error' as const,
              lastSyncError: error.message,
            };
          }
          return td;
        });

        appConfig.teamDocs = updatedTeamDocs;
        databaseService.updateSetting('app_config', JSON.stringify(appConfig));
      }

      return {
        success: false,
        message: '팀 문서 동기화 실패',
        error: error.message,
      };
    }
  });

  /**
   * 모든 활성화된 Team Docs 동기화
   */
  ipcMain.handle('team-docs-sync-all', async (_event) => {
    try {
      const appConfigStr = databaseService.getSetting('app_config');
      if (!appConfigStr) {
        throw new Error('설정을 찾을 수 없습니다.');
      }

      const appConfig: AppConfig = JSON.parse(appConfigStr);
      const teamDocs = appConfig.teamDocs || [];
      const enabledTeamDocs = teamDocs.filter((td) => td.enabled);

      if (enabledTeamDocs.length === 0) {
        return {
          success: true,
          message: '활성화된 팀 문서 설정이 없습니다.',
          data: { totalSynced: 0 },
        };
      }

      const results = [];
      let totalSynced = 0;

      for (const config of enabledTeamDocs) {
        try {
          const result = await new Promise<any>((resolve) => {
            ipcMain.handleOnce('team-docs-sync-documents-internal', async () => {
              const syncConfig = applyNetworkConfig(config);
              const syncResult = await new Promise<any>((innerResolve) => {
                // 직접 호출
                const handler = async () => {
                  const client = new GitHubSyncClient(toGitHubSyncConfig(syncConfig));
                  const pullResult = await client.pullDocuments();

                  if (!pullResult.success) {
                    return innerResolve({
                      success: false,
                      message: pullResult.error || '문서 가져오기 실패',
                    });
                  }

                  let indexedCount = 0;
                  for (const doc of pullResult.documents) {
                    try {
                      const metadata = {
                        ...doc.metadata,
                        docGroup: 'team',
                        teamDocsId: config.id,
                        teamName: config.name,
                        source: `${config.owner}/${config.repo}`,
                      };
                      await vectorDBService.indexDocument(doc.title, doc.content, metadata);
                      indexedCount++;
                    } catch (error) {
                      console.error(`[TeamDocs] Failed to index document:`, error);
                    }
                  }

                  return innerResolve({
                    success: true,
                    message: `${indexedCount}개의 팀 문서를 동기화했습니다.`,
                    data: {
                      totalDocuments: pullResult.documents.length,
                      indexedDocuments: indexedCount,
                    },
                  });
                };

                handler();
              });

              return syncResult;
            });

            // Trigger the internal handler
            resolve(ipcMain.emit('team-docs-sync-documents-internal' as any, {} as any, config));
          });

          results.push({ teamName: config.name, ...result });
          if (result.success && result.data) {
            totalSynced += result.data.indexedDocuments;
          }
        } catch (error: any) {
          console.error(`[TeamDocs] Failed to sync ${config.name}:`, error);
          results.push({
            teamName: config.name,
            success: false,
            message: error.message,
          });
        }
      }

      const allSuccess = results.every((r) => r.success);

      return {
        success: allSuccess,
        message: `${totalSynced}개의 팀 문서를 동기화했습니다.`,
        data: {
          totalSynced,
          results,
        },
      };
    } catch (error: any) {
      console.error('[TeamDocs] Failed to sync all team docs:', error);
      return {
        success: false,
        message: '전체 팀 문서 동기화 실패',
        error: error.message,
      };
    }
  });
}
