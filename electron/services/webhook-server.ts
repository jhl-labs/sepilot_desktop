/**
 * GitHub Webhook Server (Task #29)
 *
 * Node.js 내장 http 모듈을 사용하여 GitHub Webhook 이벤트를 수신하고
 * 프로젝트 변경 사항을 Renderer Process로 전파합니다.
 *
 * 참고: Express 대신 http 모듈 사용 - electron-builder 번들링 호환성 문제 해결
 */

import * as http from 'http';
import * as crypto from 'crypto';
import { BrowserWindow } from 'electron';

interface WebhookConfig {
  port: number;
  secret: string;
  isRunning: boolean;
}

class WebhookServer {
  private server: http.Server | null = null;
  private config: WebhookConfig;
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    this.config = {
      port: 3000,
      secret: '',
      isRunning: false,
    };
  }

  /**
   * HTTP 요청 처리
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const { method, url } = req;

    // CORS 헤더
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Health check
    if (method === 'GET' && url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      return;
    }

    // GitHub Webhook 수신
    if (method === 'POST' && url === '/webhook/github') {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const payload = JSON.parse(body);

          // HMAC 검증
          const signature = req.headers['x-hub-signature-256'] as string;
          if (!this.verifySignature(body, signature)) {
            console.error('[WebhookServer] Invalid signature');
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'Invalid signature' }));
            return;
          }

          // 이벤트 타입
          const event = req.headers['x-github-event'] as string;
          console.log(`[WebhookServer] Received ${event} event`);

          // 이벤트 처리
          this.handleWebhookEvent(event, payload);

          res.writeHead(200);
          res.end(JSON.stringify({ received: true }));
        } catch (error: any) {
          console.error('[WebhookServer] Error handling webhook:', error);
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }
      });

      return;
    }

    // 404 Not Found
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  /**
   * HMAC 서명 검증
   */
  private verifySignature(payload: string, signature: string): boolean {
    if (!this.config.secret || !signature) {
      return false;
    }

    const hmac = crypto.createHmac('sha256', this.config.secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  /**
   * Webhook 이벤트 처리
   */
  private handleWebhookEvent(event: string, payload: any): void {
    // Renderer Process로 이벤트 전파
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('github-webhook-event', {
        event,
        payload,
        timestamp: Date.now(),
      });
    }

    // 이벤트 타입별 처리
    switch (event) {
      case 'projects_v2_item':
        console.log('[WebhookServer] Project item event:', payload.action);
        break;
      case 'projects_v2':
        console.log('[WebhookServer] Project event:', payload.action);
        break;
      case 'push':
        console.log('[WebhookServer] Push event to:', payload.ref);
        break;
      case 'pull_request':
        console.log('[WebhookServer] PR event:', payload.action);
        break;
      default:
        console.log('[WebhookServer] Unhandled event:', event);
    }
  }

  /**
   * 서버 시작
   */
  public start(port: number, secret: string, mainWindow: BrowserWindow): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.config.isRunning) {
        reject(new Error('Server is already running'));
        return;
      }

      this.config.port = port;
      this.config.secret = secret;
      this.mainWindow = mainWindow;

      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.listen(port, () => {
        this.config.isRunning = true;
        console.log(`[WebhookServer] Listening on port ${port}`);
        resolve();
      });

      this.server.on('error', (error: any) => {
        console.error('[WebhookServer] Server error:', error);
        reject(error);
      });
    });
  }

  /**
   * 서버 중지
   */
  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config.isRunning || !this.server) {
        resolve();
        return;
      }

      this.server.close((error: any) => {
        if (error) {
          console.error('[WebhookServer] Error stopping server:', error);
          reject(error);
        } else {
          this.config.isRunning = false;
          this.mainWindow = null;
          console.log('[WebhookServer] Server stopped');
          resolve();
        }
      });
    });
  }

  /**
   * 서버 상태 확인
   */
  public getStatus(): { isRunning: boolean; port: number } {
    return {
      isRunning: this.config.isRunning,
      port: this.config.port,
    };
  }
}

// 싱글톤 인스턴스
export const webhookServer = new WebhookServer();
