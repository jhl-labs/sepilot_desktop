/**
 * GitHub API Client for Sync Operations
 * GitHub REST API를 사용하여 파일을 읽고 쓰는 클라이언트
 */

import { Octokit } from '@octokit/rest';
import type { GitHubSyncConfig, AppConfig } from '@/types';
import { encryptData } from './encryption';
import crypto from 'crypto';

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
    this.octokit = new Octokit({
      auth: config.token,
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
   * 문서 동기화
   */
  async syncDocuments(documents: any[]): Promise<GitHubSyncResult> {
    try {
      const content = JSON.stringify(
        {
          version: '1.0',
          exportDate: new Date().toISOString(),
          documents,
        },
        null,
        2
      );

      return await this.upsertFile('sepilot/documents.json', content, 'chore: sync documents');
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
