/**
 * HTTP 통신 중앙 집중화 모듈 - Server-Sent Events
 *
 * 프록시 지원 EventSource 생성
 * - Node.js 환경: eventsource 패키지 + agent로 프록시 지원
 * - 브라우저 환경: 기본 EventSource (시스템 프록시 의존)
 */

import { NetworkConfig } from '@/types';
import { SSEOptions } from './types';
import { getNetworkConfig, detectEnvironment } from './config';
import { createHttpAgent } from './agent-factory';
import { logger } from '@/lib/utils/logger';

/** EventSource 타입 */
export type EventSourceType = EventSource;

/**
 * 프록시 지원 EventSource 생성
 *
 * @param url - SSE 엔드포인트 URL
 * @param options - SSE 옵션
 * @returns EventSource 인스턴스
 *
 * @example
 * const eventSource = await createEventSource('https://api.example.com/events');
 * eventSource.onmessage = (event) => console.log(event.data);
 *
 * @example
 * // 커스텀 헤더와 함께
 * const eventSource = await createEventSource('https://api.example.com/events', {
 *   headers: { 'Authorization': 'Bearer token' },
 * });
 */
export async function createEventSource(
  url: string,
  options: SSEOptions = {}
): Promise<EventSourceType> {
  const { networkConfig: injectedConfig, headers, withCredentials } = options;
  const networkConfig = injectedConfig ?? (await getNetworkConfig());
  const env = detectEnvironment();

  // Node.js 환경 (Electron Main)
  if (env === 'electron-main' || env === 'node') {
    return createNodeEventSource(url, networkConfig, headers);
  }

  // 브라우저/Electron Renderer 환경
  return createBrowserEventSource(url, withCredentials);
}

/**
 * Node.js 환경에서 EventSource 생성 (eventsource 패키지 사용)
 */
async function createNodeEventSource(
  url: string,
  networkConfig: NetworkConfig | null,
  headers?: Record<string, string>
): Promise<EventSourceType> {
  try {
    const { EventSource } = await import('eventsource');

    const agent = await createHttpAgent(networkConfig, url);

    // 커스텀 헤더 병합
    const mergedHeaders: Record<string, string> = { ...headers };
    if (networkConfig?.customHeaders) {
      Object.entries(networkConfig.customHeaders).forEach(([key, value]) => {
        if (!(key in mergedHeaders)) {
          mergedHeaders[key] = value;
        }
      });
    }

    const eventSourceInit: any = {};

    if (Object.keys(mergedHeaders).length > 0) {
      eventSourceInit.headers = mergedHeaders;
    }

    // eventsource 패키지는 https 옵션으로 agent 전달
    if (agent) {
      eventSourceInit.https = { agent };
      logger.debug('[SSE] Using proxy agent');
    }

    const eventSource = new EventSource(url, eventSourceInit);

    // EventSource 타입으로 반환
    return eventSource as unknown as EventSourceType;
  } catch (error) {
    logger.warn('[SSE] Failed to create Node.js EventSource, falling back:', error);
    // Fallback: 브라우저 EventSource 시도 (Node.js 환경에서는 동작하지 않을 수 있음)
    throw new Error(`EventSource not available in Node.js environment: ${error}`);
  }
}

/**
 * 브라우저 환경에서 EventSource 생성
 */
function createBrowserEventSource(url: string, withCredentials?: boolean): EventSourceType {
  return new EventSource(url, { withCredentials });
}

/**
 * SSE 연결 래퍼 (자동 재연결 포함)
 *
 * @param url - SSE 엔드포인트 URL
 * @param options - SSE 옵션
 * @param onMessage - 메시지 핸들러
 * @param onError - 에러 핸들러
 * @returns 연결 해제 함수
 */
export async function connectSSE(
  url: string,
  options: SSEOptions = {},
  onMessage: (event: MessageEvent) => void,
  onError?: (error: Event) => void
): Promise<() => void> {
  const eventSource = await createEventSource(url, options);

  eventSource.onmessage = onMessage;

  eventSource.onerror = (error) => {
    logger.warn('[SSE] Connection error:', error);
    onError?.(error);
  };

  // 연결 해제 함수 반환
  return () => {
    logger.debug('[SSE] Closing connection');
    eventSource.close();
  };
}
