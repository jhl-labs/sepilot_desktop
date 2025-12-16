/**
 * HTTP 통신 중앙 집중화 모듈 - Fetch
 *
 * NetworkConfig가 자동 적용되는 통합 fetch 함수
 * - 프록시 지원
 * - SSL 검증 설정
 * - 타임아웃
 * - 재시도 로직
 * - 커스텀 헤더
 */

import { NetworkConfig } from '@/types';
import { HttpRequestOptions } from './types';
import { createHttpAgent } from './agent-factory';
import { getNetworkConfig, detectEnvironment } from './config';
import { logger } from '@/lib/utils/logger';

/** 기본 타임아웃 (ms) - 2분 */
const DEFAULT_TIMEOUT = 120000;

/** Vision 모델용 긴 타임아웃 (ms) - 5분 */
export const VISION_TIMEOUT = 300000;

/**
 * HTTP 에러 타입
 */
export type HttpErrorType =
  | 'TIMEOUT'
  | 'SSL_ERROR'
  | 'PROXY_ERROR'
  | 'CONNECTION_REFUSED'
  | 'DNS_ERROR'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'CLIENT_ERROR'
  | 'UNKNOWN';

/**
 * 상세 HTTP 에러 클래스
 */
export class HttpError extends Error {
  public readonly type: HttpErrorType;
  public readonly url: string;
  public readonly statusCode?: number;
  public readonly originalError?: Error;
  public readonly details?: string;

  constructor(options: {
    type: HttpErrorType;
    message: string;
    url: string;
    statusCode?: number;
    originalError?: Error;
    details?: string;
  }) {
    super(options.message);
    this.name = 'HttpError';
    this.type = options.type;
    this.url = options.url;
    this.statusCode = options.statusCode;
    this.originalError = options.originalError;
    this.details = options.details;
  }

  /**
   * 사용자 친화적 메시지 반환
   */
  getUserMessage(): string {
    switch (this.type) {
      case 'TIMEOUT':
        return '요청 시간이 초과되었습니다. 네트워크 연결 상태를 확인하거나 잠시 후 다시 시도해주세요.';
      case 'SSL_ERROR':
        return `SSL/TLS 인증서 오류가 발생했습니다. ${this.details || '서버 인증서를 확인하거나 네트워크 설정에서 SSL 검증을 비활성화해주세요.'}`;
      case 'PROXY_ERROR':
        return `프록시 연결 오류가 발생했습니다. ${this.details || '프록시 설정(URL, 포트, 인증 정보)을 확인해주세요.'}`;
      case 'CONNECTION_REFUSED':
        return `서버에 연결할 수 없습니다. ${this.details || '서버 URL이 올바른지, 서버가 실행 중인지 확인해주세요.'}`;
      case 'DNS_ERROR':
        return `서버 주소를 찾을 수 없습니다. ${this.details || 'URL이 올바른지 확인하고 네트워크 연결 상태를 확인해주세요.'}`;
      case 'NETWORK_ERROR':
        return `네트워크 오류가 발생했습니다. ${this.details || '인터넷 연결 상태를 확인해주세요.'}`;
      case 'SERVER_ERROR':
        return `서버 오류가 발생했습니다 (${this.statusCode}). ${this.details || '잠시 후 다시 시도해주세요.'}`;
      case 'CLIENT_ERROR':
        return this.details || `요청 오류가 발생했습니다 (${this.statusCode}).`;
      default:
        return this.details || this.message;
    }
  }

  /**
   * 디버그용 상세 정보 반환
   */
  getDebugInfo(): string {
    const parts = [
      `Type: ${this.type}`,
      `URL: ${this.url}`,
      this.statusCode ? `Status: ${this.statusCode}` : null,
      `Message: ${this.message}`,
      this.details ? `Details: ${this.details}` : null,
      this.originalError ? `Original: ${this.originalError.message}` : null,
    ].filter(Boolean);
    return parts.join(' | ');
  }
}

/**
 * 에러 메시지를 분석하여 에러 타입 결정
 */
