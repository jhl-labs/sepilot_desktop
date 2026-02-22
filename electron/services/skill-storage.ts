/**
 * Skill Storage Service
 *
 * 파일시스템에 Skills를 저장하고 로드하는 서비스
 * userData/skills/ 디렉토리를 관리
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import type {
  SkillPackage,
  SkillManifest,
  SkillContent,
  SkillResources,
  SkillTrustLevel,
} from '../../types/skill';

const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MAX_RESOURCE_FILE_COUNT_UNTRUSTED = 200;
const MAX_RESOURCE_IMAGE_COUNT_UNTRUSTED = 100;
const MAX_RESOURCE_FILE_BYTES_UNTRUSTED = 1 * 1024 * 1024; // 1MB
const MAX_RESOURCE_IMAGE_BYTES_UNTRUSTED = 5 * 1024 * 1024; // 5MB
const MAX_RESOURCE_TOTAL_BYTES_UNTRUSTED = 20 * 1024 * 1024; // 20MB

interface SaveSkillOptions {
  trustLevel?: SkillTrustLevel;
}

export class SkillStorageService {
  private skillsDir: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.skillsDir = path.join(userDataPath, 'skills');
  }

  /**
   * Skills 디렉토리 초기화
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.skillsDir, { recursive: true });
      console.log('[SkillStorage] Skills directory initialized:', this.skillsDir);
    } catch (error) {
      console.error('[SkillStorage] Failed to initialize skills directory:', error);
      throw new Error('Failed to initialize skills directory');
    }
  }

  /**
   * Skill 패키지를 파일시스템에 저장
   */
  async saveSkillToFileSystem(
    skillPackage: SkillPackage,
    options: SaveSkillOptions = {}
  ): Promise<string> {
    const trustLevel = options.trustLevel ?? 'untrusted';
    let skillDir = '';

    try {
      skillDir = this.resolveSkillDirectory(skillPackage.manifest.id);
      await this.ensureNoSymlink(skillDir, 'skill directory', this.skillsDir);

      // 스킬 디렉토리 생성
      await fs.mkdir(skillDir, { recursive: true });

      // manifest.json 저장
      const manifestPath = path.join(skillDir, 'manifest.json');
      await this.ensureNoSymlink(manifestPath, 'manifest file', skillDir);
      await fs.writeFile(manifestPath, JSON.stringify(skillPackage.manifest, null, 2), 'utf-8');

      // content.json 저장
      const contentPath = path.join(skillDir, 'content.json');
      await this.ensureNoSymlink(contentPath, 'content file', skillDir);
      await fs.writeFile(contentPath, JSON.stringify(skillPackage.content, null, 2), 'utf-8');

      // README.md 저장 (있는 경우)
      if (skillPackage.manifest.readme) {
        const readmePath = path.join(skillDir, 'README.md');
        await this.ensureNoSymlink(readmePath, 'readme file', skillDir);
        await fs.writeFile(readmePath, skillPackage.manifest.readme, 'utf-8');
      }

      // Resources 저장
      if (skillPackage.resources) {
        await this.saveResources(skillDir, skillPackage.resources, trustLevel);
      }

      console.log('[SkillStorage] Skill saved to filesystem:', skillPackage.manifest.id);
      return skillDir;
    } catch (error) {
      console.error('[SkillStorage] Failed to save skill:', error);
      // 실패 시 생성된 디렉토리 정리
      if (skillDir) {
        try {
          await fs.rm(skillDir, { recursive: true, force: true });
        } catch {}
      }
      throw new Error(`Failed to save skill: ${error}`);
    }
  }

  /**
   * Resources 저장
   */
  private async saveResources(
    skillDir: string,
    resources: SkillResources,
    trustLevel: SkillTrustLevel
  ): Promise<void> {
    const resourcesDir = path.join(skillDir, 'resources');
    await this.ensureNoSymlink(resourcesDir, 'resources directory', skillDir);
    await fs.mkdir(resourcesDir, { recursive: true });

    let totalResourceBytes = 0;

    // 파일 저장
    if (resources.files) {
      if (
        trustLevel === 'untrusted' &&
        resources.files.length > MAX_RESOURCE_FILE_COUNT_UNTRUSTED
      ) {
        throw new Error(
          `Too many resource files: ${resources.files.length} (max: ${MAX_RESOURCE_FILE_COUNT_UNTRUSTED})`
        );
      }

      for (const file of resources.files) {
        const normalizedPath = this.normalizeResourcePath(file.path, 'resource file');
        const filePath = this.resolvePathWithin(resourcesDir, normalizedPath, 'resource file');
        const fileDir = path.dirname(filePath);

        // 하위 디렉토리 생성
        await fs.mkdir(fileDir, { recursive: true });
        await this.ensureNoSymlink(filePath, 'resource file', resourcesDir);

        const fileSize = Buffer.byteLength(file.content, 'utf-8');
        totalResourceBytes += fileSize;

        if (trustLevel === 'untrusted' && fileSize > MAX_RESOURCE_FILE_BYTES_UNTRUSTED) {
          throw new Error(
            `Resource file too large: ${normalizedPath} (${fileSize} bytes, max: ${MAX_RESOURCE_FILE_BYTES_UNTRUSTED})`
          );
        }

        if (trustLevel === 'untrusted' && totalResourceBytes > MAX_RESOURCE_TOTAL_BYTES_UNTRUSTED) {
          throw new Error(
            `Total resource size exceeded (${totalResourceBytes} bytes, max: ${MAX_RESOURCE_TOTAL_BYTES_UNTRUSTED})`
          );
        }

        // 파일 저장
        await fs.writeFile(filePath, file.content, 'utf-8');
      }
    }

    // 이미지 저장
    if (resources.images) {
      if (
        trustLevel === 'untrusted' &&
        resources.images.length > MAX_RESOURCE_IMAGE_COUNT_UNTRUSTED
      ) {
        throw new Error(
          `Too many resource images: ${resources.images.length} (max: ${MAX_RESOURCE_IMAGE_COUNT_UNTRUSTED})`
        );
      }

      const imagesDir = path.join(resourcesDir, 'images');
      await this.ensureNoSymlink(imagesDir, 'resource images directory', resourcesDir);
      await fs.mkdir(imagesDir, { recursive: true });

      for (const image of resources.images) {
        const imageName = this.normalizeImageName(image.name);
        const imagePath = this.resolvePathWithin(imagesDir, imageName, 'resource image');
        await this.ensureNoSymlink(imagePath, 'resource image', imagesDir);

        const buffer = this.decodeBase64Image(image.base64, imageName);
        totalResourceBytes += buffer.length;

        if (trustLevel === 'untrusted' && buffer.length > MAX_RESOURCE_IMAGE_BYTES_UNTRUSTED) {
          throw new Error(
            `Resource image too large: ${imageName} (${buffer.length} bytes, max: ${MAX_RESOURCE_IMAGE_BYTES_UNTRUSTED})`
          );
        }

        if (trustLevel === 'untrusted' && totalResourceBytes > MAX_RESOURCE_TOTAL_BYTES_UNTRUSTED) {
          throw new Error(
            `Total resource size exceeded (${totalResourceBytes} bytes, max: ${MAX_RESOURCE_TOTAL_BYTES_UNTRUSTED})`
          );
        }

        await fs.writeFile(imagePath, buffer);
      }
    }
  }

  /**
   * 파일시스템에서 Skill 패키지 로드
   */
  async loadSkillFromFileSystem(skillId: string): Promise<SkillPackage> {
    const skillDir = this.resolveSkillDirectory(skillId);

    try {
      await this.ensureNoSymlink(skillDir, 'skill directory', this.skillsDir);

      // 디렉토리 존재 확인
      await fs.access(skillDir);

      // manifest.json 로드
      const manifestPath = path.join(skillDir, 'manifest.json');
      const manifestData = await fs.readFile(manifestPath, 'utf-8');
      const manifest: SkillManifest = JSON.parse(manifestData);
      if (manifest.id !== skillId) {
        throw new Error(`Skill ID mismatch: directory=${skillId}, manifest=${manifest.id}`);
      }

      // content.json 로드
      const contentPath = path.join(skillDir, 'content.json');
      const contentData = await fs.readFile(contentPath, 'utf-8');
      const content: SkillContent = JSON.parse(contentData);

      // README.md 로드 (있는 경우)
      try {
        const readmePath = path.join(skillDir, 'README.md');
        const readme = await fs.readFile(readmePath, 'utf-8');
        manifest.readme = readme;
      } catch {
        // README가 없으면 무시
      }

      // Resources 로드
      const resources = await this.loadResources(skillDir);

      console.log('[SkillStorage] Skill loaded from filesystem:', skillId);

      return {
        manifest,
        content,
        resources,
      };
    } catch (error) {
      console.error('[SkillStorage] Failed to load skill:', error);
      throw new Error(`Failed to load skill ${skillId}: ${error}`);
    }
  }

  /**
   * Resources 로드
   */
  private async loadResources(skillDir: string): Promise<SkillResources | undefined> {
    const resourcesDir = path.join(skillDir, 'resources');

    try {
      await fs.access(resourcesDir);
      await this.ensureNoSymlink(resourcesDir, 'resources directory', skillDir);
    } catch {
      // Resources 디렉토리가 없으면 undefined 반환
      return undefined;
    }

    const resources: SkillResources = {};

    // 파일 로드
    const files = await this.loadResourceFiles(resourcesDir);
    if (files && files.length > 0) {
      resources.files = files;
    }

    // 이미지 로드
    const images = await this.loadResourceImages(resourcesDir);
    if (images && images.length > 0) {
      resources.images = images;
    }

    return Object.keys(resources).length > 0 ? resources : undefined;
  }

  /**
   * Resource 파일 재귀 로드
   */
  private async loadResourceFiles(dir: string, basePath = ''): Promise<SkillResources['files']> {
    const files: SkillResources['files'] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.posix.join(basePath, entry.name);

        if (entry.isDirectory()) {
          // 이미지 디렉토리는 건너뜀
          if (entry.name === 'images') {
            continue;
          }

          // 재귀적으로 하위 디렉토리 탐색
          const subFiles = await this.loadResourceFiles(fullPath, relativePath);
          if (subFiles) {
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          // 파일 읽기
          const content = await fs.readFile(fullPath, 'utf-8');
          const type = this.inferFileType(entry.name);

          files.push({
            path: relativePath,
            content,
            type,
          });
        }
      }
    } catch (error) {
      console.error('[SkillStorage] Failed to load resource files:', error);
    }

    return files.length > 0 ? files : undefined;
  }

  /**
   * Resource 이미지 로드
   */
  private async loadResourceImages(resourcesDir: string): Promise<SkillResources['images']> {
    const images: SkillResources['images'] = [];
    const imagesDir = path.join(resourcesDir, 'images');

    try {
      await fs.access(imagesDir);

      const entries = await fs.readdir(imagesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const imagePath = path.join(imagesDir, entry.name);
          const buffer = await fs.readFile(imagePath);
          const base64 = buffer.toString('base64');
          const mimeType = this.getMimeType(entry.name);

          images.push({
            name: entry.name,
            base64,
            mimeType,
          });
        }
      }
    } catch {
      // 이미지 디렉토리가 없으면 무시
    }

    return images.length > 0 ? images : undefined;
  }

  /**
   * 파일시스템에서 Skill 삭제
   */
  async deleteSkillFiles(skillId: string): Promise<void> {
    const skillDir = this.resolveSkillDirectory(skillId);

    try {
      await this.ensureNoSymlink(skillDir, 'skill directory', this.skillsDir);
      await fs.rm(skillDir, { recursive: true, force: true });
      console.log('[SkillStorage] Skill files deleted:', skillId);
    } catch (error) {
      console.error('[SkillStorage] Failed to delete skill files:', error);
      throw new Error(`Failed to delete skill files: ${error}`);
    }
  }

  /**
   * Skill 구조 검증
   */
  async validateSkillStructure(skillId: string): Promise<boolean> {
    const skillDir = this.resolveSkillDirectory(skillId);

    try {
      await this.ensureNoSymlink(skillDir, 'skill directory', this.skillsDir);

      // 디렉토리 존재 확인
      await fs.access(skillDir);

      // manifest.json 존재 확인
      const manifestPath = path.join(skillDir, 'manifest.json');
      await fs.access(manifestPath);

      // content.json 존재 확인
      const contentPath = path.join(skillDir, 'content.json');
      await fs.access(contentPath);

      // manifest 파싱 테스트
      const manifestData = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestData) as SkillManifest;
      if (manifest.id !== skillId) {
        throw new Error(`Manifest ID mismatch: expected ${skillId}, got ${manifest.id}`);
      }

      // content 파싱 테스트
      const contentData = await fs.readFile(contentPath, 'utf-8');
      JSON.parse(contentData);

      return true;
    } catch (error) {
      console.error('[SkillStorage] Invalid skill structure:', error);
      return false;
    }
  }

  /**
   * 설치된 모든 Skill ID 목록
   */
  async getInstalledSkillIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      const skillIds: string[] = [];

      for (const entry of entries) {
        if (entry.isSymbolicLink()) {
          continue;
        }

        if (entry.isDirectory()) {
          if (!SKILL_ID_PATTERN.test(entry.name)) {
            continue;
          }

          // manifest.json이 있는 디렉토리만 Skill로 간주
          const manifestPath = path.join(this.skillsDir, entry.name, 'manifest.json');
          try {
            await fs.access(manifestPath);
            skillIds.push(entry.name);
          } catch {
            // manifest.json이 없으면 건너뜀
          }
        }
      }

      return skillIds;
    } catch (error) {
      console.error('[SkillStorage] Failed to get installed skill IDs:', error);
      return [];
    }
  }

  /**
   * Skill 로컬 경로 가져오기
   */
  getSkillPath(skillId: string): string {
    return this.resolveSkillDirectory(skillId);
  }

  /**
   * Skills 디렉토리 경로 가져오기
   */
  getSkillsDirectory(): string {
    return this.skillsDir;
  }

  private resolveSkillDirectory(skillId: string): string {
    if (!SKILL_ID_PATTERN.test(skillId)) {
      throw new Error(
        `Invalid skill ID: ${skillId}. Use lowercase letters/numbers with ., _, - (max 128 chars).`
      );
    }

    return this.resolvePathWithin(this.skillsDir, skillId, 'skill directory');
  }

  private resolvePathWithin(baseDir: string, relativePath: string, label: string): string {
    const resolvedBase = path.resolve(baseDir);
    const resolvedTarget = path.resolve(resolvedBase, relativePath);
    const relative = path.relative(resolvedBase, resolvedTarget);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Invalid ${label} path: ${relativePath}`);
    }

    return resolvedTarget;
  }

  private normalizeResourcePath(resourcePath: string, label: string): string {
    if (!resourcePath || typeof resourcePath !== 'string') {
      throw new Error(`Invalid ${label} path: empty path`);
    }

    if (resourcePath.includes('\0')) {
      throw new Error(`Invalid ${label} path: null byte`);
    }

    const normalized = path.posix.normalize(resourcePath.replace(/\\/g, '/'));

    if (
      normalized === '.' ||
      normalized === '..' ||
      normalized.startsWith('../') ||
      normalized.startsWith('/')
    ) {
      throw new Error(`Invalid ${label} path: ${resourcePath}`);
    }

    return normalized;
  }

  private normalizeImageName(imageName: string): string {
    if (!imageName || typeof imageName !== 'string') {
      throw new Error('Invalid image name: empty name');
    }

    if (imageName.includes('\0')) {
      throw new Error('Invalid image name: null byte');
    }

    const normalized = path.basename(imageName);
    if (normalized !== imageName || normalized === '.' || normalized === '..') {
      throw new Error(`Invalid image name: ${imageName}`);
    }

    return normalized;
  }

  private decodeBase64Image(base64: string, imageName: string): Buffer {
    const sanitized = base64.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/=]*$/.test(sanitized)) {
      throw new Error(`Invalid base64 image data: ${imageName}`);
    }
    if (sanitized.length % 4 !== 0) {
      throw new Error(`Invalid base64 image padding: ${imageName}`);
    }
    return Buffer.from(sanitized, 'base64');
  }

  private async ensureNoSymlink(
    targetPath: string,
    label: string,
    baseDir?: string
  ): Promise<void> {
    if (baseDir) {
      const resolvedBase = path.resolve(baseDir);
      const resolvedTarget = path.resolve(targetPath);
      const relative = path.relative(resolvedBase, resolvedTarget);

      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Invalid ${label} path: ${targetPath}`);
      }

      const segments = relative.split(path.sep).filter(Boolean);
      let current = resolvedBase;

      for (const segment of segments) {
        current = path.join(current, segment);
        await this.assertNotSymlink(current, label);
      }
      return;
    }

    await this.assertNotSymlink(targetPath, label);
  }

  private async assertNotSymlink(targetPath: string, label: string): Promise<void> {
    try {
      const stats = await fs.lstat(targetPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`Refusing to access ${label} via symlink: ${targetPath}`);
      }
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  }

  private isNotFoundError(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }

  /**
   * 파일 타입 추론
   */
  private inferFileType(filename: string): 'code' | 'document' | 'data' | 'image' {
    const ext = path.extname(filename).toLowerCase();

    const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.c', '.cpp'];
    const documentExts = ['.md', '.txt', '.pdf', '.doc', '.docx'];
    const dataExts = ['.json', '.yaml', '.yml', '.xml', '.csv', '.toml'];
    const imageExts = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'];

    if (codeExts.includes(ext)) return 'code';
    if (documentExts.includes(ext)) return 'document';
    if (dataExts.includes(ext)) return 'data';
    if (imageExts.includes(ext)) return 'image';

    return 'document'; // 기본값
  }

  /**
   * MIME 타입 추론
   */
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }
}

// Singleton instance
export const skillStorageService = new SkillStorageService();
