/**
 * Extension 관리 명령어
 */

import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import {
  isJsonMode,
  printExtensionTable,
  printSuccess,
  printError,
  printInfo,
  printJson,
} from '../utils/output';
import { CLIError, ExitCode } from '../utils/cli-error';
import { extensionRegistry } from '@/lib/extensions/registry';
import type { ExtensionDiagnosticResult } from '@/lib/extension-sdk/src/types/extension';

/**
 * Extension ID 검증
 */
function validateExtensionId(id: string): boolean {
  return /^[a-z0-9-]+$/.test(id);
}

/**
 * Extension 디렉토리 경로 반환
 */
function getExtensionDirectory(): string {
  if (!app.isPackaged) {
    return path.join(process.cwd(), 'resources', 'extensions');
  }
  return path.join(app.getPath('userData'), 'extensions');
}

/**
 * 로컬 Extension 스캔
 */
function scanLocalExtensions(): Array<{
  id: string;
  version: string;
  source: string;
  enabled: boolean;
}> {
  const extensions: Array<{ id: string; version: string; source: string; enabled: boolean }> = [];

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
            id: manifest.id,
            version: manifest.version,
            source: 'local',
            enabled: manifest.enabled !== false,
          });
        } catch (error) {
          // 무시하고 계속
        }
      }
    }
  } catch (error) {
    throw new CLIError(
      `Failed to scan extensions: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR
    );
  }

  return extensions;
}

/**
 * Extension 목록 출력
 */
export async function runList(): Promise<void> {
  try {
    const extensions = scanLocalExtensions();

    if (isJsonMode()) {
      printJson(extensions);
    } else {
      printExtensionTable(extensions);
    }
  } catch (error) {
    throw new CLIError(
      `Failed to list extensions: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR
    );
  }
}

/**
 * Extension 설치
 */
export async function runInstall(sepxPath: string): Promise<void> {
  try {
    // 파일 경로 해석
    const resolvedPath = path.resolve(sepxPath);

    // 파일 존재 확인
    if (!fs.existsSync(resolvedPath)) {
      throw new CLIError(`File not found: ${resolvedPath}`, ExitCode.NOT_FOUND);
    }

    // .sepx 확장자 확인
    if (!resolvedPath.endsWith('.sepx')) {
      throw new CLIError(
        'Invalid file extension: only .sepx files are allowed',
        ExitCode.INVALID_ARGUMENT
      );
    }

    printInfo(`Installing extension from ${resolvedPath}...`);

    // installExtensionFromFile을 직접 import하여 사용
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip(resolvedPath);

    // manifest.json 읽기
    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) {
      throw new CLIError('manifest.json not found in .sepx file', ExitCode.ERROR);
    }

    const manifestContent = manifestEntry.getData().toString('utf-8');
    const manifest = JSON.parse(manifestContent);

    // Extension ID 검증
    if (!validateExtensionId(manifest.id)) {
      throw new CLIError(
        `Invalid extension ID: ${manifest.id}. Only lowercase letters, numbers, and hyphens are allowed.`,
        ExitCode.INVALID_ARGUMENT
      );
    }

    // 설치 경로
    const extensionsPath = getExtensionDirectory();
    if (!fs.existsSync(extensionsPath)) {
      fs.mkdirSync(extensionsPath, { recursive: true });
    }

    const installPath = path.join(extensionsPath, manifest.id);

    // 이미 설치된 경우 덮어쓰기
    if (fs.existsSync(installPath)) {
      printInfo(`Extension already exists, overwriting...`);
      fs.rmSync(installPath, { recursive: true, force: true });
    }

    // 압축 해제
    zip.extractAllTo(installPath, true);

    printSuccess(`Extension installed successfully: ${manifest.id}@${manifest.version}`);
    printInfo(`Location: ${installPath}`);
  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(
      `Failed to install extension: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR
    );
  }
}

/**
 * Extension 제거
 */
export async function runUninstall(extId: string): Promise<void> {
  try {
    // Extension ID 검증
    if (!validateExtensionId(extId)) {
      throw new CLIError(
        `Invalid extension ID: ${extId}. Only lowercase letters, numbers, and hyphens are allowed.`,
        ExitCode.INVALID_ARGUMENT
      );
    }

    const extensionsPath = getExtensionDirectory();
    if (!fs.existsSync(extensionsPath)) {
      throw new CLIError('No extensions directory found', ExitCode.NOT_FOUND);
    }

    // Extension 찾기 ({id} 디렉토리 기준)
    const extPath = path.join(extensionsPath, extId);

    if (!fs.existsSync(extPath)) {
      throw new CLIError(`Extension not found: ${extId}`, ExitCode.NOT_FOUND);
    }

    printInfo(`Uninstalling ${extId}...`);
    fs.rmSync(extPath, { recursive: true, force: true });

    printSuccess(`Extension uninstalled successfully: ${extId}`);
  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(
      `Failed to uninstall extension: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR
    );
  }
}

/**
 * Extension 개별 진단
 * @param extId - Extension ID (예: 'editor', 'browser')
 * @param options - 진단 옵션
 */
