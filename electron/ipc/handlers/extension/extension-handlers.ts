/**
 * Extension IPC Handlers
 *
 * Extension 설치/제거/발견 기능을 제공합니다.
 */

import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import AdmZip from 'adm-zip';
/* REMOVED: unused import */
import { extensionRegistry } from '@/lib/extensions/registry';

const execFileAsync = promisify(execFile);

interface ExtensionPackageInfo {
  source: 'builtin' | 'npm' | 'local';
  packageName: string;
  version: string;
  path: string;
  metadata: {
    id: string;
    displayName: string;
    category?: string;
    description?: string;
  };
}

/**
 * node_modules에서 Extension 패키지 스캔
 *
 * @sepilot/extension-* 패턴의 패키지를 찾습니다.
 */
function scanNpmExtensions(): ExtensionPackageInfo[] {
  const extensions: ExtensionPackageInfo[] = [];

  try {
    const nodeModulesPath = path.join(process.cwd(), 'node_modules');

    // @sepilot/extension-* 스캔
    const sepilotPath = path.join(nodeModulesPath, '@sepilot');
    if (fs.existsSync(sepilotPath)) {
      const dirs = fs.readdirSync(sepilotPath);

      for (const dir of dirs) {
        if (dir.startsWith('extension-')) {
          const pkgPath = path.join(sepilotPath, dir, 'package.json');

          if (fs.existsSync(pkgPath)) {
            try {
              const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
              const pkg = JSON.parse(pkgContent);

              // package.json에 sepilot.extension: true가 있는지 확인
              if (pkg.sepilot?.extension) {
                extensions.push({
                  source: 'npm',
                  packageName: pkg.name,
                  version: pkg.version,
                  path: path.join(sepilotPath, dir),
                  metadata: {
                    id: pkg.sepilot.id || dir.replace('extension-', ''),
                    displayName: pkg.sepilot.displayName || pkg.name,
                    category: pkg.sepilot.category,
                    description: pkg.description,
                  },
                });

                console.log(`[ExtensionHandlers] Found extension: ${pkg.name}@${pkg.version}`);
              }
            } catch (error) {
              console.error(`[ExtensionHandlers] Failed to read ${pkgPath}:`, error);
            }
          }
        }
      }
    }

    // TODO: 3rd party extension 스캔
    // @*/sepilot-extension-* 패턴 지원

    console.log(`[ExtensionHandlers] Discovered ${extensions.length} npm extension(s)`);
  } catch (error) {
    console.error('[ExtensionHandlers] Failed to scan npm extensions:', error);
  }

  return extensions;
}

/**
 * Extension ID 검증
 *
 * 영문 소문자, 숫자, 하이픈만 허용 (path traversal 방지)
 */
function validateExtensionId(id: string): boolean {
  return /^[a-z0-9-]+$/.test(id);
}

/**
 * 버전 검증
 *
 * Semantic Versioning 형식만 허용
 */
function validateVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?(\+[a-z0-9.-]+)?$/i.test(version);
}

/**
 * ZIP 엔트리 경로 검증
 *
 * Path traversal 및 절대 경로 방지 (ZIP Slip 취약점 방지)
 */
function validateZipEntryPath(entryPath: string): boolean {
  // 정규화된 경로로 변환
  const normalized = path.normalize(entryPath);

  // 절대 경로 거부
  if (path.isAbsolute(normalized)) {
    return false;
  }

  // .. 포함 거부 (상위 디렉토리 접근 방지)
  if (normalized.includes('..')) {
    return false;
  }

  // null 바이트 거부
  if (normalized.includes('\0')) {
    return false;
  }

  return true;
}

/**
 * 로컬 Extension 디렉토리 경로 반환
 */
