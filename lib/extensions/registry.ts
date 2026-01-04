/**
 * Extension Registry
 *
 * 모든 extension을 등록하고 관리하는 중앙 레지스트리
 */

import type { ExtensionDefinition, ExtensionManifest, ExtensionRegistryEntry } from './types';
import { logger } from '@/lib/utils/logger';

class ExtensionRegistry {
  private extensions = new Map<string, ExtensionRegistryEntry>();

  /**
   * Extension 등록
   */
  register(definition: ExtensionDefinition): void {
    const { manifest } = definition;

    if (this.extensions.has(manifest.id)) {
      logger.warn(`[ExtensionRegistry] Extension ${manifest.id} is already registered`);
      return;
    }

    // 의존성 검사
    if (manifest.dependencies) {
      for (const depId of manifest.dependencies) {
        if (!this.extensions.has(depId)) {
          logger.error(
            `[ExtensionRegistry] Cannot register ${manifest.id}: dependency ${depId} not found`
          );
          throw new Error(`Extension ${manifest.id} requires ${depId} but it is not registered`);
        }
      }
    }

    this.extensions.set(manifest.id, {
      definition,
      loadedAt: Date.now(),
      isActive: manifest.enabled !== false, // default enabled
    });

    logger.info(`[ExtensionRegistry] Registered extension: ${manifest.id} v${manifest.version}`);
  }

  /**
   * Extension 등록 해제
   */
  unregister(id: string): void {
    // 이 extension에 의존하는 다른 extension이 있는지 확인
    for (const [extId, entry] of this.extensions.entries()) {
      if (entry.definition.manifest.dependencies?.includes(id)) {
        logger.error(`[ExtensionRegistry] Cannot unregister ${id}: ${extId} depends on it`);
        throw new Error(`Extension ${id} is required by ${extId}`);
      }
    }

    this.extensions.delete(id);
    logger.info(`[ExtensionRegistry] Unregistered extension: ${id}`);
  }

  /**
   * Extension 조회
   */
  get(id: string): ExtensionDefinition | undefined {
    return this.extensions.get(id)?.definition;
  }

  /**
   * Extension 활성화
   */
  async activate(id: string): Promise<void> {
    const entry = this.extensions.get(id);
    if (!entry) {
      logger.error(`[ExtensionRegistry] Extension ${id} not found`);
      throw new Error(`Extension ${id} not found`);
    }

    if (entry.isActive) {
      logger.warn(`[ExtensionRegistry] Extension ${id} is already active`);
      return;
    }

    // 의존성 활성화
    if (entry.definition.manifest.dependencies) {
      for (const depId of entry.definition.manifest.dependencies) {
        await this.activate(depId);
      }
    }

    // activate 함수 호출
    if (entry.definition.activate) {
      await entry.definition.activate();
    }

    entry.isActive = true;
    logger.info(`[ExtensionRegistry] Activated extension: ${id}`);
  }

  /**
   * Extension 비활성화
   */
  async deactivate(id: string): Promise<void> {
    const entry = this.extensions.get(id);
    if (!entry) {
      logger.error(`[ExtensionRegistry] Extension ${id} not found`);
      throw new Error(`Extension ${id} not found`);
    }

    if (!entry.isActive) {
      logger.warn(`[ExtensionRegistry] Extension ${id} is already inactive`);
      return;
    }

    // 이 extension에 의존하는 활성화된 extension이 있는지 확인
    for (const [extId, extEntry] of this.extensions.entries()) {
      if (extEntry.isActive && extEntry.definition.manifest.dependencies?.includes(id)) {
        logger.warn(`[ExtensionRegistry] Cannot deactivate ${id}: ${extId} depends on it`);
        throw new Error(`Extension ${id} is required by active extension ${extId}`);
      }
    }

    // deactivate 함수 호출
    if (entry.definition.deactivate) {
      await entry.definition.deactivate();
    }

    entry.isActive = false;
    logger.info(`[ExtensionRegistry] Deactivated extension: ${id}`);
  }

  /**
   * 모든 extension 목록 조회
   */
  getAll(): ExtensionDefinition[] {
    return Array.from(this.extensions.values()).map((entry) => entry.definition);
  }

  /**
   * 활성화된 extension 목록 조회
   */
  getActive(): ExtensionDefinition[] {
    return Array.from(this.extensions.values())
      .filter((entry) => entry.isActive)
      .map((entry) => entry.definition);
  }

  /**
   * Extension manifest 조회
   */
  getManifest(id: string): ExtensionManifest | undefined {
    return this.extensions.get(id)?.definition.manifest;
  }

  /**
   * 특정 모드를 지원하는 extension 조회
   */
  getByMode(mode: string): ExtensionDefinition | undefined {
    for (const entry of this.extensions.values()) {
      if (entry.isActive && entry.definition.manifest.mode === mode) {
        return entry.definition;
      }
    }
    return undefined;
  }

  /**
   * 사이드바에 표시할 extension 목록 조회
   */
  getSidebarExtensions(): Array<{
    id: string;
    manifest: ExtensionManifest;
    SidebarComponent?: ExtensionDefinition['SidebarComponent'];
  }> {
    return Array.from(this.extensions.values())
      .filter((entry) => entry.isActive && entry.definition.manifest.showInSidebar)
      .map((entry) => ({
        id: entry.definition.manifest.id,
        manifest: entry.definition.manifest,
        SidebarComponent: entry.definition.SidebarComponent,
      }));
  }

  /**
   * Extension 활성화 상태 확인
   */
  isActive(id: string): boolean {
    return this.extensions.get(id)?.isActive ?? false;
  }

  /**
   * Registry 초기화 (테스트용)
   */
  clear(): void {
    this.extensions.clear();
    logger.info('[ExtensionRegistry] Cleared all extensions');
  }
}

// Singleton instance
export const extensionRegistry = new ExtensionRegistry();
