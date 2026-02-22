/**
 * Extension Diagnostics IPC Handler
 *
 * Portable 빌드에서 Extension 로딩 문제를 진단하기 위한 IPC 핸들러
 * Dev Tools 콘솔에서 `await window.electronAPI.invoke('extension:diagnostics')` 호출 가능
 */

import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { extensionRegistry } from '@/lib/extensions/registry';
import { logger } from '@/lib/utils/logger';

export interface ExtensionDiagnostics {
  timestamp: string;
  environment: {
    isDev: boolean;
    isPackaged: boolean;
    platform: string;
    exePath: string;
    exeDir: string;
    portableDir: string | null;
    appPath: string;
    resourcesPath: string | null;
    userDataPath: string;
  };
  searchPaths: {
    path: string;
    exists: boolean;
    files?: string[];
    error?: string;
  }[];
  loadedExtensions: {
    id: string;
    version: string;
    name: string;
    enabled: boolean;
    hasMainComponent: boolean;
    hasSidebarComponent: boolean;
    hasSettingsComponent: boolean;
    // 상세 진단 정보 (--detailed 모드에서만)
    ipcHandlers?: string[];
    storeSlice?: boolean;
    agents?: Array<{ id: string; type: string }>;
    dependencies?: Array<{ id: string; loaded: boolean }>;
    processType?: string;
  }[];
  registryStats: {
    totalRegistered: number;
    enabledCount: number;
  };
  recommendations: string[];
}

/**
 * Extension 진단 정보 수집
 * @param detailed - 상세 정보 포함 여부
 */
export function getExtensionDiagnostics(detailed = false): ExtensionDiagnostics {
  const isDev = !app.isPackaged;
  const exePath = app.getPath('exe');
  const exeDir = path.dirname(exePath);
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR || null;
  const appPath = app.getAppPath();
  const resourcesPath = process.resourcesPath || null;
  const userDataPath = app.getPath('userData');

  // 환경 정보
  const environment = {
    isDev,
    isPackaged: app.isPackaged,
    platform: process.platform,
    exePath,
    exeDir,
    portableDir,
    appPath,
    resourcesPath,
    userDataPath,
  };

  // Extension 검색 경로 목록
  const candidatePaths: string[] = [];

  if (isDev) {
    // 개발 모드
    candidatePaths.push(path.join(appPath, 'resources', 'extensions'));
  } else {
    // 프로덕션 모드
    candidatePaths.push(path.join(exeDir, 'extensions'));
    if (portableDir) {
      candidatePaths.push(path.join(portableDir, 'extensions'));
    }
    if (resourcesPath) {
      candidatePaths.push(path.join(resourcesPath, 'extensions'));
    }
  }

  // 사용자 설치 경로
  candidatePaths.push(path.join(userDataPath, 'extensions'));

  // 중복 제거
  const uniquePaths = Array.from(new Set(candidatePaths.map((p) => path.resolve(p))));

  // 각 경로 검사
  const searchPaths = uniquePaths.map((searchPath) => {
    try {
      if (!fs.existsSync(searchPath)) {
        return {
          path: searchPath,
          exists: false,
        };
      }

      const files = fs.readdirSync(searchPath);
      const sepxFiles = files.filter((f) => f.endsWith('.sepx'));
      const directories = files.filter((f) => {
        try {
          return fs.statSync(path.join(searchPath, f)).isDirectory();
        } catch {
          return false;
        }
      });

      return {
        path: searchPath,
        exists: true,
        files: isDev ? directories : sepxFiles,
      };
    } catch (error) {
      return {
        path: searchPath,
        exists: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 로드된 Extension 정보
  const loadedExtensions = extensionRegistry.getAll().map((ext) => {
    const base = {
      id: ext.manifest.id,
      version: ext.manifest.version,
      name: ext.manifest.name,
      enabled: ext.manifest.enabled !== false,
      hasMainComponent: !!ext.MainComponent,
      hasSidebarComponent: !!ext.SidebarComponent,
      hasSettingsComponent: !!ext.SettingsComponent,
    };

    // 상세 정보 추가
    if (detailed) {
      return {
        ...base,
        ipcHandlers: ext.manifest.ipcChannels?.handlers || [],
        storeSlice: !!ext.createStoreSlice,
        agents: (ext.manifest.agents || []).map((agent) => ({
          id: agent.id,
          type: agent.type || 'unknown',
        })),
        dependencies: (ext.manifest.dependencies || []).map((depId) => ({
          id: depId,
          loaded: extensionRegistry.get(depId) !== undefined,
        })),
        processType: ext.manifest.processType || 'both',
      };
    }

    return base;
  });

  // 레지스트리 통계
  const registryStats = {
    totalRegistered: loadedExtensions.length,
    enabledCount: loadedExtensions.filter((e) => e.enabled).length,
  };

  // 권장사항
  const recommendations: string[] = [];

  if (loadedExtensions.length === 0) {
    recommendations.push('❌ No extensions loaded. Check if .sepx files exist in search paths.');
  }

  const hasValidSearchPath = searchPaths.some((p) => p.exists && (p.files?.length ?? 0) > 0);
  if (!hasValidSearchPath) {
    recommendations.push(
      '⚠️  No valid extension search path found. Ensure .sepx files are placed correctly.'
    );
  }

  if (!isDev && !portableDir) {
    recommendations.push(
      '⚠️  PORTABLE_EXECUTABLE_DIR not set. Portable builds may not find extensions.'
    );
  }

  if (searchPaths.every((p) => !p.exists)) {
    recommendations.push('❌ All extension search paths are missing. Check build configuration.');
  }

  if (loadedExtensions.length > 0 && loadedExtensions.length < 5) {
    recommendations.push(
      `⚠️  Only ${loadedExtensions.length} extension(s) loaded. Expected 8+ extensions.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Extension loading appears normal.');
  }

  return {
    timestamp: new Date().toISOString(),
    environment,
    searchPaths,
    loadedExtensions,
    registryStats,
    recommendations,
  };
}

/**
 * IPC 핸들러 등록
 */
export function registerExtensionDiagnosticsHandlers(): void {
  // Extension 진단 정보 조회
  ipcMain.handle('extension:diagnostics', async (_event, options?: { detailed?: boolean }) => {
    try {
      const detailed = options?.detailed ?? false;
      logger.info('[ExtensionDiagnostics] Diagnostics requested', { detailed });
      const diagnostics = getExtensionDiagnostics(detailed);
      logger.info('[ExtensionDiagnostics] Diagnostics collected', {
        loadedCount: diagnostics.loadedExtensions.length,
        searchPathCount: diagnostics.searchPaths.length,
        detailed,
      });
      return { success: true, data: diagnostics };
    } catch (error) {
      logger.error('[ExtensionDiagnostics] Failed to collect diagnostics', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  logger.info('[ExtensionDiagnostics] Handlers registered');
}
