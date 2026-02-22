/**
 * Extension Loader - Main Process
 *
 * Main Process에서 Extension을 동적으로 로드하고 IPC handler를 등록합니다.
 * VSCode와 유사하게 Built-in + External Extension을 런타임에 로드합니다.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import { logger } from '../utils/logger';
import { loadAllExtensions, type LoadedExtension } from './loader-runtime';
import { extensionRegistry } from './registry';
import { createMainExtensionContext } from './main-context-factory';
import { sortExtensionsByDependencies } from './dependency-resolver';
import { initializeMainProcessSDK } from './sdk-initializer-main';

let loadedExtensions: LoadedExtension[] = [];

/**
 * 모든 Extension 로드 및 IPC handler 등록
 *
 * Electron Main Process 시작 시 호출됩니다.
 *
 * **실행 환경:**
 * - 개발 모드: resources/extensions/ 디렉토리에서 직접 로드
 * - Unpacked/Portable: exe 옆 extensions/*.sepx → userData/extensions/{id}/로 추출
 *
 * @param resourcesPath - app.asar/resources 경로
 * @param userDataPath - app.getPath('userData') 경로
 */
export async function loadAndRegisterExtensions(
  resourcesPath: string,
  userDataPath: string
): Promise<void> {
  const isDev = !require('electron').app.isPackaged;
  const runMode = isDev ? 'DEVELOPMENT' : 'PRODUCTION';

  logger.info(`[ExtensionLoader-Main] ==========================================`);
  logger.info(`[ExtensionLoader-Main] 🚀 Starting Extension Loader (${runMode} mode)`);
  logger.info(`[ExtensionLoader-Main] 📂 Resources path: ${resourcesPath}`);
  logger.info(`[ExtensionLoader-Main] 📂 User data path: ${userDataPath}`);
  logger.info(`[ExtensionLoader-Main] ==========================================`);

  try {
    // Main Process SDK 초기화 (Extension 로드 전에 실행)
    initializeMainProcessSDK();

    // 모든 Extension 로드 (Built-in + External)
    loadedExtensions = await loadAllExtensions(resourcesPath, userDataPath);

    logger.info(
      `[ExtensionLoader-Main] Loaded ${loadedExtensions.length} extensions:`,
      loadedExtensions.map((e) => `${e.manifest.id}@${e.manifest.version} (${e.source})`)
    );

    // 의존성 해결 (ext-docs 명세)
    let sortedExtensions = loadedExtensions;
    try {
      sortedExtensions = sortExtensionsByDependencies(loadedExtensions);
      logger.info(
        '[ExtensionLoader-Main] Extensions sorted by dependencies:',
        sortedExtensions.map((e) => e.manifest.id)
      );
    } catch (error) {
      logger.error('[ExtensionLoader-Main] Dependency resolution failed', { error });
      throw error; // Fail fast on dependency errors
    }

    // Extension Registry에 등록 및 activate 호출 (Store slice 등록 완료까지 대기)
    for (const ext of sortedExtensions) {
      await extensionRegistry.register(ext.definition);

      // ExtensionContext 생성 및 activate() 호출 (ext-docs 명세)
      try {
        const context = createMainExtensionContext(ext.manifest.id, ext.path, ext.manifest);

        // activate() 함수 호출 (Main Process entry point)
        if (ext.definition.activate && typeof ext.definition.activate === 'function') {
          logger.info(`[ExtensionLoader-Main] Activating extension: ${ext.manifest.id}`);
          await ext.definition.activate(context);
          logger.info(`[ExtensionLoader-Main] Extension activated: ${ext.manifest.id}`);
        } else {
          logger.warn(
            `[ExtensionLoader-Main] No activate() function found for: ${ext.manifest.id}`
          );
        }
      } catch (error) {
        logger.error(`[ExtensionLoader-Main] Failed to activate ${ext.manifest.id}`, { error });
      }
    }

    // IPC Handlers 등록
    await registerExtensionIpcHandlers();

    logger.info('[ExtensionLoader-Main] All extensions loaded and registered');
  } catch (error) {
    logger.error('[ExtensionLoader-Main] Failed to load extensions', { error });
    // Extension 로드 실패해도 앱은 계속 실행
  }
}

/**
 * 모든 Extension의 IPC handler 등록
 *
 * 주의: electron/handlers.js 패턴은 deprecated되었습니다.
 * 모든 Extension은 definition.setupIpcHandlers()를 사용해야 합니다.
 * (registry.ts의 activate()에서 호출)
 */
async function registerExtensionIpcHandlers(): Promise<void> {
  logger.info('[ExtensionLoader-Main] Extension IPC handlers registration completed');
  // Extension 관리 IPC Handlers는 main.ts에서 이미 등록됨
  // Extension 개별 IPC Handlers는 registry.ts의 activate()에서 setupIpcHandlers() 호출로 등록됨
}

/**
 * Extension 재로드
 *
 * 개발 모드에서 Extension을 다시 로드합니다.
 */
export async function reloadExtensions(resourcesPath: string, userDataPath: string): Promise<void> {
  logger.info('[ExtensionLoader-Main] Reloading extensions...');

  // 기존 Extension 제거
  for (const ext of loadedExtensions) {
    extensionRegistry.unregister(ext.manifest.id);
  }
  loadedExtensions = [];

  // 다시 로드
  await loadAndRegisterExtensions(resourcesPath, userDataPath);
}

/**
 * 로드된 Extension 목록 반환
 */
export function getLoadedExtensions(): LoadedExtension[] {
  return loadedExtensions;
}
