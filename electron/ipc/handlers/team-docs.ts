/**
 * Team Docs IPC Handlers
 * 여러 GitHub Repo에서 Team 문서를 동기화하는 핸들러
 */

import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
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
    indexedDocuments?: number;
    addedDocuments: number;
    updatedDocuments: number;
    deletedDocuments: number;
  };
  error?: string;
}> {
  try {
    const syncConfig = toGitHubSyncConfig(applyNetworkConfig(config));
    const client = new GitHubSyncClient(syncConfig);

    // GitHub에서 문서 가져오기 (docsPath 전달)
    const result = await client.pullDocuments(config.docsPath || 'sepilot/documents');

    if (!result.success) {
      throw new Error(result.error || '문서 가져오기 실패');
    }

    // 증분 동기화: 기존 문서와 비교하여 처리
    const existingDocs = await vectorDBService.getAllDocuments();
    const existingTeamDocs = existingDocs.filter((doc) => doc.metadata?.teamDocsId === config.id);

    // githubPath 또는 title로 매핑
    const existingDocsMap = new Map<string, any>();
    for (const doc of existingTeamDocs) {
      const key = doc.metadata?.githubPath || doc.metadata?.title;
      if (key) {
        existingDocsMap.set(key, doc);
      }
    }

    const documentsToIndex: any[] = [];
    const documentsToUpdate: any[] = [];
    const documentsToDelete: string[] = [];

    // Pull한 문서들 처리
    const pulledPaths = new Set<string>();
    for (const doc of result.documents) {
      const key = doc.metadata.githubPath || doc.metadata.title;
      pulledPaths.add(key);

      const existing = existingDocsMap.get(key);

      if (existing) {
        // 기존 문서가 있는 경우
        if (existing.metadata?.modifiedLocally) {
          // 로컬에서 수정된 문서는 건너뜀 (충돌 방지)
          console.log(
            `[TeamDocs] Skipping ${key} - modified locally (use Push to sync local changes)`
          );
          continue;
        }

        // SHA 비교로 실제 변경 여부 확인
        if (existing.metadata?.githubSha === doc.metadata.githubSha) {
          // 변경 없음 - 건너뜀
          continue;
        }

        // 변경됨 - 업데이트
        documentsToUpdate.push({
          id: existing.id,
          content: doc.content,
          metadata: {
            ...existing.metadata,
            ...doc.metadata,
            docGroup: 'team',
            teamDocsId: config.id,
            teamName: config.name,
            source: `${config.owner}/${config.repo}`,
            modifiedLocally: false,
          },
        });
      } else {
        // 새 문서 - 추가
        const newDoc = {
          id: `team_${config.id}_${randomUUID()}`,
          content: doc.content,
          metadata: {
            ...doc.metadata,
            docGroup: 'team',
            teamDocsId: config.id,
            teamName: config.name,
            source: `${config.owner}/${config.repo}`,
          },
        };
        documentsToIndex.push(newDoc);
        console.log(
          `[TeamDocs] Adding new document: ${(newDoc.metadata as any).title}, docGroup=${(newDoc.metadata as any).docGroup}`
        );
      }
    }

    // GitHub에서 삭제된 문서 찾기
    for (const [key, doc] of existingDocsMap.entries()) {
      if (!pulledPaths.has(key) && !doc.metadata?.modifiedLocally) {
        // GitHub에 없고 로컬에서 수정되지 않은 문서는 삭제
        documentsToDelete.push(doc.id);
      }
    }

    // 삭제할 문서 처리
    if (documentsToDelete.length > 0) {
      console.log(
        `[TeamDocs] Deleting ${documentsToDelete.length} documents from team ${config.name}`
      );
      await vectorDBService.delete(documentsToDelete);
    }

    // 업데이트할 문서 처리
    for (const doc of documentsToUpdate) {
      await vectorDBService.delete([doc.id]); // 기존 문서 삭제
      documentsToIndex.push(doc); // 새로 인덱싱할 목록에 추가
    }

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
    if (documentsToIndex.length > 0) {
      console.log(
        `[TeamDocs] Indexing ${documentsToIndex.length} documents to VectorDB for team '${config.name}'`
      );
      console.log(
        `[TeamDocs] Sample docGroups: ${documentsToIndex
          .slice(0, 3)
          .map((d) => `${d.metadata.title}:${d.metadata.docGroup}`)
          .join(', ')}`
      );

      // 앱 설정에서 청킹 전략 가져오기 (없으면 2025 best practice 기본값)
      const appConfigStr = databaseService.getSetting('app_config');
      let chunkConfig = {
        chunkSize: 1000, // ~250 tokens (2025 권장: 500-1000 characters)
        chunkOverlap: 150, // 15% overlap (2025 best practice)
        batchSize: 10,
        storeParentDocument: true, // Parent Document Retrieval 활성화
      };

      if (appConfigStr) {
        const appConfig = JSON.parse(appConfigStr);
        if (appConfig.vectorDB?.chunkSize) {
          chunkConfig.chunkSize = appConfig.vectorDB.chunkSize;
        }
        if (appConfig.vectorDB?.chunkOverlap) {
          chunkConfig.chunkOverlap = appConfig.vectorDB.chunkOverlap;
        }
      }

      // overlap이 chunkSize보다 크지 않도록 보정
      if (chunkConfig.chunkOverlap >= chunkConfig.chunkSize) {
        chunkConfig.chunkOverlap = Math.floor(chunkConfig.chunkSize * 0.15); // 15%로 자동 조정
      }

      await vectorDBService.indexDocuments(documentsToIndex, chunkConfig);
    }

    const addedCount = documentsToIndex.length - documentsToUpdate.length;
    const updatedCount = documentsToUpdate.length;
    const deletedCount = documentsToDelete.length;

    const messageParts: string[] = [];
    if (addedCount > 0) messageParts.push(`추가 ${addedCount}개`);
    if (updatedCount > 0) messageParts.push(`업데이트 ${updatedCount}개`);
    if (deletedCount > 0) messageParts.push(`삭제 ${deletedCount}개`);

    const message =
      messageParts.length > 0
        ? `동기화 완료: ${messageParts.join(', ')}`
        : '변경 사항 없음 (모든 문서가 최신 상태)';

    return {
      success: true,
      message,
      data: {
        totalDocuments: result.documents.length,
        addedDocuments: addedCount,
        updatedDocuments: updatedCount,
        deletedDocuments: deletedCount,
      },
    };
  } catch (error: any) {
    console.error(`[TeamDocs] Failed to sync ${config.name}:`, error);

    // 사용자 친화적 에러 메시지
    let userMessage = '팀 문서 동기화 실패';
    if (error.message?.includes('404') || error.message?.includes('not found')) {
      userMessage = 'GitHub 레포지토리를 찾을 수 없습니다. Repository URL과 경로를 확인하세요.';
    } else if (error.message?.includes('401') || error.message?.includes('Bad credentials')) {
      userMessage = 'GitHub 인증 실패. Token이 유효한지 확인하세요.';
    } else if (error.message?.includes('403') || error.message?.includes('rate limit')) {
      userMessage = 'GitHub API 접근 제한. 잠시 후 다시 시도하거나 Token을 확인하세요.';
    } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('network')) {
      userMessage = '네트워크 연결 오류. 인터넷 연결 및 프록시 설정을 확인하세요.';
    } else if (error.message?.includes('ETIMEDOUT') || error.message?.includes('timeout')) {
      userMessage = '연결 시간 초과. 네트워크 상태를 확인하세요.';
    }

    return {
      success: false,
      message: userMessage,
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
   * Team Docs 문서 Push (전체 동기화)
   */
  ipcMain.handle('team-docs-push-documents', async (_event, config: TeamDocsConfig) => {
    try {
      // VectorDB에서 해당 Team의 문서만 가져오기
      const allDocs = await vectorDBService.getAllDocuments();
      const teamDocs = allDocs.filter((doc) => doc.metadata?.teamDocsId === config.id);

      if (teamDocs.length === 0) {
        return {
          success: true,
          message: 'Push할 문서가 없습니다.',
        };
      }

      // GitHub 클라이언트 생성
      const syncConfig = toGitHubSyncConfig(applyNetworkConfig(config));
      const client = new GitHubSyncClient(syncConfig);

      // 각 문서를 GitHub에 Push
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const doc of teamDocs) {
        try {
          const githubPath =
            doc.metadata?.githubPath ||
            `${config.docsPath || 'sepilot/documents'}/${doc.metadata?.title || doc.id}.md`;

          const result = await client.pushDocument(
            {
              githubPath,
              title: doc.metadata?.title || 'Untitled',
              content: doc.content,
              metadata: doc.metadata,
              sha: doc.metadata?.githubSha,
            },
            `Update ${doc.metadata?.title || 'document'} from SEPilot`
          );

          if (result.success) {
            successCount++;
            // 로컬 메타데이터 업데이트
            await vectorDBService.updateMetadata(doc.id, {
              ...doc.metadata,
              githubSha: result.sha,
              modifiedLocally: false,
              lastPushedAt: Date.now(),
            });
          } else {
            errorCount++;
            errors.push(`${doc.metadata?.title || doc.id}: ${result.error}`);
          }
        } catch (error: any) {
          errorCount++;
          errors.push(`${doc.metadata?.title || doc.id}: ${error.message}`);
        }
      }

      return {
        success: errorCount === 0,
        message:
          errorCount === 0
            ? `${successCount}개의 문서를 GitHub에 Push했습니다.`
            : `일부 Push 실패: 성공 ${successCount}개, 실패 ${errorCount}개`,
        error: errors.length > 0 ? errors.join('\n') : undefined,
      };
    } catch (error: any) {
      console.error('[TeamDocs] Failed to push documents:', error);

      // 사용자 친화적 에러 메시지
      let userMessage = '문서 Push 실패';
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        userMessage = 'GitHub 레포지토리를 찾을 수 없습니다. Repository URL을 확인하세요.';
      } else if (error.message?.includes('401') || error.message?.includes('Bad credentials')) {
        userMessage = 'GitHub 인증 실패. Token이 유효한지 확인하세요.';
      } else if (error.message?.includes('403')) {
        userMessage = 'GitHub 접근 권한 없음. Token에 write 권한이 있는지 확인하세요.';
      } else if (error.message?.includes('CONFLICT') || error.message?.includes('409')) {
        userMessage = '문서 충돌 감지. 먼저 Pull하여 최신 상태로 동기화하세요.';
      } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('network')) {
        userMessage = '네트워크 연결 오류. 인터넷 연결을 확인하세요.';
      }

      return {
        success: false,
        message: userMessage,
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
