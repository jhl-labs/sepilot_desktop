/**
 * LLM HTTP 요청을 위한 유틸리티
 * 프록시, SSL 검증, 커스텀 헤더를 지원
 */

import { LLMConfig } from '@/types';

/**
 * LLM 설정에서 fetch 옵션 생성
 */
export function createFetchOptions(
  config: LLMConfig,
  baseOptions: RequestInit = {}
): RequestInit {
  const options: RequestInit = { ...baseOptions };

  // Headers 설정
  if (!options.headers) {
    options.headers = {};
  }

  const headers = options.headers as Record<string, string>;

  // 커스텀 헤더 추가
  if (config.network?.customHeaders) {
    Object.entries(config.network.customHeaders).forEach(([key, value]) => {
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
 * @param timeout - Timeout in milliseconds (default: 5 minutes for vision models)
 */
export async function fetchWithConfig(
  url: string,
  config: LLMConfig,
  options: RequestInit = {},
  timeout: number = 300000 // 5 minutes default for vision models
): Promise<Response> {
  // 브라우저 환경
  if (typeof window !== 'undefined') {
    const fetchOptions = createFetchOptions(config, options);

    // Add timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  // Node.js/Electron 환경
  // 동적 import로 https-proxy-agent와 node:https 로드
  try {
    const fetchOptions = createFetchOptions(config, options);

    // 프록시 설정
    if (config.network?.proxy?.enabled && config.network.proxy.mode !== 'none') {
      if (config.network.proxy.mode === 'manual' && config.network.proxy.url) {
        // 동적 import로 https-proxy-agent 사용
        try {
          const { HttpsProxyAgent } = await import('https-proxy-agent' as any);
          const agent = new (HttpsProxyAgent as any)(config.network.proxy.url, {
            rejectUnauthorized: config.network.ssl?.verify ?? true,
          });
          (fetchOptions as any).agent = agent;
        } catch (error) {
          console.warn('https-proxy-agent not available, using default fetch');
        }
      } else if (config.network.proxy.mode === 'system') {
        // 시스템 프록시는 환경변수 HTTP_PROXY, HTTPS_PROXY 사용
        // Node.js fetch는 자동으로 환경변수를 읽음
        console.log('Using system proxy from environment variables');
      }
    }

    // SSL 검증 비활성화 (Node.js only)
    if (config.network?.ssl?.verify === false && typeof window === 'undefined') {
      // @ts-ignore - Node.js specific option
      if (!fetchOptions.agent) {
        try {
          const https = await import('node:https');
          const agent = new https.Agent({
            rejectUnauthorized: false,
          });
          (fetchOptions as any).agent = agent;
        } catch (error) {
          console.warn('Could not create custom HTTPS agent');
        }
      }
    }

    // Add timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  } catch (error) {
    console.error('Error creating fetch with config:', error);

    // Fallback to basic fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...createFetchOptions(config, options),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw fetchError;
    }
  }
}

/**
 * 설정에서 Authorization 헤더 생성
 */
export function createAuthHeader(
  provider: string,
  apiKey: string
): Record<string, string> {
  if (provider === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  return {
    Authorization: `Bearer ${apiKey}`,
  };
}
