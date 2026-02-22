/**
 * Extension Runtime Loader
 *
 * VSCode와 유사하게 Extension을 런타임에 동적으로 로드합니다.
 * - Built-in Extensions: resources/extensions/
 * - External Extensions: userData/extensions/
 *
 * NOTE: This module runs in Electron Main Process and uses require() for dynamic loading
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import AdmZip from 'adm-zip';
import type { ExtensionDefinition, ExtensionManifest } from './types';
import { logger } from '@/lib/utils/logger';
import { extensionLogger } from '@/lib/utils/extension-logger';
import { safeParseJSON } from '@/lib/utils/safe-json';
import { fileLogger } from '@/lib/utils/file-logger';

export type ExtensionSource = 'development' | 'package';

export interface LoadedExtension {
  manifest: ExtensionManifest;
  definition: ExtensionDefinition;
  source: ExtensionSource;
  path: string;
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

function parseSemver(version: string): ParsedSemver {
  const [withoutBuildMeta] = version.split('+');
  const [core = '0.0.0', prereleaseRaw] = withoutBuildMeta.split('-');
  const [major = '0', minor = '0', patch = '0'] = core.split('.');

  return {
    major: Number(major) || 0,
    minor: Number(minor) || 0,
    patch: Number(patch) || 0,
    prerelease: prereleaseRaw ? prereleaseRaw.split('.') : [],
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  // prerelease가 없는 버전이 더 높은 우선순위
  if (a.length === 0 && b.length === 0) {
    return 0;
  }
  if (a.length === 0) {
    return 1;
  }
  if (b.length === 0) {
    return -1;
  }

  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i += 1) {
    const aId = a[i];
    const bId = b[i];

    if (aId === undefined) {
      return -1;
    }
    if (bId === undefined) {
      return 1;
    }

    const aNum = /^\d+$/.test(aId);
    const bNum = /^\d+$/.test(bId);

    if (aNum && bNum) {
      const diff = Number(aId) - Number(bId);
      if (diff !== 0) {
        return diff;
      }
      continue;
    }

    if (aNum && !bNum) {
      return -1;
    }
    if (!aNum && bNum) {
      return 1;
    }

    const lexical = aId.localeCompare(bId);
    if (lexical !== 0) {
      return lexical;
    }
  }

  return 0;
}

function compareSemver(a: string, b: string): number {
  const av = parseSemver(a);
  const bv = parseSemver(b);

  if (av.major !== bv.major) {
    return av.major - bv.major;
  }

  if (av.minor !== bv.minor) {
    return av.minor - bv.minor;
  }

  if (av.patch !== bv.patch) {
    return av.patch - bv.patch;
  }

  return comparePrerelease(av.prerelease, bv.prerelease);
}

/**
 * Extension 로드 (개발 모드 + 프로덕션 모드)
 *
 * 개발 모드: resources/extensions/{id}/ 디렉토리에서 로드
 * 프로덕션 모드: extensions/{id}-{version}.sepx 파일에서 로드
 *
 * VSCode vsix와 유사하게 동작:
 * - 개발 모드 우선순위 높음 (Hot Reload 지원)
 * - 같은 Extension이 둘 다 있으면 개발 모드 사용
 */
export async function loadExtensions(
  resourcesPath: string,
  packagePath: string
): Promise<LoadedExtension[]> {
  const extensions: LoadedExtension[] = [];
  const loadedIds = new Set<string>();

  // 1. 개발 모드 Extension 로드 (resources/extensions/)
  const devExtensions = await loadDevelopmentExtensions(resourcesPath);
  for (const ext of devExtensions) {
    extensions.push(ext);
    loadedIds.add(ext.manifest.id);
    logger.info(
      `[ExtensionLoader] ✅ Loaded (development): ${ext.manifest.id}@${ext.manifest.version}`
    );
  }

  // 2. 프로덕션 모드 Extension 로드 (extensions/*.sepx)
  const pkgExtensions = await loadPackageExtensions(packagePath);
  for (const ext of pkgExtensions) {
    // 이미 개발 모드로 로드된 Extension은 건너뛰기
    if (loadedIds.has(ext.manifest.id)) {
      logger.info(
        `[ExtensionLoader] ⏭️  Skipping (package): ${ext.manifest.id} (already loaded in development mode)`
      );
      continue;
    }
    extensions.push(ext);
    loadedIds.add(ext.manifest.id);
    logger.info(
      `[ExtensionLoader] ✅ Loaded (package): ${ext.manifest.id}@${ext.manifest.version}`
    );
  }

  return extensions;
}

