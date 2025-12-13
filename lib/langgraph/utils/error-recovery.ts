import { logger } from '@/lib/utils/logger';
/**
 * Error Recovery for Coding Agent
 *
 * Provides retry mechanisms with exponential backoff
 */

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[]; // Error messages/codes that should trigger retry
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDurationMs: number;
}

export class ErrorRecovery {
  private static readonly DEFAULT_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableErrors: [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'rate_limit',
      'timeout',
      'network',
      '429', // Rate limit HTTP status
      '502', // Bad Gateway
      '503', // Service Unavailable
      '504', // Gateway Timeout
    ],
  };

  /**
   * Check if an error is retryable
   */
  static isRetryable(error: any, config: RetryConfig = this.DEFAULT_CONFIG): boolean {
    if (!error) {
      return false;
    }

    const errorString = JSON.stringify(error).toLowerCase();
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code?.toLowerCase() || '';

    return config.retryableErrors.some((retryableError) => {
      const pattern = retryableError.toLowerCase();
      return (
        errorString.includes(pattern) ||
        errorMessage.includes(pattern) ||
        errorCode.includes(pattern)
      );
    });
  }

  /**
   * Execute with retry and exponential backoff
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context: string = 'operation'
  ): Promise<RetryResult<T>> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
      try {
        logger.info(
          `[ErrorRecovery] ${context}: attempt ${attempt + 1}/${finalConfig.maxRetries + 1}`
        );

        const result = await fn();

        const duration = Date.now() - startTime;
        logger.info(
          `[ErrorRecovery] ${context}: success after ${attempt + 1} attempts (${duration}ms)`
        );

        return {
          success: true,
          result,
          attempts: attempt + 1,
          totalDurationMs: duration,
        };
      } catch (error: any) {
        lastError = error;

        console.error(`[ErrorRecovery] ${context}: attempt ${attempt + 1} failed:`, {
          message: error.message,
          code: error.code,
          isRetryable: this.isRetryable(error, finalConfig),
        });

        // If not retryable or last attempt, fail immediately
        if (!this.isRetryable(error, finalConfig) || attempt === finalConfig.maxRetries) {
          const duration = Date.now() - startTime;
          console.error(
            `[ErrorRecovery] ${context}: giving up after ${attempt + 1} attempts (${duration}ms)`
          );

          return {
            success: false,
            error: lastError,
            attempts: attempt + 1,
            totalDurationMs: duration,
          };
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          finalConfig.initialDelayMs * Math.pow(finalConfig.backoffMultiplier, attempt),
          finalConfig.maxDelayMs
        );

        logger.info(`[ErrorRecovery] ${context}: retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    const duration = Date.now() - startTime;
    return {
      success: false,
      error: lastError || new Error('Unknown error'),
      attempts: finalConfig.maxRetries + 1,
      totalDurationMs: duration,
    };
  }

  /**
   * Execute with timeout and retry
   */
  static async withTimeoutAndRetry<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    retryConfig: Partial<RetryConfig> = {},
    context: string = 'operation'
  ): Promise<RetryResult<T>> {
    return this.withRetry(
      async () => {
        return Promise.race([
          fn(),
          this.timeoutPromise<T>(timeoutMs, `${context} timed out after ${timeoutMs}ms`),
        ]);
      },
      retryConfig,
      context
    );
  }

  /**
   * Create a promise that rejects after timeout
   */
  private static timeoutPromise<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Format error message for user display
   */
  static formatErrorMessage(error: any, attempts: number): string {
    const baseMessage = error.message || String(error);

    if (attempts === 1) {
      return `❌ 오류 발생: ${baseMessage}`;
    } else {
      return `❌ ${attempts}회 시도 후 실패: ${baseMessage}`;
    }
  }

  /**
   * Get recovery suggestion based on error type
   */
  static getRecoverySuggestion(error: any): string {
    const errorString = JSON.stringify(error).toLowerCase();
    const errorMessage = error.message?.toLowerCase() || '';

    if (errorString.includes('rate_limit') || errorString.includes('429')) {
      return '💡 제안: API 사용량 제한에 도달했습니다. 잠시 후 다시 시도하세요.';
    }

    if (
      errorString.includes('timeout') ||
      errorString.includes('etimedout') ||
      errorString.includes('504')
    ) {
      return '💡 제안: 작업이 시간 초과되었습니다. 명령을 더 작은 단위로 나누거나 네트워크 연결을 확인하세요.';
    }

    if (
      errorString.includes('network') ||
      errorString.includes('econnrefused') ||
      errorString.includes('enotfound')
    ) {
      return '💡 제안: 네트워크 연결을 확인하세요. VPN이나 프록시 설정이 문제를 일으킬 수 있습니다.';
    }

    if (errorMessage.includes('permission') || errorMessage.includes('eacces')) {
      return '💡 제안: 파일 권한 문제입니다. 파일 접근 권한을 확인하세요.';
    }

    if (errorMessage.includes('enoent') || errorMessage.includes('not found')) {
      return '💡 제안: 파일이나 디렉토리를 찾을 수 없습니다. 경로를 확인하세요.';
    }

    return '💡 제안: 로그를 확인하고 문제를 해결한 후 다시 시도하세요.';
  }
}
