import { MCPClient } from '../client';
import { JSONRPCRequest, JSONRPCResponse } from '../types';

/**
 * Stdio MCP Client
 *
 * 이 클라이언트는 Electron Main Process에서만 동작합니다.
 * Renderer Process에서는 IPC를 통해 Main Process에 요청합니다.
 */
export class StdioMCPClient extends MCPClient {
  private process: any = null; // ChildProcess
  private pendingRequests: Map<
    string | number,
    { resolve: (value: JSONRPCResponse) => void; reject: (error: Error) => void }
  > = new Map();
  private buffer = '';

  async connect(): Promise<void> {
    // Main Process 전용 메서드로 리다이렉트
    // spawn은 여기서 직접 import할 수 없으므로 connectInMainProcess를 직접 호출해야 함
    throw new Error('StdioMCPClient.connect() must use connectInMainProcess() with spawn parameter');
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.isConnected = false;
    }
  }

  async sendRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    // Main Process에서 실행 중이면 실제 메서드로 전달
    return this.sendRequestInMainProcess(request);
  }

  /**
   * Main Process용 - 실제 프로세스 생성 및 통신
   */
  async connectInMainProcess(spawn: any): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const command = this.config.command;
        const args = this.config.args || [];

        // Windows에서는 shell: true를 사용하여 .cmd 파일을 올바르게 실행
        const isWindows = process.platform === 'win32';

        // 프로세스 생성
        this.process = spawn(command, args, {
          env: {
            ...process.env,
            ...this.config.env,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: isWindows, // Windows에서는 shell을 사용
        });

        // stdout 처리
        this.process.stdout.on('data', (data: Buffer) => {
          this.handleStdout(data);
        });

        // stderr 처리
        this.process.stderr.on('data', (data: Buffer) => {
          console.error(`MCP Server [${this.config.name}] stderr:`, data.toString());
        });

        // 프로세스 종료
        this.process.on('exit', (code: number) => {
          console.log(`MCP Server [${this.config.name}] exited with code ${code}`);
          this.isConnected = false;
        });

        // 프로세스 에러
        this.process.on('error', (error: Error) => {
          console.error(`MCP Server [${this.config.name}] error:`, error);
          reject(error);
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Main Process용 - 실제 요청 전송
   */
  async sendRequestInMainProcess(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('MCP Server not connected'));
        return;
      }

      const id = request.id || this.getNextId();
      const requestWithId = { ...request, id };

      // 응답 대기
      this.pendingRequests.set(id, { resolve, reject });

      // 요청 전송
      const message = `${JSON.stringify(requestWithId)  }\n`;
      this.process.stdin.write(message);

      // 타임아웃 설정 (30초)
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * stdout 데이터 처리
   */
  private handleStdout(data: Buffer): void {
    this.buffer += data.toString();

    // 줄바꿈으로 메시지 분리
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response: JSONRPCResponse = JSON.parse(line);
          this.handleResponse(response);
        } catch (error) {
          console.error('Failed to parse MCP response:', line, error);
        }
      }
    }
  }

  /**
   * 응답 처리
   */
  private handleResponse(response: JSONRPCResponse): void {
    if (response.id !== undefined) {
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);
        pending.resolve(response);
      }
    } else {
      // 알림 메시지 (id 없음)
      console.log('MCP notification:', response);
    }
  }
}
