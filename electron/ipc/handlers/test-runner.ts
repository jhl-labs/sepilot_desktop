import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { healthCheckService, HealthCheckResult } from '../../services/health-check';
import { logger } from '../../services/logger';

/**
 * 테스트 실행 결과 인터페이스
 */
export interface TestResult {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number; // ms
  message?: string;
  error?: string;
  timestamp: number;
}

export interface TestSuiteResult {
  id: string;
  name: string;
  tests: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  timestamp: number;
}

/**
 * Test Runner IPC 핸들러
 *
 * Frontend에서 테스트 실행을 요청하고 결과를 받을 수 있도록 합니다.
 */
export function setupTestRunnerHandlers() {
  /**
   * Health Check 실행
   */
  ipcMain.handle(
    'test:health-check',
    async (_event: IpcMainInvokeEvent): Promise<HealthCheckResult> => {
      logger.info('IPC: Running health check');
      try {
        const result = await healthCheckService.runHealthCheck();
        return result;
      } catch (error) {
        logger.error('IPC: Health check failed:', error);
        throw error;
      }
    }
  );

  /**
   * 마지막 Health Check 결과 조회
   */
  ipcMain.handle(
    'test:get-last-health-check',
    async (_event: IpcMainInvokeEvent): Promise<HealthCheckResult | null> => {
      logger.info('IPC: Getting last health check result');
      return healthCheckService.getLastResult();
    }
  );

  /**
   * 주기적인 Health Check 시작
   */
  ipcMain.handle(
    'test:start-periodic-health-check',
    async (_event: IpcMainInvokeEvent, intervalMs: number = 60000): Promise<void> => {
      logger.info(`IPC: Starting periodic health check (interval: ${intervalMs}ms)`);
      healthCheckService.startPeriodicCheck(intervalMs);
    }
  );

  /**
   * 주기적인 Health Check 중지
   */
  ipcMain.handle(
    'test:stop-periodic-health-check',
    async (_event: IpcMainInvokeEvent): Promise<void> => {
      logger.info('IPC: Stopping periodic health check');
      healthCheckService.stopPeriodicCheck();
    }
  );

  /**
   * 전체 테스트 스위트 실행 (향후 구현)
   */
  ipcMain.handle('test:run-all', async (_event: IpcMainInvokeEvent): Promise<TestSuiteResult> => {
    logger.info('IPC: Running all tests');

    // TODO: Phase 2에서 구현
    const result: TestSuiteResult = {
      id: 'all-tests',
      name: 'All Tests',
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
      },
      timestamp: Date.now(),
    };

    return result;
  });

  /**
   * LLM 상호작용 테스트 실행 (향후 구현)
   */
  ipcMain.handle('test:run-llm', async (_event: IpcMainInvokeEvent): Promise<TestSuiteResult> => {
    logger.info('IPC: Running LLM tests');

    // TODO: Phase 2에서 구현
    const result: TestSuiteResult = {
      id: 'llm-tests',
      name: 'LLM Interaction Tests',
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
      },
      timestamp: Date.now(),
    };

    return result;
  });

  /**
   * Database 테스트 실행 (향후 구현)
   */
  ipcMain.handle(
    'test:run-database',
    async (_event: IpcMainInvokeEvent): Promise<TestSuiteResult> => {
      logger.info('IPC: Running database tests');

      // TODO: Phase 2에서 구현
      const result: TestSuiteResult = {
        id: 'database-tests',
        name: 'Database Tests',
        tests: [],
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
        },
        timestamp: Date.now(),
      };

      return result;
    }
  );

  /**
   * MCP Tool 테스트 실행 (향후 구현)
   */
  ipcMain.handle('test:run-mcp', async (_event: IpcMainInvokeEvent): Promise<TestSuiteResult> => {
    logger.info('IPC: Running MCP tools tests');

    // TODO: Phase 2에서 구현
    const result: TestSuiteResult = {
      id: 'mcp-tests',
      name: 'MCP Tools Tests',
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
      },
      timestamp: Date.now(),
    };

    return result;
  });

  logger.info('Test runner IPC handlers registered');
}
