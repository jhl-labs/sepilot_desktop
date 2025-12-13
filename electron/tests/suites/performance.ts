import { TestResult, TestSuiteResult } from '../../ipc/handlers/test-runner';
import { logger } from '../../services/logger';
import { app } from 'electron';
import process from 'process';

/**
 * System Performance 테스트 스위트
 *
 * 시스템 리소스 사용량 및 성능 지표를 검증합니다.
 */
export class SystemPerformanceTestSuite {
  /**
   * 전체 테스트 실행
   */
  async run(): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const tests: TestResult[] = [];

    logger.info('Running performance tests...');

    // 메모리 사용량 테스트
    tests.push(await this.testMemoryUsage());

    // CPU 사용량 테스트
    tests.push(await this.testCPUUsage());

    // 어플리케이션 메트릭 테스트
    tests.push(await this.testAppMetrics());

    const duration = Date.now() - startTime;
    const passed = tests.filter((t) => t.status === 'pass').length;
    const failed = tests.filter((t) => t.status === 'fail').length;
    const skipped = tests.filter((t) => t.status === 'skip').length;

    const result: TestSuiteResult = {
      id: 'performance',
      name: 'System Performance Tests',
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

    logger.info(`Performance tests completed: ${passed}/${tests.length} passed in ${duration}ms`);
    return result;
  }

  /**
   * 메모리 사용량 테스트
   */
  private async testMemoryUsage(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'perf-memory';

    try {
      const memoryObj = process.getSystemMemoryInfo();
      const freeMemMB = Math.round(memoryObj.free / 1024);
      const totalMemMB = Math.round(memoryObj.total / 1024);

      const heapStats = process.getHeapStatistics();
      const heapUsedMB = Math.round(heapStats.usedHeapSize / 1024 / 1024);

      return {
        id: testId,
        name: 'System Memory Usage',
        status: 'pass', // Always pass unless extremely low?
        duration: Date.now() - startTime,
        message: `Free System Memory: ${freeMemMB}MB / ${totalMemMB}MB, App Heap Used: ${heapUsedMB}MB`,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'System Memory Usage',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * CPU 사용량 테스트
   */
  private async testCPUUsage(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'perf-cpu';

    try {
      const cpuUsage = process.getCPUUsage();
      const percentCPU = cpuUsage.percentCPUUsage.toFixed(2);

      return {
        id: testId,
        name: 'CPU Usage',
        status: 'pass',
        duration: Date.now() - startTime,
        message: `Current CPU Usage: ${percentCPU}%`,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'CPU Usage',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * App Metrics 테스트
   */
  private async testAppMetrics(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'perf-metrics';

    try {
      const metrics = app.getAppMetrics();
      const mainMetric = metrics.find((m) => m.type === 'Browser'); // Main process
      const rendererMetric = metrics.find((m) => m.type === 'Tab'); // Renderer or Tab

      let message = `Processes: ${metrics.length}`;
      if (mainMetric) {
        message += `, Main Mem: ${Math.round(mainMetric.memory.workingSetSize / 1024)}KB`;
      }

      return {
        id: testId,
        name: 'Application Metrics',
        status: 'pass',
        duration: Date.now() - startTime,
        message: message,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'Application Metrics',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }
}

// Singleton instance
export const systemPerformanceTestSuite = new SystemPerformanceTestSuite();
