/**
 * Skill Registry
 *
 * Skills의 설치/제거/관리를 담당하는 서비스
 * - SkillDatabaseService와 SkillStorageService를 래핑
 * - 비즈니스 로직 및 검증 제공
 * - SkillManager와 통합
 */

import type {
  SkillPackage,
  InstalledSkill,
  SkillSource,
  SkillUsageHistory,
  SkillStatistics,
} from '../../types/skill';
import { skillManager } from './manager';

/**
 * Skill Registry 클래스
 */
export class SkillRegistry {
  /**
   * 모든 설치된 Skills 조회
   */
  async getInstalledSkills(): Promise<InstalledSkill[]> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');
    return skillDatabaseService.getAllSkills();
  }

  /**
   * 활성화된 Skills만 조회
   */
  async getEnabledSkills(): Promise<InstalledSkill[]> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');
    return skillDatabaseService.getEnabledSkills();
  }

  /**
   * 특정 Skill 조회
   */
  async getSkill(skillId: string): Promise<InstalledSkill | null> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');
    return skillDatabaseService.getSkill(skillId);
  }

  /**
   * Skill 존재 여부 확인
   */
  async skillExists(skillId: string): Promise<boolean> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');
    return skillDatabaseService.skillExists(skillId);
  }

  /**
   * Skill 설치
   *
   * @param skillPackage - 설치할 스킬 패키지
   * @param source - 스킬 출처 정보
   * @returns 설치된 스킬 정보
   */
  async installSkill(skillPackage: SkillPackage, source: SkillSource): Promise<InstalledSkill> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');
    const { skillStorageService } = await import('../../electron/services/skill-storage');

    try {
      console.log(`[SkillRegistry] Installing skill: ${skillPackage.manifest.id}`);

      // 이미 설치된 경우 확인
      const exists = await this.skillExists(skillPackage.manifest.id);
      if (exists) {
        throw new Error(`Skill already installed: ${skillPackage.manifest.id}`);
      }

      // 파일시스템에 저장
      const localPath = await skillStorageService.saveSkillToFileSystem(skillPackage);

      // DB에 저장
      const installedSkill: InstalledSkill = {
        id: skillPackage.manifest.id,
        manifest: skillPackage.manifest,
        source,
        localPath,
        installedAt: Date.now(),
        enabled: true,
        usageCount: 0,
      };

      skillDatabaseService.saveSkill(installedSkill);

      // SkillManager에 manifest 추가
      await skillManager.reloadManifests();

      console.log(`[SkillRegistry] Skill installed successfully: ${skillPackage.manifest.id}`);

      return installedSkill;
    } catch (error) {
      console.error(`[SkillRegistry] Failed to install skill:`, error);
      throw new Error(`Failed to install skill: ${error}`);
    }
  }

  /**
   * Skill 업데이트
   *
   * @param skillPackage - 업데이트할 스킬 패키지
   * @returns 업데이트된 스킬 정보
   */
  async updateSkill(skillPackage: SkillPackage): Promise<InstalledSkill> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');
    const { skillStorageService } = await import('../../electron/services/skill-storage');

    try {
      console.log(`[SkillRegistry] Updating skill: ${skillPackage.manifest.id}`);

      // 기존 스킬 확인
      const existingSkill = await this.getSkill(skillPackage.manifest.id);
      if (!existingSkill) {
        throw new Error(`Skill not found: ${skillPackage.manifest.id}`);
      }

      // 로드된 스킬이면 언로드
      if (skillManager.isLoaded(skillPackage.manifest.id)) {
        skillManager.unloadSkill(skillPackage.manifest.id);
      }

      // 파일 삭제 후 재저장
      await skillStorageService.deleteSkillFiles(skillPackage.manifest.id);
      const localPath = await skillStorageService.saveSkillToFileSystem(skillPackage);

      // DB 업데이트
      const updatedSkill: InstalledSkill = {
        ...existingSkill,
        manifest: skillPackage.manifest,
        localPath,
      };

      skillDatabaseService.saveSkill(updatedSkill);

      // SkillManager manifest 갱신
      await skillManager.reloadManifests();

      console.log(`[SkillRegistry] Skill updated successfully: ${skillPackage.manifest.id}`);

      return updatedSkill;
    } catch (error) {
      console.error(`[SkillRegistry] Failed to update skill:`, error);
      throw new Error(`Failed to update skill: ${error}`);
    }
  }

  /**
   * Skill 제거
   *
   * @param skillId - 제거할 스킬 ID
   */
  async removeSkill(skillId: string): Promise<void> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');
    const { skillStorageService } = await import('../../electron/services/skill-storage');

    try {
      console.log(`[SkillRegistry] Removing skill: ${skillId}`);

      // 스킬 존재 확인
      const exists = await this.skillExists(skillId);
      if (!exists) {
        throw new Error(`Skill not found: ${skillId}`);
      }

      // 로드된 경우 언로드
      if (skillManager.isLoaded(skillId)) {
        skillManager.unloadSkill(skillId);
      }

      // 사용 이력 삭제
      skillDatabaseService.deleteSkillUsageHistory(skillId);

      // 파일시스템에서 삭제
      await skillStorageService.deleteSkillFiles(skillId);

      // DB에서 삭제
      skillDatabaseService.deleteSkill(skillId);

      // SkillManager manifest 갱신
      await skillManager.reloadManifests();

      console.log(`[SkillRegistry] Skill removed successfully: ${skillId}`);
    } catch (error) {
      console.error(`[SkillRegistry] Failed to remove skill:`, error);
      throw new Error(`Failed to remove skill: ${error}`);
    }
  }

  /**
   * Skill 활성화
   */
  async enableSkill(skillId: string): Promise<void> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');

    try {
      console.log(`[SkillRegistry] Enabling skill: ${skillId}`);

      skillDatabaseService.toggleSkill(skillId, true);

      // SkillManager manifest 갱신
      await skillManager.reloadManifests();

      console.log(`[SkillRegistry] Skill enabled: ${skillId}`);
    } catch (error) {
      console.error(`[SkillRegistry] Failed to enable skill:`, error);
      throw new Error(`Failed to enable skill: ${error}`);
    }
  }

  /**
   * Skill 비활성화
   */
  async disableSkill(skillId: string): Promise<void> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');

    try {
      console.log(`[SkillRegistry] Disabling skill: ${skillId}`);

      skillDatabaseService.toggleSkill(skillId, false);

      // 로드된 경우 언로드
      if (skillManager.isLoaded(skillId)) {
        skillManager.unloadSkill(skillId);
      }

      // SkillManager manifest 갱신
      await skillManager.reloadManifests();

      console.log(`[SkillRegistry] Skill disabled: ${skillId}`);
    } catch (error) {
      console.error(`[SkillRegistry] Failed to disable skill:`, error);
      throw new Error(`Failed to disable skill: ${error}`);
    }
  }

  /**
   * Skill 사용 이력 기록
   *
   * @param skillId - 스킬 ID
   * @param conversationId - 대화 ID
   * @param contextPattern - 매칭된 컨텍스트 패턴 (optional)
   */
  async recordUsage(
    skillId: string,
    conversationId: string,
    contextPattern?: string
  ): Promise<void> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');

    try {
      // 사용 횟수 및 마지막 사용 시간 업데이트
      skillDatabaseService.updateSkillUsage(skillId);

      // 사용 이력 저장
      skillDatabaseService.saveSkillUsageHistory({
        skillId,
        conversationId,
        activatedAt: Date.now(),
        contextPattern,
      });

      console.log(`[SkillRegistry] Usage recorded for skill: ${skillId}`);
    } catch (error) {
      console.error(`[SkillRegistry] Failed to record usage:`, error);
      // 사용 이력 기록 실패는 치명적이지 않으므로 throw하지 않음
    }
  }

  /**
   * Skill 사용 이력 조회
   */
  async getUsageHistory(skillId: string, limit = 100): Promise<SkillUsageHistory[]> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');
    return skillDatabaseService.getSkillUsageHistory(skillId, limit);
  }

  /**
   * 대화별 Skill 사용 이력 조회
   */
  async getConversationSkillHistory(conversationId: string): Promise<SkillUsageHistory[]> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');
    return skillDatabaseService.getConversationSkillHistory(conversationId);
  }

  /**
   * Skill 통계 조회
   */
  async getStatistics(skillId: string): Promise<SkillStatistics | null> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');
    const dbStats = skillDatabaseService.getSkillStatistics(skillId);

    if (!dbStats) {
      return null;
    }

    // DB 통계를 SkillStatistics 타입으로 변환
    const skill = await this.getSkill(skillId);
    if (!skill) {
      return null;
    }

    return {
      skillId,
      skillName: skill.manifest.name,
      usageCount: dbStats.totalUsage,
      lastUsedAt: dbStats.lastUsedAt || undefined,
      averageActivationScore: undefined, // Phase 3에서 구현
      topContextPatterns: dbStats.topContextPatterns,
    };
  }

  /**
   * 설치된 모든 Skill의 통계 조회
   */
  async getAllStatistics(): Promise<Map<string, SkillStatistics>> {
    const skills = await this.getInstalledSkills();
    const statsMap = new Map<string, SkillStatistics>();

    for (const skill of skills) {
      const stats = await this.getStatistics(skill.id);
      if (stats) {
        statsMap.set(skill.id, stats);
      }
    }

    return statsMap;
  }

  /**
   * Skill 구조 검증
   */
  async validateSkill(skillId: string): Promise<boolean> {
    const { skillStorageService } = await import('../../electron/services/skill-storage');
    return skillStorageService.validateSkillStructure(skillId);
  }

  /**
   * 손상된 Skill 복구 시도
   */
  async repairSkill(skillId: string): Promise<boolean> {
    try {
      console.log(`[SkillRegistry] Attempting to repair skill: ${skillId}`);

      // 구조 검증
      const isValid = await this.validateSkill(skillId);
      if (isValid) {
        console.log(`[SkillRegistry] Skill is valid, no repair needed: ${skillId}`);
        return true;
      }

      // 로드된 경우 언로드
      if (skillManager.isLoaded(skillId)) {
        skillManager.unloadSkill(skillId);
      }

      // manifest 갱신 시도
      await skillManager.reloadManifests();

      // 재검증
      const isValidAfterRepair = await this.validateSkill(skillId);

      if (isValidAfterRepair) {
        console.log(`[SkillRegistry] Skill repaired successfully: ${skillId}`);
        return true;
      } else {
        console.error(`[SkillRegistry] Failed to repair skill: ${skillId}`);
        return false;
      }
    } catch (error) {
      console.error(`[SkillRegistry] Repair failed for skill ${skillId}:`, error);
      return false;
    }
  }

  /**
   * 모든 설치된 Skill 검증 및 손상된 Skill 목록 반환
   */
  async validateAll(): Promise<string[]> {
    const skills = await this.getInstalledSkills();
    const damaged: string[] = [];

    for (const skill of skills) {
      const isValid = await this.validateSkill(skill.id);
      if (!isValid) {
        damaged.push(skill.id);
      }
    }

    if (damaged.length > 0) {
      console.warn(`[SkillRegistry] Found ${damaged.length} damaged skills:`, damaged);
    } else {
      console.log('[SkillRegistry] All skills are valid');
    }

    return damaged;
  }

  /**
   * 대화 삭제 시 관련 Skill 사용 이력 삭제
   */
  async deleteConversationHistory(conversationId: string): Promise<void> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');

    try {
      skillDatabaseService.deleteConversationSkillHistory(conversationId);
      console.log(`[SkillRegistry] Deleted skill history for conversation: ${conversationId}`);
    } catch (error) {
      console.error(`[SkillRegistry] Failed to delete conversation history:`, error);
      // 이력 삭제 실패는 치명적이지 않으므로 throw하지 않음
    }
  }
}

// Singleton instance export
export const skillRegistry = new SkillRegistry();
