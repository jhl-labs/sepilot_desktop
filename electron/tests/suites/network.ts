import { TestResult, TestSuiteResult } from '../../ipc/handlers/test-runner';
import { logger } from '../../services/logger';
import { net } from 'electron';

/**
 * Network Connectivity 테스트 스위트
 *
 * 네트워크 연결 상태 및 주요 외부 서비스 접근성을 검증합니다.
 */
export class NetworkTestSuite {
  /**
   * 전체 테스트 실행
   */
  async run(): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const tests: TestResult[] = [];

    logger.info('Running network tests...');

    // 인터넷 연결 테스트
    tests.push(await this.testInternetConnection());

    // 주요 서비스 도달 가능성 테스트
    tests.push(await this.testGitHubConnectivity());

    // (선택 사항) NPM 레지스트리 등 개발 관련 서비스
    tests.push(await this.testNpmRegistry());

    const duration = Date.now() - startTime;
    const passed = tests.filter((t) => t.status === 'pass').length;
    const failed = tests.filter((t) => t.status === 'fail').length;
    const skipped = tests.filter((t) => t.status === 'skip').length;

    const result: TestSuiteResult = {
      id: 'network',
      name: 'Network Connectivity Tests',
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

    logger.info(`Network tests completed: ${passed}/${tests.length} passed in ${duration}ms`);
    return result;
  }

  /**
   * 기본 인터넷 연결 테스트 (Google DNS)
   */
  private async testInternetConnection(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'net-connection';

    try {
      const isOnline = await this.checkUrl('https://8.8.8.8'); // Google Public DNS IP (usually pingable via https or just checked for connectivity)
      // Actually 8.8.8.8 is DNS, might not reply to HTTPS. Let's use google.com
      const isConnected = await this.checkUrl('https://www.google.com');

      if (!isConnected) {
        return {
          id: testId,
          name: 'Internet Connection',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'Could not reach www.google.com',
          timestamp: Date.now(),
        };
      }

      return {
        id: testId,
        name: 'Internet Connection',
        status: 'pass',
        duration: Date.now() - startTime,
        message: 'Successfully reached www.google.com',
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'Internet Connection',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * GitHub 연결 테스트
   */
  private async testGitHubConnectivity(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'net-github';

    try {
      const isConnected = await this.checkUrl('https://api.github.com');

      if (!isConnected) {
        return {
          id: testId,
          name: 'GitHub API Connectivity',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'Could not reach api.github.com',
          timestamp: Date.now(),
        };
      }

      return {
        id: testId,
        name: 'GitHub API Connectivity',
        status: 'pass',
        duration: Date.now() - startTime,
        message: 'Successfully reached properties',
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'GitHub API Connectivity',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * NPM Registry 연결 테스트
   */
  private async testNpmRegistry(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'net-npm';

    try {
      const isConnected = await this.checkUrl('https://registry.npmjs.org');

      if (!isConnected) {
        return {
          id: testId,
          name: 'NPM Registry Connectivity',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'Could not reach registry.npmjs.org',
          timestamp: Date.now(),
        };
      }

      return {
        id: testId,
        name: 'NPM Registry Connectivity',
        status: 'pass',
        duration: Date.now() - startTime,
        message: 'Successfully reached registry.npmjs.org',
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'NPM Registry Connectivity',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * URL 도달 가능성 확인 (fetch 사용)
   */
  private async checkUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      return response.ok || response.status < 500;
    } catch (error) {
      // 일부 사이트는 HEAD를 지원하지 않을 수 있으므로 GET으로 재시도
      try {
        const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
        return response.ok || response.status < 500;
      } catch (e) {
        return false;
      }
    }
  }
}

// Singleton instance
export const networkTestSuite = new NetworkTestSuite();
