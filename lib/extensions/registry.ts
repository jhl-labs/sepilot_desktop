/**
 * Extension Registry
 *
 * 모든 extension을 등록하고 관리하는 중앙 레지스트리
 */

import type {
  ExtensionDefinition,
  ExtensionManifest,
  ExtensionRegistryEntry,
} from '@sepilot/extension-sdk';
import type { ExtensionRuntimeContext } from '@sepilot/extension-sdk';
import { logger } from '@/lib/utils/logger';
import { ExtensionContextFactory } from './context-factory';
import { validateExtensionManifest } from '@sepilot/extension-sdk/utils';

// Store 업데이트를 위한 함수 (lazy loading to avoid circular dependency)
let updateStoreExtensions: ((extensions: ExtensionDefinition[]) => void) | null = null;

function getStoreUpdater() {
  if (!updateStoreExtensions && typeof window !== 'undefined') {
    // Client-side에서만 store import
    import('@/lib/store/chat-store')
      .then((module) => {
        updateStoreExtensions = (extensions: ExtensionDefinition[]) => {
          module.useChatStore.getState().updateActiveExtensions(extensions);
        };
      })
      .catch((error) => {
        logger.error('[ExtensionRegistry] Failed to load chat-store:', error);
      });
  }
  return updateStoreExtensions;
}

class ExtensionRegistry {
  private extensions = new Map<string, ExtensionRegistryEntry>();
  private contextFactory = new ExtensionContextFactory();
  private contexts = new Map<string, ExtensionRuntimeContext>();

