/**
 * Skill Loader
 *
 * Skills를 파일시스템에서 로드하고 검증하는 유틸리티
 * - SkillStorageService를 래핑
 * - 검증 로직 추가
 * - 의존성 체크
 */

import type { SkillPackage, SkillManifest } from '../../types/skill';
import { compareVersions } from './version-utils';

/**
 * Skill 로드 옵션
 */
interface LoadSkillOptions {
  validateDependencies?: boolean; // 의존성 검증 여부
  checkCompatibility?: boolean; // 앱 버전 호환성 체크
  throwOnError?: boolean; // 에러 발생 시 throw 여부
}

/**
 * 의존성 체크 결과
 */
interface DependencyCheckResult {
  valid: boolean;
  missingMCPServers: string[];
  missingExtensions: string[];
  incompatibleVersion: boolean;
  errors: string[];
}

/**
 * Skill Loader 클래스
 */
export class SkillLoader {
  /**
   * Skill 로드
   *
   * @param skillId - 스킬 ID
   * @param options - 로드 옵션
   * @returns SkillPackage
   */
  async loadSkill(skillId: string, options: LoadSkillOptions = {}): Promise<SkillPackage> {
    const { validateDependencies = true, checkCompatibility = true, throwOnError = true } = options;

    try {
      console.log(`[SkillLoader] Loading skill: ${skillId}`);

      // Storage에서 로드
      const { skillStorageService } = await import('../../electron/services/skill-storage');
      const skillPackage = await skillStorageService.loadSkillFromFileSystem(skillId);

      // Manifest 검증
      this.validateManifest(skillPackage.manifest);

      // Content 검증
      this.validateContent(skillPackage);

      // 의존성 체크
      if (validateDependencies) {
        const depCheck = await this.checkDependencies(skillPackage.manifest);
        if (!depCheck.valid) {
          const errorMsg = `Dependency check failed: ${depCheck.errors.join(', ')}`;
          console.error(`[SkillLoader] ${errorMsg}`);
          if (throwOnError) {
            throw new Error(errorMsg);
          }
        }
      }

      // 버전 호환성 체크
      if (checkCompatibility) {
        const compatible = await this.checkCompatibility(skillPackage.manifest);
        if (!compatible) {
          const errorMsg = `Skill requires newer app version: ${skillPackage.manifest.minAppVersion}`;
          console.warn(`[SkillLoader] ${errorMsg}`);
          if (throwOnError) {
            throw new Error(errorMsg);
          }
        }
      }

      console.log(`[SkillLoader] Skill loaded successfully: ${skillId}`);

      return skillPackage;
    } catch (error) {
      console.error(`[SkillLoader] Failed to load skill ${skillId}:`, error);
      throw error;
    }
  }

  /**
   * 여러 스킬을 배치로 로드
   */
  async loadSkills(skillIds: string[], options?: LoadSkillOptions): Promise<SkillPackage[]> {
    const packages: SkillPackage[] = [];
    const errors: Array<{ skillId: string; error: Error }> = [];

    for (const skillId of skillIds) {
      try {
        const pkg = await this.loadSkill(skillId, { ...options, throwOnError: false });
        packages.push(pkg);
      } catch (error) {
        errors.push({ skillId, error: error as Error });
        console.error(`[SkillLoader] Failed to load skill ${skillId}:`, error);
      }
    }

    if (errors.length > 0) {
      console.warn(`[SkillLoader] ${errors.length} skills failed to load:`, errors);
    }

    return packages;
  }

  /**
   * Manifest 검증
   */
  private validateManifest(manifest: SkillManifest): void {
    // 필수 필드 확인
    if (!manifest.id) {
      throw new Error('Manifest missing required field: id');
    }

    if (!manifest.name) {
      throw new Error('Manifest missing required field: name');
    }

    if (!manifest.version) {
      throw new Error('Manifest missing required field: version');
    }

    if (!manifest.author) {
      throw new Error('Manifest missing required field: author');
    }

    if (!manifest.description) {
      throw new Error('Manifest missing required field: description');
    }

    if (!manifest.category) {
      throw new Error('Manifest missing required field: category');
    }

    // ID 형식 검증 (reverse domain notation)
    const idPattern = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;
    if (!idPattern.test(manifest.id)) {
      throw new Error(
        `Invalid skill ID format: ${manifest.id}. Must follow reverse domain notation (e.g., com.example.skill)`
      );
    }

    // 버전 형식 검증 (Semantic Versioning)
    const versionPattern = /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/;
    if (!versionPattern.test(manifest.version)) {
      throw new Error(
        `Invalid version format: ${manifest.version}. Must follow Semantic Versioning (e.g., 1.0.0)`
      );
    }

    console.log(`[SkillLoader] Manifest validated: ${manifest.id}`);
  }

