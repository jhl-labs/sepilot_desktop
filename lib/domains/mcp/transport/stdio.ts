import { StringDecoder } from 'string_decoder';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithStdioTuple } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { getErrorMessage } from '@/lib/utils/error-handler';

import { MCPClient } from '../client';
import { JSONRPCRequest, JSONRPCResponse, MCPServerConfig } from '../types';

import { logger } from '@/lib/utils/logger';

/**
 * Node.js 매니저(fnm, nvm, volta 등)의 경로를 탐색하여 PATH에 추가
 * Electron이 데스크톱 바로가기로 실행되면 터미널 환경의 PATH를 상속받지 못할 수 있음
 */
function resolveNodeManagerPaths(): string[] {
  const extraPaths: string[] = [];

  if (process.platform !== 'win32') {
    return extraPaths;
  }

  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (!home) {
    return extraPaths;
  }

  try {
    // fnm: multishell 디렉토리 탐색 (최신 것 사용)
    const fnmMultishells = path.join(process.env.LOCALAPPDATA || '', 'fnm_multishells');
    if (fs.existsSync(fnmMultishells)) {
      const shells = fs
        .readdirSync(fnmMultishells)
        .filter((d) => {
          try {
            return fs.statSync(path.join(fnmMultishells, d)).isDirectory();
          } catch {
            return false;
          }
        })
        .sort()
        .reverse(); // 최신 것 우선
      if (shells.length > 0) {
        const shellPath = path.join(fnmMultishells, shells[0]);
        extraPaths.push(shellPath);
        logger.debug('Found fnm multishell path', { path: shellPath });
      }
    }

    // fnm: 기본 설치 경로에서 default alias
    const fnmDir = path.join(process.env.LOCALAPPDATA || '', 'fnm');
    const fnmAliasDefault = path.join(fnmDir, 'aliases', 'default');
    if (fs.existsSync(fnmAliasDefault)) {
      try {
        const defaultVersion = fs.readFileSync(fnmAliasDefault, 'utf-8').trim();
        const fnmNodeDir = path.join(fnmDir, 'node-versions', defaultVersion, 'installation');
        if (fs.existsSync(fnmNodeDir)) {
          extraPaths.push(fnmNodeDir);
          logger.debug('Found fnm default node path', { path: fnmNodeDir });
        }
      } catch {
        /* ignore */
      }
    }

    // nvm-windows: NVM_HOME 환경변수
    const nvmHome = process.env.NVM_HOME;
    if (nvmHome) {
      const nvmSymlink = process.env.NVM_SYMLINK;
      if (nvmSymlink && fs.existsSync(nvmSymlink)) {
        extraPaths.push(nvmSymlink);
      }
    }

    // Volta: VOLTA_HOME
    const voltaHome = process.env.VOLTA_HOME || path.join(home, '.volta');
    const voltaBin = path.join(voltaHome, 'bin');
    if (fs.existsSync(voltaBin)) {
      extraPaths.push(voltaBin);
    }

    // pnpm global bin
    const pnpmHome = process.env.PNPM_HOME || path.join(home, 'AppData', 'Local', 'pnpm');
    if (fs.existsSync(pnpmHome)) {
      extraPaths.push(pnpmHome);
    }

    // npm global prefix (standard Node.js install)
    const npmGlobal = path.join(home, 'AppData', 'Roaming', 'npm');
    if (fs.existsSync(npmGlobal)) {
      extraPaths.push(npmGlobal);
    }
  } catch (error) {
    logger.debug('Error resolving node manager paths', { error: getErrorMessage(error) });
  }

  return extraPaths;
}

