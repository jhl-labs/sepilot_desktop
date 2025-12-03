/**
 * GitHub API Client for Sync Operations
 * GitHub REST API를 사용하여 파일을 읽고 쓰는 클라이언트
 */

import { Octokit } from '@octokit/rest';
import type { GitHubSyncConfig, AppConfig } from '@/types';
import { encryptData } from './encryption';
import crypto from 'crypto';
import https from 'https';
import { ProxyAgent } from 'proxy-agent';

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

  constructor(config: GitHubSyncConfig) {
    // GHES 지원: baseUrl 설정
    const baseUrl =
      config.serverType === 'ghes' && config.ghesUrl
        ? `${config.ghesUrl}/api/v3`
        : 'https://api.github.com';

    // Network 설정 적용
    const requestOptions: any = {};

    if (config.networkConfig) {
      // Proxy와 SSL 설정을 함께 처리
      const agentOptions: any = {};

      // SSL 검증 설정
      if (config.networkConfig.ssl?.verify === false) {
        agentOptions.rejectUnauthorized = false;
      }

      // Proxy 설정
      if (config.networkConfig.proxy?.enabled && config.networkConfig.proxy.mode !== 'none') {
        if (config.networkConfig.proxy.mode === 'manual' && config.networkConfig.proxy.url) {
          // 수동 프록시 설정
          requestOptions.agent = new ProxyAgent({
            ...agentOptions,
            getProxyForUrl: () => config.networkConfig!.proxy!.url!,
          });
        } else if (config.networkConfig.proxy.mode === 'system') {
          // 시스템 프록시 (환경 변수에서 자동 감지)
          requestOptions.agent = new ProxyAgent(agentOptions);
        }
      } else if (config.networkConfig.ssl?.verify === false) {
        // Proxy 없이 SSL만 비활성화
        requestOptions.agent = new https.Agent(agentOptions);
      }
    }

    this.octokit = new Octokit({
      auth: config.token,
      baseUrl,
      request: requestOptions,
    });
    this.owner = config.owner;
    this.repo = config.repo;
    this.branch = config.branch || 'main';
  }

  /**
   * 파일이 존재하는지 확인하고 내용을 가져옴
   */
  async getFile(path: string): Promise<GitHubFileContent | null> {
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
    try {
      // Base64 인코딩
      const encodedContent = Buffer.from(content, 'utf-8').toString('base64');

      // 기존 파일 확인
      const existingFile = existingSha ? null : await this.getFile(path);
      const sha = existingSha || existingFile?.sha;

      const { data } = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message,
        content: encodedContent,
        branch: this.branch,
        sha, // 업데이트 시 필요
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
   * 폴더 내 모든 파일 가져오기
   */
  async listFiles(path: string): Promise<string[]> {
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
