'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.StdioMCPClient = void 0;
const client_1 = require('../client');
/**
 * Stdio MCP Client
 *
 * 이 클라이언트는 Electron Main Process에서만 동작합니다.
 * Renderer Process에서는 IPC를 통해 Main Process에 요청합니다.
 */
class StdioMCPClient extends client_1.MCPClient {
  constructor() {
    super(...arguments);
    this.process = null; // ChildProcess
    this.pendingRequests = new Map();
    this.buffer = '';
  }
  async connect() {
    // 이 메서드는 Electron Main Process에서 호출됩니다
    // Renderer에서는 IPC를 통해 요청합니다
    throw new Error('StdioMCPClient.connect() must be called from Electron Main Process');
  }
  async disconnect() {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.isConnected = false;
    }
  }
  async sendRequest(_request) {
    // 이 메서드는 Electron Main Process에서 호출됩니다
    // Renderer에서는 IPC를 통해 요청합니다
    throw new Error('StdioMCPClient.sendRequest() must be called from Electron Main Process');
  }
  /**
   * Main Process용 - 실제 프로세스 생성 및 통신
   */
  async connectInMainProcess(spawn) {
    return new Promise((resolve, reject) => {
      try {
        // 프로세스 생성
        this.process = spawn(this.config.command, this.config.args, {
          env: {
            ...process.env,
            ...this.config.env,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        // stdout 처리
        this.process.stdout.on('data', (data) => {
          this.handleStdout(data);
        });
        // stderr 처리
        this.process.stderr.on('data', (data) => {
          console.error(`MCP Server [${this.config.name}] stderr:`, data.toString());
        });
        // 프로세스 종료
        this.process.on('exit', (code) => {
          console.log(`MCP Server [${this.config.name}] exited with code ${code}`);
          this.isConnected = false;
        });
        // 프로세스 에러
        this.process.on('error', (error) => {
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
  async sendRequestInMainProcess(request) {
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
      const message = `${JSON.stringify(requestWithId)}\n`;
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
  handleStdout(data) {
    this.buffer += data.toString();
    // 줄바꿈으로 메시지 분리
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
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
  handleResponse(response) {
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
exports.StdioMCPClient = StdioMCPClient;
//# sourceMappingURL=stdio.js.map
