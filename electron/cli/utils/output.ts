/**
 * CLI 출력 포맷팅 유틸리티
 */

import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * JSON 출력 모드 여부
 */
let jsonMode = false;

/**
 * 색상 비활성화 여부
 */
let noColor = false;

/**
 * JSON 모드 조회
 */
export function isJsonMode(): boolean {
  return jsonMode;
}

/**
 * JSON 모드 설정
 */
export function setJsonMode(enabled: boolean) {
  jsonMode = enabled;
}

/**
 * 색상 모드 설정
 */
export function setColorMode(enabled: boolean) {
  noColor = !enabled;
  if (noColor) {
    chalk.level = 0; // 색상 비활성화
  }
}

/**
 * JSON 형식으로 출력
 */
export function printJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * 성공 메시지 출력
 */
export function printSuccess(message: string) {
  if (jsonMode) return;
  console.log(noColor ? `✓ ${message}` : chalk.green(`✓ ${message}`));
}

/**
 * 에러 메시지 출력
 */
export function printError(message: string) {
  if (jsonMode) return;
  console.error(noColor ? `✗ ${message}` : chalk.red(`✗ ${message}`));
}

/**
 * 경고 메시지 출력
 */
export function printWarning(message: string) {
  if (jsonMode) return;
  console.warn(noColor ? `⚠ ${message}` : chalk.yellow(`⚠ ${message}`));
}

/**
 * 정보 메시지 출력
 */
export function printInfo(message: string) {
  if (jsonMode) return;
  console.log(noColor ? `ℹ ${message}` : chalk.blue(`ℹ ${message}`));
}

/**
 * 헤더 출력
 */
export function printHeader(title: string) {
  if (jsonMode) return;
  console.log();
  console.log(noColor ? title : chalk.bold.cyan(title));
  console.log(noColor ? '━'.repeat(title.length) : chalk.cyan('━'.repeat(title.length)));
  console.log();
}

/**
 * 섹션 제목 출력
 */
export function printSection(title: string) {
  if (jsonMode) return;
  console.log();
  console.log(noColor ? title : chalk.bold(title));
}

/**
 * 키-값 쌍 출력
 */
export function printKeyValue(key: string, value: string) {
  if (jsonMode) return;
  console.log(`  ${noColor ? key : chalk.gray(key)}: ${value}`);
}

/**
 * 테이블 생성 및 출력
 */
export function createTable(headers: string[]): Table.Table {
  return new Table({
    head: headers.map((h) => (noColor ? h : chalk.cyan.bold(h))),
    style: {
      head: [],
      border: noColor ? [] : ['gray'],
    },
  });
}

/**
 * Extension 목록 테이블 출력
 */
export function printExtensionTable(
  extensions: Array<{ id: string; version: string; source: string; enabled: boolean }>
) {
  if (jsonMode) {
    printJson(extensions);
    return;
  }

  if (extensions.length === 0) {
    printWarning('No extensions found');
    return;
  }

  const table = createTable(['ID', 'Version', 'Source', 'Enabled']);

  extensions.forEach((ext) => {
    table.push([
      ext.id,
      ext.version,
      ext.source,
      ext.enabled ? (noColor ? '✓' : chalk.green('✓')) : noColor ? '✗' : chalk.red('✗'),
    ]);
  });

  console.log(table.toString());
  console.log();
  console.log(`Total: ${extensions.length} extension${extensions.length !== 1 ? 's' : ''}`);
}

/**
 * Extension 진단 정보 출력
 */
export function printDiagnostics(diagnostics: {
  environment: {
    platform: string;
    isPackaged: boolean;
    userDataPath: string;
    extensionsPath: string;
  };
  loadedExtensions: Array<{
    id: string;
    version: string;
    enabled: boolean;
    source: string;
  }>;
  registryStats: {
    total: number;
    enabled: number;
    disabled: number;
  };
  errors?: string[];
}) {
  if (jsonMode) {
    printJson(diagnostics);
    return;
  }

  printHeader('SEPilot Extension Diagnostics');

  // Environment
  printSection('Environment:');
  printKeyValue('Platform', diagnostics.environment.platform);
  printKeyValue('Packaged', diagnostics.environment.isPackaged ? 'true' : 'false');
  printKeyValue('User Data', diagnostics.environment.userDataPath);
  printKeyValue('Extensions Path', diagnostics.environment.extensionsPath);

  // Loaded Extensions
  printSection('Loaded Extensions:');
  if (diagnostics.loadedExtensions.length === 0) {
    console.log('  No extensions loaded');
  } else {
    diagnostics.loadedExtensions.forEach((ext: any) => {
      const status = ext.enabled
        ? noColor
          ? '✓'
          : chalk.green('✓')
        : noColor
          ? '✗'
          : chalk.red('✗');
      console.log(`  ${status} ${ext.id}@${ext.version} (${ext.source})`);

      // 상세 정보 출력
      if (ext.ipcHandlers) {
        console.log(`      IPC Handlers: ${ext.ipcHandlers.length || 0}`);
      }
      if (ext.storeSlice !== undefined) {
        console.log(
          `      Store Slice: ${ext.storeSlice ? (noColor ? '✓' : chalk.green('✓')) : noColor ? '✗' : chalk.red('✗')}`
        );
      }
      if (ext.agents && ext.agents.length > 0) {
        console.log(`      Agents: ${ext.agents.map((a: any) => a.id).join(', ')}`);
      }
      if (ext.dependencies && ext.dependencies.length > 0) {
        const loadedDeps = ext.dependencies.filter((d: any) => d.loaded).length;
        console.log(`      Dependencies: ${loadedDeps}/${ext.dependencies.length} loaded`);
      }
      if (ext.processType) {
        console.log(`      Process: ${ext.processType}`);
      }
    });
  }

  // Registry Stats
  printSection('Registry Stats:');
  printKeyValue('Total', diagnostics.registryStats.total.toString());
  printKeyValue('Enabled', diagnostics.registryStats.enabled.toString());
  printKeyValue('Disabled', diagnostics.registryStats.disabled.toString());

  // Errors
  if (diagnostics.errors && diagnostics.errors.length > 0) {
    printSection('Errors:');
    diagnostics.errors.forEach((error) => {
      printError(error);
    });
  }

  console.log();
}
