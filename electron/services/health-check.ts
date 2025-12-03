import { databaseService } from './database';
import { vectorDBService } from './vectordb';
import { logger } from './logger';
import { MCPServerManager } from '../../lib/mcp/server-manager';
import type { AppConfig, LLMConfigV2 } from '../../types';

/**
 * Check if LLM config is V2
 */
function isLLMConfigV2(config: any): config is LLMConfigV2 {
  return config && typeof config === 'object' && 'version' in config && config.version === 2;
}

/**
 * Health Check 결과 인터페이스
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: HealthStatus;
    vectordb: HealthStatus;
    mcpTools: HealthStatus;
    llmProviders: HealthStatus;
  };
  timestamp: number;
  message?: string;
}

export interface HealthStatus {
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  details?: Record<string, unknown>;
  latency?: number; // ms
}

/**
 * Health Check 서비스
 *
 * 앱의 주요 컴포넌트들의 상태를 검증합니다:
 * - Database 연결
 * - VectorDB 연결
 * - MCP Tools 상태
 * - LLM Provider 연결
 */
export class HealthCheckService {
  private lastCheckResult: HealthCheckResult | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  /**
   * 주기적인 Health Check 시작
   * @param intervalMs 체크 간격 (밀리초)
   */
  startPeriodicCheck(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      logger.warn('Periodic health check already running');
      return;
    }

