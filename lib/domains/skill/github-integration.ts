/**
 * GitHub Integration for Skills Marketplace
 *
 * GitHub API를 사용하여 Skills 마켓플레이스와 통합
 * - awesome-sepilot-skills 레포지토리에서 레지스트리 가져오기
 * - 개별 스킬 다운로드
 * - 검색 및 필터링
 * - 업데이트 확인
 */

import { Octokit } from '@octokit/rest';
import type {
  SkillPackage,
  SkillManifest,
  SkillContent,
  SkillRegistryEntry,
  SkillSearchFilters,
  SkillUpdate,
  SkillResources,
} from '../../../types/skill';
import { createOctokitAgent } from '@/lib/http';
import { compareVersions, isBreakingChange } from './version-utils';

/**
 * GitHub Integration 설정
 */
interface GitHubIntegrationConfig {
  owner: string; // 'sepilot' 또는 사용자 지정
  repo: string; // 'awesome-sepilot-skills'
  branch: string; // 'main'
  token?: string; // Personal Access Token (선택, rate limit 향상용)
}

/**
 * GitHub Integration 클래스
 */
export class GitHubIntegration {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private branch: string;
  private initPromise: Promise<void>;

  // 캐시
  private registryCache: SkillRegistryEntry[] | null = null;
  private registryCacheTime: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5분

  constructor(config: GitHubIntegrationConfig) {
    this.owner = config.owner;
    this.repo = config.repo;
    this.branch = config.branch;

    // 임시 Octokit 인스턴스 생성
    this.octokit = new Octokit({
      auth: config.token,
      baseUrl: 'https://api.github.com',
    });

    // NetworkConfig 적용된 Octokit으로 비동기 교체
    this.initPromise = this.initializeOctokit(config.token);
  }

  /**
   * Octokit 초기화 (NetworkConfig 적용)
   */
  private async initializeOctokit(token?: string): Promise<void> {
    try {
      // NetworkConfig는 설정에서 가져와야 하지만, Skills 시스템은 설정 없이도 동작해야 함
      // 따라서 networkConfig 없이 기본 Octokit 사용
      const requestOptions = await createOctokitAgent(undefined);

      this.octokit = new Octokit({
        auth: token,
        baseUrl: 'https://api.github.com',
        request: requestOptions,
      });

      console.log('[GitHubIntegration] Octokit initialized with network config');
    } catch (error) {
      console.error('[GitHubIntegration] Failed to initialize Octokit with network config:', error);
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
   * Skills 레지스트리 가져오기
   *
   * @param forceRefresh - 캐시 무시 및 강제 새로고침
   * @returns SkillRegistryEntry 배열
   */
  async fetchSkillsRegistry(forceRefresh = false): Promise<SkillRegistryEntry[]> {
    await this.ensureInitialized();

    // 캐시 확인
    const now = Date.now();
    if (!forceRefresh && this.registryCache && now - this.registryCacheTime < this.CACHE_TTL) {
      console.log('[GitHubIntegration] Using cached registry');
      return this.registryCache;
    }

    try {
      console.log('[GitHubIntegration] Fetching skills registry from GitHub...');

      // skills-registry.json 파일 가져오기
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: 'skills-registry.json',
        ref: this.branch,
      });

      // 폴더가 아닌 파일만 처리
      if (!('content' in data) || data.type !== 'file') {
        throw new Error('skills-registry.json is not a file');
      }

      // Base64 디코딩
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const registry = JSON.parse(content) as {
        version: string;
        skills: SkillRegistryEntry[];
      };

      // 캐시 업데이트
      this.registryCache = registry.skills;
      this.registryCacheTime = now;

      console.log(`[GitHubIntegration] Fetched ${registry.skills.length} skills from registry`);

      return registry.skills;
    } catch (error) {
      console.error('[GitHubIntegration] Failed to fetch skills registry:', error);
      throw new Error(`Failed to fetch skills registry: ${error}`);
    }
  }

