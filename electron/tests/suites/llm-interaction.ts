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
      const connections = appConfig.llm?.connections || [];

      if (connections.length === 0) {
        return {
          id: testId,
          name: 'LLM Provider Configuration',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'No LLM connections configured',
          timestamp: Date.now(),
        };
      }

      const connectionNames = connections.map((c) => c.provider).join(', ');

      return {
        id: testId,
        name: 'LLM Provider Configuration',
        status: 'pass',
        duration: Date.now() - startTime,
        message: `Found ${connections.length} connection(s): ${connectionNames}`,
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
      const connections = appConfig.llm?.connections || [];

      const configuredConnections = connections.filter((conn) => {
        return conn.apiKey && conn.apiKey.length > 0;
      });

      if (configuredConnections.length === 0) {
        return {
          id: testId,
          name: 'API Key Validation',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'No connections have API keys configured',
          timestamp: Date.now(),
        };
      }

      return {
        id: testId,
        name: 'API Key Validation',
        status: 'pass',
        duration: Date.now() - startTime,
        message: `${configuredConnections.length}/${connections.length} connection(s) have API keys`,
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
      const models = appConfig.llm?.models || [];
      const defaultMaxTokens = appConfig.llm?.defaultMaxTokens;

      let allValid = true;
      const issues: string[] = [];

      // Check default max tokens
      if (defaultMaxTokens !== undefined && defaultMaxTokens !== null) {
        if (defaultMaxTokens <= 0 || defaultMaxTokens > 128000) {
          allValid = false;
          issues.push(`default: invalid maxTokens (${defaultMaxTokens})`);
        }
      }

      // Check model-specific max tokens
      for (const model of models) {
        const maxTokens = model.maxTokens;
        if (maxTokens !== undefined && maxTokens !== null) {
          if (maxTokens <= 0 || maxTokens > 128000) {
            allValid = false;
            issues.push(`${model.name}: invalid maxTokens (${maxTokens})`);
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
      const models = appConfig.llm?.models || [];
      const defaultTemperature = appConfig.llm?.defaultTemperature;

      let allValid = true;
      const issues: string[] = [];

      // Check default temperature
      if (defaultTemperature !== undefined && defaultTemperature !== null) {
        if (defaultTemperature < 0 || defaultTemperature > 2) {
          allValid = false;
          issues.push(`default: invalid temperature (${defaultTemperature})`);
        }
      }

      // Check model-specific temperature
      for (const model of models) {
        const temperature = model.temperature;
        if (temperature !== undefined && temperature !== null) {
          if (temperature < 0 || temperature > 2) {
            allValid = false;
            issues.push(`${model.name}: invalid temperature (${temperature})`);
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
