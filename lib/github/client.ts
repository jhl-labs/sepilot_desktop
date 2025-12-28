/**
 * GitHub API Client for Sync Operations
 * GitHub REST API를 사용하여 파일을 읽고 쓰는 클라이언트
 */

import { Octokit } from '@octokit/rest';
import type { GitHubSyncConfig, AppConfig } from '@/types';
import { encryptData } from './encryption';
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
   * 파일이 존재하는지 확인하고 내용을 가져옴
   */
  async getFile(path: string): Promise<GitHubFileContent | null> {
    await this.ensureInitialized();
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
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
      console.error(`[GitHubSync] Failed to get file ${path}:`, error);
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
    try {
      // Base64 인코딩
      const encodedContent = Buffer.from(content, 'utf-8').toString('base64');

      // 기존 파일 확인 (항상 확인)
      const existingFile = await this.getFile(path);

      // SHA 결정: remote 파일이 존재하면 그 SHA 사용, 없으면 undefined (새 파일 생성)
      const sha = existingFile?.sha;

      // existingSha가 제공되었지만 실제 remote SHA와 다르면 경고
      if (existingSha && sha && existingSha !== sha) {
        console.warn(
          `[GitHubSync] SHA mismatch for ${path}: provided=${existingSha}, remote=${sha}. Using remote SHA.`
        );
      }

      const { data } = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message,
        content: encodedContent,
        branch: this.branch,
        sha, // 업데이트 시 필요, 새 파일이면 undefined
      });

      return {
        success: true,
        message: `File ${path} synced successfully`,
        sha: data.content?.sha,
      };
    } catch (error: any) {
      console.error(`[GitHubSync] Failed to upsert file ${path}:`, error);
      return {
        success: false,
        message: `Failed to sync file ${path}`,
        error: error.message,
      };
    }
  }

  /**
   * 파일 삭제
   */
  async deleteFile(path: string, message: string, sha?: string): Promise<GitHubSyncResult> {
    await this.ensureInitialized();
    try {
      // SHA가 제공되지 않으면 먼저 파일 정보를 가져옴
      let fileSha = sha;
      if (!fileSha) {
        const existingFile = await this.getFile(path);
        if (!existingFile) {
          return {
            success: true,
            message: `File ${path} does not exist`,
          };
        }
        fileSha = existingFile.sha;
      }

      await this.octokit.repos.deleteFile({
        owner: this.owner,
        repo: this.repo,
        path,
        message,
        branch: this.branch,
        sha: fileSha,
      });

      return {
        success: true,
        message: `File ${path} deleted successfully`,
      };
    } catch (error: any) {
      console.error(`[GitHubSync] Failed to delete file ${path}:`, error);
      return {
        success: false,
        message: `Failed to delete file ${path}`,
        error: error.message,
      };
    }
  }

  /**
   * 폴더 내 모든 파일 가져오기
   */
  async listFiles(path: string): Promise<string[]> {
    await this.ensureInitialized();
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: this.branch,
      });

      if (Array.isArray(data)) {
        return data.filter((item) => item.type === 'file').map((item) => item.path);
      }

      return [];
    } catch (error: any) {
      if (error.status === 404) {
        return []; // 폴더가 존재하지 않음
      }
      console.error(`[GitHubSync] Failed to list files in ${path}:`, error);
      throw error;
    }
  }

  /**
   * 설정 동기화
   */
  async syncSettings(appConfig: AppConfig, masterKey: string): Promise<GitHubSyncResult> {
    try {
      // 민감 정보 필드 정의
      const sensitiveFields = [
        'llm.apiKey',
        'llm.vision.apiKey',
        'llm.autocomplete.apiKey',
        'vectorDB.password',
        'embedding.apiKey',
        'comfyUI.apiKey',
      ];

      // 설정 복사 및 민감 정보 암호화
      const encryptedConfig = this.encryptNestedFields(
        JSON.parse(JSON.stringify(appConfig)),
        sensitiveFields,
        masterKey
      );

      // GitHub Token 제거 (동기화하지 않음)
      if (encryptedConfig.githubSync) {
        encryptedConfig.githubSync.token = '[REDACTED]';
        encryptedConfig.githubSync.encryptionKey = '[REDACTED]';
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
          const folderPath = doc.folderPath ? `${doc.folderPath}/` : '';
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
        const folderPath = doc.folderPath ? `${doc.folderPath}/` : '';
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
      const normalizedDocsPath = docsPath.endsWith('/') ? docsPath.slice(0, -1) : docsPath;
      const markdownFiles = tree.tree.filter(
        (item) =>
          item.type === 'blob' &&
          item.path?.startsWith(`${normalizedDocsPath}/`) &&
          item.path.endsWith('.md') &&
          item.path !== `${normalizedDocsPath}/README.md` // 인덱스 파일 제외
      );

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
        if (result.error?.includes('409') || result.error?.includes('does not match')) {
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
    const normalizedDocsPath = docsPath.endsWith('/') ? docsPath.slice(0, -1) : docsPath;
    // Escape special regex characters in path
    const escapedDocsPath = normalizedDocsPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pathRegex = new RegExp(`${escapedDocsPath}/(.+)\\.md$`);
    const pathMatch = filepath.match(pathRegex);
    if (pathMatch) {
      const fullPath = pathMatch[1];
      const parts = fullPath.split('/');
      if (parts.length > 1) {
        metadata.folderPath = parts.slice(0, -1).join('/');
      }
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
            .filter((t) => t);
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

  /**
   * 중첩된 필드 암호화 헬퍼
   */
  private encryptNestedFields(obj: any, fields: string[], masterKey: string): any {
    for (const field of fields) {
      const parts = field.split('.');
      let current = obj;

      // 중첩된 객체 탐색
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined) {
          break;
        }
        current = current[parts[i]];
      }

      // 마지막 필드 암호화
      const lastPart = parts[parts.length - 1];
      if (current && current[lastPart] !== undefined && current[lastPart] !== null) {
        current[lastPart] = encryptData(current[lastPart], masterKey);
      }
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