function getExtensionDirectory(): string {
  // 개발 모드: 프로젝트 루트의 resources/extensions 사용
  // install-extensions.js가 .sepx를 node_modules에 설치하고,
  // bundle-extensions.js가 resources/extensions에 압축 해제함
  if (!app.isPackaged) {
    const devPath = path.join(process.cwd(), 'resources', 'extensions');
    // 디렉토리가 없으면 생성 (에러 방지)
    if (!fs.existsSync(devPath)) {
      try {
        fs.mkdirSync(devPath, { recursive: true });
      } catch (e) {
        console.error('[ExtensionHandlers] Failed to create dev extension dir:', e);
      }
    }
    return devPath;
  }

  // 프로덕션: User Data 디렉토리 사용 (AppData/Roaming/sepilot-desktop/extensions)
  const userDataPath = app.getPath('userData');
  const extensionsPath = path.join(userDataPath, 'extensions');

  // 디렉토리가 없으면 생성
  if (!fs.existsSync(extensionsPath)) {
    fs.mkdirSync(extensionsPath, { recursive: true });
  }

  return extensionsPath;
}

/**
 * 로컬에 설치된 Extension 스캔
 *
 * ~/.config/SEPilot/extensions/ 디렉토리에서 설치된 Extension을 찾습니다.
 */
function scanLocalExtensions(): ExtensionPackageInfo[] {
  const extensions: ExtensionPackageInfo[] = [];

  try {
    const extensionsPath = getExtensionDirectory();

    if (!fs.existsSync(extensionsPath)) {
      return extensions;
    }

    const dirs = fs.readdirSync(extensionsPath);

    for (const dir of dirs) {
      const extPath = path.join(extensionsPath, dir);
      const manifestPath = path.join(extPath, 'manifest.json');

      if (fs.existsSync(manifestPath)) {
        try {
          const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent);

          extensions.push({
            source: 'local',
            packageName: `local:${manifest.id}`,
            version: manifest.version,
            path: extPath,
            metadata: {
              id: manifest.id,
              displayName: manifest.displayName || manifest.name,
              category: manifest.category,
              description: manifest.description,
            },
          });

          console.log(
            `[ExtensionHandlers] Found local extension: ${manifest.id}@${manifest.version}`
          );
        } catch (error) {
          console.error(`[ExtensionHandlers] Failed to read ${manifestPath}:`, error);
        }
      }
    }

    console.log(`[ExtensionHandlers] Discovered ${extensions.length} local extension(s)`);
  } catch (error) {
    console.error('[ExtensionHandlers] Failed to scan local extensions:', error);
  }

  return extensions;
}

/**
 * .sepx 파일에서 Extension 설치
 *
 * @param sepxFilePath - .sepx 파일 경로
 * @returns 설치된 Extension 정보
 */
async function installExtensionFromFile(sepxFilePath: string): Promise<ExtensionPackageInfo> {
  console.log(`[ExtensionHandlers] Installing extension from ${sepxFilePath}...`);

  try {
    // 1. 파일 경로 검증 (Path Traversal 방지)
    const resolvedPath = path.resolve(sepxFilePath);
    if (!resolvedPath.endsWith('.sepx')) {
      throw new Error('Invalid file extension: only .sepx files are allowed');
    }

    // 2. .sepx 파일 존재 확인
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    // 3. ZIP 파일 읽기
    const zip = new AdmZip(resolvedPath);
    const zipEntries = zip.getEntries();

    // 4. ZIP Slip 취약점 방지: 모든 엔트리 경로 검증
    for (const entry of zipEntries) {
      if (!validateZipEntryPath(entry.entryName)) {
        throw new Error(
          `Invalid entry path in .sepx file: ${entry.entryName}. ` +
            `Path traversal attempts are not allowed.`
        );
      }
    }

    // 5. manifest.json 추출 및 읽기
    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) {
      throw new Error('manifest.json not found in .sepx file');
    }

    const manifestContent = manifestEntry.getData().toString('utf-8');
    const manifest = JSON.parse(manifestContent);

    // 6. manifest 필수 필드 검증
    if (!manifest.id || !manifest.version) {
      throw new Error('Invalid manifest.json: id and version are required');
    }

    // 7. Extension ID 검증
    if (!validateExtensionId(manifest.id)) {
      throw new Error(
        `Invalid extension ID: ${manifest.id}. ` +
          `Only lowercase letters, numbers, and hyphens are allowed.`
      );
    }

    // 8. 버전 검증
    if (!validateVersion(manifest.version)) {
      throw new Error(
        `Invalid version: ${manifest.version}. ` +
          `Must follow Semantic Versioning format (e.g., 1.0.0).`
      );
    }

    // 9. 설치 디렉토리 생성 (loader-runtime.ts, extension-paths.ts와 동일한 {id} 규칙)
    const extensionsPath = getExtensionDirectory();
    const installPath = path.join(extensionsPath, manifest.id);

    // 10. 이미 설치된 경우 덮어쓰기
    if (fs.existsSync(installPath)) {
      console.log(`[ExtensionHandlers] Extension already exists, overwriting: ${installPath}`);
      fs.rmSync(installPath, { recursive: true, force: true });
    }

    // 11. ZIP 압축 해제 (경로 검증 완료)
    zip.extractAllTo(installPath, true);

    console.log(`[ExtensionHandlers] Extension installed successfully to ${installPath}`);

    return {
      source: 'local',
      packageName: `local:${manifest.id}`,
      version: manifest.version,
      path: installPath,
      metadata: {
        id: manifest.id,
        displayName: manifest.displayName || manifest.name,
        category: manifest.category,
        description: manifest.description,
      },
    };
  } catch (error) {
    console.error(`[ExtensionHandlers] Failed to install extension from ${sepxFilePath}:`, error);
    throw error;
  }
}

