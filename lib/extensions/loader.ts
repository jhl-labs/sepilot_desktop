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
 */
async function loadBuiltinExtensions(): Promise<ExtensionDefinition[]> {
  const extensions: ExtensionDefinition[] = [];

  // Editor Extension
  try {
    const editorModule = await import('@/extensions/editor');
    const { manifest, EditorWithTerminal, SidebarEditor, EditorHeaderActions, EditorSettingsTab } =
      editorModule;

    extensions.push({
      manifest,
      MainComponent: EditorWithTerminal,
      SidebarComponent: SidebarEditor,
      HeaderActionsComponent: EditorHeaderActions,
      SettingsTabComponent: EditorSettingsTab,
    });

    logger.info('[ExtensionLoader] Loaded editor extension');
  } catch (error) {
    logger.error('[ExtensionLoader] Failed to load editor extension', { error });
  }

  // Browser Extension
  try {
    const browserModule = await import('@/extensions/browser');
    const { manifest, BrowserPanel, SidebarBrowser, BrowserSettingsTab } = browserModule;

    extensions.push({
      manifest,
      MainComponent: BrowserPanel,
      SidebarComponent: SidebarBrowser,
      SettingsTabComponent: BrowserSettingsTab,
    });

    logger.info('[ExtensionLoader] Loaded browser extension');
  } catch (error) {
    logger.error('[ExtensionLoader] Failed to load browser extension', { error });
  }

  // Presentation Extension
  try {
    const presentationModule = await import('@/extensions/presentation');
    const {
      manifest,
      PresentationStudio,
      PresentationSourceSidebar,
      PresentationHeaderActions,
      PresentationSettings,
      PresentationSettingsTab,
      createPresentationSlice,
    } = presentationModule;

    extensions.push({
      manifest,
      MainComponent: PresentationStudio,
      SidebarComponent: PresentationSourceSidebar,
      HeaderActionsComponent: PresentationHeaderActions,
      SettingsComponent: PresentationSettings, // Beta Settings용 (deprecated)
      SettingsTabComponent: PresentationSettingsTab, // 독립 Settings 탭
      createStoreSlice: createPresentationSlice,
    });

    logger.info('[ExtensionLoader] Loaded presentation extension');
  } catch (error) {
    logger.error('[ExtensionLoader] Failed to load presentation extension', { error });
  }

  // Terminal Extension
  try {
    const terminalModule = await import('@/extensions/terminal');
    const { manifest, createTerminalSlice, TerminalPanel, SidebarTerminal, TerminalSettings } =
      terminalModule;

    extensions.push({
      manifest,
      MainComponent: TerminalPanel,
      SidebarComponent: SidebarTerminal,
      SettingsTabComponent: TerminalSettings,
      createStoreSlice: createTerminalSlice,
    });

    logger.info('[ExtensionLoader] Loaded terminal extension');
  } catch (error) {
    logger.error('[ExtensionLoader] Failed to load terminal extension', { error });
  }

  return extensions;
}

/**
 * Extension 동적 로드 (런타임)
 *
 * @param extensionPath - extension 경로 (예: '@/extensions/my-extension')
 */
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
