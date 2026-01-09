/**
 * Skill Database Service
 *
 * Skills 테이블과 관련된 데이터베이스 작업을 관리하는 서비스
 * databaseService를 래핑하여 Skill 전용 인터페이스 제공
 */

import { databaseService } from './database';
import type {
  InstalledSkill,
  SkillManifest,
  SkillSource,
  SkillUsageHistory,
} from '../../types/skill';

export class SkillDatabaseService {
  /**
   * 모든 설치된 Skills 조회
   */
  getAllSkills(): InstalledSkill[] {
    const db = databaseService.getDatabase();

    const result = db.exec(`
      SELECT id, manifest, source, local_path, installed_at, enabled, usage_count, last_used_at
      FROM skills
      ORDER BY installed_at DESC
    `);

    if (result.length === 0 || result[0].values.length === 0) {
      return [];
    }

    const skills: InstalledSkill[] = [];
    for (const row of result[0].values) {
      try {
        skills.push({
          id: row[0] as string,
          manifest: JSON.parse(row[1] as string) as SkillManifest,
          source: JSON.parse(row[2] as string) as SkillSource,
          localPath: row[3] as string,
          installedAt: row[4] as number,
          enabled: (row[5] as number) === 1,
          usageCount: row[6] as number,
          lastUsedAt: row[7] ? (row[7] as number) : undefined,
        });
      } catch (error) {
        console.error('[SkillDB] Failed to parse skill row:', error);
      }
    }

    return skills;
  }

  /**
   * 활성화된 Skills만 조회
   */
  getEnabledSkills(): InstalledSkill[] {
    const db = databaseService.getDatabase();

    const result = db.exec(`
      SELECT id, manifest, source, local_path, installed_at, enabled, usage_count, last_used_at
      FROM skills
      WHERE enabled = 1
      ORDER BY installed_at DESC
    `);

    if (result.length === 0 || result[0].values.length === 0) {
      return [];
    }

    const skills: InstalledSkill[] = [];
    for (const row of result[0].values) {
      try {
        skills.push({
          id: row[0] as string,
          manifest: JSON.parse(row[1] as string) as SkillManifest,
          source: JSON.parse(row[2] as string) as SkillSource,
          localPath: row[3] as string,
          installedAt: row[4] as number,
          enabled: true,
          usageCount: row[6] as number,
          lastUsedAt: row[7] ? (row[7] as number) : undefined,
        });
      } catch (error) {
        console.error('[SkillDB] Failed to parse skill row:', error);
      }
    }

    return skills;
  }

