/**
 * HTTP 통신 중앙 집중화 모듈
 *
 * 모든 HTTP/HTTPS 통신을 단일 진입점으로 관리
 * NetworkConfig(프록시, SSL, 커스텀 헤더)가 자동 적용됨
 *
 * @example
 * // 기본 HTTP 요청
 * import { httpFetch } from '@/lib/http';
 * const response = await httpFetch('https://api.example.com/data');
 *
 * @example
 * // WebSocket 연결
 * import { createWebSocket } from '@/lib/http';
 * const ws = await createWebSocket('wss://api.example.com/ws');
 *
 * @example
 * // SSE 연결
 * import { createEventSource } from '@/lib/http';
 * const es = await createEventSource('https://api.example.com/events');
 *
 * @example
 * // Node.js HTTP 요청
 * import { httpsRequest, httpsGet } from '@/lib/http';
 * const response = await httpsGet('https://api.example.com/data');
 */

// Types
export type {
  HttpRequestOptions,
  WebSocketOptions,
  SSEOptions,
  NodeHttpOptions,
  NodeHttpResponse,
  HttpClientConfig,
  Environment,
} from './types';

// Config
export {
  getNetworkConfig,
  setNetworkConfig,
  clearNetworkConfigCache,
  detectEnvironment,
  isElectron,
  createDefaultNetworkConfig,
} from './config';

// Agent Factory
export { createHttpAgent, createOctokitAgent } from './agent-factory';
export type { HttpAgentType } from './agent-factory';

// Fetch
export {
  httpFetch,
  httpFetchJson,
  httpPost,
  httpPostJson,
  httpFetchStream,
  fetchWithNetworkConfig,
  VISION_TIMEOUT,
} from './fetch';

// WebSocket
export { createWebSocket, wsToHttpUrl, httpToWsUrl } from './websocket';
export type { WebSocketType } from './websocket';

// SSE (Server-Sent Events)
export { createEventSource, connectSSE } from './sse';
export type { EventSourceType } from './sse';

// Node.js HTTP
export { httpsRequest, httpsGet, httpsPost, httpsGetJson, downloadImage } from './node-http';
