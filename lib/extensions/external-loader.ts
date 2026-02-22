/**
 * External Extension Loader
 *
 * npm으로 설치된 Extension을 동적으로 로드합니다.
 */

import type { ExtensionDefinition } from './types';
import { logger } from '@/lib/utils/logger';

/**
 * Extension Source 타입
 */
export type ExtensionSource = 'builtin' | 'npm' | 'local';

/**
 * Extension 패키지 정보
 */
export interface ExtensionPackageInfo {
  source: ExtensionSource;
  packageName: string;
  version: string;
  path: string; // 실제 파일 경로
  metadata: {
    id: string;
    displayName: string;
    category?: string;
    description?: string;
  };
}

/**
 * Electron 환경 확인
 */
function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

/**
 * External Extension을 동적으로 로드
 *
 * @param packageName - npm 패키지 이름 (예: '@sepilot/extension-{id}')
 * @returns Extension Definition
 */
export async function loadExternalExtension(packageName: string): Promise<ExtensionDefinition> {
  logger.info(`[ExternalLoader] Loading extension: ${packageName}`);

  try {
    // Dynamic import 사용 (Vite/Webpack에서 경고 무시)
    const module = await import(/* webpackIgnore: true */ /* @vite-ignore */ packageName);

    if (!module.default) {
      throw new Error(`Extension ${packageName} does not export default`);
    }

    const definition = module.default as ExtensionDefinition;

    // 기본 검증
    if (!definition.manifest || !definition.manifest.id) {
      throw new Error(`Extension ${packageName} has invalid manifest`);
    }

    logger.info(
      `[ExternalLoader] Successfully loaded: ${definition.manifest.id} v${definition.manifest.version}`
    );

    return definition;
  } catch (error) {
    logger.error(`[ExternalLoader] Failed to load ${packageName}`, { error });
    throw error;
  }
}

/**
 * 설치된 Extension 목록 조회
 *
 * node_modules에서 @sepilot/extension-* 패키지를 스캔합니다.
 *
 * @returns Extension 패키지 정보 배열
 */
export async function discoverExternalExtensions(): Promise<ExtensionPackageInfo[]> {
  if (!isElectron() || !(window as any).electronAPI) {
    logger.warn('[ExternalLoader] Not in Electron environment, skipping discovery');
    return [];
  }

  try {
    logger.info('[ExternalLoader] Discovering external extensions...');

    const result = await (window as any).electronAPI.extension.discover();

    if (!result.success) {
      throw new Error(result.error || 'Failed to discover extensions');
    }

    const extensions: ExtensionPackageInfo[] = result.data || [];

    logger.info(`[ExternalLoader] Discovered ${extensions.length} external extension(s)`, {
      extensions: extensions.map((e) => `${e.packageName}@${e.version}`),
    });

    return extensions;
  } catch (error) {
    logger.error('[ExternalLoader] Failed to discover extensions', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return [];
  }
}

/**
 * Extension 설치
 *
 * npm install을 실행하여 Extension을 설치합니다.
 *
 * @param packageName - 설치할 패키지 이름
 * @param version - 버전 (선택적, 미지정 시 latest)
 */
export async function installExtension(packageName: string, version?: string): Promise<void> {
  if (!isElectron() || !(window as any).electronAPI) {
    throw new Error('Extension installation is only available in Electron');
  }

  const fullPackageName = version ? `${packageName}@${version}` : packageName;

  logger.info(`[ExternalLoader] Installing extension: ${fullPackageName}`);

  try {
    const result = await (window as any).electronAPI.extension.install(fullPackageName);

    if (!result.success) {
      throw new Error(result.error || 'Installation failed');
    }

    logger.info(`[ExternalLoader] Successfully installed: ${fullPackageName}`);
  } catch (error) {
    logger.error(`[ExternalLoader] Failed to install ${fullPackageName}`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Extension 제거
 *
 * npm uninstall을 실행하여 Extension을 제거합니다.
 *
 * @param packageName - 제거할 패키지 이름
 */
export async function uninstallExtension(packageName: string): Promise<void> {
  if (!isElectron() || !(window as any).electronAPI) {
    throw new Error('Extension uninstallation is only available in Electron');
  }

  logger.info(`[ExternalLoader] Uninstalling extension: ${packageName}`);

  try {
    const result = await (window as any).electronAPI.extension.uninstall(packageName);

    if (!result.success) {
      throw new Error(result.error || 'Uninstallation failed');
    }

    logger.info(`[ExternalLoader] Successfully uninstalled: ${packageName}`);
  } catch (error) {
    logger.error(`[ExternalLoader] Failed to uninstall ${packageName}`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Extension 업데이트 확인
 *
 * npm outdated를 실행하여 업데이트 가능한 Extension을 확인합니다.
 *
 * @returns 업데이트 가능한 Extension 목록
 */
export async function checkExtensionUpdates(): Promise<
  Array<{
    packageName: string;
    currentVersion: string;
    latestVersion: string;
  }>
> {
  if (!isElectron() || !(window as any).electronAPI) {
    logger.warn('[ExternalLoader] Not in Electron environment');
    return [];
  }

  try {
    const result = await (window as any).electronAPI.extension.checkUpdates();

    if (!result.success) {
      throw new Error(result.error || 'Failed to check updates');
    }

    return result.data || [];
  } catch (error) {
    logger.error('[ExternalLoader] Failed to check extension updates', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return [];
  }
}