function classifyError(error: Error, url: string): HttpError {
  const message = error.message.toLowerCase();

  // SSL/TLS 에러
  if (
    message.includes('ssl') ||
    message.includes('tls') ||
    message.includes('certificate') ||
    message.includes('cert') ||
    message.includes('unable to verify') ||
    message.includes('self signed') ||
    message.includes('self-signed') ||
    message.includes('depth zero self signed') ||
    message.includes('unable to get local issuer') ||
    message.includes('cert_has_expired') ||
    message.includes('hostname/ip does not match')
  ) {
    return new HttpError({
      type: 'SSL_ERROR',
      message: error.message,
      url,
      originalError: error,
      details: extractSslErrorDetails(message),
    });
  }

  // 프록시 에러
  if (
    message.includes('proxy') ||
    message.includes('tunnel') ||
    message.includes('407') || // Proxy Authentication Required
    message.includes('proxy authentication') ||
    message.includes('connect tunnel') ||
    message.includes('eproto') // Protocol error (often proxy-related)
  ) {
    return new HttpError({
      type: 'PROXY_ERROR',
      message: error.message,
      url,
      originalError: error,
      details: extractProxyErrorDetails(message),
    });
  }

  // 연결 거부
  if (
    message.includes('econnrefused') ||
    message.includes('connection refused') ||
    message.includes('econnreset') ||
    message.includes('connection reset')
  ) {
    return new HttpError({
      type: 'CONNECTION_REFUSED',
      message: error.message,
      url,
      originalError: error,
      details: '서버가 연결을 거부했습니다. 서버가 실행 중인지 확인해주세요.',
    });
  }

  // DNS 에러
  if (
    message.includes('getaddrinfo') ||
    message.includes('enotfound') ||
    message.includes('dns') ||
    message.includes('name or service not known')
  ) {
    return new HttpError({
      type: 'DNS_ERROR',
      message: error.message,
      url,
      originalError: error,
      details: '도메인 이름을 확인할 수 없습니다. URL이 올바른지 확인해주세요.',
    });
  }

  // 타임아웃
  if (
    message.includes('timeout') ||
    message.includes('etimedout') ||
    message.includes('esockettimedout') ||
    message.includes('timed out')
  ) {
    return new HttpError({
      type: 'TIMEOUT',
      message: error.message,
      url,
      originalError: error,
    });
  }

  // 기타 네트워크 에러
  if (
    message.includes('network') ||
    message.includes('socket') ||
    message.includes('epipe') ||
    message.includes('econnaborted') ||
    message.includes('ehostunreach')
  ) {
    return new HttpError({
      type: 'NETWORK_ERROR',
      message: error.message,
      url,
      originalError: error,
    });
  }

  // 알 수 없는 에러
  return new HttpError({
    type: 'UNKNOWN',
    message: error.message,
    url,
    originalError: error,
  });
}

/**
 * SSL 에러 상세 정보 추출
 */
function extractSslErrorDetails(message: string): string {
  if (message.includes('self signed') || message.includes('self-signed')) {
    return '자체 서명된 인증서입니다. 네트워크 설정에서 SSL 검증을 비활성화하거나 인증서를 신뢰 목록에 추가해주세요.';
  }
  if (message.includes('expired') || message.includes('cert_has_expired')) {
    return '인증서가 만료되었습니다. 서버 관리자에게 문의하거나 SSL 검증을 비활성화해주세요.';
  }
  if (message.includes('unable to get local issuer')) {
    return '인증서 발급자를 확인할 수 없습니다. 중간 인증서가 누락되었을 수 있습니다.';
  }
  if (message.includes('hostname/ip does not match')) {
    return '인증서의 호스트명이 일치하지 않습니다. URL이 올바른지 확인해주세요.';
  }
  return '인증서 검증에 실패했습니다. 네트워크 설정에서 SSL 검증을 비활성화해주세요.';
}

/**
 * 프록시 에러 상세 정보 추출
 */
