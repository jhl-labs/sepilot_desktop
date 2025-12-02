import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { healthCheckService, HealthCheckResult } from '../../services/health-check';
import { logger } from '../../services/logger';
import { llmInteractionTestSuite } from '../../tests/suites/llm-interaction';
import { databaseTestSuite } from '../../tests/suites/database';
import { mcpToolsTestSuite } from '../../tests/suites/mcp-tools';

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
   * 전체 테스트 스위트 실행
   */
  ipcMain.handle('test:run-all', async (_event: IpcMainInvokeEvent): Promise<TestSuiteResult> => {
    logger.info('IPC: Running all tests');
    const startTime = Date.now();

    try {
      // 모든 테스트 스위트 실행
      const llmResult = await llmInteractionTestSuite.run();
      const dbResult = await databaseTestSuite.run();
      const mcpResult = await mcpToolsTestSuite.run();

      // 모든 테스트 결과 합치기
      const allTests = [...llmResult.tests, ...dbResult.tests, ...mcpResult.tests];

      const result: TestSuiteResult = {
        id: 'all-tests',
        name: 'All Tests',
        tests: allTests,
        summary: {
          total: allTests.length,
          passed: allTests.filter((t) => t.status === 'pass').length,
          failed: allTests.filter((t) => t.status === 'fail').length,
          skipped: allTests.filter((t) => t.status === 'skip').length,
          duration: Date.now() - startTime,
        },
        timestamp: Date.now(),
      };

      return result;
    } catch (error) {
      logger.error('IPC: All tests failed:', error);
      throw error;
    }
  });

  /**
   * LLM 상호작용 테스트 실행
   */
  ipcMain.handle('test:run-llm', async (_event: IpcMainInvokeEvent): Promise<TestSuiteResult> => {
    logger.info('IPC: Running LLM tests');
    try {
      return await llmInteractionTestSuite.run();
    } catch (error) {
      logger.error('IPC: LLM tests failed:', error);
      throw error;
    }
  });

  /**
   * Database 테스트 실행
   */
  ipcMain.handle(
    'test:run-database',
    async (_event: IpcMainInvokeEvent): Promise<TestSuiteResult> => {
      logger.info('IPC: Running database tests');
      try {
        return await databaseTestSuite.run();
      } catch (error) {
        logger.error('IPC: Database tests failed:', error);
        throw error;
      }
    }
  );

  /**
   * MCP Tool 테스트 실행
   */
  ipcMain.handle('test:run-mcp', async (_event: IpcMainInvokeEvent): Promise<TestSuiteResult> => {
    logger.info('IPC: Running MCP tools tests');
    try {
      return await mcpToolsTestSuite.run();
    } catch (error) {
      logger.error('IPC: MCP tests failed:', error);
      throw error;
    }
  });

  logger.info('Test runner IPC handlers registered');
}