/**
 * 로컬 Extension 제거
 *
 * @param extensionId - Extension ID
 * @param version - Extension 버전 (하위 호환성 유지, 경로에는 미사용)
 */
async function uninstallLocalExtension(extensionId: string, version: string): Promise<void> {
  console.log(`[ExtensionHandlers] Uninstalling local extension: ${extensionId}@${version}...`);

  try {
    // 1. Extension ID 검증 (Path Traversal 방지)
    if (!validateExtensionId(extensionId)) {
      throw new Error(
        `Invalid extension ID: ${extensionId}. ` +
          `Only lowercase letters, numbers, and hyphens are allowed.`
      );
    }

    // 2. 설치 경로 확인 (loader-runtime.ts와 동일한 {id} 규칙)
    const extensionsPath = getExtensionDirectory();
    const installPath = path.join(extensionsPath, extensionId);

    // 3. 경로가 extensions 디렉토리 내에 있는지 확인 (추가 안전장치)
    const resolvedInstallPath = path.resolve(installPath);
    const resolvedExtensionsPath = path.resolve(extensionsPath);

    if (!resolvedInstallPath.startsWith(resolvedExtensionsPath)) {
      throw new Error('Invalid installation path: attempted directory traversal detected');
    }

    // 4. Extension 존재 확인
    if (!fs.existsSync(resolvedInstallPath)) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    // 5. 디렉토리 삭제
    fs.rmSync(resolvedInstallPath, { recursive: true, force: true });

    console.log(`[ExtensionHandlers] Extension uninstalled successfully: ${extensionId}`);
  } catch (error) {
    console.error(`[ExtensionHandlers] Failed to uninstall extension ${extensionId}:`, error);
    throw error;
  }
}

/**
 * Extension 설치
 *
 * pnpm install을 실행하여 Extension을 설치합니다.
 */
async function installExtension(packageName: string): Promise<void> {
  console.log(`[ExtensionHandlers] Installing ${packageName}...`);

  try {
    // Command Injection 방지: execFile 사용
    const { stdout, stderr } = await execFileAsync('pnpm', ['install', packageName], {
      cwd: process.cwd(),
    });

    if (stderr && !stderr.includes('Progress')) {
      console.error(`[ExtensionHandlers] pnpm install stderr:`, stderr);
    }

    console.log(`[ExtensionHandlers] Successfully installed ${packageName}`);
    console.log(stdout);
  } catch (error) {
    console.error(`[ExtensionHandlers] Failed to install ${packageName}:`, error);
    throw error;
  }
}

