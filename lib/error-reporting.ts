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
      console.log('[ErrorReporting] Error reporting is disabled, skipping report');
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
          console.log('[ErrorReporting] Error report skipped (duplicate issue exists)');
          return {
            success: true,
            message: '동일한 에러가 이미 리포트되어 있습니다.',
          };
        }

        console.log('[ErrorReporting] Error reported successfully:', result.data?.issueUrl);
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
 * 전역 에러 핸들러 설정
 * React Error Boundary와 함께 사용
 */
export function setupGlobalErrorHandler() {
  if (typeof window === 'undefined') {
    return;
  }

  // Unhandled errors
  window.addEventListener('error', (event) => {
    console.error('[Global Error Handler] Unhandled error:', event.error);

    reportError(event.error || new Error(event.message), {
      type: 'frontend',
      additionalInfo: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    }).catch((err) => {
      console.error('[ErrorReporting] Failed to report unhandled error:', err);
    });
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Global Error Handler] Unhandled rejection:', event.reason);

    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));

    reportError(error, {
      type: 'frontend',
      additionalInfo: {
        promiseRejection: true,
      },
    }).catch((err) => {
      console.error('[ErrorReporting] Failed to report unhandled rejection:', err);
    });
  });

  console.log('[ErrorReporting] Global error handlers registered');
}