export async function runDiagnose(
  extId?: string,
  options?: { all?: boolean; renderer?: boolean }
): Promise<void> {
  const all = options?.all ?? false;
  const renderer = options?.renderer ?? false;

  // Renderer 진단 요청 시 안내 메시지
  if (renderer) {
    printInfo('Renderer 진단은 GUI가 실행 중일 때만 사용 가능합니다.');
    console.log('\n📋 사용 방법:\n');
    console.log('1. SEPilot Desktop GUI를 실행하세요.');
    console.log('2. Dev Tools 콘솔을 엽니다 (Ctrl+Shift+I 또는 Cmd+Option+I).');
    console.log('3. 다음 명령어를 실행하세요:\n');

    if (extId) {
      console.log(`   await window.electronAPI.extension.diagnoseRenderer('${extId}')\n`);
    } else {
      console.log("   await window.electronAPI.extension.diagnoseRenderer('editor')");
      console.log("   await window.electronAPI.extension.diagnoseRenderer('browser')\n");
    }

    console.log('💡 Renderer 진단은 실제 컴포넌트 렌더링, Monaco Editor 로드,');
    console.log('   Electron API 접근 등 브라우저 환경에서만 가능한 체크를 수행합니다.\n');
    return;
  }
  try {
    // 모든 Extension 진단
    if (all || !extId) {
      const allExtensions = extensionRegistry.getAll();

      if (allExtensions.length === 0) {
        printInfo('No extensions loaded.');
        return;
      }

      const results: Array<{
        id: string;
        result: ExtensionDiagnosticResult | null;
        error?: string;
      }> = [];

      for (const ext of allExtensions) {
        const extId = ext.manifest.id;

        try {
          if (ext.diagnostics) {
            const result = await Promise.resolve(ext.diagnostics());
            results.push({ id: extId, result });
          } else {
            results.push({
              id: extId,
              result: {
                status: 'healthy',
                message: 'No diagnostics function provided',
              },
            });
          }
        } catch (error) {
          results.push({
            id: extId,
            result: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // JSON 모드
      if (isJsonMode()) {
        printJson(results);
        return;
      }

      // 테이블 출력
      console.log('\n📊 Extension Diagnostics\n');
      console.log('━'.repeat(80));

      for (const { id, result, error } of results) {
        const statusIcon =
          result?.status === 'healthy'
            ? '✓'
            : result?.status === 'warning'
              ? '⚠'
              : result?.status === 'error'
                ? '✗'
                : '○';

        console.log(`\n${statusIcon} ${id}`);
        if (result) {
          console.log(`  Status: ${result.status}`);
          console.log(`  Message: ${result.message}`);

          if (result.checks && result.checks.length > 0) {
            console.log('  Checks:');
            for (const check of result.checks) {
              const checkIcon = check.passed ? '  ✓' : '  ✗';
              console.log(
                `${checkIcon} ${check.name}: ${check.message || (check.passed ? 'OK' : 'Failed')}`
              );
            }
          }

          if (result.details && Object.keys(result.details).length > 0) {
            console.log('  Details:', JSON.stringify(result.details, null, 2));
          }
        } else if (error) {
          console.log(`  Error: ${error}`);
        }
      }

      console.log('\n' + '━'.repeat(80));
      return;
    }

    // 단일 Extension 진단
    const extension = extensionRegistry.get(extId);

    if (!extension) {
      throw new CLIError(`Extension not found: ${extId}`, ExitCode.NOT_FOUND);
    }

    if (!extension.diagnostics) {
      printInfo(`Extension '${extId}' does not provide a diagnostics function.`);
      return;
    }

    printInfo(`Running diagnostics for extension: ${extId}...`);

    const result = await Promise.resolve(extension.diagnostics());

    // JSON 모드
    if (isJsonMode()) {
      printJson({ id: extId, result });
      return;
    }

    // 상세 출력
    console.log('\n📊 Extension Diagnostics\n');
    console.log('━'.repeat(80));
    console.log(`Extension: ${extId}`);
    console.log(`Status: ${result.status}`);
    console.log(`Message: ${result.message}`);

    if (result.checks && result.checks.length > 0) {
      console.log('\nChecks:');
      for (const check of result.checks) {
        const icon = check.passed ? '✓' : '✗';
        console.log(
          `  ${icon} ${check.name}: ${check.message || (check.passed ? 'OK' : 'Failed')}`
        );
        if (check.data) {
          console.log(`    Data: ${JSON.stringify(check.data, null, 2)}`);
        }
      }
    }

    if (result.details && Object.keys(result.details).length > 0) {
      console.log('\nDetails:');
      console.log(JSON.stringify(result.details, null, 2));
    }

    console.log('━'.repeat(80));

    // 에러 상태면 exit code 반환
    if (result.status === 'error') {
      throw new CLIError(`Extension ${extId} diagnostics failed`, ExitCode.ERROR);
    }
  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(
      `Failed to run diagnostics: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR
    );
  }
}
