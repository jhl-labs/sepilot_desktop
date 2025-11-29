/**
 * PTY Manager Service
 *
 * Manages pseudo-terminal sessions using node-pty.
 * Handles session lifecycle, shell detection, and data streaming.
 */

import * as pty from 'node-pty';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { logger } from './logger';
import { BrowserWindow } from 'electron';

export interface PTYSession {
  id: string;
  pty: pty.IPty;
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

  constructor(mainWindow?: BrowserWindow) {
    if (mainWindow) {
      this.mainWindow = mainWindow;
    }
  }

  setMainWindow(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * 시스템 기본 셸 감지
   */
  private getDefaultShell(): { shell: string; args: string[] } {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows: PowerShell 우선
      return { shell: 'powershell.exe', args: [] };
    } else {
      // macOS/Linux: SHELL 환경변수 또는 /bin/bash
      return {
        shell: process.env.SHELL || '/bin/bash',
        args: [],
      };
    }
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
    });

    try {
      const ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: {
          ...process.env,
          LANG: 'ko_KR.UTF-8',
          LC_ALL: 'ko_KR.UTF-8',
        } as any,
      });

      // PTY 데이터 이벤트 → Renderer로 전송
      ptyProcess.onData((data) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('terminal:data', {
            sessionId,
            data,
          });
        }
      });

      // PTY 프로세스 종료 이벤트
      ptyProcess.onExit(({ exitCode, signal }) => {
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
   * 세션 종료
   */
  killSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn(`[PTYManager] Session not found: ${sessionId}`);
      return false;
    }

    try {
      session.pty.kill();
      this.sessions.delete(sessionId);
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
        session.pty.kill();
        logger.info(`[PTYManager] Killed session ${sessionId}`);
      } catch (error) {
        logger.error(`[PTYManager] Error killing session ${sessionId}:`, error);
      }
    }

    this.sessions.clear();
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
