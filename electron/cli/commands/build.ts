/**
 * 빌드 체크 명령어
 */

import { spawn } from 'child_process';
import path from 'path';
import {
  isJsonMode,
  printSuccess,
  printError,
  printInfo,
  printJson,
  printWarning,
} from '../utils/output';
import { CLIError, ExitCode } from '../utils/cli-error';

interface BuildError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

interface BuildCheckResult {
  success: boolean;
  backend: {
    success: boolean;
    errors: BuildError[];
    warnings: BuildError[];
  };
  frontend: {
    success: boolean;
    errors: BuildError[];
    warnings: BuildError[];
  };
  summary: {
    totalErrors: number;
    totalWarnings: number;
    canBuild: boolean;
  };
}

/**
 * TypeScript 에러 파싱
 */
function parseTypeScriptError(line: string): BuildError | null {
  // 형식: path/file.ts(line,col): error TSxxxx: message
  const match = line.match(/^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/);

  if (!match) {
    return null;
  }

  return {
    file: match[1],
    line: parseInt(match[2], 10),
    column: parseInt(match[3], 10),
    code: match[5],
    message: match[6],
    severity: match[4] as 'error' | 'warning',
  };
}

/**
 * TypeScript 빌드 체크 실행
 */
async function runTypeScriptCheck(
  configFile: string
): Promise<{ success: boolean; errors: BuildError[]; warnings: BuildError[] }> {
  return new Promise((resolve) => {
    const errors: BuildError[] = [];
    const warnings: BuildError[] = [];

    const tsc = spawn('npx', ['tsc', '--noEmit', '-p', configFile], {
      cwd: process.cwd(),
      shell: true,
    });

    let output = '';

    tsc.stdout.on('data', (data) => {
      output += data.toString();
    });

    tsc.stderr.on('data', (data) => {
      output += data.toString();
    });

    tsc.on('close', (code) => {
      // 출력 파싱
      const lines = output.split('\n');
      for (const line of lines) {
        const error = parseTypeScriptError(line);
        if (error) {
          if (error.severity === 'error') {
            errors.push(error);
          } else {
            warnings.push(error);
          }
        }
      }

      resolve({
        success: code === 0,
        errors,
        warnings,
      });
    });
  });
}

/**
 * 빌드 체크 실행
 */
export async function runBuildCheck(): Promise<void> {
  try {
    printInfo('Checking TypeScript compilation...\n');

    // 백엔드 체크
    printInfo('Checking backend (tsconfig.backend.json)...');
    const backendResult = await runTypeScriptCheck('tsconfig.backend.json');

    if (backendResult.success) {
      printSuccess(
        `✓ Backend: ${backendResult.errors.length} errors, ${backendResult.warnings.length} warnings`
      );
    } else {
      printError(
        `✗ Backend: ${backendResult.errors.length} errors, ${backendResult.warnings.length} warnings`
      );
    }

    // 프론트엔드 체크 (선택적)
    printInfo('\nChecking frontend (tsconfig.json)...');
    const frontendResult = await runTypeScriptCheck('tsconfig.json');

    if (frontendResult.success) {
      printSuccess(
        `✓ Frontend: ${frontendResult.errors.length} errors, ${frontendResult.warnings.length} warnings`
      );
    } else {
      printError(
        `✗ Frontend: ${frontendResult.errors.length} errors, ${frontendResult.warnings.length} warnings`
      );
    }

    // 결과 집계
    const result: BuildCheckResult = {
      success: backendResult.success && frontendResult.success,
      backend: backendResult,
      frontend: frontendResult,
      summary: {
        totalErrors: backendResult.errors.length + frontendResult.errors.length,
        totalWarnings: backendResult.warnings.length + frontendResult.warnings.length,
        canBuild: backendResult.errors.length === 0 && frontendResult.errors.length === 0,
      },
    };

    // JSON 모드
    if (isJsonMode()) {
      printJson(result);
      if (!result.success) {
        process.exit(ExitCode.ERROR);
      }
      return;
    }

    // 에러 상세 출력
    if (backendResult.errors.length > 0) {
      printError('\nBackend Errors:');
      backendResult.errors.slice(0, 10).forEach((err) => {
        console.log(`  ${err.file}:${err.line}:${err.column}`);
        console.log(`    ${err.code}: ${err.message}`);
      });
      if (backendResult.errors.length > 10) {
        console.log(`  ... and ${backendResult.errors.length - 10} more errors`);
      }
    }

    if (frontendResult.errors.length > 0) {
      printError('\nFrontend Errors:');
      frontendResult.errors.slice(0, 10).forEach((err) => {
        console.log(`  ${err.file}:${err.line}:${err.column}`);
        console.log(`    ${err.code}: ${err.message}`);
      });
      if (frontendResult.errors.length > 10) {
        console.log(`  ... and ${frontendResult.errors.length - 10} more errors`);
      }
    }

    // 경고 출력
    if (backendResult.warnings.length > 0 || frontendResult.warnings.length > 0) {
      printWarning(
        `\nTotal warnings: ${backendResult.warnings.length + frontendResult.warnings.length}`
      );
    }

    // 최종 결과
    console.log('\n' + '─'.repeat(60));
    if (result.summary.canBuild) {
      printSuccess(`✓ Build check passed! No errors found.`);
    } else {
      printError(`✗ Build check failed! ${result.summary.totalErrors} error(s) found.`);
      process.exit(ExitCode.ERROR);
    }
  } catch (error) {
    throw new CLIError(
      `Failed to check build: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR
    );
  }
}
