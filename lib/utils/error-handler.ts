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
  if (!isError(error)) {
    return false;
  }

  return (
    error.name === 'NetworkError' ||
    error.message.includes('network') ||
    error.message.includes('fetch') ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ETIMEDOUT')
  );
}

/**
 * SSL/TLS 에러인지 확인
 */
export function isSslError(error: unknown): boolean {
  if (!isError(error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('ssl') ||
    message.includes('tls') ||
    message.includes('certificate') ||
    message.includes('cert') ||
    message.includes('self signed') ||
    message.includes('self-signed') ||
    message.includes('unable to verify')
  );
}

/**
 * 프록시 에러인지 확인
 */
export function isProxyError(error: unknown): boolean {
  if (!isError(error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('proxy') ||
    message.includes('tunnel') ||
    message.includes('407') ||
    message.includes('eproto')
  );
}

/**
 * 연결 에러인지 확인
 */
export function isConnectionError(error: unknown): boolean {
  if (!isError(error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('econnrefused') ||
    message.includes('connection refused') ||
    message.includes('econnreset') ||
    message.includes('connection reset') ||
    message.includes('enotfound') ||
    message.includes('getaddrinfo')
  );
}

/**
 * HttpError인지 확인하고 사용자 메시지 추출
 */
export function getHttpErrorUserMessage(error: unknown): string | null {
  // HttpError 타입 체크 (동적 import 피하기 위해 duck typing 사용)
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as Error).name === 'HttpError' &&
    'getUserMessage' in error &&
    typeof (error as any).getUserMessage === 'function'
  ) {
    return (error as any).getUserMessage();
  }
  return null;
}

/**
 * 에러 타입에 따른 사용자 친화적 메시지 생성
 */
export function getFriendlyErrorMessage(error: unknown, context?: string): string {
  // HttpError인 경우 getUserMessage 사용
  const httpErrorMessage = getHttpErrorUserMessage(error);
  if (httpErrorMessage) {
    return httpErrorMessage;
  }

  if (!isError(error)) {
    return context
      ? `${context}: 알 수 없는 오류가 발생했습니다.`
      : '알 수 없는 오류가 발생했습니다.';
  }

  // SSL 에러
  if (isSslError(error)) {
    return 'SSL/TLS 인증서 오류가 발생했습니다. 네트워크 설정에서 SSL 검증을 비활성화하거나 서버 인증서를 확인해주세요.';
  }

  // 프록시 에러
  if (isProxyError(error)) {
    return '프록시 연결 오류가 발생했습니다. 프록시 설정(URL, 포트, 인증 정보)을 확인해주세요.';
  }

  // 연결 에러
  if (isConnectionError(error)) {
    if (error.message.toLowerCase().includes('enotfound')) {
      return '서버 주소를 찾을 수 없습니다. URL이 올바른지 확인해주세요.';
    }
    return '서버에 연결할 수 없습니다. 서버가 실행 중인지, URL이 올바른지 확인해주세요.';
  }

  // 네트워크 에러
  if (isNetworkError(error)) {
    if (
      error.message.toLowerCase().includes('timeout') ||
      error.message.toLowerCase().includes('etimedout')
    ) {
      return '요청 시간이 초과되었습니다. 네트워크 연결 상태를 확인하거나 잠시 후 다시 시도해주세요.';
    }
    return '네트워크 오류가 발생했습니다. 인터넷 연결 상태를 확인해주세요.';
  }

  // 타임아웃 에러
  if (isAbortError(error)) {
    return '요청이 취소되었습니다.';
  }

  // 기본 에러 메시지
  return context ? `${context}: ${error.message}` : error.message;
}

/**
 * LLM 통신 에러에 대한 상세 메시지 생성
 */
export function getLLMErrorMessage(error: unknown, provider?: string): string {
  const baseMessage = getFriendlyErrorMessage(error);

  // HttpError인 경우 이미 상세한 메시지가 포함됨
  const httpErrorMessage = getHttpErrorUserMessage(error);
  if (httpErrorMessage) {
    return provider ? `[${provider}] ${httpErrorMessage}` : httpErrorMessage;
  }

  // 에러 메시지에서 HTTP 상태 코드 추출
  const errorMessage = getErrorMessage(error);
  const statusMatch = errorMessage.match(/(\d{3})/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1]);
    const httpMessage = getHTTPErrorMessage(status, errorMessage);
    return provider ? `[${provider}] ${httpMessage}` : httpMessage;
  }

  return provider ? `[${provider}] ${baseMessage}` : baseMessage;
}
