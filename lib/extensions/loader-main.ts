/**
 * Extension Loader - Main Process
 *
 * Main Process에서 Extension의 IPC handler를 등록합니다.
 * Renderer Process용 loader와는 별도로 동작합니다.
 */

import { logger } from '../utils/logger';

/**
 * 모든 Extension의 IPC handler를 등록
 *
 * Main Process의 electron/ipc/index.ts에서 호출됩니다.
 */
export function registerExtensionIpcHandlers(): void {
  logger.info('[ExtensionLoader-Main] Registering extension IPC handlers...');

  try {
    // Presentation Extension IPC Handlers
    try {
      // Main Process에서만 require 사용 가능 (동적 import는 Main Process에서 문제 발생)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {
        setupPresentationIpcHandlers,
      } = require('../../extensions/presentation/ipc/handlers');
      setupPresentationIpcHandlers();
      logger.info('[ExtensionLoader-Main] Registered presentation IPC handlers');
    } catch (error) {
      logger.error('[ExtensionLoader-Main] Failed to register presentation IPC handlers', {
        error,
      });
    }

    // 추가 Extension IPC Handlers
    // try {
    //   const { setupMyExtensionIpcHandlers } = require('../../extensions/my-extension/ipc/handlers');
    //   setupMyExtensionIpcHandlers();
    // } catch (error) {
    //   logger.error('[ExtensionLoader-Main] Failed to register my-extension IPC handlers', { error });
    // }

    logger.info('[ExtensionLoader-Main] Extension IPC handlers registered');
  } catch (error) {
    logger.error('[ExtensionLoader-Main] Failed to register extension IPC handlers', { error });
    throw error;
  }
}

/**
 * Extension manifest를 기반으로 자동으로 IPC handler 등록 (향후 개선)
 *
 * @param extensionPath - Extension 경로
 */
export async function registerExtensionIpc(extensionPath: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require(extensionPath);

    if (!module.manifest) {
      throw new Error(`Extension ${extensionPath} does not export a manifest`);
    }

    // setupIpcHandlers 함수가 있으면 실행
    if (module.setupIpcHandlers && typeof module.setupIpcHandlers === 'function') {
      module.setupIpcHandlers();
      logger.info(`[ExtensionLoader-Main] Registered IPC handlers for: ${module.manifest.id}`);
    }
  } catch (error) {
    logger.error(`[ExtensionLoader-Main] Failed to register IPC for ${extensionPath}`, { error });
    throw error;
  }
}
