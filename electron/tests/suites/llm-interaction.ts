import { TestResult, TestSuiteResult } from '../../ipc/handlers/test-runner';
import { logger } from '../../services/logger';
import { databaseService } from '../../services/database';
import type { AppConfig, LLMConfigV2 } from '../../../types';

/**
 * Check if LLM config is V2
 */
function isLLMConfigV2(config: any): config is LLMConfigV2 {
  return config && typeof config === 'object' && 'version' in config && config.version === 2;
}

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
      const configValue = databaseService.getSetting('app_config');

      if (!configValue) {
        return {
          id: testId,
          name: 'LLM Provider Configuration',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'No app configuration found',
          timestamp: Date.now(),
        };
      }

      const appConfig: AppConfig = JSON.parse(configValue);
      const llmConfig = appConfig.llm;

      // V2 config 지원
      if (isLLMConfigV2(llmConfig)) {
        const connectionCount = llmConfig.connections?.length || 0;
        const modelCount = llmConfig.models?.length || 0;

        if (connectionCount === 0) {
          return {
            id: testId,
            name: 'LLM Provider Configuration',
            status: 'fail',
            duration: Date.now() - startTime,
            message: 'No LLM connections configured',
            timestamp: Date.now(),
          };
        }

        return {
          id: testId,
          name: 'LLM Provider Configuration',
          status: 'pass',
          duration: Date.now() - startTime,
          message: `Found ${connectionCount} connection(s), ${modelCount} model(s)`,
          timestamp: Date.now(),
        };
      }

      // V1 config
      const provider = llmConfig?.provider;

      if (!provider) {
        return {
          id: testId,
          name: 'LLM Provider Configuration',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'No LLM provider configured',
          timestamp: Date.now(),
        };
      }

      return {
        id: testId,
        name: 'LLM Provider Configuration',
        status: 'pass',
        duration: Date.now() - startTime,
        message: `Found provider: ${provider}`,
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
      const configValue = databaseService.getSetting('app_config');

      if (!configValue) {
        return {
          id: testId,
          name: 'API Key Validation',
          status: 'skip',
          duration: Date.now() - startTime,
          message: 'No configuration found',
          timestamp: Date.now(),
        };
      }

      const appConfig: AppConfig = JSON.parse(configValue);
      const llmConfig = appConfig.llm;

      // V2 config 지원
      if (isLLMConfigV2(llmConfig)) {
        const connectionsWithKey =
          llmConfig.connections?.filter((conn) => conn.apiKey && conn.apiKey.length > 0) || [];

        if (connectionsWithKey.length === 0) {
          return {
            id: testId,
            name: 'API Key Validation',
            status: 'fail',
            duration: Date.now() - startTime,
            message: 'No connections with API key configured',
            timestamp: Date.now(),
          };
        }

        return {
          id: testId,
          name: 'API Key Validation',
          status: 'pass',
          duration: Date.now() - startTime,
          message: `${connectionsWithKey.length} connection(s) with API key`,
          timestamp: Date.now(),
        };
      }

      // V1 config
      const hasApiKey = llmConfig?.apiKey && llmConfig.apiKey.length > 0;

      if (!hasApiKey) {
        return {
          id: testId,
          name: 'API Key Validation',
          status: 'fail',
          duration: Date.now() - startTime,
          message: 'No API key configured',
          timestamp: Date.now(),
        };
      }

      return {
        id: testId,
        name: 'API Key Validation',
        status: 'pass',
        duration: Date.now() - startTime,
        message: 'API key is configured',
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
      const configValue = databaseService.getSetting('app_config');

      if (!configValue) {
        return {
          id: testId,
          name: 'Token Limits Configuration',
          status: 'skip',
          duration: Date.now() - startTime,
          message: 'No configuration found',
          timestamp: Date.now(),
        };
      }

      const appConfig: AppConfig = JSON.parse(configValue);
      const llmConfig = appConfig.llm;

      // V2 config 지원
      if (isLLMConfigV2(llmConfig)) {
        const defaultMaxTokens = llmConfig.defaultMaxTokens;

        if (defaultMaxTokens !== undefined && defaultMaxTokens !== null) {
          if (defaultMaxTokens <= 0 || defaultMaxTokens > 200000) {
            return {
              id: testId,
              name: 'Token Limits Configuration',
              status: 'fail',
              duration: Date.now() - startTime,
              message: `Invalid defaultMaxTokens: ${defaultMaxTokens}`,
              timestamp: Date.now(),
            };
          }
        }

        return {
          id: testId,
          name: 'Token Limits Configuration',
          status: 'pass',
          duration: Date.now() - startTime,
          message: `Default maxTokens: ${defaultMaxTokens}`,
          timestamp: Date.now(),
        };
      }

      // V1 config
      const maxTokens = llmConfig?.maxTokens;

      if (maxTokens !== undefined && maxTokens !== null) {
        if (maxTokens <= 0 || maxTokens > 128000) {
          return {
            id: testId,
            name: 'Token Limits Configuration',
            status: 'fail',
            duration: Date.now() - startTime,
            message: `Invalid maxTokens: ${maxTokens}`,
            timestamp: Date.now(),
          };
        }
      }

      return {
        id: testId,
        name: 'Token Limits Configuration',
        status: 'pass',
        duration: Date.now() - startTime,
        message: `maxTokens: ${maxTokens}`,
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
      const configValue = databaseService.getSetting('app_config');

      if (!configValue) {
        return {
          id: testId,
          name: 'Temperature Settings',
          status: 'skip',
          duration: Date.now() - startTime,
          message: 'No configuration found',
          timestamp: Date.now(),
        };
      }

      const appConfig: AppConfig = JSON.parse(configValue);
      const llmConfig = appConfig.llm;

      // V2 config 지원
      if (isLLMConfigV2(llmConfig)) {
        const defaultTemperature = llmConfig.defaultTemperature;

        if (defaultTemperature !== undefined && defaultTemperature !== null) {
          if (defaultTemperature < 0 || defaultTemperature > 2) {
            return {
              id: testId,
              name: 'Temperature Settings',
              status: 'fail',
              duration: Date.now() - startTime,
              message: `Invalid defaultTemperature: ${defaultTemperature}`,
              timestamp: Date.now(),
            };
          }
        }

        return {
          id: testId,
          name: 'Temperature Settings',
          status: 'pass',
          duration: Date.now() - startTime,
          message: `Default temperature: ${defaultTemperature}`,
          timestamp: Date.now(),
        };
      }

      // V1 config
      const temperature = llmConfig?.temperature;

      if (temperature !== undefined && temperature !== null) {
        if (temperature < 0 || temperature > 2) {
          return {
            id: testId,
            name: 'Temperature Settings',
            status: 'fail',
            duration: Date.now() - startTime,
            message: `Invalid temperature: ${temperature}`,
            timestamp: Date.now(),
          };
        }
      }

      return {
        id: testId,
        name: 'Temperature Settings',
        status: 'pass',
        duration: Date.now() - startTime,
        message: `Temperature: ${temperature}`,
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
