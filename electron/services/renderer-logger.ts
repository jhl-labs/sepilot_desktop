import fs from 'fs';
import path from 'path';
import { BrowserWindow } from 'electron';
import { PathsUtil } from '../utils/paths';

/**
 * Renderer 프로세스의 콘솔 로그를 파일로 캡처하는 서비스
 *
 * webContents.on('console-message') 이벤트를 통해 브라우저 콘솔 로그를 캡처하여
 * 일별 로그 파일(renderer-YYYY-MM-DD.log)에 기록합니다.
 */

const LOG_LEVEL_MAP: Record<number, string> = {
  0: 'DEBUG',
  1: 'INFO',
  2: 'WARN',
  3: 'ERROR',
};

let currentLogPath: string | null = null;
let currentDate: string | null = null;
let writeQueue: string[] = [];
let isWriting = false;

function getLogPath(): string {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  if (today !== currentDate) {
    currentDate = today;
    const logsDir = PathsUtil.getLogsPath();
    currentLogPath = path.join(logsDir, `renderer-${today}.log`);
  }

  return currentLogPath!;
}

function formatMessage(level: number, message: string, source: string, line: number): string {
  const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const levelStr = LOG_LEVEL_MAP[level] || 'INFO';
  const sourceInfo = source ? ` (${path.basename(source)}:${line})` : '';
  return `[${timestamp}] [${levelStr}]${sourceInfo} ${message}\n`;
}

async function processQueue(): Promise<void> {
  if (isWriting || writeQueue.length === 0) {
    return;
  }

  isWriting = true;
  const messages = writeQueue.splice(0, writeQueue.length);
  const content = messages.join('');

  try {
    const logPath = getLogPath();
    await fs.promises.appendFile(logPath, content, 'utf-8');
  } catch (error) {
    // Silently fail — avoid recursive logging
  } finally {
    isWriting = false;
    if (writeQueue.length > 0) {
      setTimeout(() => processQueue(), 0);
    }
  }
}

/**
 * BrowserWindow의 콘솔 로그 캡처를 시작합니다.
 * 기존 브라우저 콘솔 동작에 영향을 주지 않습니다.
 */
export function setupRendererLogCapture(window: BrowserWindow): void {
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const formatted = formatMessage(level, message, sourceId, line);
    writeQueue.push(formatted);
    processQueue();
  });
}

/**
 * 오래된 로그 파일을 정리합니다.
 * @param maxAgeDays 보관 일수 (기본 7일)
 */
export function cleanupOldLogs(maxAgeDays: number = 7): void {
  try {
    const logsDir = PathsUtil.getLogsPath();
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;

    for (const file of files) {
      // renderer-*.log 와 app.old.log 파일만 정리 대상
      if (!file.match(/^renderer-\d{4}-\d{2}-\d{2}\.log$/) && file !== 'app.old.log') {
        continue;
      }

      const filePath = path.join(logsDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // Ignore individual file errors
      }
    }
  } catch {
    // Silently fail — log cleanup is non-critical
  }
}
