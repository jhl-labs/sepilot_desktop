/**
 * HTTP 통신 중앙 집중화 모듈 - WebSocket
 *
 * 프록시 지원 WebSocket 생성
 * - Node.js 환경: ws 패키지 + agent로 프록시 지원
 * - 브라우저 환경: 기본 WebSocket (시스템 프록시 의존)
 */

import { NetworkConfig } from '@/types';
import { WebSocketOptions } from './types';
import { getNetworkConfig, detectEnvironment } from './config';
import { createHttpAgent } from './agent-factory';
import { logger } from '@/lib/utils/logger';

/** WebSocket 타입 (Node.js ws 또는 브라우저 WebSocket) */
export type WebSocketType = WebSocket;

/**
 * 프록시 지원 WebSocket 생성
 *
 * @param url - WebSocket URL (ws:// 또는 wss://)
 * @param options - WebSocket 옵션
 * @returns WebSocket 인스턴스
 *
 * @example
 * const ws = await createWebSocket('wss://api.example.com/ws');
 * ws.onmessage = (event) => console.log(event.data);
 *
 * @example
 * // 커스텀 헤더와 타임아웃
 * const ws = await createWebSocket('wss://api.example.com/ws', {
 *   headers: { 'Authorization': 'Bearer token' },
 *   timeout: 30000,
 * });
 */
export async function createWebSocket(
  url: string,
  options: WebSocketOptions = {}
): Promise<WebSocketType> {
  const { networkConfig: injectedConfig, protocols, headers, timeout } = options;
  const networkConfig = injectedConfig ?? (await getNetworkConfig());
  const env = detectEnvironment();

  // Node.js 환경 (Electron Main)
  if (env === 'electron-main' || env === 'node') {
    return createNodeWebSocket(url, networkConfig, protocols, headers, timeout);
  }

  // 브라우저/Electron Renderer 환경
  // 프록시는 시스템 설정에 의존
  return createBrowserWebSocket(url, protocols, timeout);
}

/**
 * Node.js 환경에서 WebSocket 생성 (ws 패키지 사용)
 */
async function createNodeWebSocket(
  url: string,
  networkConfig: NetworkConfig | null,
  protocols?: string | string[],
  headers?: Record<string, string>,
  timeout?: number
): Promise<WebSocketType> {
  try {
    const WebSocketModule = await import('ws');
    const WebSocket = WebSocketModule.default || WebSocketModule;

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

    const wsOptions: any = {};

    if (agent) {
      wsOptions.agent = agent;
      logger.debug('[WebSocket] Using proxy agent');
    }

    if (Object.keys(mergedHeaders).length > 0) {
      wsOptions.headers = mergedHeaders;
    }

    // 타임아웃 설정
    if (timeout) {
      wsOptions.handshakeTimeout = timeout;
    }

    const ws = new WebSocket(url, protocols, wsOptions);

    // WebSocket 타입으로 반환 (Node.js ws는 브라우저 WebSocket과 호환)
    return ws as unknown as WebSocketType;
  } catch (error) {
    logger.warn('[WebSocket] Failed to create Node.js WebSocket, falling back:', error);
    // Fallback: 기본 WebSocket 시도 (Node.js 18+에서 지원)
    return new WebSocket(url, protocols);
  }
}

/**
 * 브라우저 환경에서 WebSocket 생성
 */
function createBrowserWebSocket(
  url: string,
  protocols?: string | string[],
  timeout?: number
): WebSocketType {
  const ws = new WebSocket(url, protocols);

  // 타임아웃 처리
  if (timeout) {
    const timeoutId = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        logger.warn('[WebSocket] Connection timeout, closing');
        ws.close();
      }
    }, timeout);

    const clearTimeoutOnConnect = () => {
      clearTimeout(timeoutId);
      ws.removeEventListener('open', clearTimeoutOnConnect);
      ws.removeEventListener('error', clearTimeoutOnConnect);
    };

    ws.addEventListener('open', clearTimeoutOnConnect);
    ws.addEventListener('error', clearTimeoutOnConnect);
  }

  return ws;
}

/**
 * WebSocket URL을 HTTP URL로 변환
 * (일부 API에서 HTTP 엔드포인트가 필요한 경우)
 *
 * @param wsUrl - WebSocket URL
 * @returns HTTP URL
 */
export function wsToHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
}

/**
 * HTTP URL을 WebSocket URL로 변환
 *
 * @param httpUrl - HTTP URL
 * @returns WebSocket URL
 */
export function httpToWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}
