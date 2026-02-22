/**
 * Extension Skills IPC Handlers
 *
 * Extension이 ExtensionRuntimeContext.skills API를 통해 스킬에 접근하기 위한 IPC 핸들러.
 * Extension 전용 채널 (extension:skills:*) 사용.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { skillRegistry } from '@/lib/domains/skill/registry';
import { skillManager } from '@/lib/domains/skill/manager';
import { logger } from '@/lib/utils/logger';

const EXTENSION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateExtensionId(extensionId: string): void {
  if (!EXTENSION_ID_PATTERN.test(extensionId)) {
    throw new Error(`Invalid extension ID: ${extensionId}`);
  }
}

/**
 * Extension Skills 핸들러 등록
 */
export function registerExtensionSkillsHandlers() {
  /**
   * 활성화된 스킬 목록 조회
   * Permission: skills:read
   */
  ipcMain.handle(
    'extension:skills:list',
    async (
      _event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
      }
    ) => {
      const extensionId = typeof data?.extensionId === 'string' ? data.extensionId : '';

      try {
        validateExtensionId(extensionId);

        logger.info('[Extension Skills] List request:', {
          extensionId,
        });

        const skills = await skillRegistry.getEnabledSkills();

        const result = skills.map((skill) => ({
          id: skill.id,
          name: skill.manifest.name,
          description: skill.manifest.description,
          enabled: skill.enabled,
        }));

        return {
          success: true,
          data: result,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('[Extension Skills] List error:', {
          extensionId: extensionId || 'unknown',
          error: message,
        });
        return {
          success: false,
          error: message,
        };
      }
    }
  );

  /**
   * 특정 스킬 상세 정보 조회
   * Permission: skills:read
   */
  ipcMain.handle(
    'extension:skills:get',
    async (
      _event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        skillId: string;
      }
    ) => {
      const extensionId = typeof data?.extensionId === 'string' ? data.extensionId : '';
      const skillId = typeof data?.skillId === 'string' ? data.skillId : '';

      try {
        validateExtensionId(extensionId);

        logger.info('[Extension Skills] Get request:', {
          extensionId,
          skillId,
        });

        const skill = await skillRegistry.getSkill(skillId);

        if (!skill) {
          return {
            success: true,
            data: null,
          };
        }

        return {
          success: true,
          data: {
            id: skill.id,
            name: skill.manifest.name,
            description: skill.manifest.description,
            enabled: skill.enabled,
            version: skill.manifest.version,
            author: skill.manifest.author || '',
            tags: skill.manifest.tags || [],
          },
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('[Extension Skills] Get error:', {
          extensionId: extensionId || 'unknown',
          error: message,
        });
        return {
          success: false,
          error: message,
        };
      }
    }
  );

  /**
   * 스킬 콘텐츠 (프롬프트) 조회
   * Permission: skills:read
   */
  ipcMain.handle(
    'extension:skills:get-content',
    async (
      _event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        skillId: string;
      }
    ) => {
      const extensionId = typeof data?.extensionId === 'string' ? data.extensionId : '';
      const skillId = typeof data?.skillId === 'string' ? data.skillId : '';

      try {
        validateExtensionId(extensionId);

        logger.info('[Extension Skills] Get content request:', {
          extensionId,
          skillId,
        });

        const loadedSkill = await skillManager.loadSkill(skillId);

        if (!loadedSkill?.package?.content) {
          return {
            success: true,
            data: null,
          };
        }

        // content 객체에서 systemPrompt 또는 instructions를 추출
        const content = loadedSkill.package.content;
        const promptContent =
          content.systemPrompt || (content as any).instructions || JSON.stringify(content);

        return {
          success: true,
          data: promptContent,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('[Extension Skills] Get content error:', {
          extensionId: extensionId || 'unknown',
          error: message,
        });
        return {
          success: false,
          error: message,
        };
      }
    }
  );

  logger.info('[Extension Skills] Handlers registered');
}