  /**
   * Extension 등록
   */
  async register(definition: ExtensionDefinition): Promise<void> {
    try {
      const { manifest } = definition;

      // Manifest 검증
      try {
        validateExtensionManifest(manifest);
      } catch (error) {
        logger.error(`[ExtensionRegistry] Invalid manifest for ${manifest.id}:`, error);
        throw error;
      }

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
            // throw 대신 로그만 남기고 등록 스킵
            return;
          }
        }
      }

      this.extensions.set(manifest.id, {
        definition,
        loadedAt: Date.now(),
        isActive: false, // Will be set to true after activate() is called
      });

      // Extension Context 생성 (Extension별 격리)
      const context = this.contextFactory.createContext(manifest.id, manifest);
      this.contexts.set(manifest.id, context);

      // ✅ Store slice 등록 (client-side only) - Context 전달
      // await로 Store slice 등록 완료를 보장하여 UI가 slice 접근 전 준비 완료
      if (typeof window !== 'undefined' && definition.createStoreSlice) {
        try {
          const module = await import('@/lib/store/extension-slices');
          module.registerExtensionSlice(manifest.id, definition.createStoreSlice!, context);
          logger.debug(
            `[ExtensionRegistry] ✅ Registered store slice for extension: ${manifest.id}`
          );
        } catch (error) {
          logger.error(
            `[ExtensionRegistry] ❌ Failed to register store slice for ${manifest.id}:`,
            error
          );
        }
      }

      logger.debug(`[ExtensionRegistry] Registered extension: ${manifest.id} v${manifest.version}`);
    } catch (error) {
      logger.error(`[ExtensionRegistry] Failed to register extension:`, error);
      // 에러를 삼켜서 다른 Extension 로드에 영향 주지 않음
    }
  }

  /**
   * Extension 등록 해제
   */
  unregister(id: string): void {
    try {
      // 이 extension에 의존하는 다른 extension이 있는지 확인
      for (const [extId, entry] of this.extensions.entries()) {
        if (entry.definition.manifest.dependencies?.includes(id)) {
          logger.error(`[ExtensionRegistry] Cannot unregister ${id}: ${extId} depends on it`);
          return; // throw 대신 return
        }
      }

      // Context 정리
      this.contextFactory.dispose(id);
      this.contexts.delete(id);

      this.extensions.delete(id);
      logger.debug(`[ExtensionRegistry] Unregistered extension: ${id}`);
    } catch (error) {
      logger.error(`[ExtensionRegistry] Error unregistering extension ${id}:`, error);
      // 에러를 삼켜서 앱 크래시 방지
    }
  }

  /**
   * Extension 조회
   */
  get(id: string): ExtensionDefinition | undefined {
    return this.extensions.get(id)?.definition;
  }

  /**
   * Extension 활성화
   * @param visitedStack - 순환 의존성 감지를 위한 방문 스택
   */
  async activate(id: string, visitedStack: Set<string> = new Set()): Promise<void> {
    try {
      const entry = this.extensions.get(id);
      if (!entry) {
        logger.error(`[ExtensionRegistry] Extension ${id} not found`);
        return; // throw 대신 return
      }

      if (entry.isActive) {
        logger.warn(`[ExtensionRegistry] Extension ${id} is already active`);
        return;
      }

      // 순환 의존성 감지
      if (visitedStack.has(id)) {
        const cycle = `${Array.from(visitedStack).join(' -> ')} -> ${id}`;
        logger.error(`[ExtensionRegistry] Circular dependency detected: ${cycle}`);
        throw new Error(`Circular dependency detected during activation: ${cycle}`);
      }

      // 현재 Extension을 방문 스택에 추가
      visitedStack.add(id);

      // 의존성 활성화
      if (entry.definition.manifest.dependencies) {
        for (const depId of entry.definition.manifest.dependencies) {
          await this.activate(depId, visitedStack);
        }
      }

      // 의존성 활성화 완료 후 스택에서 제거
      visitedStack.delete(id);

      // IPC handlers 등록 (Main Process only)
      if (typeof window === 'undefined' && entry.definition.setupIpcHandlers) {
        try {
          entry.definition.setupIpcHandlers();
          logger.debug(`[ExtensionRegistry] Registered IPC handlers for ${id}`);
        } catch (error) {
          logger.error(`[ExtensionRegistry] Failed to setup IPC handlers for ${id}:`, error);
        }
      }

      // activate 함수 호출 (try-catch로 보호)
      // Extension Context 전달
      if (entry.definition.activate) {
        const context = this.contexts.get(id);
        try {
          await entry.definition.activate(context as any);
        } catch (error) {
          logger.error(`[ExtensionRegistry] Failed to activate ${id}:`, error);
          // 활성화 실패해도 계속 진행
          return;
        }
      }

      // IPC handler registry 활성화 (Main Process only)
      if (typeof window === 'undefined') {
        try {
          // Dynamic import to avoid bundling in client
          const { extensionHandlerRegistry } =
            await import('../../electron/ipc/extension-handler-registry');
          extensionHandlerRegistry.activate(id);
        } catch {
          // Registry import 실패는 무시 (client-side에서는 정상)
          logger.debug(`[ExtensionRegistry] IPC handler registry not available (client-side)`);
        }
      }

      entry.isActive = true;
      logger.debug(`[ExtensionRegistry] Activated extension: ${id}`);

      // Store 업데이트
      const updater = getStoreUpdater();
      if (updater) {
        updater(this.getActive());
      }
    } catch (error) {
      logger.error(`[ExtensionRegistry] Error activating extension ${id}:`, error);
      // 에러를 삼켜서 앱 크래시 방지
    }
  }

  /**
   * Extension 비활성화
   */
  async deactivate(id: string): Promise<void> {
    try {
      const entry = this.extensions.get(id);
      if (!entry) {
        logger.error(`[ExtensionRegistry] Extension ${id} not found`);
        return; // throw 대신 return
      }

      if (!entry.isActive) {
        logger.warn(`[ExtensionRegistry] Extension ${id} is already inactive`);
        return;
      }

      // 이 extension에 의존하는 활성화된 extension이 있는지 확인
      for (const [extId, extEntry] of this.extensions.entries()) {
        if (extEntry.isActive && extEntry.definition.manifest.dependencies?.includes(id)) {
          logger.warn(`[ExtensionRegistry] Cannot deactivate ${id}: ${extId} depends on it`);
          return; // throw 대신 return
        }
      }

      // IPC handler registry 비활성화 (Main Process only)
      if (typeof window === 'undefined') {
        try {
          // Dynamic import to avoid bundling in client
          const { extensionHandlerRegistry } =
            await import('../../electron/ipc/extension-handler-registry');
          extensionHandlerRegistry.deactivate(id);
        } catch {
          // Registry import 실패는 무시 (client-side에서는 정상)
          logger.debug(`[ExtensionRegistry] IPC handler registry not available (client-side)`);
        }
      }

      // clearSession 호출하여 Extension 상태 초기화 (try-catch로 보호)
      if (entry.definition.clearSession) {
        try {
          entry.definition.clearSession();
          logger.debug(`[ExtensionRegistry] Cleared session for ${id}`);
        } catch (error) {
          logger.error(`[ExtensionRegistry] Failed to clear session for ${id}:`, error);
        }
      }

      // deactivate 함수 호출 (try-catch로 보호)
      if (entry.definition.deactivate) {
        const context = this.contexts.get(id);
        try {
          await entry.definition.deactivate(context as any);
        } catch (error) {
          logger.error(`[ExtensionRegistry] Failed to deactivate ${id}:`, error);
          // 비활성화 실패해도 상태는 업데이트
        }
      }

      entry.isActive = false;
      logger.debug(`[ExtensionRegistry] Deactivated extension: ${id}`);

      // Store 업데이트
      const updater = getStoreUpdater();
      if (updater) {
        updater(this.getActive());
      }
    } catch (error) {
      logger.error(`[ExtensionRegistry] Error deactivating extension ${id}:`, error);
      // 에러를 삼켜서 앱 크래시 방지
    }
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
   * 특정 extension에 의존하는 활성화된 extension 목록 조회
   */
  getDependents(id: string): ExtensionDefinition[] {
    return Array.from(this.extensions.values())
      .filter((entry) => entry.isActive && entry.definition.manifest.dependencies?.includes(id))
      .map((entry) => entry.definition);
  }

  /**
   * Extension 비활성화 가능 여부 확인
   * 다른 활성화된 extension이 이 extension에 의존하고 있으면 false 반환
   */
  canDeactivate(id: string): boolean {
    const dependents = this.getDependents(id);
    return dependents.length === 0;
  }

  /**
   * Extension이 export하는 특정 모듈 조회
   *
   * @param extensionId - Extension ID
   * @param exportName - Export 이름
   * @returns Export된 모듈/클래스/함수
   *
   * @example
   * ```typescript
   * const ToolClass = extensionRegistry.getExport('{extensionId}', 'ToolClassName');
   * if (ToolClass) {
   *   const tool = new ToolClass();
   * }
   * ```
   */
  getExport<T = any>(extensionId: string, exportName: string): T | undefined {
    const extension = this.get(extensionId);
    return extension?.exports?.[exportName] as T | undefined;
  }

  /**
   * Extension의 모든 exports 조회
   *
   * @param extensionId - Extension ID
   * @returns Extension이 export하는 모든 항목
   */
  getExports(extensionId: string): Record<string, any> | undefined {
    return this.get(extensionId)?.exports;
  }

  /**
   * Registry 초기화 (테스트용)
   */
  clear(): void {
    this.contextFactory.disposeAll();
    this.contexts.clear();
    this.extensions.clear();
    logger.info('[ExtensionRegistry] Cleared all extensions');
  }

  /**
   * Extension의 Runtime Context 조회
   */
  getContext(id: string): ExtensionRuntimeContext | undefined {
    return this.contexts.get(id);
  }

  /**
   * Extension의 Tool Registry 조회
   */
  getToolRegistry(id: string) {
    return this.contextFactory.getToolRegistry(id);
  }
}

// Singleton instance
export const extensionRegistry = new ExtensionRegistry();
