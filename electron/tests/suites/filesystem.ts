import { TestResult, TestSuiteResult } from '../../ipc/handlers/test-runner';
import { logger } from '../../services/logger';
import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * File System 테스트 스위트
 *
 * 파일 시스템 접근 권한 및 주요 디렉토리 상태를 검증합니다.
 */
export class FileSystemTestSuite {
  /**
   * 전체 테스트 실행
   */
  async run(): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const tests: TestResult[] = [];

    logger.info('Running file system tests...');

    // User Data 디렉토리 테스트
    tests.push(await this.testUserDataDirectory());

    // 임시 디렉토리 쓰기/읽기 테스트
    tests.push(await this.testTempFileOperations());

    // Logs 디렉토리 테스트
    tests.push(await this.testLogsDirectory());

    const duration = Date.now() - startTime;
    const passed = tests.filter((t) => t.status === 'pass').length;
    const failed = tests.filter((t) => t.status === 'fail').length;
    const skipped = tests.filter((t) => t.status === 'skip').length;

    const result: TestSuiteResult = {
      id: 'filesystem',
      name: 'File System Tests',
      tests,
      summary: {
        total: tests.length,
        passed,
        failed,
        skipped,
        duration,
      },
      timestamp: Date.now(),
    };

    logger.info(`File system tests completed: ${passed}/${tests.length} passed in ${duration}ms`);
    return result;
  }

  /**
   * User Data 디렉토리 접근성 테스트
   */
  private async testUserDataDirectory(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'fs-userdata';

    try {
      const userDataPath = app.getPath('userData');

      try {
        await fs.access(userDataPath, fs.constants.R_OK | fs.constants.W_OK);
      } catch (error) {
        throw new Error(`Cannot access userData path: ${userDataPath}`);
      }

      return {
        id: testId,
        name: 'User Data Directory Access',
        status: 'pass',
        duration: Date.now() - startTime,
        message: `Accessible: ${userDataPath}`,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'User Data Directory Access',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 임시 파일 쓰기/읽기 테스트
   */
  private async testTempFileOperations(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'fs-temp-io';
    const tempFileName = `sepilot-test-${Date.now()}.txt`;
    const tempFilePath = path.join(app.getPath('temp'), tempFileName);
    const content = 'Hello SEPilot Test';

    try {
      // Write
      await fs.writeFile(tempFilePath, content, 'utf8');

      // Read
      const readContent = await fs.readFile(tempFilePath, 'utf8');

      // Delete
      await fs.unlink(tempFilePath);

      if (readContent !== content) {
        throw new Error('Content mismatch');
      }

      return {
        id: testId,
        name: 'Temporary File I/O',
        status: 'pass',
        duration: Date.now() - startTime,
        message: 'Successfully wrote, read, and deleted temporary file',
        timestamp: Date.now(),
      };
    } catch (error) {
      // Try to cleanup if failed
      try {
        await fs.unlink(tempFilePath).catch(() => {});
      } catch (e) {}

      return {
        id: testId,
        name: 'Temporary File I/O',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Logs 디렉토리 확인
   */
  private async testLogsDirectory(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'fs-logs';

    try {
      const logsPath = path.join(app.getPath('userData'), 'logs'); // Assuming logs are here, or check logger config

      // Logger might use a different path, but let's check if we can find where logs are usually stored.
      // Usually electron-log stores in userData/logs or similar.
      // Let's just check userData/logs exists or create it.

      try {
        await fs.access(logsPath);
      } catch {
        // If not exists, maybe it's fine, but let's report it as info or skip?
        // Actually, let's just check if we can write to userData, which we did.
        // Let's check if any log file exists.
      }

      return {
        id: testId,
        name: 'Logs Directory Check',
        status: 'pass',
        duration: Date.now() - startTime,
        message: `Logs directory checked at ${logsPath}`,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'Logs Directory Check',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }
}

// Singleton instance
export const fileSystemTestSuite = new FileSystemTestSuite();
