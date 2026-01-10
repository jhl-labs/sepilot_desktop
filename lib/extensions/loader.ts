/**
 * Extension Loader
 *
 * extensions/ 폴더에서 모든 extension을 자동으로 로드하고 등록합니다.
 */

import { extensionRegistry } from './registry';
import type { ExtensionDefinition } from './types';
import type { ExtensionStateConfig } from '@/types';
import { logger } from '@/lib/utils/logger';

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

/**
 * 저장된 Extension 설정 로드
 */
async function loadExtensionsConfig(): Promise<ExtensionStateConfig> {
  try {
    if (isElectron() && (window as any).electronAPI) {
      const result = await (window as any).electronAPI.config.load();
      return result.data?.extensions || {};
    } else {
      const saved = localStorage.getItem('sepilot_app_config');
      if (saved) {
        const config = JSON.parse(saved);
        return config.extensions || {};
      }
      return {};
    }
  } catch (error) {
    logger.error('[ExtensionLoader] Failed to load extensions config', { error });
    return {};
  }
}

/**
 * 모든 extension을 로드하고 등록
 */
export async function loadExtensions(): Promise<void> {
  logger.info('[ExtensionLoader] Loading extensions...');

  try {
    // 현재는 수동으로 extension을 import
    // TODO: 추후 동적 import를 사용하여 extensions/ 폴더를 스캔할 수 있음
    const extensions = await loadBuiltinExtensions();

    // Registry에 등록
    for (const extension of extensions) {
      try {
        extensionRegistry.register(extension);
      } catch (error) {
        logger.error(`[ExtensionLoader] Failed to register extension ${extension.manifest.id}`, {
          error,
        });
      }
    }

    // 저장된 Extension 상태 로드
    const extensionsConfig = await loadExtensionsConfig();

    // 활성화 (저장된 상태 우선, 없으면 manifest.enabled 사용)
    for (const extension of extensions) {
      const extensionId = extension.manifest.id;
      const savedConfig = extensionsConfig[extensionId];

      // 저장된 상태가 있으면 우선 사용, 없으면 manifest.enabled 사용
      const shouldActivate =
        savedConfig !== undefined ? savedConfig.enabled : extension.manifest.enabled !== false;

      if (shouldActivate) {
        try {
          await extensionRegistry.activate(extensionId);
          logger.info(`[ExtensionLoader] Activated extension: ${extensionId}`);
        } catch (error) {
          logger.error(`[ExtensionLoader] Failed to activate extension ${extensionId}`, {
            error,
          });
        }
      } else {
        logger.info(`[ExtensionLoader] Extension ${extensionId} is disabled`);
      }
    }

    logger.info(`[ExtensionLoader] Loaded ${extensions.length} extension(s)`, {
      extensions: extensions.map((e) => `${e.manifest.id}@${e.manifest.version}`),
    });
  } catch (error) {
    logger.error('[ExtensionLoader] Failed to load extensions', { error });
    throw error;
  }
}

/**
 * 빌트인 extension 로드
 *
 * extensions/index.ts에서 등록된 모든 Extension을 자동으로 로드합니다.
 * 새 Extension 추가 시 extensions/index.ts만 수정하면 됩니다.
 */
async function loadBuiltinExtensions(): Promise<ExtensionDefinition[]> {
  try {
    const { builtinExtensions } = await import('@/extensions');

    logger.info('[ExtensionLoader] Loading builtin extensions...', {
      count: builtinExtensions.length,
      extensions: builtinExtensions.map((ext) => ext.manifest.id),
    });

    // 각 Extension 검증 및 로깅
    for (const extension of builtinExtensions) {
      const { manifest } = extension;

      if (!manifest.id || !manifest.name) {
        logger.error('[ExtensionLoader] Invalid extension manifest', { manifest });
        continue;
      }

      logger.info(`[ExtensionLoader] Loaded extension: ${manifest.id} v${manifest.version}`, {
        enabled: manifest.enabled !== false,
        hasMainComponent: !!extension.MainComponent,
        hasSidebarComponent: !!extension.SidebarComponent,
        hasSettingsTab: !!extension.SettingsTabComponent,
        hasStoreSlice: !!extension.createStoreSlice,
      });
    }

    return builtinExtensions;
  } catch (error) {
    logger.error('[ExtensionLoader] Failed to load builtin extensions', { error });
    return [];
  }
}

/**
 * Extension 동적 로드 (런타임)
 *
 * @param extensionPath - extension 경로 (예: '@/extensions/my-extension')
 */
/*
export async function loadExtension(extensionPath: string): Promise<void> {
  try {
    const module = await import(extensionPath);

    if (!module.manifest) {
      throw new Error(`Extension ${extensionPath} does not export a manifest`);
    }

    const extension: ExtensionDefinition = {
      manifest: module.manifest,
      MainComponent: module.MainComponent,
      SidebarComponent: module.SidebarComponent,
      createStoreSlice: module.createStoreSlice,
      activate: module.activate,
      deactivate: module.deactivate,
    };

    extensionRegistry.register(extension);

    if (extension.manifest.enabled !== false) {
      await extensionRegistry.activate(extension.manifest.id);
    }

    logger.info(`[ExtensionLoader] Loaded extension: ${extension.manifest.id}`);
  } catch (error) {
    logger.error(`[ExtensionLoader] Failed to load extension ${extensionPath}`, { error });
    throw error;
  }
}
*/

/**
 * Extension 언로드 (런타임)
 *
 * @param extensionId - extension ID
 */
export async function unloadExtension(extensionId: string): Promise<void> {
  try {
    await extensionRegistry.deactivate(extensionId);
    extensionRegistry.unregister(extensionId);
    logger.info(`[ExtensionLoader] Unloaded extension: ${extensionId}`);
  } catch (error) {
    logger.error(`[ExtensionLoader] Failed to unload extension ${extensionId}`, { error });
    throw error;
  }
}
