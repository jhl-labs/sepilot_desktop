import { MCPClient } from '../client';
import { JSONRPCRequest, JSONRPCResponse } from '../types';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EventSource } = require('eventsource');

// EventSource 인터페이스 정의
interface IEventSource {
  onmessage: ((event: any) => void) | null;
  onopen: (() => void) | null;
  onerror: ((error: any) => void) | null;
  close(): void;
}

/**
 * SSE (Server-Sent Events) MCP Client
 *
 * HTTP 기반 MCP 서버와 SSE를 통해 통신합니다.
 * Main Process에서 동작합니다 (Node.js EventSource 사용).
 */
export class SSEMCPClient extends MCPClient {
  private eventSource: IEventSource | null = null;
  private sessionId: string | null = null;
  private pendingRequests: Map<
    string | number,
    { resolve: (value: JSONRPCResponse) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }
  > = new Map();

  async connect(): Promise<void> {
    if (!this.config.url) {
      throw new Error('SSE transport requires url');
    }

    return new Promise((resolve, reject) => {
      try {
        // SSE 연결 시작
        const url = new URL(this.config.url!);

        // Node.js eventsource는 커스텀 헤더를 지원합니다
        // 선택적으로 세션 초기화 가능 (stateful 서버용)
        this.initializeSession()
          .then(() => {
            // 세션 ID를 URL에 포함
            if (this.sessionId) {
              url.searchParams.set('session', this.sessionId);
            }

            // 헤더 디버깅
            console.log('[SSE MCP] Connecting with headers:', JSON.stringify(this.config.headers, null, 2));
            console.log('[SSE MCP] URL:', url.toString());

            const eventSource = new EventSource(url.toString(), {
              headers: this.config.headers || {},
            });
            this.eventSource = eventSource;

            // 메시지 수신
            eventSource.onmessage = (event: MessageEvent) => {
              this.handleMessage(event.data);
            };

            // 연결 성공
            eventSource.onopen = () => {
              console.log(`[SSE MCP] Connected to ${this.config.name}`);
              this.isConnected = true;
              resolve();
            };

            // 에러 처리
            eventSource.onerror = (error: Event) => {
              console.error(`[SSE MCP] Connection error for ${this.config.name}:`, error);
              if (!this.isConnected) {
                reject(new Error('Failed to connect to SSE endpoint'));
              } else {
                // 연결 중 에러 발생 시 재연결 시도
                this.isConnected = false;
              }
            };
          })
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // 모든 대기 중인 요청 취소
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    this.isConnected = false;
    this.sessionId = null;
  }

  async sendRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    if (!this.config.url) {
      throw new Error('SSE transport requires url');
    }

    return new Promise((resolve, reject) => {
      const id = request.id || this.getNextId();
      const requestWithId = { ...request, id };

      // 타임아웃 설정 (30초)
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${request.method}`));
      }, 30000);

      // 요청 등록
      this.pendingRequests.set(id, { resolve, reject, timeout });

      // HTTP POST로 요청 전송
      this.sendHTTPRequest(requestWithId)
        .catch((error) => {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(error);
        });
    });
  }

  /**
   * 세션 초기화 (선택사항)
   */
  private async initializeSession(): Promise<void> {
    if (!this.config.url) {
      return;
    }

    try {
      // POST /session endpoint로 세션 생성 (표준은 아니지만 일부 서버에서 사용)
      const sessionUrl = new URL('/session', this.config.url);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.config.headers,
      };

      console.log('[SSE MCP] initializeSession headers:', JSON.stringify(headers, null, 2));
      console.log('[SSE MCP] Session URL:', sessionUrl.toString());

      const response = await fetch(sessionUrl.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientInfo: {
            name: 'sepilot-desktop',
            version: '0.1.0',
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        this.sessionId = data.sessionId;
        console.log(`[SSE MCP] Session created: ${this.sessionId}`);
      } else {
        console.warn(`[SSE MCP] Session creation failed (${response.status}), continuing without session`);
      }
    } catch (error) {
      // 세션 생성 실패는 치명적이지 않음 (일부 서버는 세션이 필요 없음)
      console.warn('[SSE MCP] Session initialization failed:', error);
    }
  }

  /**
   * HTTP POST로 JSON-RPC 요청 전송
   */
  private async sendHTTPRequest(request: JSONRPCRequest): Promise<void> {
    if (!this.config.url) {
      throw new Error('SSE transport requires url');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    // 세션 ID가 있으면 헤더에 포함
    if (this.sessionId) {
      headers['X-Session-ID'] = this.sessionId;
    }

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    // SSE를 통해 응답이 오므로 여기서는 완료
    // (일부 구현은 POST 응답으로 직접 결과를 반환할 수도 있음)
    if (response.headers.get('content-type')?.includes('application/json')) {
      const data = await response.json();
      // 즉시 응답인 경우 처리
      if (data.id !== undefined) {
        this.handleMessage(JSON.stringify(data));
      }
    }
  }

  /**
   * SSE 메시지 처리
   */
  private handleMessage(data: string): void {
    try {
      const response: JSONRPCResponse = JSON.parse(data);

      if (response.id === undefined) {
        // 알림 메시지 (응답이 아님)
        console.log('[SSE MCP] Notification:', response);
        return;
      }

      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);
        pending.resolve(response);
      } else {
        console.warn('[SSE MCP] Received response for unknown request:', response.id);
      }
    } catch (error) {
      console.error('[SSE MCP] Failed to parse message:', error, data);
    }
  }
}