    logger.info(`Starting periodic health check (interval: ${intervalMs}ms)`);
    this.checkInterval = setInterval(async () => {
      try {
        await this.runHealthCheck();
      } catch (error) {
        logger.error('Periodic health check failed:', error);
      }
    }, intervalMs);
  }

  /**
   * 주기적인 Health Check 중지
   */
  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Stopped periodic health check');
    }
  }

  /**
   * 전체 Health Check 실행
   */
  async runHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    logger.info('Running health check...');

    const checks = {
      database: await this.checkDatabase(),
      vectordb: await this.checkVectorDB(),
      mcpTools: await this.checkMCPTools(),
      llmProviders: await this.checkLLMProviders(),
    };

    // 전체 상태 계산
    const hasFailures = Object.values(checks).some((check) => check.status === 'fail');
    const hasWarnings = Object.values(checks).some((check) => check.status === 'warn');

    let status: 'healthy' | 'degraded' | 'unhealthy';
    let message: string;

    if (hasFailures) {
      status = 'unhealthy';
      message = 'One or more critical components are failing';
    } else if (hasWarnings) {
      status = 'degraded';
      message = 'All critical components are working, but some have warnings';
    } else {
      status = 'healthy';
      message = 'All systems operational';
    }

    const result: HealthCheckResult = {
      status,
      checks,
      timestamp: Date.now(),
      message,
    };

    this.lastCheckResult = result;
    const duration = Date.now() - startTime;
    logger.info(`Health check completed in ${duration}ms: ${status}`);

    return result;
  }

  /**
   * 마지막 Health Check 결과 반환
   */
  getLastResult(): HealthCheckResult | null {
    return this.lastCheckResult;
  }

  /**
   * Database Health Check
   */
  private async checkDatabase(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      // Database 초기화 확인
      if (!databaseService) {
        return {
          status: 'fail',
          message: 'Database service not initialized',
          latency: Date.now() - startTime,
        };
      }

      // 간단한 쿼리로 연결 확인
      const db = databaseService.getDatabase();
      const testQuery = db.exec('SELECT 1 as test');

      if (
        !testQuery ||
        testQuery.length === 0 ||
        testQuery[0].values.length === 0 ||
        testQuery[0].values[0][0] !== 1
      ) {
        return {
          status: 'fail',
          message: 'Database query failed',
          latency: Date.now() - startTime,
        };
      }

      return {
        status: 'pass',
        message: 'Database connection healthy',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Unknown error',
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * VectorDB Health Check
   */
  private async checkVectorDB(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      if (!vectorDBService) {
        return {
          status: 'fail',
          message: 'VectorDB service not initialized',
          latency: Date.now() - startTime,
        };
      }

      // VectorDB 상태 확인 (컬렉션 목록 조회)
      const collections = await vectorDBService.listCollections();

      return {
        status: 'pass',
        message: 'VectorDB connection healthy',
        details: { collectionCount: collections.length },
        latency: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('VectorDB health check failed:', error);
      return {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Unknown error',
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * MCP Tools Health Check
   */
  private async checkMCPTools(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      if (!MCPServerManager) {
        return {
          status: 'warn',
          message: 'MCP manager not initialized',
          latency: Date.now() - startTime,
        };
      }

      // MCP 서버 상태 확인
      const servers = MCPServerManager.getAllServersInMainProcess();
      const serverCount = servers.length;
      const connectedServers = servers.filter((s) => s.connected).length;

      if (serverCount === 0) {
        return {
          status: 'warn',
          message: 'No MCP servers configured',
          details: { serverCount: 0, connectedCount: 0 },
          latency: Date.now() - startTime,
        };
      }

      if (connectedServers === 0) {
        return {
          status: 'fail',
          message: 'No MCP servers connected',
          details: { serverCount, connectedCount: 0 },
          latency: Date.now() - startTime,
        };
      }

      return {
        status: 'pass',
        message: `${connectedServers}/${serverCount} MCP servers connected`,
        details: { serverCount, connectedCount: connectedServers },
        latency: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('MCP tools health check failed:', error);
      return {
        status: 'warn',
        message: error instanceof Error ? error.message : 'Unknown error',
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * LLM Providers Health Check
   */
  private async checkLLMProviders(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      // 설정에서 LLM Provider 확인
      const configValue = databaseService.getSetting('app_config');

      if (!configValue) {
        return {
          status: 'warn',
          message: 'No LLM providers configured',
          latency: Date.now() - startTime,
        };
      }
      const appConfig: AppConfig = JSON.parse(configValue);
      const llmConfig = appConfig.llm;

      // V2 config 지원
      if (isLLMConfigV2(llmConfig)) {
        const connectionCount = llmConfig.connections?.length || 0;
        const connectionsWithKey =
          llmConfig.connections?.filter((conn) => conn.apiKey && conn.apiKey.length > 0) || [];

        if (connectionCount === 0) {
          return {
            status: 'warn',
            message: 'No LLM connections configured (V2)',
            details: { connectionCount: 0 },
            latency: Date.now() - startTime,
          };
        }

        if (connectionsWithKey.length === 0) {
          return {
            status: 'fail',
            message: 'No LLM connections have API keys configured (V2)',
            details: { totalConnections: connectionCount, configuredCount: 0 },
            latency: Date.now() - startTime,
          };
        }

        return {
          status: 'pass',
          message: `${connectionsWithKey.length}/${connectionCount} LLM connection(s) configured (V2)`,
          details: {
            totalConnections: connectionCount,
            configuredCount: connectionsWithKey.length,
          },
          latency: Date.now() - startTime,
        };
      }

      // V1 config
      const providers = llmConfig?.providers || {};
      const providerNames = Object.keys(providers);

      if (providerNames.length === 0) {
        return {
          status: 'warn',
          message: 'No LLM providers configured (V1)',
          details: { providerCount: 0 },
          latency: Date.now() - startTime,
        };
      }

      // API 키가 설정된 Provider 확인
      const configuredProviders = providerNames.filter((name) => {
        const provider = providers[name];
        return provider?.apiKey && provider.apiKey.length > 0;
      });

      if (configuredProviders.length === 0) {
        return {
          status: 'fail',
          message: 'No LLM providers have API keys configured (V1)',
          details: { totalProviders: providerNames.length, configuredCount: 0 },
          latency: Date.now() - startTime,
        };
      }

      return {
        status: 'pass',
        message: `${configuredProviders.length}/${providerNames.length} LLM provider(s) configured (V1)`,
        details: {
          totalProviders: providerNames.length,
          configuredCount: configuredProviders.length,
          providers: configuredProviders,
        },
        latency: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('LLM providers health check failed:', error);
      return {
        status: 'warn',
        message: error instanceof Error ? error.message : 'Unknown error',
        latency: Date.now() - startTime,
      };
    }
  }
}

// Singleton instance
export const healthCheckService = new HealthCheckService();
