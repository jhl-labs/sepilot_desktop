/**
 * Skills IPC Handlers
 *
 * Renderer Process와 Main Process 간 Skills 관련 IPC 통신 핸들러
 */

import { ipcMain } from 'electron';
import { z } from 'zod';
import type {
  SkillPackage,
  InstalledSkill,
  SkillUsageHistory,
  SkillStatistics,
  SkillValidationResult,
  SkillSource,
} from '../../../types/skill';
import type { IPCResponse } from '../../../types/electron';
import { skillManager } from '../../../lib/skills/manager';
import { skillRegistry } from '../../../lib/skills/registry';
import { skillLoader } from '../../../lib/skills/loader';
import { githubIntegration } from '../../../lib/skills/github-integration';

/**
 * Zod schemas for runtime validation
 */
const SkillIdSchema = z.string().min(1);
const SkillSourceSchema = z.object({
  type: z.enum(['local', 'github', 'marketplace', 'builtin']),
  url: z.string().optional(),
  version: z.string().optional(),
  downloadedAt: z.number().optional(),
});

/**
 * Initialize Skills system on app startup
 */
export async function initializeSkills(): Promise<void> {
  console.log('[Skills] Initializing Skills system...');

  try {
    // Skill Storage 초기화
    const { skillStorageService } = await import('../../services/skill-storage');
    await skillStorageService.initialize();

    // Skill Manager 초기화 (manifests 로드)
    await skillManager.initialize();

    console.log('[Skills] Skills system initialized successfully');
  } catch (error) {
    console.error('[Skills] Failed to initialize Skills system:', error);
    throw error;
  }
}

/**
 * Register Skills IPC handlers
 */
