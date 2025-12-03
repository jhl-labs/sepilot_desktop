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

/**
 * 단일 Team Docs 동기화 로직 (공통 함수)
 */
async function syncTeamDocsInternal(config: TeamDocsConfig): Promise<{
  success: boolean;
  message: string;
  data?: {
    totalDocuments: number;
    indexedDocuments: number;
  };
  error?: string;
}> {
  try {
    const syncConfig = toGitHubSyncConfig(applyNetworkConfig(config));
    const client = new GitHubSyncClient(syncConfig);

    // GitHub에서 문서 가져오기
    const result = await client.pullDocuments();

    if (!result.success) {
      throw new Error(result.error || '문서 가져오기 실패');
    }

    // 기존 팀 문서 삭제 (중복 방지)
    const existingDocs = await vectorDBService.getAllDocuments();
    const existingTeamDocIds = existingDocs
      .filter((doc) => doc.metadata?.teamDocsId === config.id)
      .map((doc) => doc.id);

    if (existingTeamDocIds.length > 0) {
      console.log(
        `[TeamDocs] Removing ${existingTeamDocIds.length} existing documents from team ${config.name}`
      );
      await vectorDBService.delete(existingTeamDocIds);
    }

    // VectorDB에 문서 저장 (docGroup='team' 메타데이터 추가)
    const documentsToIndex = result.documents.map((doc) => ({
      id: `team_${config.id}_${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}`,
      content: doc.content,
      metadata: {
        ...doc.metadata,
        docGroup: 'team',
        teamDocsId: config.id,
        teamName: config.name,
        source: `${config.owner}/${config.repo}`,
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

    return {
      success: true,
      message: `${indexedCount}개의 팀 문서를 동기화했습니다.`,
      data: {
        totalDocuments: result.documents.length,
        indexedDocuments: indexedCount,
      },
    };
  } catch (error: any) {
    console.error(`[TeamDocs] Failed to sync ${config.name}:`, error);
    return {
      success: false,
      message: '팀 문서 동기화 실패',
      error: error.message,
    };
  }
}

export function setupTeamDocsHandlers() {
  /**
   * Team Docs 문서 Push (GitHub에 업로드)
   */
  ipcMain.handle(
    'team-docs-push-document',
    async (
      _event,
      params: {
        teamDocsId: string;
        githubPath: string;
        title: string;
        content: string;
        metadata?: Record<string, any>;
        sha?: string;
        commitMessage?: string;
      }
    ) => {
      try {
        // Team Docs 설정 찾기
        const appConfigStr = databaseService.getSetting('app_config');
        if (!appConfigStr) {
          throw new Error('설정을 찾을 수 없습니다.');
        }

        const appConfig: AppConfig = JSON.parse(appConfigStr);
        const teamDocs = appConfig.teamDocs || [];
        const config = teamDocs.find((td) => td.id === params.teamDocsId);

        if (!config) {
          throw new Error(`Team Docs 설정을 찾을 수 없습니다: ${params.teamDocsId}`);
        }

        // GitHub 클라이언트 생성
        const syncConfig = toGitHubSyncConfig(applyNetworkConfig(config));
        const client = new GitHubSyncClient(syncConfig);

        // 문서 Push
        const result = await client.pushDocument(
          {
            githubPath: params.githubPath,
            title: params.title,
            content: params.content,
            metadata: params.metadata,
            sha: params.sha,
          },
          params.commitMessage
        );

        if (!result.success) {
          return result;
        }

        // Push 성공 시 로컬 VectorDB 메타데이터 업데이트
        const allDocs = await vectorDBService.getAllDocuments();
        const docToUpdate = allDocs.find(
          (doc) =>
            doc.metadata?.teamDocsId === params.teamDocsId &&
            doc.metadata?.githubPath === params.githubPath
        );

        if (docToUpdate) {
          await vectorDBService.updateMetadata(docToUpdate.id, {
            ...docToUpdate.metadata,
            githubSha: result.sha,
            modifiedLocally: false,
            lastPushedAt: Date.now(),
          });
        }

        return {
          success: true,
          message: result.message,
          data: { sha: result.sha },
        };
      } catch (error: any) {
        console.error('[TeamDocs] Failed to push document:', error);
        return {
          success: false,
          message: '문서 Push 실패',
          error: error.message,
        };
      }
    }
  );

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
      // 공통 동기화 로직 사용
      const result = await syncTeamDocsInternal(config);

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
              lastSyncStatus: result.success ? ('success' as const) : ('error' as const),
              lastSyncError: result.success ? undefined : result.error,
            };
          }
          return td;
        });

        appConfig.teamDocs = updatedTeamDocs;
        databaseService.updateSetting('app_config', JSON.stringify(appConfig));
      }

      return result;
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
          data: { totalSynced: 0, results: [] },
        };
      }

      const results = [];
      let totalSynced = 0;

      // 각 활성화된 팀 문서를 순차적으로 동기화
      for (const config of enabledTeamDocs) {
        try {
          // 공통 동기화 함수 사용
          const result = await syncTeamDocsInternal(config);

          results.push({ teamName: config.name, ...result });
          if (result.success && result.data) {
            totalSynced += result.data.indexedDocuments;
          }

          // 각 설정의 동기화 상태 업데이트
          const updatedTeamDocs = teamDocs.map((td) => {
            if (td.id === config.id) {
              return {
                ...td,
                lastSyncAt: Date.now(),
                lastSyncStatus: result.success ? ('success' as const) : ('error' as const),
                lastSyncError: result.success ? undefined : result.error,
              };
            }
            return td;
          });

          appConfig.teamDocs = updatedTeamDocs;
          databaseService.updateSetting('app_config', JSON.stringify(appConfig));
        } catch (error: any) {
          console.error(`[TeamDocs] Failed to sync ${config.name}:`, error);
          results.push({
            teamName: config.name,
            success: false,
            message: error.message,
          });

          // 에러 상태 기록
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
      }

      const allSuccess = results.every((r) => r.success);

      return {
        success: allSuccess,
        message: allSuccess
          ? `${totalSynced}개의 팀 문서를 동기화했습니다.`
          : `일부 동기화 실패 (성공: ${results.filter((r) => r.success).length}/${results.length})`,
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
