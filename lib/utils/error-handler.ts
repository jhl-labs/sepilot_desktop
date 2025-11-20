/**
 * 에러 핸들링 유틸리티
 *
 * 프로젝트 전반에 걸쳐 일관된 에러 처리를 위한 유틸리티 함수들
 */

import { logger } from './logger';
import type { IPCResponse } from '@/types/electron';

/**
 * 에러가 Error 인스턴스인지 확인하는 타입 가드
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * 에러에서 메시지를 안전하게 추출
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }

  return 'Unknown error occurred';
}

/**
 * 에러 스택을 안전하게 추출
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) {
    return error.stack;
  }
  return undefined;
}

/**
 * IPC 핸들러에서 사용할 표준 에러 응답 생성
 */
export function createErrorResponse(error: unknown, context?: string): IPCResponse {
  const message = getErrorMessage(error);
  const stack = getErrorStack(error);

  if (context) {
    logger.error(`[${context}]`, message, stack ? { stack } : {});
  } else {
    logger.error(message, stack ? { stack } : {});
  }

  return {
    success: false,
    error: message,
  };
}

/**
 * IPC 핸들러에서 사용할 표준 성공 응답 생성
 */
export function createSuccessResponse<T = void>(data?: T): IPCResponse<T> {
  if (data !== undefined) {
    return {
      success: true,
      data,
    };
  }

  return {
    success: true,
  } as IPCResponse<T>;
}

/**
 * HTTP 상태 코드에 따라 사용자 친화적 에러 메시지 생성
 */
export function getHTTPErrorMessage(status: number, defaultMessage: string): string {
  switch (status) {
    case 400:
      return '잘못된 요청입니다. 입력값을 확인해주세요.';
    case 401:
      return 'API 키가 유효하지 않습니다. 설정에서 API 키를 확인해주세요.';
    case 403:
      return '접근 권한이 없습니다. API 키 권한을 확인해주세요.';
    case 404:
      return '요청한 리소스를 찾을 수 없습니다.';
    case 429:
      return 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
    case 500:
    case 502:
    case 503:
    case 504:
      return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    default:
      return `${defaultMessage} (상태 코드: ${status})`;
  }
}

/**
 * 비동기 작업을 안전하게 실행하고 결과 또는 에러를 반환
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    const message = getErrorMessage(error);
    const stack = getErrorStack(error);

    if (context) {
      logger.error(`[${context}]`, message, stack ? { stack } : {});
    } else {
      logger.error(message, stack ? { stack } : {});
    }

    return { success: false, error: message };
  }
}

/**
 * 여러 에러를 하나의 메시지로 결합
 */
export function combineErrors(errors: unknown[]): string {
  return errors
    .map((error) => getErrorMessage(error))
    .filter(Boolean)
    .join('; ');
}

/**
 * 에러가 특정 타입인지 확인 (예: AbortError, NetworkError 등)
 */
export function isErrorType(error: unknown, name: string): boolean {
  return isError(error) && error.name === name;
}

/**
 * Abort 에러인지 확인
 */
export function isAbortError(error: unknown): boolean {
  return isErrorType(error, 'AbortError');
}

/**
 * 네트워크 에러인지 확인
 */
export function isNetworkError(error: unknown): boolean {
  if (!isError(error)) return false;

  return (
    error.name === 'NetworkError' ||
    error.message.includes('network') ||
    error.message.includes('fetch') ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ETIMEDOUT')
  );
}
