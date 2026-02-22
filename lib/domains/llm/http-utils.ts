/**
 * LLM HTTP 요청을 위한 유틸리티
 *
 * 이 모듈은 하위 호환성을 위해 유지됩니다.
 * 새 코드에서는 @/lib/http 모듈의 httpFetch를 직접 사용하세요.
 */

import { LLMConfig } from '@/types';
import { httpFetch, VISION_TIMEOUT } from '@/lib/http';

/**
 * LLM 설정에서 fetch 옵션 생성
 */
export function createFetchOptions(config: LLMConfig, baseOptions: RequestInit = {}): RequestInit {
  const options: RequestInit = { ...baseOptions };

  // Headers 설정
  if (!options.headers) {
    options.headers = {};
  }

  const headers = options.headers as Record<string, string>;

  // 커스텀 헤더 추가 (LLM API 전용)
  if (config.customHeaders) {
    Object.entries(config.customHeaders).forEach(([key, value]) => {
      headers[key] = value;
    });
  }

  options.headers = headers;

  return options;
}

/**
 * Node.js 환경에서 프록시 및 SSL 설정을 포함한 fetch 함수
 * 브라우저 환경에서는 일반 fetch 사용
 *
 * @param url - 요청 URL
 * @param config - LLM 설정 (network 설정 포함)
 * @param options - fetch 옵션
 * @param timeout - Timeout in milliseconds (default: 5 minutes for vision models)
 *
 * @deprecated 새 코드에서는 @/lib/http의 httpFetch 사용 권장
 */
export async function fetchWithConfig(
  url: string,
  config: LLMConfig,
  options: RequestInit = {},
  timeout: number = VISION_TIMEOUT
): Promise<Response> {
  // LLM 설정에서 헤더 생성
  const fetchOptions = createFetchOptions(config, options);

  // lib/http의 httpFetch 사용
  return httpFetch(url, {
    ...fetchOptions,
    timeout,
    networkConfig: config.network,
  });
}

/**
 * 설정에서 Authorization 헤더 생성
 */
export function createAuthHeader(provider: string, apiKey: string): Record<string, string> {
  if (provider === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  // Ollama는 API 키가 필요 없으므로 빈 헤더 반환
  if (provider === 'ollama') {
    return {};
  }

  // API Key가 없으면 Authorization 헤더를 추가하지 않음
  // (Ollama OpenAI 호환 API 등 인증이 필요 없는 경우)
  if (!apiKey || apiKey.trim() === '') {
    return {};
  }

  return {
    Authorization: `Bearer ${apiKey}`,
  };
}
