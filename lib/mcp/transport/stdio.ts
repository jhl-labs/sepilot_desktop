import type { ChildProcessWithoutNullStreams, SpawnOptionsWithStdioTuple } from 'child_process';

import { getErrorMessage } from '@/lib/utils/error-handler';

import { MCPClient } from '../client';
import { JSONRPCRequest, JSONRPCResponse } from '../types';

import { logger } from '@/lib/utils/logger';
type SpawnFunction = (
  command: string,
  args?: readonly string[],
  options?: SpawnOptionsWithStdioTuple<'pipe', 'pipe', 'pipe'>
) => ChildProcessWithoutNullStreams;

/**
 * Stdio MCP Client
 *
 * 이 클라이언트는 Electron Main Process에서만 동작합니다.
 * Renderer Process에서는 IPC를 통해 Main Process에 요청합니다.
 */
export class StdioMCPClient extends MCPClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private pendingRequests: Map<
    string | number,
    {
      resolve: (value: JSONRPCResponse) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();
  private buffer = '';

  async connect(): Promise<void> {
    // Main Process 전용 메서드로 리다이렉트
    // spawn은 여기서 직접 import할 수 없으므로 connectInMainProcess를 직접 호출해야 함
    throw new Error(
      'StdioMCPClient.connect() must use connectInMainProcess() with spawn parameter'
    );
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.isConnected = false;
    }

    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  async sendRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    // Main Process에서 실행 중이면 실제 메서드로 전달
    return this.sendRequestInMainProcess(request);
  }

  /**
   * Main Process용 - 실제 프로세스 생성 및 통신
   */
  async connectInMainProcess(spawn: SpawnFunction): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const command = this.config.command;
        if (!command) {
          throw new Error('Command is required for stdio transport');
        }
        const args = this.config.args || [];

        logger.info('Starting MCP server process', {
          server: this.config.name,
          command,
          args,
          platform: process.platform,
        });

        // Windows에서는 shell: true를 사용하여 .cmd 파일을 올바르게 실행
        const isWindows = process.platform === 'win32';

        // 연결 타임아웃 (30초)
        const connectionTimeout = setTimeout(() => {
          if (this.process) {
            this.process.kill();
            this.process = null;
          }
          reject(
            new Error(
              `Connection timeout: MCP server '${this.config.name}' did not respond within 30 seconds. ` +
                `Please check if the command is correct and the server is properly configured.`
            )
          );
        }, 30000);

        let processStarted = false;
        let connectionResolved = false;

        // 프로세스 생성
        try {
          this.process = spawn(command, args, {
            env: {
              ...process.env,
              PYTHONUNBUFFERED: '1', // Python 버퍼링 비활성화 (블로킹 방지)
              ...this.config.env, // 사용자 설정이 우선
            },
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: isWindows, // Windows에서는 shell을 사용
          });
        } catch (spawnError: any) {
          clearTimeout(connectionTimeout);
          logger.error('Failed to spawn MCP server process', {
            server: this.config.name,
            error: spawnError.message,
          });
          reject(
            new Error(
              `Failed to start MCP server process: ${spawnError.message}. ` +
                `Please verify the command path and arguments are correct.`
            )
          );
          return;
        }

        // stdout 처리 - 첫 데이터 수신 시 연결 성공으로 간주
        this.process.stdout.on('data', (data: Buffer) => {
          if (!processStarted) {
            processStarted = true;
            logger.info('MCP server process started successfully', {
              server: this.config.name,
            });
          }

          // 첫 stdout 데이터 수신 시 연결 성공
          if (!connectionResolved) {
            connectionResolved = true;
            clearTimeout(connectionTimeout);
            this.isConnected = true;
            logger.info('MCP server connection established (first stdout received)', {
              server: this.config.name,
            });
            resolve();
          }

          this.handleStdout(data);
        });

        // stderr 처리
        this.process.stderr.on('data', (data: Buffer) => {
          const output = data.toString();
          logger.error('MCP server stderr', {
            server: this.config.name,
            output,
          });
        });

        // 프로세스 종료
        this.process.on('exit', (code: number | null, signal: string | null) => {
          logger.warn('MCP server exited', {
            server: this.config.name,
            code,
            signal,
          });
          this.isConnected = false;

          // 프로세스가 시작되지 않고 종료된 경우 (연결도 성공하지 않음)
          if (!connectionResolved) {
            connectionResolved = true;
            clearTimeout(connectionTimeout);
            reject(
              new Error(
                `MCP server process exited before sending data (code: ${code}). ` +
                  `This usually means the command or arguments are incorrect, or the server failed to start. ` +
                  `For Python servers, try using 'python -u' flag.`
              )
            );
          }
        });

        // 프로세스 에러
        this.process.on('error', (error: Error) => {
          if (!connectionResolved) {
            connectionResolved = true;
            clearTimeout(connectionTimeout);
            logger.error('MCP server process error', {
              server: this.config.name,
              error: error.message,
            });
            reject(
              new Error(
                `MCP server process error: ${error.message}. ` +
                  `Please check if the command exists and is executable.`
              )
            );
          }
        });
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
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout (30s)'));
        }
      }, 30000); // 30초 = 30000ms

      this.pendingRequests.set(id, { resolve, reject, timeout });

      // 요청 전송
      const message = `${JSON.stringify(requestWithId)}\n`;
      this.process.stdin.write(message);
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
          logger.error('Failed to parse MCP response', {
            line,
            error: getErrorMessage(error),
          });
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
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);
        pending.resolve(response);
      }
    } else {
      // 알림 메시지 (id 없음)
      logger.debug('MCP notification', response);
    }
  }
}