  /**
   * Content 검증
   */
  private validateContent(skillPackage: SkillPackage): void {
    const { content } = skillPackage;

    // Content가 있는지 확인
    if (!content) {
      console.warn(`[SkillLoader] Skill has no content: ${skillPackage.manifest.id}`);
      return;
    }

    // systemPrompt가 있으면 길이 확인 (너무 길면 경고)
    if (content.systemPrompt && content.systemPrompt.length > 10000) {
      console.warn(
        `[SkillLoader] System prompt is very long (${content.systemPrompt.length} chars) for skill: ${skillPackage.manifest.id}`
      );
    }

    // Knowledge 항목 검증
    if (content.knowledge) {
      for (const item of content.knowledge) {
        if (!item.title || !item.content) {
          throw new Error(`Invalid knowledge item in skill: ${skillPackage.manifest.id}`);
        }
      }
    }

    // Templates 검증
    if (content.templates) {
      for (const template of content.templates) {
        if (!template.id || !template.name || !template.prompt) {
          throw new Error(`Invalid template in skill: ${skillPackage.manifest.id}`);
        }
      }
    }

    console.log(`[SkillLoader] Content validated: ${skillPackage.manifest.id}`);
  }

  /**
   * 의존성 체크
   */
  async checkDependencies(manifest: SkillManifest): Promise<DependencyCheckResult> {
    const result: DependencyCheckResult = {
      valid: true,
      missingMCPServers: [],
      missingExtensions: [],
      incompatibleVersion: false,
      errors: [],
    };

    try {
      // MCP Servers 체크 (Phase 3에서 구현)
      if (manifest.requiredMCPServers && manifest.requiredMCPServers.length > 0) {
        // TODO: Phase 3에서 구현
        console.warn(
          '[SkillLoader] MCP server dependency check not yet implemented:',
          manifest.requiredMCPServers
        );
      }

      // Extensions 체크 (Phase 3에서 구현)
      if (manifest.requiredExtensions && manifest.requiredExtensions.length > 0) {
        // TODO: Phase 3에서 구현
        console.warn(
          '[SkillLoader] Extension dependency check not yet implemented:',
          manifest.requiredExtensions
        );
      }

      // 버전 호환성 체크
      if (manifest.minAppVersion) {
        const compatible = await this.checkCompatibility(manifest);
        if (!compatible) {
          result.incompatibleVersion = true;
          result.valid = false;
          result.errors.push(`Requires app version ${manifest.minAppVersion} or higher`);
        }
      }
    } catch (error) {
      console.error('[SkillLoader] Dependency check failed:', error);
      result.valid = false;
      result.errors.push(`Dependency check error: ${error}`);
    }

    return result;
  }

  /**
   * 앱 버전 호환성 체크
   */
  async checkCompatibility(manifest: SkillManifest): Promise<boolean> {
    if (!manifest.minAppVersion) {
      return true; // 최소 버전이 명시되지 않으면 호환
    }

    try {
      // package.json에서 현재 앱 버전 가져오기
      const { version: currentVersion } = await import('../../package.json');

      return compareVersions(currentVersion, manifest.minAppVersion) >= 0;
    } catch (error) {
      console.error('[SkillLoader] Failed to check compatibility:', error);
      return true; // 체크 실패 시 호환되는 것으로 간주
    }
  }

  /**
   * Skill 재검증
   */
  async revalidateSkill(skillId: string): Promise<boolean> {
    try {
      await this.loadSkill(skillId, {
        validateDependencies: true,
        checkCompatibility: true,
        throwOnError: true,
      });
      return true;
    } catch (error) {
      console.error(`[SkillLoader] Revalidation failed for ${skillId}:`, error);
      return false;
    }
  }

  /**
   * 모든 설치된 Skill 재검증
   */
  async revalidateAll(): Promise<string[]> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');
    const installedSkills = skillDatabaseService.getAllSkills();

    const invalidSkills: string[] = [];

    for (const skill of installedSkills) {
      const isValid = await this.revalidateSkill(skill.id);
      if (!isValid) {
        invalidSkills.push(skill.id);
      }
    }

    return invalidSkills;
  }
}

// Singleton instance export
export const skillLoader = new SkillLoader();