  /**
   * 특정 스킬 다운로드
   *
   * @param skillPath - GitHub 경로 (예: 'skills/web-development/react-expert')
   * @returns SkillPackage
   */
  async downloadSkill(skillPath: string): Promise<SkillPackage> {
    await this.ensureInitialized();

    try {
      console.log(`[GitHubIntegration] Downloading skill from ${skillPath}...`);

      // 폴더 구조:
      // skills/web-development/react-expert/
      //   ├── manifest.json
      //   ├── content.json
      //   ├── README.md
      //   └── resources/ (선택)

      // manifest.json 가져오기
      const manifestPath = `${skillPath}/manifest.json`;
      const manifestData = await this.getFileContent(manifestPath);
      const manifest = JSON.parse(manifestData) as SkillManifest;

      // content.json 가져오기
      const contentPath = `${skillPath}/content.json`;
      const contentData = await this.getFileContent(contentPath);
      const content = JSON.parse(contentData) as SkillContent;

      // README.md 가져오기 (선택)
      let readme: string | undefined;
      try {
        readme = await this.getFileContent(`${skillPath}/README.md`);
      } catch {
        console.warn(`[GitHubIntegration] README.md not found for ${skillPath}`);
      }

      // resources 폴더 가져오기 (선택)
      let resources: SkillResources | undefined;
      try {
        resources = await this.downloadResources(`${skillPath}/resources`);
      } catch {
        console.warn(`[GitHubIntegration] Resources not found for ${skillPath}`);
      }

      // README가 있으면 manifest에 추가
      if (readme && manifest) {
        manifest.readme = 'README.md';
      }

      console.log(`[GitHubIntegration] Skill downloaded successfully: ${manifest.id}`);

      return {
        manifest,
        content,
        resources,
      };
    } catch (error) {
      console.error(`[GitHubIntegration] Failed to download skill from ${skillPath}:`, error);
      throw new Error(`Failed to download skill: ${error}`);
    }
  }

  /**
   * Resources 폴더 다운로드
   *
   * @param resourcesPath - resources 폴더 경로
   * @returns SkillResources
   */
  private async downloadResources(resourcesPath: string): Promise<SkillResources> {
    const resources: SkillResources = {};

    try {
      // 폴더 내용 가져오기
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: resourcesPath,
        ref: this.branch,
      });

      if (!Array.isArray(data)) {
        throw new Error('Resources path is not a directory');
      }

      // 각 파일/폴더 처리
      for (const item of data) {
        if (item.type === 'file') {
          const content = await this.getFileContent(item.path);
          const filename = item.name;

          // 파일 타입 추론
          if (filename.endsWith('.md')) {
            // Markdown 파일
            if (!resources.files) {
              resources.files = [];
            }
            resources.files.push({
              path: item.path,
              content,
              type: 'document',
            });
          } else if (
            filename.endsWith('.png') ||
            filename.endsWith('.jpg') ||
            filename.endsWith('.jpeg') ||
            filename.endsWith('.gif') ||
            filename.endsWith('.svg')
          ) {
            // 이미지 파일 (base64)
            if (!resources.images) {
              resources.images = [];
            }
            const base64Data = await this.getFileContentBase64(item.path);
            resources.images.push({
              name: filename,
              base64: base64Data,
              mimeType: this.getMimeType(filename),
            });
          } else {
            // 기타 파일
            if (!resources.files) {
              resources.files = [];
            }
            resources.files.push({
              path: item.path,
              content,
              type: this.inferFileType(filename),
            });
          }
        } else if (item.type === 'dir') {
          // 하위 폴더 재귀적으로 처리
          const subResources = await this.downloadResources(item.path);

          // 병합
          if (subResources.files) {
            if (!resources.files) {
              resources.files = [];
            }
            resources.files.push(...subResources.files);
          }
          if (subResources.images) {
            if (!resources.images) {
              resources.images = [];
            }
            resources.images.push(...subResources.images);
          }
        }
      }