/**
 * 개발 모드 Extension 로드
 *
 * resources/extensions/{id}/ 디렉토리에서 로드
 * - manifest.json 필수
 * - dist/ 폴더 필수
 */
async function loadDevelopmentExtensions(resourcesPath: string): Promise<LoadedExtension[]> {
  const extensionsPath = path.join(resourcesPath, 'extensions');

  logger.info(`[ExtensionLoader] Scanning development extensions: ${extensionsPath}`);

  if (!fs.existsSync(extensionsPath)) {
    logger.warn('[ExtensionLoader] Development extensions directory not found');
    return [];
  }

  const extensions: LoadedExtension[] = [];
  const entries = fs.readdirSync(extensionsPath, { withFileTypes: true });

  for (const entry of entries) {
    try {
      // 디렉토리만 처리 (개발 모드)
      if (!entry.isDirectory()) {
        continue;
      }

      const extPath = path.join(extensionsPath, entry.name);
      const manifestPath = path.join(extPath, 'manifest.json');

      // manifest.json 확인
      if (!fs.existsSync(manifestPath)) {
        logger.debug(`[ExtensionLoader] No manifest.json in ${entry.name}, skipping`);
        continue;
      }

      // manifest 로드 (Prototype Pollution 방어)
      const manifest: ExtensionManifest = safeParseJSON<ExtensionManifest>(
        fs.readFileSync(manifestPath, 'utf-8')
      );

      // manifest.main 경로 검증 (Path Traversal 방어)
      const mainEntry = manifest.main || 'dist/main.js';
      if (!/^dist\/[a-zA-Z0-9/_-]+\.m?js$/.test(mainEntry)) {
        logger.error(
          `[ExtensionLoader] Invalid main path in manifest for ${entry.name}: ${mainEntry}`
        );
        continue;
      }

      // main entry point 확인 (ext-docs 명세)
      const mainPath = path.join(extPath, mainEntry);

      let definition: ExtensionDefinition = { manifest };

      // Main Process 코드가 있으면 로드
      if (fs.existsSync(mainPath)) {
        try {
          delete require.cache[require.resolve(mainPath)];
          const module = require(mainPath);
          definition = module.default || module;
          // manifest가 없으면 주입 (불변 객체 대비 새 객체 생성)
          if (!definition.manifest) {
            definition = { ...definition, manifest };
          }
        } catch (loadError) {
          logger.warn(
            `[ExtensionLoader] Failed to load main module for ${entry.name}, registering manifest only:`,
            { error: loadError instanceof Error ? loadError.message : String(loadError) }
          );
          definition = { manifest };
        }
      } else {
        logger.debug(`[ExtensionLoader] No main entry in ${entry.name}, registering manifest only`);
      }

      extensions.push({
        manifest,
        definition,
        source: 'development',
        path: extPath,
      });

      logger.debug(
        `[ExtensionLoader] Loaded development extension: ${manifest.id}@${manifest.version} from ${extPath}`
      );
    } catch (error) {
      logger.error(`[ExtensionLoader] Failed to load ${entry.name}:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  return extensions;
}

/**
 * 프로덕션 모드 Extension 로드
 *
 * extensions/*.sepx 파일에서 로드
 * - ZIP 압축 해제
 * - manifest.json 검증
 * - Main/Renderer 코드 로드
 */
async function loadPackageExtensions(packagePath: string): Promise<LoadedExtension[]> {
  logger.warn(`[ExtensionLoader] Scanning package extensions: ${packagePath}`);
  fileLogger.info('LoaderRuntime', `Scanning package path: ${packagePath}`);

  if (!fs.existsSync(packagePath)) {
    logger.warn(`[ExtensionLoader] Package extensions directory not found: ${packagePath}`);
    fileLogger.warn('LoaderRuntime', `Directory not found: ${packagePath}`);
    return [];
  }

  const extensions: LoadedExtension[] = [];
  const files = fs.readdirSync(packagePath);
  const sepxFiles = files.filter((f) => f.endsWith('.sepx'));
  fileLogger.info('LoaderRuntime', `Found ${sepxFiles.length} .sepx files`, { files: sepxFiles });

  const promises = files.map(async (file) => {
    if (!file.endsWith('.sepx')) {
      return null;
    }

    try {
      const sepxPath = path.join(packagePath, file);
      logger.info(`[ExtensionLoader] Loading .sepx file: ${file}`);
      fileLogger.info('LoaderRuntime', `Loading .sepx: ${file}`);
      const start = Date.now();

      const extension = await loadExternalExtension(sepxPath);
      const loadTime = Date.now() - start;
      logger.info(`[ExtensionLoader] Loaded ${file} in ${loadTime}ms`);
      fileLogger.info('LoaderRuntime', `✅ Loaded ${file} in ${loadTime}ms`);

      return {
        ...extension,
        source: 'package' as const,
      };
    } catch (error) {
      logger.error(`[ExtensionLoader] Failed to load .sepx file ${file}:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      fileLogger.error('LoaderRuntime', `❌ Failed to load ${file}`, error);
      return null;
    }
  });

  const results = await Promise.all(promises);
  results.forEach((ext) => {
    if (ext) {
      extensions.push(ext);
    }
  });

  return extensions;
}

