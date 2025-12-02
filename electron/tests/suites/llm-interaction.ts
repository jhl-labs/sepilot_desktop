import { TestResult, TestSuiteResult } from '../../ipc/handlers/test-runner';
import { logger } from '../../services/logger';
import { databaseService } from '../../services/database';
import type { AppConfig } from '../../../types';

/**
 * LLM 상호작용 테스트 스위트
 *
 * LLM Provider들의 상태와 기본 기능을 검증합니다.
 */
export class LLMInteractionTestSuite {
  /**
   * 전체 테스트 실행
   */
  async run(): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const tests: TestResult[] = [];

    logger.info('Running LLM interaction tests...');

    // 1. LLM Provider 설정 확인
    tests.push(await this.testProviderConfiguration());

    // 2. API 키 검증
    tests.push(await this.testAPIKeyValidation());

    // 3. 프롬프트 제한 설정 확인
    tests.push(await this.testTokenLimits());

    // 4. Temperature 설정 확인
    tests.push(await this.testTemperatureSettings());

    const duration = Date.now() - startTime;
    const passed = tests.filter((t) => t.status === 'pass').length;
    const failed = tests.filter((t) => t.status === 'fail').length;
    const skipped = tests.filter((t) => t.status === 'skip').length;

    const result: TestSuiteResult = {
      id: 'llm-interaction',
      name: 'LLM Interaction Tests',
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

    logger.info(`LLM tests completed: ${passed}/${tests.length} passed in ${duration}ms`);
    return result;
  }

  /**
   * LLM Provider 설정 확인
   */
  private async testProviderConfiguration(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'llm-provider-config';

    try {
      const db = databaseService.getDatabase();
      const config = db.prepare('SELECT value FROM config WHERE key = ?').get('app_config') as
        | { value: string }
        | undefined;

      if (!config) {
        return {
          id: testId,
          name: 'LLM Provider Configuration',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'No app configuration found',
          timestamp: Date.now(),
        };
      }

      const appConfig: AppConfig = JSON.parse(config.value);
      const providers = appConfig.llm?.providers || {};
      const providerNames = Object.keys(providers);

      if (providerNames.length === 0) {
        return {
          id: testId,
          name: 'LLM Provider Configuration',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'No LLM providers configured',
          timestamp: Date.now(),
        };
      }

      return {
        id: testId,
        name: 'LLM Provider Configuration',
        status: 'pass',
        duration: Date.now() - startTime,
        message: `Found ${providerNames.length} provider(s): ${providerNames.join(', ')}`,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'LLM Provider Configuration',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * API 키 검증
   */
  private async testAPIKeyValidation(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'llm-api-key';

    try {
      const db = databaseService.getDatabase();
      const config = db.prepare('SELECT value FROM config WHERE key = ?').get('app_config') as
        | { value: string }
        | undefined;

      if (!config) {
        return {
          id: testId,
          name: 'API Key Validation',
          status: 'skip',
          duration: Date.now() - startTime,
          message: 'No configuration found',
          timestamp: Date.now(),
        };
      }

      const appConfig: AppConfig = JSON.parse(config.value);
      const providers = appConfig.llm?.providers || {};
      const providerNames = Object.keys(providers);

      const configuredProviders = providerNames.filter((name) => {
        const provider = providers[name];
        return provider?.apiKey && provider.apiKey.length > 0;
      });

      if (configuredProviders.length === 0) {
        return {
          id: testId,
          name: 'API Key Validation',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'No providers have API keys configured',
          timestamp: Date.now(),
        };
      }

      return {
        id: testId,
        name: 'API Key Validation',
        status: 'pass',
        duration: Date.now() - startTime,
        message: `${configuredProviders.length}/${providerNames.length} provider(s) have API keys`,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'API Key Validation',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Token Limits 설정 확인
   */
  private async testTokenLimits(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'llm-token-limits';

    try {
      const db = databaseService.getDatabase();
      const config = db.prepare('SELECT value FROM config WHERE key = ?').get('app_config') as
        | { value: string }
        | undefined;

      if (!config) {
        return {
          id: testId,
          name: 'Token Limits Configuration',
          status: 'skip',
          duration: Date.now() - startTime,
          message: 'No configuration found',
          timestamp: Date.now(),
        };
      }

      const appConfig: AppConfig = JSON.parse(config.value);
      const providers = appConfig.llm?.providers || {};

      let allValid = true;
      const issues: string[] = [];

      for (const [name, provider] of Object.entries(providers)) {
        const maxTokens = provider?.maxTokens;
        if (maxTokens !== undefined && maxTokens !== null) {
          if (maxTokens <= 0 || maxTokens > 128000) {
            allValid = false;
            issues.push(`${name}: invalid maxTokens (${maxTokens})`);
          }
        }
      }

      if (!allValid) {
        return {
          id: testId,
          name: 'Token Limits Configuration',
          status: 'fail',
          duration: Date.now() - startTime,
          message: `Invalid token limits: ${issues.join(', ')}`,
          timestamp: Date.now(),
        };
      }

      return {
        id: testId,
        name: 'Token Limits Configuration',
        status: 'pass',
        duration: Date.now() - startTime,
        message: 'All token limits are within valid range',
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'Token Limits Configuration',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Temperature 설정 확인
   */
  private async testTemperatureSettings(): Promise<TestResult> {
    const startTime = Date.now();
    const testId = 'llm-temperature';

    try {
      const db = databaseService.getDatabase();
      const config = db.prepare('SELECT value FROM config WHERE key = ?').get('app_config') as
        | { value: string }
        | undefined;

      if (!config) {
        return {
          id: testId,
          name: 'Temperature Settings',
          status: 'skip',
          duration: Date.now() - startTime,
          message: 'No configuration found',
          timestamp: Date.now(),
        };
      }

      const appConfig: AppConfig = JSON.parse(config.value);
      const providers = appConfig.llm?.providers || {};

      let allValid = true;
      const issues: string[] = [];

      for (const [name, provider] of Object.entries(providers)) {
        const temperature = provider?.temperature;
        if (temperature !== undefined && temperature !== null) {
          if (temperature < 0 || temperature > 2) {
            allValid = false;
            issues.push(`${name}: invalid temperature (${temperature})`);
          }
        }
      }

      if (!allValid) {
        return {
          id: testId,
          name: 'Temperature Settings',
          status: 'fail',
          duration: Date.now() - startTime,
          message: `Invalid temperature settings: ${issues.join(', ')}`,
          timestamp: Date.now(),
        };
      }

      return {
        id: testId,
        name: 'Temperature Settings',
        status: 'pass',
        duration: Date.now() - startTime,
        message: 'All temperature settings are within valid range (0-2)',
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: testId,
        name: 'Temperature Settings',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }
}

// Singleton instance
export const llmInteractionTestSuite = new LLMInteractionTestSuite();