  /**
   * 특정 Skill 조회
   */
  getSkill(skillId: string): InstalledSkill | null {
    const db = databaseService.getDatabase();

    const result = db.exec(
      `SELECT id, manifest, source, local_path, installed_at, enabled, usage_count, last_used_at
       FROM skills
       WHERE id = ?`,
      [skillId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];

    try {
      return {
        id: row[0] as string,
        manifest: JSON.parse(row[1] as string) as SkillManifest,
        source: JSON.parse(row[2] as string) as SkillSource,
        localPath: row[3] as string,
        installedAt: row[4] as number,
        enabled: (row[5] as number) === 1,
        usageCount: row[6] as number,
        lastUsedAt: row[7] ? (row[7] as number) : undefined,
      };
    } catch (error) {
      console.error('[SkillDB] Failed to parse skill:', error);
      return null;
    }
  }

  /**
   * Skill 저장 (추가 또는 업데이트)
   */
  saveSkill(skill: InstalledSkill): void {
    const db = databaseService.getDatabase();

    db.run(
      `INSERT OR REPLACE INTO skills
       (id, manifest, source, local_path, installed_at, enabled, usage_count, last_used_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        skill.id,
        JSON.stringify(skill.manifest),
        JSON.stringify(skill.source),
        skill.localPath,
        skill.installedAt,
        skill.enabled ? 1 : 0,
        skill.usageCount,
        skill.lastUsedAt || null,
        Date.now(),
      ]
    );

    databaseService['saveDatabase'](); // Private method 호출

    console.log('[SkillDB] Skill saved:', skill.id);
  }

  /**
   * Skill 삭제
   */
  deleteSkill(skillId: string): void {
    const db = databaseService.getDatabase();

    db.run('DELETE FROM skills WHERE id = ?', [skillId]);
    databaseService['saveDatabase']();

    console.log('[SkillDB] Skill deleted:', skillId);
  }

  /**
   * Skill 활성화/비활성화
   */
  toggleSkill(skillId: string, enabled: boolean): void {
    const db = databaseService.getDatabase();

    db.run('UPDATE skills SET enabled = ?, updated_at = ? WHERE id = ?', [
      enabled ? 1 : 0,
      Date.now(),
      skillId,
    ]);

    databaseService['saveDatabase']();

    console.log('[SkillDB] Skill toggled:', skillId, enabled);
  }

  /**
   * Skill 사용 횟수 증가 및 마지막 사용 시간 업데이트
   */
  updateSkillUsage(skillId: string): void {
    const db = databaseService.getDatabase();

    const now = Date.now();

    db.run(
      `UPDATE skills
       SET usage_count = usage_count + 1,
           last_used_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [now, now, skillId]
    );

    databaseService['saveDatabase']();

    console.log('[SkillDB] Skill usage updated:', skillId);
  }

  /**
   * Skill 사용 이력 저장
   */
  saveSkillUsageHistory(history: Omit<SkillUsageHistory, 'id'>): void {
    const db = databaseService.getDatabase();

    db.run(
      `INSERT INTO skill_usage_history
       (skill_id, conversation_id, activated_at, context_pattern)
       VALUES (?, ?, ?, ?)`,
      [history.skillId, history.conversationId, history.activatedAt, history.contextPattern || null]
    );

    databaseService['saveDatabase']();

    console.log('[SkillDB] Usage history saved:', history.skillId);
  }

  /**
   * 특정 Skill의 사용 이력 조회
   */
  getSkillUsageHistory(skillId: string, limit = 100): SkillUsageHistory[] {
    const db = databaseService.getDatabase();

    const result = db.exec(
      `SELECT id, skill_id, conversation_id, activated_at, context_pattern
       FROM skill_usage_history
       WHERE skill_id = ?
       ORDER BY activated_at DESC
       LIMIT ?`,
      [skillId, limit]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return [];
    }

    const histories: SkillUsageHistory[] = [];
    for (const row of result[0].values) {
      histories.push({
        id: row[0] as number,
        skillId: row[1] as string,
        conversationId: row[2] as string,
        activatedAt: row[3] as number,
        contextPattern: row[4] ? (row[4] as string) : undefined,
      });
    }

    return histories;
  }

  /**
   * 특정 대화의 Skill 사용 이력 조회
   */
  getConversationSkillHistory(conversationId: string): SkillUsageHistory[] {
    const db = databaseService.getDatabase();

    const result = db.exec(
      `SELECT id, skill_id, conversation_id, activated_at, context_pattern
       FROM skill_usage_history
       WHERE conversation_id = ?
       ORDER BY activated_at ASC`,
      [conversationId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return [];
    }

    const histories: SkillUsageHistory[] = [];
    for (const row of result[0].values) {
      histories.push({
        id: row[0] as number,
        skillId: row[1] as string,
        conversationId: row[2] as string,
        activatedAt: row[3] as number,
        contextPattern: row[4] ? (row[4] as string) : undefined,
      });
    }

    return histories;
  }

  /**
   * Skill ID 존재 여부 확인
   */
  skillExists(skillId: string): boolean {
    const db = databaseService.getDatabase();

    const result = db.exec('SELECT COUNT(*) as count FROM skills WHERE id = ?', [skillId]);

    if (result.length === 0 || result[0].values.length === 0) {
      return false;
    }

    const count = result[0].values[0][0] as number;
    return count > 0;
  }

  /**
   * 모든 Skill 사용 이력 삭제 (특정 Skill)
   */
  deleteSkillUsageHistory(skillId: string): void {
    const db = databaseService.getDatabase();

    db.run('DELETE FROM skill_usage_history WHERE skill_id = ?', [skillId]);
    databaseService['saveDatabase']();

    console.log('[SkillDB] Usage history deleted for skill:', skillId);
  }

  /**
   * 모든 Skill 사용 이력 삭제 (특정 대화)
   */
  deleteConversationSkillHistory(conversationId: string): void {
    const db = databaseService.getDatabase();

    db.run('DELETE FROM skill_usage_history WHERE conversation_id = ?', [conversationId]);
    databaseService['saveDatabase']();

    console.log('[SkillDB] Usage history deleted for conversation:', conversationId);
  }

  /**
   * Skill 통계 조회
   */
  getSkillStatistics(skillId: string): {
    totalUsage: number;
    lastUsedAt: number | null;
    conversationCount: number;
    topContextPatterns: string[];
  } | null {
    const skill = this.getSkill(skillId);
    if (!skill) {
      return null;
    }

    const db = databaseService.getDatabase();

    // 대화 수 조회
    const convResult = db.exec(
      `SELECT COUNT(DISTINCT conversation_id) as count
       FROM skill_usage_history
       WHERE skill_id = ?`,
      [skillId]
    );

    const conversationCount = convResult.length > 0 ? (convResult[0].values[0][0] as number) : 0;

    // 상위 컨텍스트 패턴 조회
    const patternResult = db.exec(
      `SELECT context_pattern, COUNT(*) as count
       FROM skill_usage_history
       WHERE skill_id = ? AND context_pattern IS NOT NULL
       GROUP BY context_pattern
       ORDER BY count DESC
       LIMIT 5`,
      [skillId]
    );

    const topContextPatterns: string[] = [];
    if (patternResult.length > 0) {
      for (const row of patternResult[0].values) {
        if (row[0]) {
          topContextPatterns.push(row[0] as string);
        }
      }
    }

    return {
      totalUsage: skill.usageCount,
      lastUsedAt: skill.lastUsedAt || null,
      conversationCount,
      topContextPatterns,
    };
  }
}

// Singleton instance
export const skillDatabaseService = new SkillDatabaseService();
