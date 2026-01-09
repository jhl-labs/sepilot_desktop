/**
 * Skill Storage Service
 *
 * 파일시스템에 Skills를 저장하고 로드하는 서비스
 * userData/skills/ 디렉토리를 관리
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import type { SkillPackage, SkillManifest, SkillContent, SkillResources } from '../../types/skill';

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
  async saveSkillToFileSystem(skillPackage: SkillPackage): Promise<string> {
    const skillDir = path.join(this.skillsDir, skillPackage.manifest.id);

    try {
      // 스킬 디렉토리 생성
      await fs.mkdir(skillDir, { recursive: true });

      // manifest.json 저장
      const manifestPath = path.join(skillDir, 'manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(skillPackage.manifest, null, 2), 'utf-8');

      // content.json 저장
      const contentPath = path.join(skillDir, 'content.json');
      await fs.writeFile(contentPath, JSON.stringify(skillPackage.content, null, 2), 'utf-8');

      // README.md 저장 (있는 경우)
      if (skillPackage.manifest.readme) {
        const readmePath = path.join(skillDir, 'README.md');
        await fs.writeFile(readmePath, skillPackage.manifest.readme, 'utf-8');
      }

      // Resources 저장
      if (skillPackage.resources) {
        await this.saveResources(skillDir, skillPackage.resources);
      }

      console.log('[SkillStorage] Skill saved to filesystem:', skillPackage.manifest.id);
      return skillDir;
    } catch (error) {
      console.error('[SkillStorage] Failed to save skill:', error);
      // 실패 시 생성된 디렉토리 정리
      try {
        await fs.rm(skillDir, { recursive: true, force: true });
      } catch {}
      throw new Error(`Failed to save skill: ${error}`);
    }
  }

  /**
   * Resources 저장
   */
  private async saveResources(skillDir: string, resources: SkillResources): Promise<void> {
    const resourcesDir = path.join(skillDir, 'resources');
    await fs.mkdir(resourcesDir, { recursive: true });

    // 파일 저장
    if (resources.files) {
      for (const file of resources.files) {
        const filePath = path.join(resourcesDir, file.path);
        const fileDir = path.dirname(filePath);

        // 하위 디렉토리 생성
        await fs.mkdir(fileDir, { recursive: true });

        // 파일 저장
        await fs.writeFile(filePath, file.content, 'utf-8');
      }
    }

    // 이미지 저장
    if (resources.images) {
      const imagesDir = path.join(resourcesDir, 'images');
      await fs.mkdir(imagesDir, { recursive: true });

      for (const image of resources.images) {
        const imagePath = path.join(imagesDir, image.name);
        const buffer = Buffer.from(image.base64, 'base64');
        await fs.writeFile(imagePath, buffer);
      }
    }
  }

  /**
   * 파일시스템에서 Skill 패키지 로드
   */
  async loadSkillFromFileSystem(skillId: string): Promise<SkillPackage> {
    const skillDir = path.join(this.skillsDir, skillId);

    try {
      // 디렉토리 존재 확인
      await fs.access(skillDir);

      // manifest.json 로드
      const manifestPath = path.join(skillDir, 'manifest.json');
      const manifestData = await fs.readFile(manifestPath, 'utf-8');
      const manifest: SkillManifest = JSON.parse(manifestData);

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
    } catch {
      // Resources 디렉토리가 없으면 undefined 반환
      return undefined;
    }

    const resources: SkillResources = {};

    // 파일 로드
    const files = await this.loadResourceFiles(resourcesDir);
    if (files.length > 0) {
      resources.files = files;
    }

    // 이미지 로드
    const images = await this.loadResourceImages(resourcesDir);
    if (images.length > 0) {
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
        const relativePath = path.join(basePath, entry.name);

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
    const skillDir = path.join(this.skillsDir, skillId);

    try {
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
    const skillDir = path.join(this.skillsDir, skillId);

    try {
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
      JSON.parse(manifestData);

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
        if (entry.isDirectory()) {
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
    return path.join(this.skillsDir, skillId);
  }

  /**
   * Skills 디렉토리 경로 가져오기
   */
  getSkillsDirectory(): string {
    return this.skillsDir;
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