export function registerSkillsHandlers(): void {
  console.log('[IPC] Registering Skills handlers...');

  /**
   * 설치된 스킬 목록 조회
   */
  ipcMain.handle('skills:get-installed', async (): Promise<IPCResponse<InstalledSkill[]>> => {
    try {
      const skills = await skillRegistry.getInstalledSkills();
      return { success: true, data: skills };
    } catch (error) {
      console.error('[IPC] skills:get-installed error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 활성화된 스킬만 조회
   */
  ipcMain.handle('skills:get-enabled', async (): Promise<IPCResponse<InstalledSkill[]>> => {
    try {
      const skills = await skillRegistry.getEnabledSkills();
      return { success: true, data: skills };
    } catch (error) {
      console.error('[IPC] skills:get-enabled error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 특정 스킬 조회
   */
  ipcMain.handle(
    'skills:get-skill',
    async (_, skillId: string): Promise<IPCResponse<InstalledSkill | null>> => {
      try {
        SkillIdSchema.parse(skillId);
        const skill = await skillRegistry.getSkill(skillId);
        return { success: true, data: skill };
      } catch (error) {
        console.error('[IPC] skills:get-skill error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * 스킬 설치
   */
  ipcMain.handle(
    'skills:install',
    async (
      _,
      skillPackage: SkillPackage,
      source: SkillSource
    ): Promise<IPCResponse<InstalledSkill>> => {
      try {
        // 검증
        SkillSourceSchema.parse(source);

        // 설치
        const installedSkill = await skillRegistry.installSkill(skillPackage, source);
        return { success: true, data: installedSkill };
      } catch (error) {
        console.error('[IPC] skills:install error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * 로컬 ZIP 파일에서 스킬 설치 (Phase 1에서는 스텁)
   */
  ipcMain.handle(
    'skills:install-from-local',
    async (_, zipPath: string): Promise<IPCResponse<InstalledSkill>> => {
      try {
        // TODO: Phase 1에서는 구현하지 않음
        // Phase 2 또는 3에서 ZIP 파일 파싱 및 설치 구현
        throw new Error('Install from local ZIP not yet implemented');
      } catch (error) {
        console.error('[IPC] skills:install-from-local error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * 스킬 제거
   */
  ipcMain.handle('skills:remove', async (_, skillId: string): Promise<IPCResponse> => {
    try {
      SkillIdSchema.parse(skillId);
      await skillRegistry.removeSkill(skillId);
      return { success: true };
    } catch (error) {
      console.error('[IPC] skills:remove error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 스킬 활성화/비활성화
   */
  ipcMain.handle(
    'skills:toggle',
    async (_, skillId: string, enabled: boolean): Promise<IPCResponse> => {
      try {
        SkillIdSchema.parse(skillId);

        if (enabled) {
          await skillRegistry.enableSkill(skillId);
        } else {
          await skillRegistry.disableSkill(skillId);
        }

        return { success: true };
      } catch (error) {
        console.error('[IPC] skills:toggle error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * 스킬 로드 (Lazy loading)
   */
  ipcMain.handle(
    'skills:load-skill',
    async (_, skillId: string): Promise<IPCResponse<SkillPackage>> => {
      try {
        SkillIdSchema.parse(skillId);

        // SkillManager를 통해 로드
        const loadedSkill = await skillManager.loadSkill(skillId);

        // LoadedSkill을 SkillPackage로 변환
        const skillPackage: SkillPackage = {
          manifest: loadedSkill.package.manifest,
          content: loadedSkill.package.content,
          resources: loadedSkill.package.resources,
        };

        return { success: true, data: skillPackage };
      } catch (error) {
        console.error('[IPC] skills:load-skill error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * 스킬 사용 이력 업데이트
   */
  ipcMain.handle('skills:update-usage', async (_, skillId: string): Promise<IPCResponse> => {
    try {
      SkillIdSchema.parse(skillId);

      // 임시로 conversationId는 'unknown'으로 설정
      // Phase 3에서 LangGraph 통합 시 실제 conversationId 전달
      await skillRegistry.recordUsage(skillId, 'unknown');

      return { success: true };
    } catch (error) {
      console.error('[IPC] skills:update-usage error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 스킬 통계 조회
   */
  ipcMain.handle(
    'skills:get-statistics',
    async (_, skillId: string): Promise<IPCResponse<SkillStatistics | null>> => {
      try {
        SkillIdSchema.parse(skillId);
        const stats = await skillRegistry.getStatistics(skillId);
        return { success: true, data: stats };
      } catch (error) {
        console.error('[IPC] skills:get-statistics error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * 스킬 사용 이력 조회
   */
  ipcMain.handle(
    'skills:get-usage-history',
    async (_, skillId: string, limit = 100): Promise<IPCResponse<SkillUsageHistory[]>> => {
      try {
        SkillIdSchema.parse(skillId);
        const history = await skillRegistry.getUsageHistory(skillId, limit);
        return { success: true, data: history };
      } catch (error) {
        console.error('[IPC] skills:get-usage-history error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * 스킬 패키지 검증
   */
  ipcMain.handle(
    'skills:validate',
    async (_, skillPackage: SkillPackage): Promise<IPCResponse<SkillValidationResult>> => {
      try {
        // SkillLoader를 사용하여 검증
        // 임시로 파일에 저장하지 않고 메모리에서 검증
        skillLoader['validateManifest'](skillPackage.manifest);
        skillLoader['validateContent'](skillPackage);

        const depCheck = await skillLoader['checkDependencies'](skillPackage.manifest);
        const compatible = await skillLoader['checkCompatibility'](skillPackage.manifest);

        const result: SkillValidationResult = {
          valid: depCheck.valid && compatible,
          errors: depCheck.errors,
          warnings: [],
          missingDependencies: {
            mcpServers: depCheck.missingMCPServers,
            extensions: depCheck.missingExtensions,
          },
        };

        if (!compatible) {
          result.warnings.push(
            `Requires app version ${skillPackage.manifest.minAppVersion} or higher`
          );
        }

        return { success: true, data: result };
      } catch (error) {
        console.error('[IPC] skills:validate error:', error);

        const result: SkillValidationResult = {
          valid: false,
          errors: [String(error)],
          warnings: [],
          missingDependencies: {
            mcpServers: [],
            extensions: [],
          },
        };

        return { success: true, data: result };
      }
    }
  );

  /**
   * Phase 2: GitHub 마켓플레이스에서 스킬 레지스트리 가져오기
   */
  ipcMain.handle(
    'skills:fetch-marketplace',
    async (): Promise<IPCResponse<SkillRegistryEntry[]>> => {
      try {
        const registry = await githubIntegration.fetchSkillsRegistry();
        return { success: true, data: registry };
      } catch (error) {
        console.error('[IPC] skills:fetch-marketplace error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * Phase 2: 스킬 검색
   */
  ipcMain.handle(
    'skills:search-skills',
    async (_, query: string, filters: any): Promise<IPCResponse<SkillRegistryEntry[]>> => {
      try {
        const results = await githubIntegration.searchSkills(query, filters);
        return { success: true, data: results };
      } catch (error) {
        console.error('[IPC] skills:search-skills error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * Phase 2: GitHub 마켓플레이스에서 스킬 다운로드 및 설치
   */
  ipcMain.handle(
    'skills:download-from-marketplace',
    async (_, skillPath: string): Promise<IPCResponse<InstalledSkill>> => {
      try {
        // GitHub에서 스킬 다운로드
        const skillPackage = await githubIntegration.downloadSkill(skillPath);

        // 스킬 설치
        const source: SkillSource = {
          type: 'marketplace',
          url: `https://github.com/sepilot/awesome-sepilot-skills/tree/main/${skillPath}`,
          downloadedAt: Date.now(),
        };

        const installedSkill = await skillRegistry.installSkill(skillPackage, source);

        return { success: true, data: installedSkill };
      } catch (error) {
        console.error('[IPC] skills:download-from-marketplace error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  /**
   * Phase 2: 스킬 업데이트 확인
   */
  ipcMain.handle('skills:check-updates', async (): Promise<IPCResponse<SkillUpdate[]>> => {
    try {
      // 설치된 스킬 목록 가져오기
      const installedSkills = await skillRegistry.getInstalledSkills();

      // 마켓플레이스 출처만 체크
      const marketplaceSkills = installedSkills
        .filter((skill) => skill.source.type === 'marketplace')
        .map((skill) => ({
          id: skill.id,
          version: skill.manifest.version,
        }));

      // 업데이트 확인
      const updates = await githubIntegration.checkForUpdates(marketplaceSkills);

      return { success: true, data: updates };
    } catch (error) {
      console.error('[IPC] skills:check-updates error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Phase 2: 스킬 업데이트
   */
  ipcMain.handle(
    'skills:update-skill',
    async (_, skillId: string): Promise<IPCResponse<InstalledSkill>> => {
      try {
        // 기존 스킬 정보 가져오기
        const existingSkill = await skillRegistry.getSkill(skillId);
        if (!existingSkill) {
          return { success: false, error: `Skill not found: ${skillId}` };
        }

        // 마켓플레이스 출처인지 확인
        if (existingSkill.source.type !== 'marketplace' || !existingSkill.source.url) {
          return { success: false, error: 'Skill is not from marketplace' };
        }

        // GitHub 경로 추출 (URL에서)
        const skillPath = existingSkill.source.url.split('/tree/main/')[1];
        if (!skillPath) {
          return { success: false, error: 'Invalid marketplace skill URL' };
        }

        // GitHub에서 최신 버전 다운로드
        const skillPackage = await githubIntegration.downloadSkill(skillPath);

        // 스킬 업데이트
        const updatedSkill = await skillRegistry.updateSkill(skillPackage);

        return { success: true, data: updatedSkill };
      } catch (error) {
        console.error('[IPC] skills:update-skill error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  console.log('[IPC] Skills handlers registered successfully');
}
