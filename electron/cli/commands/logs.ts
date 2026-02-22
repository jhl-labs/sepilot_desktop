/**
 * 로그 관리 명령어
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { isJsonMode, printInfo, printKeyValue, printJson } from '../utils/output';
import { CLIError, ExitCode } from '../utils/cli-error';

/**
 * 로그 디렉토리 경로 반환
 */
function getLogsPath(): string {
  return app.getPath('logs');
}

/**
 * 로그 파일 목록 조회
 */
function getLogFiles(): string[] {
  const logsPath = getLogsPath();

  if (!fs.existsSync(logsPath)) {
    return [];
  }

  try {
    const files = fs.readdirSync(logsPath);
    return files
      .filter((f) => f.endsWith('.log'))
      .map((f) => path.join(logsPath, f))
      .sort((a, b) => {
        // 최근 파일 우선
        const statA = fs.statSync(a);
        const statB = fs.statSync(b);
        return statB.mtime.getTime() - statA.mtime.getTime();
      });
  } catch (error) {
    return [];
  }
}

/**
 * 로그 출력
 */
export async function runShowLogs(lines: number = 100): Promise<void> {
  try {
    const logFiles = getLogFiles();

    if (logFiles.length === 0) {
      throw new CLIError('No log files found', ExitCode.NOT_FOUND);
    }

    // 가장 최근 로그 파일 읽기
    const latestLogFile = logFiles[0];
    const content = fs.readFileSync(latestLogFile, 'utf-8');
    const logLines = content.split('\n').filter((line) => line.trim().length > 0);

    // 마지막 N개 라인만 출력
    const outputLines = logLines.slice(-lines);

    if (isJsonMode()) {
      printJson({
        file: latestLogFile,
        lines: outputLines,
        totalLines: logLines.length,
      });
    } else {
      printInfo(`Log file: ${latestLogFile}`);
      printInfo(`Showing last ${outputLines.length} lines (total: ${logLines.length}):`);
      console.log();
      outputLines.forEach((line) => console.log(line));
    }
  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(
      `Failed to show logs: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR
    );
  }
}

/**
 * 로그 디렉토리 경로 출력
 */
export async function runLogsPath(): Promise<void> {
  try {
    const logsPath = getLogsPath();
    const logFiles = getLogFiles();

    if (isJsonMode()) {
      printJson({
        logsPath,
        logFiles,
      });
    } else {
      printInfo(`Logs directory:`);
      printKeyValue('Path', logsPath);
      printKeyValue('Log files', logFiles.length.toString());

      if (logFiles.length > 0) {
        console.log();
        printInfo('Available log files:');
        logFiles.forEach((file) => {
          const fileName = path.basename(file);
          const stat = fs.statSync(file);
          const size = (stat.size / 1024).toFixed(2);
          console.log(`  - ${fileName} (${size} KB)`);
        });
      }
    }
  } catch (error) {
    throw new CLIError(
      `Failed to get logs path: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR
    );
  }
}