function extractProxyErrorDetails(message: string): string {
  if (message.includes('407') || message.includes('proxy authentication')) {
    return '프록시 인증이 필요합니다. 프록시 설정에서 사용자명과 비밀번호를 확인해주세요.';
  }
  if (message.includes('tunnel')) {
    return '프록시 터널 연결에 실패했습니다. 프록시 서버 설정을 확인해주세요.';
  }
  return '프록시 서버에 연결할 수 없습니다. 프록시 URL과 포트를 확인해주세요.';
}

/**
 * NetworkConfig가 자동 적용되는 통합 fetch 함수
 *
 * @param url - 요청 URL
 * @param options - 요청 옵션 (fetch 옵션 + 확장)
 * @returns Response
 *
 * @example
 * // 기본 사용
 * const response = await httpFetch('https://api.example.com/data');
 *
 * @example
 * // 옵션과 함께 사용
 * const response = await httpFetch('https://api.example.com/data', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ key: 'value' }),
 *   timeout: 30000,
 *   retries: 3,
 * });
 *
 * @example
 * // NetworkConfig 주입
 * const response = await httpFetch('https://api.example.com/data', {
 *   networkConfig: myNetworkConfig,
 * });
 */
export async function httpFetch(url: string, options: HttpRequestOptions = {}): Promise<Response> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = 0,
    retryDelay = 1000,
    networkConfig: injectedConfig,
    ...fetchOptions
  } = options;

  // NetworkConfig 결정: 주입된 값 > 전역 설정
  const networkConfig = injectedConfig ?? (await getNetworkConfig());

  // 헤더 병합
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };

  // 전역 커스텀 헤더 적용
  if (networkConfig?.customHeaders) {
    Object.entries(networkConfig.customHeaders).forEach(([key, value]) => {
      // 기존 헤더가 없는 경우에만 추가 (요청별 헤더 우선)
      if (!(key in headers)) {
        headers[key] = value;
      }
    });
  }

  fetchOptions.headers = headers;

  // HTTP Agent 생성 (프록시/SSL) - Node.js/Electron Main에서만 적용
  const env = detectEnvironment();
  if (env === 'electron-main' || env === 'node') {
    const agent = await createHttpAgent(networkConfig, url);
    if (agent) {
      (fetchOptions as any).agent = agent;
    }
  }

  // AbortController로 타임아웃 처리
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetchWithRetry(
      url,
      { ...fetchOptions, signal: controller.signal },
      retries,
      retryDelay,
      networkConfig
    );
    clearTimeout(timeoutId);
    return response;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    const err = error as Error & { name?: string };

    // AbortError는 타임아웃으로 처리
    if (err.name === 'AbortError') {
      const httpError = new HttpError({
        type: 'TIMEOUT',
        message: `Request timeout after ${timeout}ms`,
        url,
        originalError: err,
      });
      logger.error('[HTTP Fetch] Request timeout', {
        url,
        timeout,
        debugInfo: httpError.getDebugInfo(),
      });
      throw httpError;
    }

    // 이미 HttpError인 경우 그대로 던지기
    if (err instanceof HttpError) {
      throw err;
    }

    // 일반 에러를 분류하여 HttpError로 변환
    const httpError = classifyError(err, url);
    logger.error('[HTTP Fetch] Request failed', {
      type: httpError.type,
      url,
      message: httpError.message,
      userMessage: httpError.getUserMessage(),
      debugInfo: httpError.getDebugInfo(),
    });
    throw httpError;
  }
}