/**
 * Extension 제거
 *
 * pnpm uninstall을 실행하여 Extension을 제거합니다.
 */
async function uninstallExtension(packageName: string): Promise<void> {
  console.log(`[ExtensionHandlers] Uninstalling ${packageName}...`);

  try {
    // Command Injection 방지: execFile 사용
    const { stdout, stderr } = await execFileAsync('pnpm', ['uninstall', packageName], {
      cwd: process.cwd(),
    });

    if (stderr && !stderr.includes('Progress')) {
      console.error(`[ExtensionHandlers] pnpm uninstall stderr:`, stderr);
    }

    console.log(`[ExtensionHandlers] Successfully uninstalled ${packageName}`);
    console.log(stdout);
  } catch (error) {
    console.error(`[ExtensionHandlers] Failed to uninstall ${packageName}:`, error);
    throw error;
  }
}

/**
 * Extension 업데이트 확인
 *
 * pnpm outdated를 실행하여 업데이트 가능한 Extension을 확인합니다.
 */
async function checkExtensionUpdates(): Promise<
  Array<{
    packageName: string;
    currentVersion: string;
    latestVersion: string;
  }>
> {
  console.log('[ExtensionHandlers] Checking for extension updates...');

  try {
    // pnpm outdated --json 실행 (Command Injection 방지: execFile 사용)
    const { stdout } = await execFileAsync('pnpm', ['outdated', '--json', '@sepilot/extension-*'], {
      cwd: process.cwd(),
    });

    if (!stdout) {
      console.log('[ExtensionHandlers] All extensions are up to date');
      return [];
    }

    // JSON 파싱
    const outdated = JSON.parse(stdout);
    const updates: Array<{
      packageName: string;
      currentVersion: string;
      latestVersion: string;
    }> = [];

    for (const [pkgName, info] of Object.entries(outdated)) {
      if (pkgName.startsWith('@sepilot/extension-')) {
        updates.push({
          packageName: pkgName,
          currentVersion: (info as any).current,
          latestVersion: (info as any).latest,
        });
      }
    }

    console.log(`[ExtensionHandlers] Found ${updates.length} extension(s) with updates available`);

    return updates;
  } catch (error) {
    // pnpm outdated는 업데이트가 있을 때 exit code 1을 반환
    // 따라서 에러가 발생해도 정상일 수 있음
    console.log('[ExtensionHandlers] No updates available or error occurred:', error);
    return [];
  }
}

/**
 * Extension IPC Handlers 등록
 */
