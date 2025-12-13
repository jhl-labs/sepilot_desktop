import { logger } from '@/lib/utils/logger';
/**
 * Error Reporting Utility
 * 프론트엔드/백엔드 에러를 자동으로 GitHub Issue로 리포트
 */

import type { ErrorReportData } from '@/types';

/**
 * 에러 리포팅이 활성화되어 있는지 확인
 */
export async function isErrorReportingEnabled(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.electronAPI) {
      return false;
    }

    const result = await window.electronAPI.errorReporting.isEnabled();
    return result.enabled;
  } catch (error) {
    console.error('[ErrorReporting] Failed to check if enabled:', error);
    return false;
  }
}

/**
 * 에러 컨텍스트 정보 가져오기
 */
async function getErrorContext(): Promise<{
  version: string;
  platform: string;
  timestamp: number;
  userAgent?: string;
}> {
  try {
    if (typeof window === 'undefined' || !window.electronAPI) {
      return {
        version: 'unknown',
        platform: 'unknown',
        timestamp: Date.now(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      };
    }

    const result = await window.electronAPI.errorReporting.getContext();
    if (result.success && result.data) {
      return {
        ...result.data,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      };
    }

    throw new Error(result.error || 'Failed to get context');
  } catch (error) {
    console.error('[ErrorReporting] Failed to get context:', error);
    return {
      version: 'unknown',
      platform: 'unknown',
      timestamp: Date.now(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };
  }
}

/**
 * 에러를 GitHub Issue로 리포트
 */
export async function reportError(
  error: Error,
  options?: {
    type?: 'frontend' | 'backend' | 'ipc';
    reproduction?: string;
    additionalInfo?: Record<string, unknown>;
  }
): Promise<{ success: boolean; issueUrl?: string; message?: string }> {
  try {
    // 에러 리포팅이 활성화되어 있는지 확인
    const enabled = await isErrorReportingEnabled();
    if (!enabled) {
      logger.info('[ErrorReporting] Error reporting is disabled, skipping report');
      return {
        success: false,
        message: '에러 리포팅이 비활성화되어 있습니다.',
      };
    }

    // 컨텍스트 정보 가져오기
    const context = await getErrorContext();

    // 에러 제목 생성
    const title = `[${options?.type || 'frontend'}] ${error.message.substring(0, 100)}`;

    // 에러 데이터 구성
    const errorData: ErrorReportData = {
      title,
      error: {
        message: error.message,
        stack: error.stack,
        type: options?.type || 'frontend',
      },
      context,
      reproduction: options?.reproduction,
      additionalInfo: options?.additionalInfo,
    };

    // GitHub Issue 생성
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.errorReporting.send(errorData);

      if (result.success) {
        if (result.data?.skipped) {
          logger.info('[ErrorReporting] Error report skipped (duplicate issue exists)');
          return {
            success: true,
            message: '동일한 에러가 이미 리포트되어 있습니다.',
          };
        }

        logger.info('[ErrorReporting] Error reported successfully:', result.data?.issueUrl);
        return {
          success: true,
          issueUrl: result.data?.issueUrl,
          message: '에러가 성공적으로 리포트되었습니다.',
        };
      }

      throw new Error(result.error || 'Failed to send error report');
    }

    return {
      success: false,
      message: 'Electron API를 사용할 수 없습니다.',
    };
  } catch (error) {
    console.error('[ErrorReporting] Failed to report error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '에러 리포트 전송 실패',
    };
  }
}

/**
 * 에러 리포팅 콜백 타입
 * 에러 발생 시 UI에서 처리하기 위한 콜백
 */
type ErrorReportingCallback = (error: Error, additionalInfo?: Record<string, unknown>) => void;

let errorReportingCallback: ErrorReportingCallback | null = null;

/**
 * 에러 리포팅 콜백 등록
 * ErrorBoundary나 다른 컴포넌트에서 에러 발생 시 호출할 콜백을 등록
 */
export function setErrorReportingCallback(callback: ErrorReportingCallback | null) {
  errorReportingCallback = callback;
}

/**
 * 전역 에러 핸들러 설정
 * React Error Boundary와 함께 사용
 * 에러 발생 시 자동으로 리포트하지 않고, 콜백을 통해 UI에 전달
 */
export function setupGlobalErrorHandler() {
  if (typeof window === 'undefined') {
    return;
  }

  // Unhandled errors
  window.addEventListener('error', (event) => {
    console.error('[Global Error Handler] Unhandled error:', event.error);

    const error = event.error || new Error(event.message);

    // 콜백이 등록되어 있으면 UI에서 처리하도록 위임
    if (errorReportingCallback) {
      errorReportingCallback(error, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    }
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Global Error Handler] Unhandled rejection:', event.reason);

    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));

    // 콜백이 등록되어 있으면 UI에서 처리하도록 위임
    if (errorReportingCallback) {
      errorReportingCallback(error, {
        promiseRejection: true,
      });
    }
  });

  logger.info('[ErrorReporting] Global error handlers registered');
}
