/**
 * GitHub API Client for Sync Operations
 * GitHub REST API를 사용하여 파일을 읽고 쓰는 클라이언트
 */

import { Octokit } from '@octokit/rest';
import type { GitHubSyncConfig, AppConfig } from '@/types';
import { decryptData, encryptData } from './encryption';
import crypto from 'crypto';
import { createOctokitAgent } from '@/lib/http';

export interface GitHubFileContent {
  sha: string;
  content: string;
  encoding: 'base64';
}

export interface GitHubSyncResult {
  success: boolean;
  message: string;
  sha?: string;
  error?: string;
}

/**
 * GitHub 클라이언트 클래스
 */
export class GitHubSyncClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private branch: string;
  private initPromise: Promise<void>;
  private readonly sensitiveSettingFields = [
    'llm.apiKey',
    'llm.vision.apiKey',
    'llm.autocomplete.apiKey',
    'llm.connections.*.apiKey',
    'llm.connections.*.customHeaders.Authorization',
    'llm.connections.*.customHeaders.authorization',
    'llm.models.*.customHeaders.Authorization',
    'llm.models.*.customHeaders.authorization',
    'vectorDB.password',
    'vectorDB.connectionString',
    'embedding.apiKey',
    'comfyUI.apiKey',
    'imageGen.comfyui.apiKey',
    'imageGen.nanobanana.apiKey',
    'network.customHeaders.Authorization',
    'network.customHeaders.authorization',
  ];

  constructor(config: GitHubSyncConfig) {
    this.owner = config.owner;
    this.repo = config.repo;
    this.branch = config.branch || 'main';

    // GHES 지원: baseUrl 설정
    const baseUrl =
      config.serverType === 'ghes' && config.ghesUrl
        ? `${config.ghesUrl}/api/v3`
        : 'https://api.github.com';

    // 임시 Octokit 인스턴스 생성 (NetworkConfig 없이)
    this.octokit = new Octokit({
      auth: config.token,
      baseUrl,
    });

    // NetworkConfig 적용된 Octokit으로 비동기 교체
    this.initPromise = this.initializeOctokit(config.token, baseUrl, config.networkConfig);
  }

  /**
   * Octokit 초기화 (async - NetworkConfig 적용)
   */
  private async initializeOctokit(
    token: string,
    baseUrl: string,
    networkConfig: GitHubSyncConfig['networkConfig']
  ): Promise<void> {
    try {
      const requestOptions = await createOctokitAgent(networkConfig);

      this.octokit = new Octokit({
        auth: token,
        baseUrl,
        request: requestOptions,
      });
    } catch (error) {
      console.error('[GitHubSync] Failed to initialize Octokit with network config:', error);
      // Fallback은 이미 설정된 기본 octokit 사용
    }
  }

  /**
   * Octokit 초기화 완료 대기
   */
  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  /**
   * GitHub 경로 정규화 및 검증
   */
  private normalizeGitHubPath(path: string, allowEmpty: boolean = false): string {
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

  /**
   * 파일이 존재하는지 확인하고 내용을 가져옴
   */
  async getFile(path: string): Promise<GitHubFileContent | null> {
    await this.ensureInitialized();
    const safePath = this.normalizeGitHubPath(path);
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: safePath,
        ref: this.branch,
      });

      // 폴더가 아닌 파일만 처리
      if ('content' in data && data.type === 'file') {
        return {
          sha: data.sha,
          content: data.content,
          encoding: data.encoding as 'base64',
        };
      }

      return null;
    } catch (error: any) {
      if (error.status === 404) {
        return null; // 파일이 존재하지 않음
      }
      console.error(`[GitHubSync] Failed to get file ${safePath}:`, error);
      throw error;
    }
  }

  /**
   * 파일을 생성하거나 업데이트
   */
  async upsertFile(
    path: string,
    content: string,
    message: string,
    existingSha?: string
  ): Promise<GitHubSyncResult> {
    await this.ensureInitialized();
    const safePath = this.normalizeGitHubPath(path);
    try {
      // Base64 인코딩
      const encodedContent = Buffer.from(content, 'utf-8').toString('base64');

      // 기존 파일 확인
      const existingFile = await this.getFile(safePath);

      // existingSha가 제공된 경우, 낙관적 잠금으로 충돌 감지
      if (existingSha) {
        if (!existingFile) {
          return {
            success: false,
            message: `Conflict detected for ${safePath}`,
            error: 'CONFLICT',
          };
        }
        if (existingSha !== existingFile.sha) {
          return {
            success: false,
            message: `Conflict detected for ${safePath}`,
            error: 'CONFLICT',
          };
        }
      }

      // SHA 결정: 호출자가 제공한 SHA 우선, 없으면 remote SHA 사용
      const sha = existingSha ?? existingFile?.sha;

      const { data } = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: safePath,
        message,
        content: encodedContent,
        branch: this.branch,
        sha, // 업데이트 시 필요, 새 파일이면 undefined
      });

      return {
        success: true,
        message: `File ${safePath} synced successfully`,
        sha: data.content?.sha,
      };
    } catch (error: any) {
      console.error(`[GitHubSync] Failed to upsert file ${safePath}:`, error);
      if (error.status === 409 || error.message?.includes('does not match')) {
        return {
          success: false,
          message: `Conflict detected for ${safePath}`,
          error: 'CONFLICT',
        };
      }
      return {
        success: false,
        message: `Failed to sync file ${safePath}`,
        error: error.message,
      };
    }
  }

  /**
   * 파일 삭제
   */
  async deleteFile(path: string, message: string, sha?: string): Promise<GitHubSyncResult> {
    await this.ensureInitialized();
    const safePath = this.normalizeGitHubPath(path);
    try {
      // SHA가 제공되지 않으면 먼저 파일 정보를 가져옴
      let fileSha = sha;
      if (!fileSha) {
        const existingFile = await this.getFile(safePath);
        if (!existingFile) {
          return {
            success: true,
            message: `File ${safePath} does not exist`,
          };
        }
        fileSha = existingFile.sha;
      }

      await this.octokit.repos.deleteFile({
        owner: this.owner,
        repo: this.repo,
        path: safePath,
        message,
        branch: this.branch,
        sha: fileSha,
      });

      return {
        success: true,
        message: `File ${safePath} deleted successfully`,
      };
    } catch (error: any) {
      console.error(`[GitHubSync] Failed to delete file ${safePath}:`, error);
      return {
        success: false,
        message: `Failed to delete file ${safePath}`,
        error: error.message,
      };
    }
  }

  /**
   * 폴더 내 모든 파일 가져오기
   */
  async listFiles(path: string): Promise<string[]> {
    await this.ensureInitialized();
    const safePath = this.normalizeGitHubPath(path, true);
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: safePath,
        ref: this.branch,
      });

      if (Array.isArray(data)) {
        return data.filter((item: any) => item.type === 'file').map((item: any) => item.path);
      }

      return [];
    } catch (error: any) {
      if (error.status === 404) {
        return []; // 폴더가 존재하지 않음
      }
      console.error(`[GitHubSync] Failed to list files in ${safePath}:`, error);
      throw error;
    }
  }

  /**
   * 설정 동기화
   */
  async syncSettings(appConfig: AppConfig, masterKey: string): Promise<GitHubSyncResult> {
    try {
      // 설정 복사 및 민감 정보 암호화
      const encryptedConfig = this.transformNestedFields(
        JSON.parse(JSON.stringify(appConfig)),
        this.sensitiveSettingFields,
        masterKey,
        'encrypt'
      );

      // 토큰류는 GitHub에 동기화하지 않음
      if (encryptedConfig.githubSync) {
        encryptedConfig.githubSync.token = '[REDACTED]';
        encryptedConfig.githubSync.encryptionKey = '[REDACTED]';
      }
      if (Array.isArray(encryptedConfig.teamDocs)) {
        encryptedConfig.teamDocs = encryptedConfig.teamDocs.map((team: any) => ({
          ...team,
          token: '[REDACTED]',
        }));
      }

      const content = JSON.stringify(encryptedConfig, null, 2);
      return await this.upsertFile('sepilot/settings.json', content, 'chore: sync settings');
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync settings:', error);
      return {
        success: false,
        message: 'Failed to sync settings',
        error: error.message,
      };
    }
  }

  /**
   * GitHub에서 설정 Pull
   */
  async pullSettings(masterKeys: string[]): Promise<{
    success: boolean;
    message: string;
    config?: AppConfig;
    error?: string;
  }> {
    try {
      const file = await this.getFile('sepilot/settings.json');
      if (!file) {
        return {
          success: false,
          message: 'GitHub에 설정 파일이 없습니다.',
          error: 'SETTINGS_NOT_FOUND',
        };
      }

      const content = Buffer.from(file.content, 'base64').toString('utf-8');
      const parsed = JSON.parse(content);

      const candidates = masterKeys.filter((key) => typeof key === 'string' && key.length > 0);
      const decryptErrors: string[] = [];

      for (const key of candidates) {
        try {
          const decrypted = this.transformNestedFields(
            JSON.parse(JSON.stringify(parsed)),
            this.sensitiveSettingFields,
            key,
            'decrypt'
          ) as AppConfig;

          return {
            success: true,
            message: 'GitHub에서 설정을 가져왔습니다.',
            config: decrypted,
          };
        } catch (error: any) {
          decryptErrors.push(error.message || String(error));
        }
      }

      return {
        success: false,
        message: '설정 복호화 실패',
        error:
          decryptErrors.length > 0
            ? `설정 복호화 실패: ${decryptErrors.join(' | ')}`
            : '유효한 복호화 키를 찾지 못했습니다.',
      };
    } catch (error: any) {
      console.error('[GitHubSync] Failed to pull settings:', error);
      return {
        success: false,
        message: '설정 가져오기 실패',
        error: error.message,
      };
    }
  }

  /**
   * 청킹된 문서를 원본으로 병합
   */
  private mergeChunkedDocuments(documents: any[]): Map<string, any> {
    const originalDocs = new Map<string, any>();

    for (const doc of documents) {
      const originalId = doc.metadata?.originalId || doc.id;
      const chunkIndex = doc.metadata?.chunkIndex;

      if (!originalDocs.has(originalId)) {
        // 새 원본 문서 생성
        originalDocs.set(originalId, {
          id: originalId,
          title: doc.metadata?.title || 'Untitled',
          source: doc.metadata?.source || '',
          uploadedAt: doc.metadata?.uploadedAt || new Date().toISOString(),
          folderPath: doc.metadata?.folderPath || '',
          tags: doc.metadata?.tags || [],
          category: doc.metadata?.category || '',
          chunks: [],
        });
      }

      const original = originalDocs.get(originalId);
      if (chunkIndex !== undefined) {
        // 청크 추가
        original.chunks.push({
          index: chunkIndex,
          content: doc.content,
        });
      } else {
        // 청크가 없는 원본 문서
        original.chunks.push({
          index: 0,
          content: doc.content,
        });
      }
    }

    // 청크를 인덱스 순서로 정렬하고 병합
    for (const [, doc] of originalDocs.entries()) {
      doc.chunks.sort((a: any, b: any) => a.index - b.index);
      doc.content = doc.chunks.map((chunk: any) => chunk.content).join('\n\n');
      delete doc.chunks;
    }

    return originalDocs;
  }

  /**
   * 문서를 Markdown 파일로 변환
   */
  private documentToMarkdown(doc: any): string {
    const lines: string[] = [];

    // 제목
    lines.push(`# ${doc.title}`);
    lines.push('');

    // 메타데이터
    if (doc.source || doc.category || doc.tags?.length > 0 || doc.folderPath) {
      lines.push('---');
      if (doc.source) {
        lines.push(`**출처:** ${doc.source}`);
      }
      if (doc.category) {
        lines.push(`**카테고리:** ${doc.category}`);
      }
      if (doc.folderPath) {
        lines.push(`**폴더:** ${doc.folderPath}`);
      }
      if (doc.tags && doc.tags.length > 0) {
        lines.push(`**태그:** ${doc.tags.join(', ')}`);
      }
      lines.push(`**업로드일:** ${new Date(doc.uploadedAt).toLocaleString('ko-KR')}`);
      lines.push('---');
      lines.push('');
    }

    // 본문 내용
    lines.push(doc.content);

    return lines.join('\n');
  }

  /**
   * 파일명 생성 (안전한 파일명으로 변환)
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_') // 금지된 문자를 언더스코어로 변경
      .replace(/\s+/g, '_') // 공백을 언더스코어로 변경
      .replace(/_{2,}/g, '_') // 연속된 언더스코어를 하나로
      .substring(0, 200); // 최대 길이 제한
  }

  /**
   * 폴더 경로 정규화 (경로 traversal 방지)
   */
  private sanitizeFolderPath(folderPath: string): string {
    return folderPath
      .replace(/\\/g, '/')
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
      .map((segment) => this.sanitizeFilename(segment))
      .join('/');
  }

  /**
   * 문서 동기화
   */
  async syncDocuments(documents: any[]): Promise<GitHubSyncResult> {
    try {
      // 1. 청킹된 문서를 원본으로 병합
      const originalDocs = this.mergeChunkedDocuments(documents);

      // 2. 각 문서를 개별 Markdown 파일로 저장
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const [id, doc] of originalDocs.entries()) {
        try {
          const markdown = this.documentToMarkdown(doc);
          const filename = this.sanitizeFilename(doc.title || id);
          const normalizedFolderPath = doc.folderPath
            ? this.sanitizeFolderPath(doc.folderPath)
            : '';
          const folderPath = normalizedFolderPath ? `${normalizedFolderPath}/` : '';
          const filepath = `sepilot/documents/${folderPath}${filename}.md`;

          const result = await this.upsertFile(
            filepath,
            markdown,
            `docs: sync document "${doc.title}"`
          );

          if (result.success) {
            successCount++;
          } else {
            errorCount++;
            errors.push(`${doc.title}: ${result.error}`);
          }
        } catch (error: any) {
          errorCount++;
          errors.push(`${doc.title}: ${error.message}`);
        }
      }

      // 3. 인덱스 파일 생성 (문서 목록)
      const indexContent = this.generateDocumentIndex(originalDocs);
      await this.upsertFile(
        'sepilot/documents/README.md',
        indexContent,
        'docs: update document index'
      );

      return {
        success: errorCount === 0,
        message: `문서 동기화 완료: 성공 ${successCount}개, 실패 ${errorCount}개`,
        error: errors.length > 0 ? errors.join('\n') : undefined,
      };
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync documents:', error);
      return {
        success: false,
        message: 'Failed to sync documents',
        error: error.message,
      };
    }
  }

  /**
   * 문서 인덱스 생성
   */
  private generateDocumentIndex(docs: Map<string, any>): string {
    const lines: string[] = [];
    lines.push('# 문서 목록');
    lines.push('');
    lines.push(`> 마지막 업데이트: ${new Date().toLocaleString('ko-KR')}`);
    lines.push('');

    // 폴더별로 그룹화
    const folderGroups = new Map<string, any[]>();

    for (const doc of docs.values()) {
      const folder = doc.folderPath || '(루트)';
      if (!folderGroups.has(folder)) {
        folderGroups.set(folder, []);
      }
      folderGroups.get(folder)!.push(doc);
    }

    // 폴더별로 출력
    const sortedFolders = Array.from(folderGroups.keys()).sort();

    for (const folder of sortedFolders) {
      lines.push(`## ${folder}`);
      lines.push('');

      const docsInFolder = folderGroups.get(folder)!;
      docsInFolder.sort((a, b) => a.title.localeCompare(b.title));

      for (const doc of docsInFolder) {
        const filename = this.sanitizeFilename(doc.title || doc.id);
        const normalizedFolderPath = doc.folderPath ? this.sanitizeFolderPath(doc.folderPath) : '';
        const folderPath = normalizedFolderPath ? `${normalizedFolderPath}/` : '';
        const filepath = `${folderPath}${filename}.md`;

        lines.push(`- [${doc.title}](./${filepath})`);
        if (doc.category) {
          lines.push(`  - 카테고리: ${doc.category}`);
        }
        if (doc.tags && doc.tags.length > 0) {
          lines.push(`  - 태그: ${doc.tags.join(', ')}`);
        }
      }

      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('📝 이 문서들은 SEPilot Desktop에서 자동으로 동기화됩니다.');

    return lines.join('\n');
  }

  /**
   * GitHub에서 문서 가져오기 (Pull)
   */
  async pullDocuments(docsPath: string = 'sepilot/documents'): Promise<{
    success: boolean;
    documents: Array<{ title: string; content: string; metadata: Record<string, any> }>;
    message?: string;
    error?: string;
  }> {
    await this.ensureInitialized();
    try {
      // 지정된 디렉토리의 모든 파일 가져오기
      const { data: tree } = await this.octokit.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: this.branch,
        recursive: 'true',
      });

      // .md 파일만 필터링 (docsPath 사용)
      // docsPath가 "/" 또는 빈 문자열이면 루트 디렉토리로 처리
      const normalizedDocsPath = this.normalizeGitHubPath(docsPath, true);

      const isRootPath = normalizedDocsPath === '';
      const markdownFiles = tree.tree.filter((item: any) => {
        if (item.type !== 'blob' || !item.path?.endsWith('.md')) {
          return false;
        }

        // README.md 제외 (루트 및 docsPath 내)
        const filename = item.path.split('/').pop();
        if (filename === 'README.md') {
          return false;
        }

        if (isRootPath) {
          // 루트 경로인 경우: 모든 .md 파일 포함
          return true;
        } else {
          // 특정 경로인 경우: 해당 경로로 시작하는 파일만
          return item.path.startsWith(`${normalizedDocsPath}/`);
        }
      });

      const documents: Array<{ title: string; content: string; metadata: Record<string, any> }> =
        [];

      // 각 파일의 내용 가져오기
      for (const file of markdownFiles) {
        if (!file.path || !file.sha) {
          continue;
        }

        try {
          const { data: blob } = await this.octokit.git.getBlob({
            owner: this.owner,
            repo: this.repo,
            file_sha: file.sha,
          });

          // Base64 디코딩
          const content = Buffer.from(blob.content, 'base64').toString('utf-8');

          // Markdown 파싱 (메타데이터 추출)
          const parsed = this.parseMarkdownDocument(content, file.path, normalizedDocsPath);

          // GitHub 동기화 메타데이터 추가
          parsed.metadata.githubSha = file.sha;
          parsed.metadata.githubPath = file.path;
          parsed.metadata.lastPulledAt = Date.now();
          parsed.metadata.modifiedLocally = false;

          documents.push(parsed);
        } catch (error: any) {
          console.error(`[GitHubSync] Failed to fetch file ${file.path}:`, error);
        }
      }

      return {
        success: true,
        documents,
        message: `${documents.length}개의 문서를 가져왔습니다.`,
      };
    } catch (error: any) {
      console.error('[GitHubSync] Failed to pull documents:', error);
      return {
        success: false,
        documents: [],
        message: 'Failed to pull documents',
        error: error.message,
      };
    }
  }

  /**
   * 문서를 GitHub에 Push (생성 또는 업데이트)
   * @param document 문서 정보
   * @param document.githubPath GitHub 경로 (예: sepilot/documents/folder/doc.md)
   * @param document.title 문서 제목
   * @param document.content 문서 내용
   * @param document.metadata 문서 메타데이터
   * @param document.sha 기존 파일의 SHA (업데이트 시)
   * @param commitMessage 커밋 메시지 (선택)
   */
  async pushDocument(
    document: {
      githubPath: string;
      title: string;
      content: string;
      metadata?: Record<string, any>;
      sha?: string;
    },
    commitMessage?: string
  ): Promise<{
    success: boolean;
    message: string;
    sha?: string;
    error?: string;
  }> {
    try {
      // Markdown 형식으로 변환
      const markdown = this.formatDocumentAsMarkdown(
        document.title,
        document.content,
        document.metadata
      );

      // GitHub에 파일 업로드
      const result = await this.upsertFile(
        document.githubPath,
        markdown,
        commitMessage || `Update ${document.title} from SEPilot`,
        document.sha
      );

      if (!result.success) {
        // 409 Conflict 처리
        if (
          result.error === 'CONFLICT' ||
          result.error?.includes('409') ||
          result.error?.includes('does not match')
        ) {
          return {
            success: false,
            message: '문서 충돌 감지',
            error: 'CONFLICT',
          };
        }
        throw new Error(result.error || 'Push 실패');
      }

      return {
        success: true,
        message: `문서 "${document.title}"를 GitHub에 업로드했습니다.`,
        sha: result.sha,
      };
    } catch (error: any) {
      console.error('[GitHubSync] Failed to push document:', error);
      return {
        success: false,
        message: '문서 Push 실패',
        error: error.message,
      };
    }
  }

  /**
   * 문서를 Markdown 형식으로 변환
   */
  private formatDocumentAsMarkdown(
    title: string,
    content: string,
    metadata?: Record<string, any>
  ): string {
    const lines: string[] = [];

    // 제목
    lines.push(`# ${title}`);
    lines.push('');

    // 메타데이터 (선택)
    if (metadata && Object.keys(metadata).length > 0) {
      lines.push('---');

      // 특정 메타데이터만 포함 (내부 시스템 필드 제외)
      const allowedFields = ['folderPath', 'tags', 'category', 'source', 'author'];
      for (const [key, value] of Object.entries(metadata)) {
        if (allowedFields.includes(key) && value !== undefined) {
          lines.push(`${key}: ${JSON.stringify(value)}`);
        }
      }

      lines.push('---');
      lines.push('');
    }

    // 내용
    lines.push(content);

    return lines.join('\n');
  }

  /**
   * Markdown 문서 파싱 (메타데이터 추출)
   */
  private parseMarkdownDocument(
    content: string,
    filepath: string,
    docsPath: string = 'sepilot/documents'
  ): { title: string; content: string; metadata: Record<string, any> } {
    const lines = content.split('\n');

    let title = 'Untitled';
    let mainContent = content;
    const metadata: Record<string, any> = {};

    // 폴더 경로 추출 (docsPath 이후 경로)
    let normalizedDocsPath = docsPath.endsWith('/') ? docsPath.slice(0, -1) : docsPath;
    if (normalizedDocsPath === '' || normalizedDocsPath === '/') {
      normalizedDocsPath = '';
    }

    // filepath에서 폴더 경로 추출
    let relativePath: string;
    if (normalizedDocsPath === '') {
      // 루트 경로인 경우: filepath 자체가 상대 경로
      relativePath = filepath;
    } else {
      // Escape special regex characters in path
      const escapedDocsPath = normalizedDocsPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pathRegex = new RegExp(`${escapedDocsPath}/(.+)$`);
      const pathMatch = filepath.match(pathRegex);
      relativePath = pathMatch ? pathMatch[1] : filepath;
    }

    // .md 확장자 제거 후 폴더 경로 추출
    const withoutExt = relativePath.replace(/\.md$/, '');
    const parts = withoutExt.split('/');
    if (parts.length > 1) {
      metadata.folderPath = parts.slice(0, -1).join('/');
    }

    // 첫 번째 # 헤딩을 제목으로 추출
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('# ')) {
        title = line.substring(2).trim();
        break;
      }
    }

    // 메타데이터 섹션 파싱 (--- 로 구분된 부분)
    let inMetadataSection = false;
    let metadataEndIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line === '---') {
        if (!inMetadataSection) {
          inMetadataSection = true;
        } else {
          metadataEndIndex = i;
          break;
        }
      } else if (inMetadataSection) {
        // **출처:** 형태 파싱
        const sourceMatch = line.match(/^\*\*출처:\*\*\s*(.+)$/);
        if (sourceMatch) {
          metadata.source = sourceMatch[1].trim();
        }

        const categoryMatch = line.match(/^\*\*카테고리:\*\*\s*(.+)$/);
        if (categoryMatch) {
          metadata.category = categoryMatch[1].trim();
        }

        const folderMatch = line.match(/^\*\*폴더:\*\*\s*(.+)$/);
        if (folderMatch) {
          metadata.folderPath = folderMatch[1].trim();
        }

        const tagsMatch = line.match(/^\*\*태그:\*\*\s*(.+)$/);
        if (tagsMatch) {
          metadata.tags = tagsMatch[1]
            .split(',')
            .map((t) => t.trim())
            .filter((t: any) => t);
        }

        const uploadedAtMatch = line.match(/^\*\*업로드일:\*\*\s*(.+)$/);
        if (uploadedAtMatch) {
          const dateStr = uploadedAtMatch[1].trim();
          try {
            metadata.uploadedAt = new Date(dateStr).getTime();
          } catch {
            // 파싱 실패 시 무시
          }
        }
      }
    }

    // 본문 추출 (제목과 메타데이터 제외)
    if (metadataEndIndex > 0) {
      mainContent = lines
        .slice(metadataEndIndex + 1)
        .join('\n')
        .trim();
    } else {
      // 메타데이터 섹션이 없으면 첫 # 이후부터
      const titleIndex = lines.findIndex((l) => l.trim().startsWith('# '));
      if (titleIndex >= 0) {
        mainContent = lines
          .slice(titleIndex + 1)
          .join('\n')
          .trim();
      }
    }

    return {
      title,
      content: mainContent,
      metadata: {
        ...metadata,
        title,
        source: metadata.source || 'github',
        uploadedAt: metadata.uploadedAt || Date.now(),
      },
    };
  }

  /**
   * 이미지 동기화
   */
  async syncImages(images: any[]): Promise<GitHubSyncResult> {
    try {
      // 이미지 메타데이터만 동기화 (base64는 크기가 크므로)
      const imageMetadata = images.map((img) => ({
        id: img.id,
        filename: img.filename,
        mimeType: img.mimeType,
        conversationId: img.conversationId,
        conversationTitle: img.conversationTitle,
        messageId: img.messageId,
        createdAt: img.createdAt,
        type: img.type,
        // base64는 제외하고 SHA256 해시만 저장
        contentHash: this.hashContent(img.base64 || ''),
      }));

      const content = JSON.stringify(
        {
          version: '1.0',
          exportDate: new Date().toISOString(),
          images: imageMetadata,
        },
        null,
        2
      );

      return await this.upsertFile(
        'sepilot/images-metadata.json',
        content,
        'chore: sync image metadata'
      );
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync images:', error);
      return {
        success: false,
        message: 'Failed to sync images',
        error: error.message,
      };
    }
  }

  /**
   * 대화 내역 동기화
   */
  async syncConversations(backupData: any): Promise<GitHubSyncResult> {
    try {
      const content = JSON.stringify(backupData, null, 2);

      return await this.upsertFile(
        'sepilot/conversations.json',
        content,
        'chore: sync conversations'
      );
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync conversations:', error);
      return {
        success: false,
        message: 'Failed to sync conversations',
        error: error.message,
      };
    }
  }

  /**
   * AI 페르소나 동기화
   */
  async syncPersonas(personas: any): Promise<GitHubSyncResult> {
    try {
      const content = JSON.stringify(
        {
          version: '1.0',
          exportDate: new Date().toISOString(),
          personas,
        },
        null,
        2
      );

      return await this.upsertFile('sepilot/personas.json', content, 'chore: sync AI personas');
    } catch (error: any) {
      console.error('[GitHubSync] Failed to sync personas:', error);
      return {
        success: false,
        message: 'Failed to sync personas',
        error: error.message,
      };
    }
  }

  /**
   * 레포지토리 연결 테스트
   */
  async testConnection(): Promise<GitHubSyncResult> {
    await this.ensureInitialized();
    try {
      // 레포지토리 정보 가져오기
      const { data } = await this.octokit.repos.get({
        owner: this.owner,
        repo: this.repo,
      });

      return {
        success: true,
        message: `Connected to ${data.full_name}`,
      };
    } catch (error: any) {
      console.error('[GitHubSync] Connection test failed:', error);
      return {
        success: false,
        message: 'Failed to connect to GitHub repository',
        error: error.message,
      };
    }
  }

  private looksEncryptedValue(value: string): boolean {
    const parts = value.split(':');
    if (parts.length !== 4) {
      return false;
    }
    return parts.every((part) => part.length > 0);
  }

  private transformPathValue(
    obj: any,
    parts: string[],
    masterKey: string,
    mode: 'encrypt' | 'decrypt'
  ): void {
    if (obj === null || obj === undefined) {
      return;
    }

    if (parts.length === 0) {
      return;
    }

    const [current, ...rest] = parts;

    if (current === '*') {
      if (Array.isArray(obj)) {
        for (const item of obj) {
          this.transformPathValue(item, rest, masterKey, mode);
        }
      } else if (typeof obj === 'object') {
        for (const value of Object.values(obj)) {
          this.transformPathValue(value, rest, masterKey, mode);
        }
      }
      return;
    }

    if (typeof obj !== 'object') {
      return;
    }

    if (!(current in obj)) {
      return;
    }

    if (rest.length === 0) {
      const value = obj[current];
      if (value === undefined || value === null) {
        return;
      }

      if (mode === 'encrypt') {
        // 이미 암호화된 문자열이면 중복 암호화 방지
        if (typeof value === 'string' && this.looksEncryptedValue(value)) {
          return;
        }
        obj[current] = encryptData(value, masterKey);
        return;
      }

      // decrypt mode
      if (typeof value === 'string' && this.looksEncryptedValue(value)) {
        obj[current] = decryptData(value, masterKey);
      }
      return;
    }

    this.transformPathValue(obj[current], rest, masterKey, mode);
  }

  /**
   * 중첩된 민감 필드 암복호화 헬퍼
   */
  private transformNestedFields(
    obj: any,
    fields: string[],
    masterKey: string,
    mode: 'encrypt' | 'decrypt'
  ): any {
    for (const field of fields) {
      const parts = field.split('.');
      this.transformPathValue(obj, parts, masterKey, mode);
    }
    return obj;
  }

  /**
   * 콘텐츠 해시 생성 (이미지 중복 확인용)
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