export function registerExtensionHandlers(): void {
  console.log('[ExtensionHandlers] Registering extension IPC handlers...');

  /**
   * extension:discover
   * 설치된 Extension 목록 조회
   */
  ipcMain.handle('extension:discover', async () => {
    try {
      const extensions = scanNpmExtensions();
      return { success: true, data: extensions };
    } catch (error) {
      console.error('[ExtensionHandlers] extension:discover failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * extension:install
   * Extension 설치
   */
  ipcMain.handle('extension:install', async (event, { packageName }) => {
    try {
      await installExtension(packageName);
      return { success: true };
    } catch (error) {
      console.error('[ExtensionHandlers] extension:install failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * extension:uninstall
   * Extension 제거
   */
  ipcMain.handle('extension:uninstall', async (event, { packageName }) => {
    try {
      await uninstallExtension(packageName);
      return { success: true };
    } catch (error) {
      console.error('[ExtensionHandlers] extension:uninstall failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * extension:check-updates
   * Extension 업데이트 확인
   */
  ipcMain.handle('extension:check-updates', async () => {
    try {
      const updates = await checkExtensionUpdates();
      return { success: true, data: updates };
    } catch (error) {
      console.error('[ExtensionHandlers] extension:check-updates failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * extension:scan-local
   * 로컬에 설치된 Extension 목록 조회
   */
  ipcMain.handle('extension:scan-local', async () => {
    try {
      const extensions = scanLocalExtensions();
      return { success: true, data: extensions };
    } catch (error) {
      console.error('[ExtensionHandlers] extension:scan-local failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * extension:install-from-file
   * .sepx 파일에서 Extension 설치
   */
  ipcMain.handle('extension:install-from-file', async (event, { filePath }) => {
    try {
      const extension = await installExtensionFromFile(filePath);
      return { success: true, data: extension };
    } catch (error) {
      console.error('[ExtensionHandlers] extension:install-from-file failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * extension:uninstall-local
   * 로컬 Extension 제거
   */
  ipcMain.handle('extension:uninstall-local', async (event, { extensionId, version }) => {
    try {
      await uninstallLocalExtension(extensionId, version);
      return { success: true };
    } catch (error) {
      console.error('[ExtensionHandlers] extension:uninstall-local failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * extension:list-renderer-extensions
   * Renderer Process에서 사용 가능한 Extension 목록 조회
   *
   * Main Process에서 로드된 Extension 중 processType이 'renderer' 또는 'both'인 것만 반환합니다.
   */
  ipcMain.handle('extension:list-renderer-extensions', async () => {
    try {
      // Main Process에서 등록된 Extension 조회
      const allExtensions = extensionRegistry.getAll();

      console.log(`[ExtensionHandlers] All extensions (registry size): ${allExtensions.length}`);
      allExtensions.forEach((ext) => console.log(`[ExtensionHandlers] - ${ext.manifest.id}`));

      // Renderer에서 사용 가능한 Extension만 필터링
      const rendererExtensions = allExtensions
        .filter((ext) => {
          const processType = ext.manifest.processType || 'renderer';
          return processType === 'renderer' || processType === 'both';
        })
        .map((ext) => ({
          id: ext.manifest.id,
          version: ext.manifest.version,
          name: ext.manifest.name,
          mode: ext.manifest.mode,
          renderer: (ext.manifest as any).renderer || undefined,
        }));

      console.log(
        `[ExtensionHandlers] Returning ${rendererExtensions.length} renderer extension(s):`,
        rendererExtensions.map((e) => `${e.id}@${e.version}`).join(', ')
      );

      return {
        success: true,
        data: rendererExtensions,
      };
    } catch (error) {
      console.error('[ExtensionHandlers] extension:list-renderer-extensions failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * extension:diagnose-renderer
   * Renderer Process에서 Extension 진단 실행 (런타임 체크 포함)
   *
   * Renderer 환경에서만 가능한 실제 렌더링 체크를 수행합니다.
   * CLI에서는 이 핸들러를 직접 호출할 수 없으며, GUI Dev Tools 콘솔에서 사용합니다.
   *
   * @example
   * // Dev Tools Console에서 실행
   * await window.electronAPI.invoke('extension:diagnose-renderer', 'editor')
   */
  ipcMain.handle('extension:diagnose-renderer', async (event, extensionId: string) => {
    try {
      console.log(`[ExtensionHandlers] Renderer diagnostics requested for: ${extensionId}`);

      // Extension Registry에서 Extension 찾기
      const extension = extensionRegistry.get(extensionId);

      if (!extension) {
        return {
          success: false,
          error: `Extension not found: ${extensionId}`,
        };
      }

      // Extension에 diagnostics 함수가 있는지 확인
      if (!extension.diagnostics) {
        return {
          success: false,
          error: `Extension '${extensionId}' does not provide a diagnostics function`,
        };
      }

      // Renderer에서 진단 함수 실행 (이 코드는 Renderer에서 실행되어야 함)
      // 실제로는 Renderer에서 Extension을 직접 import하고 diagnostics를 실행해야 합니다.
      // Main Process에서는 Renderer 환경 체크를 할 수 없으므로, 이 핸들러는
      // Renderer에서 직접 Extension의 diagnostics를 호출하고 결과를 전달받는 용도입니다.

      return {
        success: true,
        message:
          'This IPC handler should be called from Renderer. Use window.electronAPI in browser console.',
      };
    } catch (error) {
      console.error('[ExtensionHandlers] extension:diagnose-renderer failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  console.log('[ExtensionHandlers] Extension IPC handlers registered successfully');
}