// Extension에서 require 시 앱의 node_modules를 사용하도록 패치
let modulePathsPatched = false;

function patchModulePaths() {
  if (modulePathsPatched) {
    return;
  }

  const Module = require('module');
  const appNodeModules = path.join(app.getAppPath(), 'node_modules');
  const originalNodeModulePaths = Module._nodeModulePaths;

  Module._nodeModulePaths = (from: string) => {
    const paths = originalNodeModulePaths(from);
    // 앱의 node_modules를 항상 포함 (extension 임시 폴더에서 로드 시 필요)
    if (!paths.includes(appNodeModules)) {
      paths.unshift(appNodeModules);
    }
    return paths;
  };

  modulePathsPatched = true;
  logger.info(`[ExtensionLoader] Module paths patched to include: ${appNodeModules}`);
}

/**
 * External Extension (.sepx) 로드
 *
 * .sepx 파일을 userData/extensions/{id}/ 디렉토리로 추출합니다.
 * 이 경로는 resolveExtensionFilePath()가 검색하는 경로와 일치하여
 * Renderer Process에서 sepilot-ext:// 프로토콜로 파일 접근이 가능합니다.
 */
interface ExtractedExtensionValidation {
  manifestExists: boolean;
  distExists: boolean;
  mainExists: boolean;
  rendererExists: boolean;
  needsRenderer: boolean;
  rendererEntryPath: string;
  processType: string;
  missingRequired: string[];
  missingCritical: string[];
}

export function validateExtractedExtensionFiles(
  extractDir: string,
  mainEntryPath: string,
  manifest: ExtensionManifest
): ExtractedExtensionValidation {
  const manifestExists = fs.existsSync(path.join(extractDir, 'manifest.json'));
  const distExists = fs.existsSync(path.join(extractDir, 'dist'));
  const mainExists = fs.existsSync(path.join(extractDir, mainEntryPath));

  const rendererEntryPath = (manifest as any).renderer || 'dist/renderer.js';
  const rendererExists = fs.existsSync(path.join(extractDir, rendererEntryPath));
  const processType = manifest.processType || 'renderer';
  const needsRenderer = processType === 'renderer' || processType === 'both';

  const missingRequired: string[] = [];
  if (!manifestExists) missingRequired.push('manifest.json');
  if (!distExists) missingRequired.push('dist/');
  if (!mainExists) missingRequired.push(mainEntryPath);

  const missingCritical = [...missingRequired];
  if (needsRenderer && !rendererExists) {
    missingCritical.push(rendererEntryPath);
  }

  return {
    manifestExists,
    distExists,
    mainExists,
    rendererExists,
    needsRenderer,
    rendererEntryPath,
    processType,
    missingRequired,
    missingCritical,
  };
}

