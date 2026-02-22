/**
 * Skills Access IPC 프록시 구현
 *
 * Extension이 ExtensionRuntimeContext.skills API를 통해 스킬에 접근하기 위한 프록시 클래스.
 * IPC를 통해 Main Process의 extension-skills.ts 핸들러와 통신합니다.
 */

import type { SkillsAccess, SkillInfo, SkillDetail } from '@sepilot/extension-sdk';

export class SkillsAccessImpl implements SkillsAccess {
  constructor(
    private extensionId: string,
    private permissions: string[]
  ) {}

  /**
   * 설치된 스킬 목록 조회
   */
  async list(): Promise<SkillInfo[]> {
    this.checkPermission('skills:read');

    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('Skills API is only available in Electron environment');
    }

    const result = await window.electronAPI.invoke('extension:skills:list', {
      extensionId: this.extensionId,
    });

    if (!result.success) {
      throw new Error(result.error || 'Skills list failed');
    }

    return result.data ?? [];
  }

  /**
   * 특정 스킬 상세 정보 조회
   */
  async get(skillId: string): Promise<SkillDetail | null> {
    this.checkPermission('skills:read');

    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('Skills API is only available in Electron environment');
    }

    const result = await window.electronAPI.invoke('extension:skills:get', {
      extensionId: this.extensionId,
      skillId,
    });

    if (!result.success) {
      throw new Error(result.error || 'Skills get failed');
    }

    return result.data ?? null;
  }

  /**
   * 스킬 콘텐츠 (프롬프트) 조회
   */
  async getContent(skillId: string): Promise<string | null> {
    this.checkPermission('skills:read');

    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('Skills API is only available in Electron environment');
    }

    const result = await window.electronAPI.invoke('extension:skills:get-content', {
      extensionId: this.extensionId,
      skillId,
    });

    if (!result.success) {
      throw new Error(result.error || 'Skills get content failed');
    }

    return result.data ?? null;
  }

  private checkPermission(permission: string): void {
    const hasDirectPermission = this.permissions.includes(permission);
    const hasSkillManagePermission =
      permission.startsWith('skills:') && this.permissions.includes('skills:manage');
    const hasWildcardPermission =
      this.permissions.includes('all') || this.permissions.includes('skills:*');

    if (
      this.permissions.length > 0 &&
      !hasDirectPermission &&
      !hasSkillManagePermission &&
      !hasWildcardPermission
    ) {
      throw new Error(`Extension "${this.extensionId}" does not have permission: ${permission}`);
    }
  }
}