// 캐시하여 매번 파일시스템 탐색 방지
let _cachedExtraPaths: string[] | null = null;
function getExtraNodePaths(): string[] {
  if (_cachedExtraPaths === null) {
    _cachedExtraPaths = resolveNodeManagerPaths();
  }
  return _cachedExtraPaths;
}
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
  // Use StringDecoder to correctly handle multi-byte characters split across chunks
  private decoder: StringDecoder;

  constructor(config: MCPServerConfig) {
    super(config);
    this.decoder = new StringDecoder('utf8');
  }

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

        // 프로세스 시작 확인 타임아웃 (10초로 증가)
        // MCP 서버는 시작 후 stdin 요청을 대기하므로 stdout 출력이 없을 수 있음
        const connectionTimeout = setTimeout(() => {
          if (this.process) {
            this.process.kill();
            this.process = null;
          }
          reject(
            new Error(
              `Process start timeout: MCP server '${this.config.name}' failed to start within 10 seconds. ` +
                `Please check if the command is correct and the server is properly configured.`
            )
          );
        }, 10000);

        let processStarted = false;
        let stderrOutput = ''; // stderr 내용을 수집하여 에러 메시지에 포함

        // 프로세스 생성
        try {
          // Node.js 매니저(fnm, nvm 등) 경로를 PATH에 추가
          const extraPaths = getExtraNodePaths();
          const currentPath = process.env.PATH || process.env.Path || '';
          const augmentedPath =
            extraPaths.length > 0 ? [...extraPaths, currentPath].join(path.delimiter) : currentPath;

          if (extraPaths.length > 0) {
            logger.info('Augmenting PATH for MCP server', {
              server: this.config.name,
              extraPaths,
            });
          }

          this.process = spawn(command, args, {
            env: {
              ...process.env,
              PATH: augmentedPath,
              Path: augmentedPath, // Windows에서는 Path 대문자 사용하는 경우도 있음
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

        // stdout 처리
        this.process.stdout.on('data', (data: Buffer) => {
          if (!processStarted) {
            processStarted = true;
            logger.info('MCP server process started successfully', {
              server: this.config.name,
            });
          }
          this.handleStdout(data);
        });

        // stderr 처리
        this.process.stderr.on('data', (data: Buffer) => {
          // Use decoder for stderr as well to handle multi-byte characters properly
          // Note: We create a temporary decoder or use toString() since this is logging
          // Many MCP servers use stderr for diagnostic/info messages, not actual errors
          const output = data.toString();
          // stderr 출력을 수집 (프로세스 즉시 종료 시 에러 원인 파악용)
          stderrOutput += output;
          // 수집 크기 제한 (4KB)
          if (stderrOutput.length > 4096) {
            stderrOutput = stderrOutput.slice(-4096);
          }
          logger.debug('MCP server stderr', {
            server: this.config.name,
            output,
          });
        });

        // 프로세스 종료
        this.process.on('exit', (code: number | null, signal: string | null) => {
          clearTimeout(connectionTimeout);
          logger.warn('MCP server exited', {
            server: this.config.name,
            code,
            signal,
          });
          this.isConnected = false;

          // 프로세스가 시작 직후 종료된 경우
          if (!processStarted) {
            const stderrTrimmed = stderrOutput.trim();
            const stderrInfo = stderrTrimmed ? `\nServer stderr: ${stderrTrimmed}` : '';
            reject(
              new Error(
                `MCP server process exited immediately (code: ${code}). ` +
                  'This usually means the command or arguments are incorrect, or the server failed to start. ' +
                  `For Python servers, ensure 'python' or 'python3' is in PATH.${stderrInfo}`
              )
            );
          }
        });

        // 프로세스 에러
        this.process.on('error', (error: Error) => {
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
        });

        // 프로세스 시작 대기 (2초)
        // MCP 서버는 시작 후 stdin 요청을 기다리므로 stdout 출력이 없을 수 있음
        // 실제 통신 확인은 initialize() 메서드에서 수행됨
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            clearTimeout(connectionTimeout);
            this.isConnected = true;
            logger.info('MCP server process started, ready for initialization', {
              server: this.config.name,
            });
            resolve();
          }
        }, 2000); // 2초 대기 후 프로세스가 살아있으면 연결 성공으로 간주
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
        // Timeout cleanup
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout (30s) for method: ${request.method}, id: ${id}`));
        } else if (this.pendingRequests.has(String(id))) {
          this.pendingRequests.delete(String(id));
          reject(new Error(`Request timeout (300s) for method: ${request.method}, id: ${id}`));
        }
      }, 300000); // 300초 = 300000ms = 5분

      // Use String(id) as key to avoid type mismatches
      this.pendingRequests.set(String(id), { resolve, reject, timeout });

      // 요청 전송
      try {
        const message = JSON.stringify(requestWithId);
        logger.debug('[MCP Transmit] Sending CLI Request:', {
          server: this.config.name,
          method: request.method,
          id,
        });
        this.process.stdin.write(`${message}\n`);
      } catch (err) {
        clearTimeout(timeout);
        this.pendingRequests.delete(String(id));
        reject(err as Error);
      }
    });
  }

  /**
   * stdout 데이터 처리
   */
  private handleStdout(data: Buffer): void {
    // Decode new data and add to buffer
    this.buffer += this.decoder.write(data);

    // Check for newlines
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line) {
        try {
          // Log raw lines for debugging (optional, can be noisy)
          logger.debug('[MCP Raw]', { line });

          const response: JSONRPCResponse = JSON.parse(line);
          this.handleResponse(response);
        } catch (error) {
          // Only log if it looks like it might have been intended as JSON but failed
          // or if it's significant output
          if (line.startsWith('{') || line.includes('error') || line.includes('Error')) {
            logger.error('Failed to parse MCP response', {
              server: this.config.name,
              line,
              error: getErrorMessage(error),
            });
          } else {
            // Treat as debug logging from the tool
            logger.debug(`[MCP Server Log] ${this.config.name}:`, line);
          }
        }
      }
    }
  }

  /**
   * 응답 처리
   */
  private handleResponse(response: JSONRPCResponse): void {
    if (response.id !== undefined) {
      // Try both exact match and string coercion
      const idString = String(response.id);
      const pending = this.pendingRequests.get(idString);

      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(idString);
        pending.resolve(response);
      } else {
        // ID는 있지만 pending 목록에 없는 경우 (timeout 이후 도착 등)
        logger.warn('Received response for unknown or timed-out request', {
          server: this.config.name,
          receivedId: response.id,
          pendingIds: Array.from(this.pendingRequests.keys()),
        });
      }
    } else {
      // 알림 메시지 (id 없음)
      logger.debug('MCP notification', { server: this.config.name, notification: response });
    }
  }
}