/**
 * 재시도 로직이 포함된 fetch
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number,
  retryDelay: number,
  networkConfig: NetworkConfig | null | undefined
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      // 429 (Too Many Requests) 처리
      if (response.status === 429 && attempt < retries) {
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : retryDelay;
        logger.warn(`[HTTP Fetch] Rate limited (429), waiting ${waitTime}ms before retry`, {
          url,
          attempt: attempt + 1,
          maxRetries: retries,
        });
        await delay(waitTime);
        continue;
      }

      // 5xx 서버 에러에 대한 재시도
      if (response.status >= 500 && attempt < retries) {
        logger.warn(`[HTTP Fetch] Server error ${response.status}, retrying...`, {
          url,
          status: response.status,
          statusText: response.statusText,
          attempt: attempt + 1,
          maxRetries: retries,
        });
        await delay(retryDelay * Math.pow(2, attempt)); // 지수 백오프
        continue;
      }

      return response;
    } catch (error: unknown) {
      lastError = error as Error;

      // AbortError는 재시도하지 않음
      if ((error as Error & { name?: string }).name === 'AbortError') {
        throw error;
      }

      // 에러 분류하여 상세 로깅
      const httpError = classifyError(lastError, url);

      if (attempt < retries) {
        const waitTime = retryDelay * Math.pow(2, attempt); // 지수 백오프
        logger.warn(
          `[HTTP Fetch] Request failed (${httpError.type}), retrying in ${waitTime}ms...`,
          {
            url,
            errorType: httpError.type,
            message: httpError.message,
            attempt: attempt + 1,
            maxRetries: retries,
            proxyEnabled: networkConfig?.proxy?.enabled,
            proxyMode: networkConfig?.proxy?.mode,
            sslVerify: networkConfig?.ssl?.verify,
          }
        );
        await delay(waitTime);
      } else {
        // 마지막 시도에서 실패
        logger.error(`[HTTP Fetch] Request failed after ${retries + 1} attempts`, {
          url,
          errorType: httpError.type,
          message: httpError.message,
          userMessage: httpError.getUserMessage(),
          proxyEnabled: networkConfig?.proxy?.enabled,
          proxyMode: networkConfig?.proxy?.mode,
          proxyUrl: networkConfig?.proxy?.enabled ? networkConfig?.proxy?.url : undefined,
          sslVerify: networkConfig?.ssl?.verify,
        });
      }
    }
  }

  // 마지막 에러를 HttpError로 변환하여 던지기
  if (lastError) {
    const httpError = classifyError(lastError, url);
    throw httpError;
  }

  throw new HttpError({
    type: 'UNKNOWN',
    message: 'Request failed after all retries',
    url,
  });
}

/**
 * 딜레이 유틸리티
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * JSON 응답을 파싱하는 편의 함수
 *
 * @param url - 요청 URL
 * @param options - 요청 옵션
 * @returns 파싱된 JSON
 */
export async function httpFetchJson<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
  const response = await httpFetch(url, options);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * POST 요청 편의 함수
 *
 * @param url - 요청 URL
 * @param body - 요청 본문
 * @param options - 추가 옵션
 * @returns Response
 */
export async function httpPost(
  url: string,
  body: unknown,
  options: HttpRequestOptions = {}
): Promise<Response> {
  return httpFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
    body: JSON.stringify(body),
    ...options,
  });
}

/**
 * POST 요청 후 JSON 파싱 편의 함수
 *
 * @param url - 요청 URL
 * @param body - 요청 본문
 * @param options - 추가 옵션
 * @returns 파싱된 JSON
 */
export async function httpPostJson<T>(
  url: string,
  body: unknown,
  options: HttpRequestOptions = {}
): Promise<T> {
  const response = await httpPost(url, body, options);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * NetworkConfig를 사용하는 스트리밍 fetch
 * SSE(Server-Sent Events) 스트림 처리용
 *
 * @param url - 요청 URL
 * @param options - 요청 옵션
 * @returns Response (body를 스트림으로 읽을 수 있음)
 */
export async function httpFetchStream(
  url: string,
  options: HttpRequestOptions = {}
): Promise<Response> {
  // 스트리밍은 기본적으로 더 긴 타임아웃 사용
  const streamOptions: HttpRequestOptions = {
    timeout: VISION_TIMEOUT,
    ...options,
  };

  return httpFetch(url, streamOptions);
}

/**
 * 기존 LLM http-utils.ts와의 호환성을 위한 래퍼
 *
 * @deprecated httpFetch 사용 권장
 */
export async function fetchWithNetworkConfig(
  url: string,
  networkConfig: NetworkConfig | null | undefined,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> {
  return httpFetch(url, {
    ...options,
    timeout,
    networkConfig: networkConfig ?? undefined,
  });
}
