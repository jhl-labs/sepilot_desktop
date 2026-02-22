/**
 * 설정 관리 명령어
 */

import { app } from 'electron';
import path from 'path';
import { databaseService } from '../../services/database';
import { isJsonMode, printInfo, printKeyValue, printJson } from '../utils/output';
import { CLIError, ExitCode } from '../utils/cli-error';

/**
 * 설정 값 조회
 */
export async function runGetConfig(key: string): Promise<void> {
  try {
    // Database 초기화 (CLI 모드에서도 필요)
    if (!databaseService['db']) {
      await databaseService.initialize();
    }

    const value = await databaseService.getSetting(key);

    if (value === null || value === undefined) {
      throw new CLIError(`Setting not found: ${key}`, ExitCode.NOT_FOUND);
    }

    if (isJsonMode()) {
      printJson({ key, value });
    } else {
      printKeyValue(
        key,
        typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
      );
    }
  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(
      `Failed to get config: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR
    );
  }
}

/**
 * 설정 파일 경로 출력
 */
export async function runConfigPath(): Promise<void> {
  try {
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, 'config.db');

    if (isJsonMode()) {
      printJson({ configPath, userDataPath });
    } else {
      printInfo(`Config file location:`);
      printKeyValue('Config DB', configPath);
      printKeyValue('User Data', userDataPath);
    }
  } catch (error) {
    throw new CLIError(
      `Failed to get config path: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR
    );
  }
}
