/**
 * HTTP 통신 중앙 집중화 모듈 - 타입 정의
 *
 * 모든 HTTP/HTTPS 통신에 사용되는 공통 타입들
 */

import { NetworkConfig } from '@/types';

/**
 * HTTP 요청 옵션 (fetch RequestInit 확장)
 */
export interface HttpRequestOptions extends RequestInit {
  /** 타임아웃 (ms), 기본값: 120000 (2분) */
  timeout?: number;

  /** 재시도 횟수, 기본값: 0 */
  retries?: number;

  /** 재시도 간격 (ms), 기본값: 1000 */
  retryDelay?: number;

  /** 네트워크 설정 (주입 시 전역 설정보다 우선) */
  networkConfig?: NetworkConfig;
}

/**
 * WebSocket 옵션
 */
export interface WebSocketOptions {
  /** 네트워크 설정 */
  networkConfig?: NetworkConfig;

  /** WebSocket 프로토콜 */
  protocols?: string | string[];

  /** 커스텀 헤더 (Node.js 환경에서만 지원) */
  headers?: Record<string, string>;

  /** 연결 타임아웃 (ms) */
  timeout?: number;
}

/**
 * Server-Sent Events 옵션
 */
export interface SSEOptions {
  /** 네트워크 설정 */
  networkConfig?: NetworkConfig;

  /** 커스텀 헤더 (Node.js 환경에서만 지원) */
  headers?: Record<string, string>;

  /** 자격 증명 포함 여부 (브라우저) */
  withCredentials?: boolean;
}

/**
 * Node.js HTTP 요청 옵션
 */
export interface NodeHttpOptions {
  /** HTTP 메서드 */
  method?: string;

  /** HTTP 헤더 */
  headers?: Record<string, string>;

  /** 타임아웃 (ms) */
  timeout?: number;

  /** 네트워크 설정 */
  networkConfig?: NetworkConfig;

  /** 요청 본문 */
  body?: string | Buffer;
}

/**
 * Node.js HTTP 응답
 */
export interface NodeHttpResponse {
  /** HTTP 상태 코드 */
  statusCode?: number;

  /** 응답 헤더 */
  headers: Record<string, string | string[] | undefined>;

  /** 응답 본문 */
  body: Buffer;
}

/**
 * HTTP 클라이언트 설정
 */
export interface HttpClientConfig {
  /** 기본 URL */
  baseURL?: string;

  /** 기본 헤더 */
  defaultHeaders?: Record<string, string>;

  /** 기본 타임아웃 (ms) */
  defaultTimeout?: number;

  /** 네트워크 설정 */
  networkConfig?: NetworkConfig;
}

/**
 * 환경 타입
 */
export type Environment = 'electron-main' | 'electron-renderer' | 'browser' | 'node';