      return resources;
    } catch (error) {
      console.error(
        `[GitHubIntegration] Failed to download resources from ${resourcesPath}:`,
        error
      );
      throw error;
    }
  }

  /**
   * 파일 내용 가져오기 (UTF-8 텍스트)
   */
  private async getFileContent(path: string): Promise<string> {
    const { data } = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
      ref: this.branch,
    });

    if (!('content' in data) || data.type !== 'file') {
      throw new Error(`${path} is not a file`);
    }

    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  /**
   * 파일 내용 가져오기 (Base64)
   */
  private async getFileContentBase64(path: string): Promise<string> {
    const { data } = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
      ref: this.branch,
    });

    if (!('content' in data) || data.type !== 'file') {
      throw new Error(`${path} is not a file`);
    }

    return data.content; // 이미 base64 인코딩됨
  }

  /**
   * 스킬 검색
   *
   * @param query - 검색어
   * @param filters - 검색 필터
   * @returns 필터링된 SkillRegistryEntry 배열
   */
  async searchSkills(query: string, filters?: SkillSearchFilters): Promise<SkillRegistryEntry[]> {
    const registry = await this.fetchSkillsRegistry();

    let results = registry;

    // 검색어 필터링
    if (query && query.trim()) {
      const lowerQuery = query.toLowerCase().trim();
      results = results.filter(
        (skill) =>
          skill.name.toLowerCase().includes(lowerQuery) ||
          skill.description.toLowerCase().includes(lowerQuery) ||
          skill.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
          skill.author.toLowerCase().includes(lowerQuery)
      );
    }

    // 필터 적용
    if (filters) {
      // 카테고리 필터
      if (filters.categories && filters.categories.length > 0) {
        results = results.filter((skill) => filters.categories!.includes(skill.category));
      }

      // 태그 필터
      if (filters.tags && filters.tags.length > 0) {
        results = results.filter((skill) => filters.tags!.some((tag) => skill.tags.includes(tag)));
      }

      // 검증된 스킬만
      if (filters.verifiedOnly) {
        results = results.filter((skill) => skill.verified);
      }

      // 최소 Stars
      if (filters.minStars !== undefined) {
        results = results.filter((skill) => skill.stars >= filters.minStars!);
      }
    }

    console.log(`[GitHubIntegration] Search results: ${results.length} skills`);

    return results;
  }

  /**
   * 업데이트 확인
   *
   * @param installedSkills - 설치된 스킬 목록 (id와 version 포함)
   * @returns 업데이트 가능한 스킬 목록
   */
  async checkForUpdates(
    installedSkills: Array<{ id: string; version: string }>
  ): Promise<SkillUpdate[]> {
    const registry = await this.fetchSkillsRegistry();
    const updates: SkillUpdate[] = [];

    for (const installed of installedSkills) {
      const registryEntry = registry.find((skill) => skill.id === installed.id);

      if (!registryEntry) {
        // 레지스트리에 없는 스킬 (로컬 전용 또는 제거됨)
        continue;
      }

      // 버전 비교
      const comparison = compareVersions(installed.version, registryEntry.version);

      if (comparison < 0) {
        // 설치된 버전이 레지스트리 버전보다 낮음 (업데이트 가능)
        updates.push({
          skillId: installed.id,
          currentVersion: installed.version,
          latestVersion: registryEntry.version,
          changelog: registryEntry.changelog,
          breaking: isBreakingChange(installed.version, registryEntry.version),
        });
      }
    }

    console.log(`[GitHubIntegration] Found ${updates.length} updates`);

    return updates;
  }

  /**
   * GitHub 레포지토리 통계 가져오기
   *
   * @param skillPath - 스킬 경로
   * @returns Stars, Downloads 등 통계
   */
  async fetchSkillStats(skillPath: string): Promise<{ stars: number; downloads: number }> {
    await this.ensureInitialized();

    try {
      // GitHub API로 레포지토리 정보 가져오기
      const { data } = await this.octokit.repos.get({
        owner: this.owner,
        repo: this.repo,
      });

      // 다운로드 수는 별도로 추적 필요 (GitHub Release API 또는 별도 카운터)
      // 여기서는 Stars만 반환
      return {
        stars: data.stargazers_count || 0,
        downloads: 0, // TODO: Phase 3에서 다운로드 카운터 구현
      };
    } catch (error) {
      console.error(`[GitHubIntegration] Failed to fetch stats for ${skillPath}:`, error);
      return { stars: 0, downloads: 0 };
    }
  }

  /**
   * 파일 타입 추론
   */
  private inferFileType(filename: string): 'code' | 'document' | 'data' | 'image' {
    const ext = filename.split('.').pop()?.toLowerCase();

    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'go', 'rs'].includes(ext || '')) {
      return 'code';
    }

    if (['md', 'txt', 'pdf', 'doc', 'docx'].includes(ext || '')) {
      return 'document';
    }

    if (['json', 'yaml', 'yml', 'xml', 'csv'].includes(ext || '')) {
      return 'data';
    }

    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) {
      return 'image';
    }

    return 'document';
  }

  /**
   * MIME Type 가져오기
   */
  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();

    const mimeTypes: Record<string, string> = {
      // Text
      txt: 'text/plain',
      md: 'text/markdown',
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      ts: 'application/typescript',
      json: 'application/json',
      xml: 'application/xml',
      yaml: 'application/yaml',
      yml: 'application/yaml',

      // Images
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      webp: 'image/webp',

      // Documents
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

      // Data
      csv: 'text/csv',
    };

    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  /**
   * 캐시 클리어
   */
  clearCache(): void {
    this.registryCache = null;
    this.registryCacheTime = 0;
    console.log('[GitHubIntegration] Cache cleared');
  }
}

// Singleton instance export
// 기본 설정: sepilot/awesome-sepilot-skills
export const githubIntegration = new GitHubIntegration({
  owner: 'sepilot',
  repo: 'awesome-sepilot-skills',
  branch: 'main',
  // token은 설정에서 가져와야 함 (향후 추가)
});
