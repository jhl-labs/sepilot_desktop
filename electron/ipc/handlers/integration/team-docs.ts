/**
 * Team Docs IPC Handlers
 * 여러 GitHub Repo에서 Team 문서를 동기화하는 핸들러
 */

import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { GitHubSyncClient } from '@/lib/domains/integration/github/client';
import type { TeamDocsConfig, AppConfig, GitHubSyncConfig } from '@/types';
import type { VectorDocument } from '@/lib/domains/rag/types';
import { databaseService } from '../../../services/database';
import { vectorDBService } from '../../../services/vectordb';
import { loadAppConfig, loadRawAppConfig } from '../../../services/secure-config';

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

const DEFAULT_TEAM_DOCS_PATH = 'sepilot/documents';

type TeamDocGroup = {
  originalId: string;
  rows: VectorDocument[];
  rowIds: string[];
  representative: VectorDocument;
  mergedContent: string;
};

function normalizeGitHubPath(path: string, allowEmpty: boolean = false): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').trim();

  if (!normalized) {
    if (allowEmpty) {
      return '';
    }
    throw new Error('Invalid empty path');
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Invalid path segment in "${path}"`);
  }

  return normalized;
}

function normalizeDocsRootPath(path?: string): string {
  if (typeof path !== 'string' || path.trim() === '') {
    return normalizeGitHubPath(DEFAULT_TEAM_DOCS_PATH);
  }
  return normalizeGitHubPath(path, true);
}

function joinDocsRootAndPath(docsRoot: string, relativePath: string): string {
  if (!docsRoot) {
    return relativePath;
  }
  return `${docsRoot}/${relativePath}`;
}

function sanitizeFilenameBase(filename: string): string {
  const sanitized = filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized || 'Untitled';
}

function normalizeFolderPath(folderPath: string, docsRoot: string): string {
  const normalizedFolder = normalizeGitHubPath(folderPath, true);
  if (!normalizedFolder) {
    return '';
  }
  if (!docsRoot) {
    return normalizedFolder;
  }
  if (normalizedFolder === docsRoot) {
    return '';
  }
  if (normalizedFolder.startsWith(`${docsRoot}/`)) {
    return normalizedFolder.slice(docsRoot.length + 1);
  }
  return normalizedFolder;
}

function buildTeamGithubPath(params: {
  docsPath?: string;
  githubPath?: string;
  folderPath?: unknown;
  title?: string;
}): string {
  const docsRoot = normalizeDocsRootPath(params.docsPath);

  if (typeof params.githubPath === 'string' && params.githubPath.trim()) {
    const normalizedGithubPath = normalizeGitHubPath(params.githubPath);
    if (!docsRoot) {
      return normalizedGithubPath;
    }
    if (normalizedGithubPath === docsRoot || normalizedGithubPath.startsWith(`${docsRoot}/`)) {
      return normalizedGithubPath;
    }
    return joinDocsRootAndPath(docsRoot, normalizedGithubPath);
  }

  const folderPath =
    typeof params.folderPath === 'string' ? normalizeFolderPath(params.folderPath, docsRoot) : '';
  let titleBase = sanitizeFilenameBase((params.title || 'Untitled').trim());
  if (titleBase.toLowerCase().endsWith('.md')) {
    titleBase = titleBase.slice(0, -3).trim() || 'Untitled';
  }

  const filename = `${titleBase}.md`;
  const relativePath = folderPath ? `${folderPath}/${filename}` : filename;
  return joinDocsRootAndPath(docsRoot, relativePath);
}

function getOriginalDocumentId(doc: VectorDocument): string {
  const originalId = doc.metadata?.originalId;
  if (typeof originalId === 'string' && originalId.trim()) {
    return originalId;
  }
  return doc.id;
}

function getMergedGroupContent(rows: VectorDocument[]): string {
  const parentDoc = rows.find((row) => row.metadata?.isParentDoc);
  if (parentDoc) {
    return parentDoc.content;
  }

  const chunkRows = rows
    .filter((row) => typeof row.metadata?.chunkIndex === 'number')
    .sort((a, b) => {
      const aIndex = (a.metadata?.chunkIndex as number) || 0;
      const bIndex = (b.metadata?.chunkIndex as number) || 0;
      return aIndex - bIndex;
    });

  if (chunkRows.length > 0) {
    return chunkRows.map((row) => row.content).join('\n');
  }

  return rows[0]?.content || '';
}

function getRepresentativeRow(rows: VectorDocument[]): VectorDocument {
  if (rows.length === 0) {
    throw new Error('Cannot select representative row from empty group');
  }

  const chunkZero = rows.find(
    (row) => !row.metadata?.isParentDoc && (row.metadata?.chunkIndex as number) === 0
  );
  if (chunkZero) {
    return chunkZero;
  }

  const nonParent = rows.find((row) => !row.metadata?.isParentDoc);
  return nonParent || rows[0];
}

function buildTeamDocGroups(
  documents: VectorDocument[],
  teamDocsId: string
): Map<string, TeamDocGroup> {
  const groupedRows = new Map<string, VectorDocument[]>();

  for (const doc of documents) {
    if (doc.metadata?.teamDocsId !== teamDocsId) {
      continue;
    }
    const originalId = getOriginalDocumentId(doc);
    const existingRows = groupedRows.get(originalId) || [];
    existingRows.push(doc);
    groupedRows.set(originalId, existingRows);
  }

  const groups = new Map<string, TeamDocGroup>();
  for (const [originalId, rows] of groupedRows.entries()) {
    const representative = getRepresentativeRow(rows);
    groups.set(originalId, {
      originalId,
      rows,
      rowIds: rows.map((row) => row.id),
      representative,
      mergedContent: getMergedGroupContent(rows),
    });
  }

  return groups;
}

function getDocumentIdentityKey(
  metadata: Record<string, any> | undefined,
  docsPath: string
): string | undefined {
  if (!metadata) {
    return undefined;
  }

  const rawGithubPath = metadata.githubPath;
  if (typeof rawGithubPath === 'string' && rawGithubPath.trim()) {
    try {
      const normalizedPath = normalizeGitHubPath(rawGithubPath);
      if (!docsPath) {
        return normalizedPath;
      }
      if (normalizedPath === docsPath || normalizedPath.startsWith(`${docsPath}/`)) {
        return normalizedPath;
      }
      return joinDocsRootAndPath(docsPath, normalizedPath);
    } catch (error) {
      console.warn('[team-docs] Failed to normalize githubPath, falling back to title:', error);
    }
  }

  const title = metadata.title;
  if (typeof title === 'string' && title.trim()) {
    return title.trim();
  }

  return undefined;
}

async function updateTeamDocGroupMetadata(
  group: TeamDocGroup,
  metadataPatch: Record<string, any>
): Promise<void> {
  for (const row of group.rows) {
    await vectorDBService.updateMetadata(row.id, {
      ...row.metadata,
      ...metadataPatch,
    });
  }
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
    console.log('[team-docs-sync] Starting sync for:', config.name, config.id);
    console.log('[team-docs-sync] Config:', {
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      docsPath: config.docsPath,
    });

    const syncConfig = toGitHubSyncConfig(applyNetworkConfig(config));
    const client = new GitHubSyncClient(syncConfig);

    // GitHub에서 문서 가져오기 (docsPath 전달)
    const docsPath = normalizeDocsRootPath(config.docsPath);
    console.log('[team-docs-sync] Pulling documents from:', docsPath);
    const result = await client.pullDocuments(docsPath);

    if (!result.success) {
      console.error('[team-docs-sync] Pull failed:', result.error);
      throw new Error(result.error || '문서 가져오기 실패');
    }

    console.log('[team-docs-sync] Pulled documents:', result.documents.length);

    // 증분 동기화: 기존 문서를 원본 문서 단위로 그룹화하여 비교
    const existingDocs = await vectorDBService.getAllDocuments();
    console.log('[team-docs-sync] Total existing documents:', existingDocs.length);

    const existingGroups = buildTeamDocGroups(existingDocs, config.id);
    console.log('[team-docs-sync] Existing team docs (grouped):', existingGroups.size);

    const existingDocsMap = new Map<string, TeamDocGroup>();
    for (const group of existingGroups.values()) {
      const key = getDocumentIdentityKey(
        group.representative.metadata as Record<string, any>,
        docsPath
      );
      if (!key) {
        continue;
      }
      if (existingDocsMap.has(key)) {
        console.warn(
          `[team-docs-sync] Duplicate key "${key}" found. Keeping latest group: ${group.originalId}`
        );
      }
      existingDocsMap.set(key, group);
    }
    console.log('[team-docs-sync] Existing docs map size:', existingDocsMap.size);

    const documentsToIndex: Array<{ id: string; content: string; metadata: Record<string, any> }> =
      [];
    const documentsToUpdate: Array<{
      originalId: string;
      rowIds: string[];
      content: string;
      metadata: Record<string, any>;
    }> = [];
    const rowsToDelete = new Set<string>();
    let deletedDocumentCount = 0;
    let addedDocumentCount = 0;

    // Pull한 문서들 처리
    const pulledPaths = new Set<string>();
    for (const doc of result.documents) {
      const normalizedGithubPath = buildTeamGithubPath({
        docsPath,
        githubPath: doc.metadata?.githubPath as string | undefined,
        folderPath: doc.metadata?.folderPath,
        title: doc.title || (doc.metadata?.title as string),
      });

      const key =
        getDocumentIdentityKey(
          {
            ...doc.metadata,
            githubPath: normalizedGithubPath,
            title: doc.title || (doc.metadata?.title as string),
          },
          docsPath
        ) || normalizedGithubPath;
      pulledPaths.add(key);

      const existingGroup = existingDocsMap.get(key);
      const normalizedMetadata: Record<string, any> = {
        ...doc.metadata,
        title: doc.title || (doc.metadata?.title as string) || 'Untitled',
        githubPath: normalizedGithubPath,
        docGroup: 'team',
        teamDocsId: config.id,
        teamName: config.name,
        source: `${config.owner}/${config.repo}`,
        modifiedLocally: false,
      };

      if (existingGroup) {
        // 기존 문서가 있는 경우
        if (existingGroup.representative.metadata?.modifiedLocally) {
          // 로컬에서 수정된 문서는 건너뜀 (충돌 방지)
          console.log(
            `[TeamDocs] Skipping ${key} - modified locally (use Push to sync local changes)`
          );
          continue;
        }

        // SHA 비교로 실제 변경 여부 확인
        if (existingGroup.representative.metadata?.githubSha === normalizedMetadata.githubSha) {
          // 변경 없음 - 건너뜀
          continue;
        }

        // 변경됨 - 업데이트 (기존 row 전체 교체)
        documentsToUpdate.push({
          originalId: existingGroup.originalId,
          rowIds: existingGroup.rowIds,
          content: doc.content,
          metadata: {
            ...existingGroup.representative.metadata,
            ...normalizedMetadata,
          },
        });
      } else {
        // 새 문서 - 추가
        const newDoc = {
          id: `team_${config.id}_${randomUUID()}`,
          content: doc.content,
          metadata: normalizedMetadata,
        };
        documentsToIndex.push(newDoc);
        addedDocumentCount++;
        console.log(
          `[TeamDocs] Adding new document: ${(newDoc.metadata as any).title}, docGroup=${(newDoc.metadata as any).docGroup}`
        );
      }
    }

    // GitHub에서 삭제된 문서 찾기 (로컬 수정 문서는 보존)
    for (const [key, group] of existingDocsMap.entries()) {
      if (!pulledPaths.has(key) && !group.representative.metadata?.modifiedLocally) {
        deletedDocumentCount++;
        for (const rowId of group.rowIds) {
          rowsToDelete.add(rowId);
        }
      }
    }

    // 업데이트 문서는 기존 row를 모두 삭제 후 재인덱싱
    for (const doc of documentsToUpdate) {
      for (const rowId of doc.rowIds) {
        rowsToDelete.add(rowId);
      }
      documentsToIndex.push({
        id: doc.originalId,
        content: doc.content,
        metadata: doc.metadata,
      });
    }

    if (rowsToDelete.size > 0) {
      console.log(
        `[TeamDocs] Deleting ${rowsToDelete.size} rows for ${deletedDocumentCount} removed documents from team ${config.name}`
      );
      await vectorDBService.delete(Array.from(rowsToDelete));
    }

    // 임베딩 설정 로드
    const { initializeEmbedding } = await import('@/lib/domains/rag/embeddings/client');
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

    const addedCount = addedDocumentCount;
    const updatedCount = documentsToUpdate.length;
    const deletedCount = deletedDocumentCount;

    console.log('[team-docs-sync] Sync summary:', {
      added: addedCount,
      updated: updatedCount,
      deleted: deletedCount,
      total: result.documents.length,
    });

    const messageParts: string[] = [];
    if (addedCount > 0) messageParts.push(`추가 ${addedCount}개`);
    if (updatedCount > 0) messageParts.push(`업데이트 ${updatedCount}개`);
    if (deletedCount > 0) messageParts.push(`삭제 ${deletedCount}개`);

    const message =
      messageParts.length > 0
        ? `동기화 완료: ${messageParts.join(', ')}`
        : '변경 사항 없음 (모든 문서가 최신 상태)';

    console.log('[team-docs-sync] Sync completed successfully:', message);

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
        documentId?: string;
        githubPath: string;
        oldGithubPath?: string; // 파일명 변경 감지용
        title: string;
        content: string;
        metadata?: Record<string, any>;
        sha?: string;
        commitMessage?: string;
      }
    ) => {
      try {
        // Team Docs 설정 찾기
        const appConfig = await loadAppConfig({ includeTokens: true });
        if (!appConfig) {
          throw new Error('설정을 찾을 수 없습니다.');
        }
        const teamDocs = appConfig.teamDocs || [];
        const config = teamDocs.find((td) => td.id === params.teamDocsId);

        if (!config) {
          throw new Error(`Team Docs 설정을 찾을 수 없습니다: ${params.teamDocsId}`);
        }

        // GitHub 클라이언트 생성
        const syncConfig = toGitHubSyncConfig(applyNetworkConfig(config));
        const client = new GitHubSyncClient(syncConfig);

        const docsPath = normalizeDocsRootPath(config.docsPath);

        // githubPath 검증 및 생성 (docsPath 기준 강제)
        const githubPath = buildTeamGithubPath({
          docsPath,
          githubPath: params.githubPath,
          folderPath: params.metadata?.folderPath,
          title: params.title,
        });
        let oldGithubPath: string | undefined;
        if (typeof params.oldGithubPath === 'string' && params.oldGithubPath.trim().length > 0) {
          try {
            oldGithubPath = normalizeGitHubPath(params.oldGithubPath);
          } catch (error) {
            console.warn(
              `[team-docs-push-document] Invalid oldGithubPath "${params.oldGithubPath}", skipping old file deletion`,
              error
            );
          }
        }

        console.log('[team-docs-push-document] Pushing document:', {
          teamDocsId: params.teamDocsId,
          documentId: params.documentId,
          title: params.title,
          githubPath,
          oldGithubPath,
          folderPath: params.metadata?.folderPath,
        });

        // 파일명이 변경된 경우 이전 파일 삭제
        if (oldGithubPath && oldGithubPath !== githubPath) {
          console.log(`[team-docs-push-document] File renamed: ${oldGithubPath} -> ${githubPath}`);
          const deleteResult = await client.deleteFile(
            oldGithubPath,
            `Delete old file ${oldGithubPath} (renamed to ${githubPath})`
          );
          if (deleteResult.success) {
            console.log(
              `[team-docs-push-document] Successfully deleted old file: ${oldGithubPath}`
            );
          } else {
            console.warn(
              `[team-docs-push-document] Failed to delete old file: ${deleteResult.error}`
            );
            // 삭제 실패해도 계속 진행 (파일이 이미 없을 수 있음)
          }
        }

        // 문서 Push
        const isRenamed = !!oldGithubPath && oldGithubPath !== githubPath;
        const result = await client.pushDocument(
          {
            githubPath,
            title: params.title,
            content: params.content,
            metadata: params.metadata,
            // 파일명이 바뀐 경우만 새 파일로 간주하여 sha를 제거하고, 그 외에는 충돌 감지를 위해 전달
            sha: isRenamed ? undefined : params.sha,
          },
          params.commitMessage
        );

        if (!result.success) {
          return result;
        }

        // Push 성공 시 로컬 VectorDB 메타데이터를 문서 전체 row에 반영
        const allDocs = await vectorDBService.getAllDocuments();
        const groupedDocs = buildTeamDocGroups(allDocs, params.teamDocsId);
        let targetGroup: TeamDocGroup | undefined;

        if (params.documentId && groupedDocs.has(params.documentId)) {
          targetGroup = groupedDocs.get(params.documentId);
        }

        if (!targetGroup) {
          const targetKey = getDocumentIdentityKey({ githubPath, title: params.title }, docsPath);
          if (targetKey) {
            for (const group of groupedDocs.values()) {
              const key = getDocumentIdentityKey(
                group.representative.metadata as Record<string, any>,
                docsPath
              );
              if (key === targetKey) {
                targetGroup = group;
                break;
              }
            }
          }
        }

        if (targetGroup) {
          await updateTeamDocGroupMetadata(targetGroup, {
            ...params.metadata,
            title: params.title,
            githubPath,
            githubSha: result.sha,
            modifiedLocally: false,
            lastPushedAt: Date.now(),
            teamDocsId: params.teamDocsId,
            teamName: config.name,
            source: `${config.owner}/${config.repo}`,
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
      const docsPath = normalizeDocsRootPath(config.docsPath);

      // VectorDB에서 해당 Team의 문서를 원본 문서 단위로 그룹화
      const allDocs = await vectorDBService.getAllDocuments();
      console.log('[team-docs-push] Total documents:', allDocs.length);
      console.log('[team-docs-push] Looking for teamDocsId:', config.id);
      console.log('[team-docs-push] Available teamDocsIds:', [
        ...new Set(allDocs.map((doc) => doc.metadata?.teamDocsId).filter(Boolean)),
      ]);

      const teamDocGroups = buildTeamDocGroups(allDocs, config.id);
      console.log('[team-docs-push] Found grouped documents for this team:', teamDocGroups.size);

      if (teamDocGroups.size === 0) {
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

      for (const group of teamDocGroups.values()) {
        try {
          const representative = group.representative;
          const title = (representative.metadata?.title as string) || 'Untitled';
          let existingGithubPath: string | undefined;
          if (
            typeof representative.metadata?.githubPath === 'string' &&
            representative.metadata.githubPath.trim().length > 0
          ) {
            try {
              existingGithubPath = normalizeGitHubPath(
                representative.metadata.githubPath as string
              );
            } catch (error) {
              console.warn(
                `[team-docs-push] Invalid existing githubPath "${representative.metadata.githubPath}", fallback to generated path`,
                error
              );
            }
          }

          // 로컬 수정 시 folder/title 기반으로 재계산하여 path drift를 방지
          const githubPath = buildTeamGithubPath({
            docsPath,
            githubPath: representative.metadata?.modifiedLocally ? undefined : existingGithubPath,
            folderPath: representative.metadata?.folderPath,
            title,
          });
          const isRenamed = !!existingGithubPath && existingGithubPath !== githubPath;
          const shaForPush = isRenamed
            ? undefined
            : (representative.metadata?.githubSha as string | undefined);

          // rename 감지 시 이전 path 정리 (실패해도 push 계속)
          if (isRenamed) {
            const deleteResult = await client.deleteFile(
              existingGithubPath!,
              `Delete old file ${existingGithubPath} (renamed to ${githubPath})`
            );
            if (!deleteResult.success) {
              console.warn(
                `[team-docs-push] Failed to delete old file ${existingGithubPath}: ${deleteResult.error}`
              );
            }
          }

          console.log('[team-docs-push] Pushing document:', {
            id: group.originalId,
            title,
            githubPath,
            folderPath: representative.metadata?.folderPath,
            chunkRows: group.rowIds.length,
          });

          const result = await client.pushDocument(
            {
              githubPath,
              title,
              content: group.mergedContent,
              metadata: representative.metadata,
              sha: shaForPush,
            },
            `Update ${title} from SEPilot`
          );

          if (result.success) {
            successCount++;
            // 로컬 문서 전체 row 메타데이터 업데이트
            await updateTeamDocGroupMetadata(group, {
              githubSha: result.sha,
              githubPath,
              modifiedLocally: false,
              lastPushedAt: Date.now(),
              teamDocsId: config.id,
              teamName: config.name,
              source: `${config.owner}/${config.repo}`,
            });
          } else {
            errorCount++;
            errors.push(`${title}: ${result.error}`);
          }
        } catch (error: any) {
          errorCount++;
          errors.push(
            `${group.representative.metadata?.title || group.originalId}: ${error.message}`
          );
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
      const rawAppConfig = loadRawAppConfig();
      if (!rawAppConfig) {
        throw new Error('설정을 찾을 수 없습니다.');
      }
      const appConfigWithTokens = await loadAppConfig({ includeTokens: true });
      const teamDocs = rawAppConfig.teamDocs || [];
      const tokenMap = new Map(
        (appConfigWithTokens?.teamDocs || []).map((td) => [td.id, td.token || ''])
      );
      const enabledTeamDocs = teamDocs
        .filter((td) => td.enabled)
        .map((td) => ({
          ...td,
          token: tokenMap.get(td.id) || '',
        }));

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
            totalSynced += result.data.totalDocuments ?? 0;
          }

          // 각 설정의 동기화 상태 업데이트
          const updatedTeamDocs = (rawAppConfig.teamDocs || []).map((td) => {
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

          rawAppConfig.teamDocs = updatedTeamDocs;
          databaseService.updateSetting('app_config', JSON.stringify(rawAppConfig));
        } catch (error: any) {
          console.error(`[TeamDocs] Failed to sync ${config.name}:`, error);
          results.push({
            teamName: config.name,
            success: false,
            message: error.message,
          });

          // 에러 상태 기록
          const updatedTeamDocs = (rawAppConfig.teamDocs || []).map((td) => {
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

          rawAppConfig.teamDocs = updatedTeamDocs;
          databaseService.updateSetting('app_config', JSON.stringify(rawAppConfig));
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