export async function loadExternalExtension(sepxPath: string): Promise<LoadedExtension> {
  const extractStart = Date.now();

  // 모듈 경로 패치 (최초 1회만)
  patchModulePaths();

  const zip = new AdmZip(sepxPath);

  // manifest.json 추출
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    throw new Error('No manifest.json in .sepx file');
  }

  // manifest 로드 (Prototype Pollution 방어)
  const manifest: ExtensionManifest = safeParseJSON<ExtensionManifest>(
    manifestEntry.getData().toString('utf-8')
  );

  // Manifest 검증
  if (!manifest.id || !manifest.version) {
    throw new Error('Invalid manifest: missing id or version');
  }

  // Extension ID 검증 (Path Traversal 방지)
  // 영문 소문자, 숫자, 하이픈만 허용
  if (!/^[a-z0-9-]+$/.test(manifest.id)) {
    throw new Error(
      `Invalid extension ID: ${manifest.id} (only lowercase, numbers, hyphens allowed)`
    );
  }

  // Version 검증 (semver 형식)
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.-]+)?(\+[a-z0-9.-]+)?$/.test(manifest.version)) {
    throw new Error(`Invalid extension version: ${manifest.version} (must be semver format)`);
  }

  // main entry point 확인 (ext-docs 명세)
  const mainEntryPath = manifest.main || 'dist/index.js';
  const mainEntry = zip.getEntry(mainEntryPath);
  if (!mainEntry) {
    throw new Error(`Main entry not found: ${mainEntryPath} in .sepx file`);
  }

  // userData/extensions/{id}/ 디렉토리로 추출 (버전 기반 캐시)
  // 이 경로는 resolveExtensionFilePath()의 검색 경로에 포함되어 있어
  // Renderer Process에서 sepilot-ext:// 프로토콜로 접근 가능
  const extractBaseDir = path.join(app.getPath('userData'), 'extensions');
  const extractDir = path.join(extractBaseDir, manifest.id);
  const cachedManifestPath = path.join(extractDir, 'manifest.json');
  const extractionMetaPath = path.join(extractDir, '.sepx-meta.json');
  let needsExtraction = true;

  let sepxStats: fs.Stats | null = null;
  try {
    sepxStats = fs.statSync(sepxPath);
  } catch (error) {
    logger.warn('[ExtensionLoader] Failed to read .sepx file stats, cache will be bypassed', error);
  }

  logger.info(`[ExtensionLoader] Extraction target: ${extractDir}`);
  fileLogger.info('LoaderRuntime', `Extract target: ${extractDir}`, {
    sepxPath,
    manifestId: manifest.id,
    manifestVersion: manifest.version,
  });

  // 캐시 전략:
  // 1) 버전 동일
  // 2) .sepx 메타데이터(크기/mtime) 동일
  // 위 두 조건을 모두 만족할 때만 추출 생략
  if (fs.existsSync(cachedManifestPath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachedManifestPath, 'utf-8'));
      logger.info(`[ExtensionLoader] Found cached manifest: ${cached.id}@${cached.version}`);
      fileLogger.info('LoaderRuntime', 'Cached manifest found', {
        cachedId: cached.id,
        cachedVersion: cached.version,
        newVersion: manifest.version,
      });
      if (cached.version === manifest.version && fs.existsSync(extractionMetaPath) && sepxStats) {
        try {
          const extractionMeta = JSON.parse(fs.readFileSync(extractionMetaPath, 'utf-8'));
          const cachedMtime = Number(extractionMeta.sourceMtimeMs || 0);
          const currentMtime = Number(sepxStats.mtimeMs || 0);
          const sameMtime = Math.abs(cachedMtime - currentMtime) < 1;
          const sameSize = Number(extractionMeta.sourceSize || -1) === Number(sepxStats.size || -2);

          if (sameMtime && sameSize) {
            needsExtraction = false;
            logger.info(
              `[ExtensionLoader] ✅ Cache hit: ${manifest.id}@${manifest.version}, skipping extraction`
            );
            fileLogger.info('LoaderRuntime', 'Cache hit, skipping extraction', {
              sameVersion: true,
              sameMtime,
              sameSize,
            });
          } else {
            logger.info(
              `[ExtensionLoader] ⚠️ Cache miss: .sepx file changed (mtime/size), will re-extract`
            );
            fileLogger.info('LoaderRuntime', 'Cache miss, .sepx changed', {
              cachedMtime,
              currentMtime,
              cachedSize: extractionMeta.sourceSize,
              currentSize: sepxStats.size,
            });
          }
        } catch (metaError) {
          logger.info(
            '[ExtensionLoader] ⚠️ Cache miss: extraction metadata unavailable/invalid, will re-extract'
          );
          fileLogger.warn('LoaderRuntime', 'Cache miss, extraction metadata invalid', metaError);
        }
      } else {
        logger.info(
          `[ExtensionLoader] ⚠️  Cache miss: version mismatch or metadata missing (${cached.version} -> ${manifest.version}), will re-extract`
        );
        fileLogger.info('LoaderRuntime', 'Cache miss, will re-extract', {
          hasMeta: fs.existsSync(extractionMetaPath),
          hasSepxStats: !!sepxStats,
        });
      }
    } catch (error) {
      logger.warn('[ExtensionLoader] Failed to read cached manifest, will re-extract', error);
      fileLogger.warn('LoaderRuntime', 'Failed to read cached manifest', error);
    }
  } else {
    logger.info(`[ExtensionLoader] No cached manifest found at ${cachedManifestPath}`);
    fileLogger.info('LoaderRuntime', 'No cached manifest');
  }

  // 캐시 hit로 추출을 건너뛰는 경우에도 추출 디렉토리의 무결성 검증
  // (손상/부분 삭제/외부 개입으로 인한 stale state 방지)
  if (!needsExtraction) {
    const cachedValidation = validateExtractedExtensionFiles(extractDir, mainEntryPath, manifest);

    if (cachedValidation.missingCritical.length > 0) {
      logger.warn(
        `[ExtensionLoader] ⚠️ Cached extraction is incomplete, forcing re-extraction: ${cachedValidation.missingCritical.join(', ')}`
      );
      fileLogger.warn('LoaderRuntime', 'Cached extraction incomplete, forcing re-extraction', {
        missingRequired: cachedValidation.missingRequired,
        missingCritical: cachedValidation.missingCritical,
        needsRenderer: cachedValidation.needsRenderer,
      });
      needsExtraction = true;
    }
  }

  if (needsExtraction) {
    extensionLogger.extracting('Main', manifest.id, sepxPath);
    fileLogger.info('LoaderRuntime', 'Starting extraction', { manifest: manifest.id });

    if (fs.existsSync(extractDir)) {
      logger.info(`[ExtensionLoader] Removing old extraction directory: ${extractDir}`);
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    if (!fs.existsSync(extractBaseDir)) {
      logger.info(`[ExtensionLoader] Creating extraction base directory: ${extractBaseDir}`);
      fs.mkdirSync(extractBaseDir, { recursive: true });
    }

    // Async extraction wrapper
    try {
      await new Promise<void>((resolve, reject) => {
        zip.extractAllToAsync(extractDir, true, false, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      const extractDuration = Date.now() - extractStart;
      logger.info(
        `[ExtensionLoader] ✅ Extracted: ${manifest.id}@${manifest.version} to ${extractDir} in ${extractDuration}ms`
      );
      extensionLogger.extractionSuccess('Main', manifest.id, extractDir, extractDuration);

      // ✅ 추출 후 파일 구조 검증
      try {
        const extractedFiles = fs.readdirSync(extractDir);
        logger.info(
          `[ExtensionLoader] Extracted files (${extractedFiles.length}):`,
          extractedFiles
        );
        fileLogger.info('LoaderRuntime', 'Extracted files', { files: extractedFiles });

        const validation = validateExtractedExtensionFiles(extractDir, mainEntryPath, manifest);

        logger.info('[ExtensionLoader] File validation:', {
          manifestJson: validation.manifestExists ? '✅' : '❌',
          distFolder: validation.distExists ? '✅' : '❌',
          mainEntry: validation.mainExists ? '✅' : '❌',
          rendererEntry: validation.rendererExists ? '✅' : '❌',
        });

        fileLogger.info('LoaderRuntime', 'File validation', {
          manifestExists: validation.manifestExists,
          distExists: validation.distExists,
          mainExists: validation.mainExists,
          rendererExists: validation.rendererExists,
          mainEntryPath,
          rendererEntryPath: validation.rendererEntryPath,
          processType: validation.processType,
        });

        if (validation.missingCritical.length > 0) {
          throw new Error(
            `Missing files after extraction: ${validation.missingCritical.join(', ')}`
          );
        }

        // 다음 실행에서 stale cache를 방지하기 위한 메타데이터 기록
        if (sepxStats) {
          const extractionMeta = {
            extensionId: manifest.id,
            version: manifest.version,
            sourceSepxPath: sepxPath,
            sourceMtimeMs: sepxStats.mtimeMs,
            sourceSize: sepxStats.size,
            extractedAt: new Date().toISOString(),
          };

          try {
            fs.writeFileSync(extractionMetaPath, JSON.stringify(extractionMeta, null, 2), 'utf-8');
          } catch (metaWriteError) {
            // 메타데이터는 캐시 최적화용이므로 기록 실패 시 extension 로드는 계속 진행
            logger.warn('[ExtensionLoader] Failed to write extraction metadata, continuing', {
              error:
                metaWriteError instanceof Error ? metaWriteError.message : String(metaWriteError),
              extractionMetaPath,
            });
            fileLogger.warn('LoaderRuntime', 'Failed to write extraction metadata', {
              extractionMetaPath,
              error:
                metaWriteError instanceof Error ? metaWriteError.message : String(metaWriteError),
            });
          }
        }

        // renderer가 optional인(main-only) 확장은 누락되어도 허용
        if (!validation.needsRenderer && !validation.rendererExists) {
          logger.info(
            `[ExtensionLoader] Renderer entry not found for main-only extension ${manifest.id}: ${validation.rendererEntryPath}`
          );
        }
      } catch (validationError) {
        logger.error('[ExtensionLoader] ❌ File validation failed:', validationError);
        fileLogger.error('LoaderRuntime', 'File validation failed', validationError);
        throw validationError;
      }
    } catch (error) {
      logger.error('[ExtensionLoader] ❌ Extraction failed:', error);
      extensionLogger.extractionFailed('Main', manifest.id, error);
      fileLogger.error('LoaderRuntime', 'Extraction failed', error);
      throw error;
    }
  }

  // Main Process 모듈 로드 시도
  const mainPath = path.join(extractDir, mainEntryPath);
  let definition: ExtensionDefinition = { manifest };

  try {
    delete require.cache[require.resolve(mainPath)];
    const loadedModule = require(mainPath);
    definition = loadedModule.default || loadedModule;
    // manifest가 없으면 주입 (불변 객체 대비 새 객체 생성)
    if (!definition.manifest) {
      definition = { ...definition, manifest };
    }
    logger.info(
      `[ExtensionLoader] Loaded external extension (full): ${manifest.id}@${manifest.version} from ${extractDir}`
    );
  } catch (loadError) {
    // Main Process 코드 로드 실패 시에도 manifest만으로 등록 (Renderer에서 사용)
    logger.warn(
      `[ExtensionLoader] Main module load failed for ${manifest.id}, registering manifest only:`,
      { error: loadError instanceof Error ? loadError.message : String(loadError) }
    );
    definition = { manifest };
  }

  return {
    manifest,
    definition,
    source: 'package',
    path: extractDir,
  };
}

/**
 * 모든 Extension 로드 (세 가지 실행 환경 지원)
 *
 * **환경별 로딩 전략:**
 *
 * 1. **개발 모드** (pnpm dev, !app.isPackaged):
 *    - resources/extensions/{id}/ 디렉토리에서 직접 로드
 *    - Hot reload 지원, 소스맵 사용 가능
 *
 * 2. **Unpacked 빌드** (빌드 후 압축 해제, app.isPackaged):
 *    - app.asar/resources/extensions/ 또는
 *    - exe 옆 extensions/*.sepx → userData/extensions/{id}/로 추출
 *
 * 3. **Portable 빌드** (단일 exe, app.isPackaged):
 *    - exe 옆 extensions/*.sepx → userData/extensions/{id}/로 추출
 *    - .sepx 파일이 없으면 빌드 시 포함된 extensions 사용
 *
 * **우선순위:**
 * - 개발 모드 Extensions > 외부 .sepx > 사용자 설치 .sepx
 * - 같은 ID가 여러 소스에 있으면 우선순위 높은 것 사용
 */
export async function loadAllExtensions(
  resourcesPath: string,
  userDataPath: string
): Promise<LoadedExtension[]> {
  const extensionMap = new Map<string, LoadedExtension>();
  const loadStats = {
    development: 0,
    external: 0,
    user: 0,
    failed: [] as string[],
  };

  // 개발 환경 여부 확인
  const isDev = !app.isPackaged;

  // ✅ 환경 정보 상세 로깅 (Portable 빌드 디버깅)
  const exeDir = path.dirname(app.getPath('exe'));
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  const appPath = app.getAppPath();
  const environmentInfo = {
    isDev,
    isPackaged: app.isPackaged,
    exeDir,
    portableDir: portableDir || '(not set)',
    appPath,
    resourcesPath: process.resourcesPath || '(not set)',
    userDataPath,
  };

  logger.info('[ExtensionLoader] ========== ENVIRONMENT INFO ==========');
  logger.info('[ExtensionLoader] Runtime mode:', isDev ? 'DEVELOPMENT' : 'PRODUCTION');
  logger.info('[ExtensionLoader] app.isPackaged:', app.isPackaged);
  logger.info('[ExtensionLoader] exe directory:', exeDir);
  logger.info('[ExtensionLoader] PORTABLE_EXECUTABLE_DIR:', portableDir || '(not set)');
  logger.info('[ExtensionLoader] app.getAppPath():', appPath);
  logger.info('[ExtensionLoader] process.resourcesPath:', process.resourcesPath || '(not set)');
  logger.info('[ExtensionLoader] userDataPath:', userDataPath);
  logger.info('[ExtensionLoader] ============================================');

  fileLogger.info('LoaderRuntime', 'Environment info', environmentInfo);

  if (isDev) {
    // 1. 개발 모드 Extensions (resources/extensions/)
    // 디렉토리 형태로 직접 로드 (Hot Reload 가능)
    try {
      const devExtensions = await loadDevelopmentExtensions(resourcesPath);
      for (const ext of devExtensions) {
        extensionMap.set(ext.manifest.id, ext);
        loadStats.development++;
        logger.info(
          `[ExtensionLoader] ✅ Loaded (development): ${ext.manifest.id}@${ext.manifest.version}`
        );
      }
    } catch (error) {
      logger.error('[ExtensionLoader] ❌ Failed to load development extensions:', error);
      loadStats.failed.push('development');
    }
  }

  // 2. EXE 옆 extensions/ 폴더에서 .sepx 로드 (Portable/Unpacked 빌드)
  // 빌드에는 포함되지 않지만, 사용자가 EXE 옆에 배치한 .sepx를 로드
  if (!isDev) {
    try {
      const exeDir = path.dirname(app.getPath('exe'));
      // Portable 빌드: 원본 EXE 위치 (Temp 추출 경로가 아닌 실제 사용자 경로)
      const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
      const externalPaths = [
        path.join(exeDir, 'extensions'),
        ...(portableDir ? [path.join(portableDir, 'extensions')] : []),
        ...(process.resourcesPath ? [path.join(process.resourcesPath, 'extensions')] : []),
      ];
      const uniqueExternalPaths = Array.from(new Set(externalPaths.map((p) => path.resolve(p))));

      logger.info('[ExtensionLoader] ========== EXTERNAL EXTENSION PATHS ==========');
      logger.info('[ExtensionLoader] Candidate paths:', externalPaths.length);
      logger.info('[ExtensionLoader] Unique paths:', uniqueExternalPaths.length);
      uniqueExternalPaths.forEach((p, idx) => {
        const exists = fs.existsSync(p);
        logger.info(`[ExtensionLoader]   [${idx + 1}] ${p} (${exists ? 'EXISTS' : 'NOT FOUND'})`);
        if (exists) {
          try {
            const files = fs.readdirSync(p);
            const sepxFiles = files.filter((f) => f.endsWith('.sepx'));
            logger.info(
              `[ExtensionLoader]       -> ${sepxFiles.length} .sepx file(s): ${sepxFiles.join(', ')}`
            );
            fileLogger.info('LoaderRuntime', `Path ${idx + 1}: ${p}`, { exists: true, sepxFiles });
          } catch (readError) {
            logger.error(`[ExtensionLoader]       -> Failed to read directory:`, readError);
            fileLogger.error('LoaderRuntime', `Failed to read ${p}`, readError);
          }
        } else {
          fileLogger.info('LoaderRuntime', `Path ${idx + 1}: ${p}`, { exists: false });
        }
      });
      logger.info('[ExtensionLoader] ====================================================');

      fileLogger.info('LoaderRuntime', 'External extension paths', {
        exeDir,
        portableDir,
        resourcesPath: process.resourcesPath,
        uniquePaths: uniqueExternalPaths,
      });

      // Log search paths
      extensionLogger.searchPaths('Main', uniqueExternalPaths);

      for (const externalPath of uniqueExternalPaths) {
        try {
          logger.info(`[ExtensionLoader] Scanning external extensions: ${externalPath}`);
          fileLogger.info('LoaderRuntime', `Scanning external path: ${externalPath}`);
          const externalExtensions = await loadPackageExtensions(externalPath);
          for (const ext of externalExtensions) {
            if (extensionMap.has(ext.manifest.id)) {
              logger.info(
                `[ExtensionLoader] Skipping (external): ${ext.manifest.id} (already loaded)`
              );
              continue;
            }
            extensionMap.set(ext.manifest.id, ext);
            loadStats.external++;
            logger.info(
              `[ExtensionLoader] ✅ Loaded (external): ${ext.manifest.id}@${ext.manifest.version}`
            );
          }
        } catch (error) {
          logger.error(`[ExtensionLoader] ❌ Failed to load from ${externalPath}:`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          loadStats.failed.push(externalPath);
        }
      }
    } catch (error) {
      logger.error('[ExtensionLoader] ❌ Failed to scan external extensions:', error);
    }
  }

  // 3. userData/extensions/ 에서 .sepx 로드 (사용자 설치, 우선순위 최상)
  const userPath = path.join(userDataPath, 'extensions');
  try {
    const userExtensions = await loadPackageExtensions(userPath);
    for (const ext of userExtensions) {
      const existing = extensionMap.get(ext.manifest.id);

      if (existing) {
        const versionCompare = compareSemver(ext.manifest.version, existing.manifest.version);

        // 사용자 설치본이 더 오래됐거나 동일 버전이면 기존 Extension 유지
        // (예: userData 캐시가 최신 번들을 가리는 문제 방지)
        if (versionCompare <= 0) {
          logger.warn(
            `[ExtensionLoader] ⏭️ Skipping user override for ${ext.manifest.id}: keeping ${existing.source}@${existing.manifest.version}, ignoring user@${ext.manifest.version}`
          );
          continue;
        }

        logger.warn(
          `[ExtensionLoader] ⚠️  User extension ${ext.manifest.id}@${ext.manifest.version} overrides ${existing.source}@${existing.manifest.version}`
        );
      }

      extensionMap.set(ext.manifest.id, ext);
      loadStats.user++;
      logger.info(`[ExtensionLoader] ✅ Loaded (user): ${ext.manifest.id}@${ext.manifest.version}`);
    }
  } catch (error) {
    logger.error('[ExtensionLoader] ❌ Failed to load user extensions:', error);
    loadStats.failed.push('user');
  }

  const allExtensions = Array.from(extensionMap.values());

  // ✅ 통계 로깅
  logger.info(`[ExtensionLoader] ==========================================`);
  logger.info(`[ExtensionLoader] 📊 Extension Loading Summary:`);
  logger.info(`[ExtensionLoader]    Total loaded: ${allExtensions.length}`);
  logger.info(`[ExtensionLoader]    Development: ${loadStats.development}`);
  logger.info(`[ExtensionLoader]    External: ${loadStats.external}`);
  logger.info(`[ExtensionLoader]    User: ${loadStats.user}`);
  if (loadStats.failed.length > 0) {
    logger.warn(`[ExtensionLoader]    ⚠️ Failed sources: ${loadStats.failed.join(', ')}`);
  }
  logger.info(`[ExtensionLoader] 📂 User extensions path: ${userPath}`);
  logger.info(`[ExtensionLoader] ==========================================`);

  return allExtensions;
}
