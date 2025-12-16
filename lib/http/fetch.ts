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
      retryDelay
    );
    clearTimeout(timeoutId);
    return response;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    const err = error as Error & { name?: string };

    if (err.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms: ${url}`);
    }

    throw new Error(`HTTP request failed: ${err.message || error}`);
  }
}

/**
 * 재시도 로직이 포함된 fetch
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number,
  retryDelay: number
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      // 429 (Too Many Requests) 처리
      if (response.status === 429 && attempt < retries) {
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : retryDelay;
        logger.debug(`[HTTP Fetch] Rate limited, waiting ${waitTime}ms before retry`);
        await delay(waitTime);
        continue;
      }

      // 5xx 서버 에러에 대한 재시도
      if (response.status >= 500 && attempt < retries) {
        logger.debug(`[HTTP Fetch] Server error ${response.status}, retrying...`);
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

      if (attempt < retries) {
        const waitTime = retryDelay * Math.pow(2, attempt); // 지수 백오프
        logger.debug(`[HTTP Fetch] Request failed, retrying in ${waitTime}ms...`);
        await delay(waitTime);
      }
    }
  }

  throw lastError || new Error('Request failed after all retries');
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
