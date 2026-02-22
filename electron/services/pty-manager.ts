/**
 * PTY Manager Service
 *
 * Manages pseudo-terminal sessions using node-pty.
 * Handles session lifecycle, shell detection, and data streaming.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { logger } from './logger';
import { BrowserWindow } from 'electron';

// Dynamic import for node-pty to handle potential loading errors gracefully
let pty: any;
try {
  pty = require('node-pty');
} catch (error) {
  logger.error(
    '[PTYManager] Failed to load node-pty module. Terminal features will be disabled.',
    error
  );
}

export interface PTYSession {
  id: string;
  pty: any; // pty.IPty - using any to avoid namespace issues with dynamic import
  cwd: string;
  shell: string;
  createdAt: number;
}

export interface CreateSessionOptions {
  cwd?: string;
  cols?: number;
  rows?: number;
}

export interface CreateSessionResult {
  sessionId: string;
  cwd: string;
  shell: string;
}

export class PTYManager {
  private sessions: Map<string, PTYSession> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private runningCommands: Map<string, { startTime: number }> = new Map();
  private terminalBuffers: Map<
    string,
    { chunks: string[]; bytes: number; timer: ReturnType<typeof setTimeout> | null }
  > = new Map();
  private readonly terminalFlushIntervalMs = 16;
  private readonly terminalMaxBufferedBytes = 64 * 1024;

  constructor(mainWindow?: BrowserWindow) {
    if (mainWindow) {
      this.mainWindow = mainWindow;
    }
  }

  setMainWindow(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  private flushTerminalData(sessionId: string): void {
    const buffer = this.terminalBuffers.get(sessionId);
    if (!buffer || buffer.chunks.length === 0) {
      return;
    }

    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }

    const data = buffer.chunks.join('');
    buffer.chunks = [];
    buffer.bytes = 0;

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('terminal:data', {
        sessionId,
        data,
      });
      return;
    }

    logger.warn(`[PTYManager] Dropped terminal data for ${sessionId}: mainWindow is not available`);
  }

  private queueTerminalData(sessionId: string, data: string): void {
    let buffer = this.terminalBuffers.get(sessionId);
    if (!buffer) {
      buffer = { chunks: [], bytes: 0, timer: null };
      this.terminalBuffers.set(sessionId, buffer);
    }

    buffer.chunks.push(data);
    buffer.bytes += Buffer.byteLength(data, 'utf8');

    if (buffer.bytes >= this.terminalMaxBufferedBytes) {
      this.flushTerminalData(sessionId);
      return;
    }

    if (buffer.timer) {
      return;
    }

    buffer.timer = setTimeout(() => {
      this.flushTerminalData(sessionId);
    }, this.terminalFlushIntervalMs);
  }

  /**
   * 시스템 기본 셸 감지
   */
  private getDefaultShell(): { shell: string; args: string[] } {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows: 절대 경로 우선 탐색 (패키징/환경 차이 대응)
      const systemRoot = process.env.SystemRoot || 'C:\\Windows';
      const powershellPath = path.join(
        systemRoot,
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe'
      );

      return {
        shell: fs.existsSync(powershellPath) ? powershellPath : 'powershell.exe',
        args: ['-NoLogo'],
      };
    } else {
      // macOS/Linux: SHELL 환경변수 또는 /bin/bash
      return {
        shell: process.env.SHELL || '/bin/bash',
        args: [],
      };
    }
  }

  private spawnPtyWithFallback(
    shell: string,
    args: string[],
    cwd: string,
    cols: number,
    rows: number
  ): any {
    const isWindows = os.platform() === 'win32';
    const requestedConpty = process.env.SEPILOT_PTY_USE_CONPTY;
    const parsedRequestedConpty =
      requestedConpty === '1' ? true : requestedConpty === '0' ? false : null;

    const spawnCandidates = isWindows
      ? parsedRequestedConpty !== null
        ? [parsedRequestedConpty]
        : [true, false]
      : [undefined];

    let lastError: unknown;

    for (const useConpty of spawnCandidates) {
      try {
        const ptyProcess = pty.spawn(shell, args, {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          env: {
            ...process.env,
          } as any,
          ...(typeof useConpty === 'boolean' ? { useConpty } : {}),
        });

        logger.info('[PTYManager] PTY spawned successfully', {
          shell,
          cwd,
          cols,
          rows,
          platform: os.platform(),
          useConpty,
        });

        return ptyProcess;
      } catch (error) {
        lastError = error;
        logger.warn('[PTYManager] PTY spawn attempt failed', {
          shell,
          cwd,
          useConpty,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * 작업 디렉토리 검증 및 정규화
   */
  private validateCwd(cwd?: string): string {
    let workingDirectory = cwd || os.homedir();

    try {
      workingDirectory = path.resolve(workingDirectory);
      if (!fs.existsSync(workingDirectory)) {
        logger.warn(`[PTYManager] Invalid cwd: ${cwd}, using home directory`);
        workingDirectory = os.homedir();
      }
    } catch (error) {
      logger.error('[PTYManager] Path validation error:', error);
      workingDirectory = os.homedir();
    }

    return workingDirectory;
  }

  /**
   * 새로운 PTY 세션 생성
   */
  createSession(options: CreateSessionOptions = {}): CreateSessionResult {
    if (!pty) {
      throw new Error('Terminal functionality is not available (node-pty failed to load).');
    }

    const sessionId = randomUUID();
    const { shell, args } = this.getDefaultShell();
    const cwd = this.validateCwd(options.cwd);
    const cols = options.cols || 80;
    const rows = options.rows || 24;

    logger.info(`[PTYManager] Creating session ${sessionId}:`, {
      shell,
      cwd,
      cols,
      rows,
      platform: os.platform(),
    });

    try {
      const ptyProcess = this.spawnPtyWithFallback(shell, args, cwd, cols, rows);

      logger.info(`[PTYManager] Session ${sessionId} process spawned. PID: ${ptyProcess.pid}`);

      // PTY 데이터 이벤트 → Renderer로 전송
      ptyProcess.on('data', (data: string) => {
        this.queueTerminalData(sessionId, data);
      });

      // PTY 프로세스 종료 이벤트
      ptyProcess.on('exit', (exitCode, signal) => {
        this.flushTerminalData(sessionId);
        logger.info(`[PTYManager] Session ${sessionId} exited:`, {
          exitCode,
          signal,
        });

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('terminal:exit', {
            sessionId,
            exitCode,
            signal,
          });
        }

        // 세션 정리
        this.sessions.delete(sessionId);
        this.terminalBuffers.delete(sessionId);
      });

      const session: PTYSession = {
        id: sessionId,
        pty: ptyProcess,
        cwd,
        shell,
        createdAt: Date.now(),
      };

      this.sessions.set(sessionId, session);

      logger.info(`[PTYManager] Session ${sessionId} created successfully`);

      return {
        sessionId,
        cwd,
        shell,
      };
    } catch (error) {
      logger.error(`[PTYManager] Failed to create session:`, error);
      throw error;
    }
  }

  /**
   * 세션에 데이터 쓰기
   */
  writeData(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn(`[PTYManager] Session not found: ${sessionId}`);
      return false;
    }

    try {
      session.pty.write(data);
      return true;
    } catch (error) {
      logger.error(`[PTYManager] Failed to write data to session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * 세션 리사이즈
   */
  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn(`[PTYManager] Session not found: ${sessionId}`);
      return false;
    }

    try {
      session.pty.resize(cols, rows);
      logger.info(`[PTYManager] Session ${sessionId} resized to ${cols}x${rows}`);
      return true;
    } catch (error) {
      logger.error(`[PTYManager] Failed to resize session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * 실행 중인 명령어 취소 (Ctrl+C 전송)
   */
  cancelCommand(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn(`[PTYManager] Session not found: ${sessionId}`);
      return false;
    }

    try {
      // Ctrl+C (SIGINT) 전송
      session.pty.write('\x03');

      // 실행 중인 명령어 추적 제거
      this.runningCommands.delete(sessionId);

      logger.info(`[PTYManager] Sent interrupt signal to session ${sessionId}`);
      return true;
    } catch (error) {
      logger.error(`[PTYManager] Failed to cancel command in session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * 세션 종료
   */
  killSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn(`[PTYManager] Session not found: ${sessionId}`);
      return false;
    }

    try {
      this.flushTerminalData(sessionId);
      session.pty.kill();
      this.sessions.delete(sessionId);
      this.runningCommands.delete(sessionId);
      this.terminalBuffers.delete(sessionId);
      logger.info(`[PTYManager] Session ${sessionId} killed`);
      return true;
    } catch (error) {
      logger.error(`[PTYManager] Failed to kill session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * 모든 세션 정리 (앱 종료 시)
   */
  cleanup(): void {
    logger.info(`[PTYManager] Cleaning up ${this.sessions.size} sessions`);

    for (const [sessionId, session] of this.sessions) {
      try {
        this.flushTerminalData(sessionId);
        session.pty.kill();
        logger.info(`[PTYManager] Killed session ${sessionId}`);
      } catch (error) {
        logger.error(`[PTYManager] Error killing session ${sessionId}:`, error);
      }
    }

    this.sessions.clear();
    this.runningCommands.clear();
    this.terminalBuffers.clear();
  }

  /**
   * 활성 세션 목록 조회
   */
  getSessions(): CreateSessionResult[] {
    return Array.from(this.sessions.values()).map((session) => ({
      sessionId: session.id,
      cwd: session.cwd,
      shell: session.shell,
    }));
  }
}

// 싱글톤 인스턴스
let ptyManagerInstance: PTYManager | null = null;

export function getPTYManager(mainWindow?: BrowserWindow): PTYManager {
  if (!ptyManagerInstance) {
    ptyManagerInstance = new PTYManager(mainWindow);
  } else if (mainWindow) {
    ptyManagerInstance.setMainWindow(mainWindow);
  }
  return ptyManagerInstance;
}
