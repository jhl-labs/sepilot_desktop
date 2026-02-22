/**
 * File-based logger for production builds
 *
 * Writes Extension loading logs to userData/logs/extension-loading.log
 * Only works in Main Process (Electron/Node.js environment)
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';

let logFilePath: string | null = null;
let writeStream: fs.WriteStream | null = null;
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Initialize file logger
 */
export function initFileLogger(): void {
  if (!app) {
    console.warn('[FileLogger] Not in Electron environment, skipping file logger init');
    return;
  }

  try {
    const userDataPath = app.getPath('userData');
    const logsDir = path.join(userDataPath, 'logs');

    // Create logs directory if not exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    logFilePath = path.join(logsDir, 'extension-loading.log');

    // Check file size and rotate if needed
    if (fs.existsSync(logFilePath)) {
      const stats = fs.statSync(logFilePath);
      if (stats.size > MAX_LOG_SIZE) {
        const backupPath = path.join(logsDir, `extension-loading.log.${Date.now()}.bak`);
        fs.renameSync(logFilePath, backupPath);
        console.log(`[FileLogger] Rotated log file to: ${backupPath}`);
      }
    }

    // Create write stream (append mode)
    writeStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    writeStream.on('error', (err) => {
      console.error('[FileLogger] Write stream error:', err);
    });

    // Log initialization
    const initMsg = `\n\n${'='.repeat(80)}\n[${new Date().toISOString()}] Extension Loading Log Session Started\n${'='.repeat(80)}\n`;
    writeStream.write(initMsg);

    console.log(`[FileLogger] Initialized. Log file: ${logFilePath}`);
  } catch (error) {
    console.error('[FileLogger] Failed to initialize:', error);
  }
}

/**
 * Close file logger
 */
export function closeFileLogger(): void {
  if (writeStream) {
    writeStream.end();
    writeStream = null;
  }
}

/**
 * Format timestamp
 */
function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 23);
}

/**
 * Write log to file
 */
function writeLog(level: string, context: string, message: string, data?: unknown): void {
  if (!writeStream || !logFilePath) {
    return;
  }

  try {
    const timestamp = formatTimestamp();
    let logLine = `[${timestamp}] [${level.padEnd(5)}] [${context}] ${message}`;

    if (data !== undefined) {
      if (data instanceof Error) {
        logLine += `\n  Error: ${data.message}`;
        if (data.stack) {
          logLine += `\n  Stack: ${data.stack.split('\n').slice(0, 5).join('\n         ')}`;
        }
      } else if (typeof data === 'object') {
        logLine += `\n  Data: ${JSON.stringify(data, null, 2).split('\n').join('\n        ')}`;
      } else {
        logLine += ` ${data}`;
      }
    }

    logLine += '\n';

    // Write to file (non-blocking)
    writeStream.write(logLine);

    // Also log to console
    console.log(`[FileLogger] ${logLine.trim()}`);
  } catch (error) {
    console.error('[FileLogger] Failed to write log:', error);
  }
}

/**
 * File logger interface
 */
export const fileLogger = {
  /**
   * Log debug message (development only)
   */
  debug: (context: string, message: string, data?: unknown) => {
    if (process.env.NODE_ENV === 'development') {
      writeLog('DEBUG', context, message, data);
    }
  },

  /**
   * Log info message
   */
  info: (context: string, message: string, data?: unknown) => {
    writeLog('INFO', context, message, data);
  },

  /**
   * Log warning message
   */
  warn: (context: string, message: string, data?: unknown) => {
    writeLog('WARN', context, message, data);
  },

  /**
   * Log error message
   */
  error: (context: string, message: string, data?: unknown) => {
    writeLog('ERROR', context, message, data);
  },

  /**
   * Get log file path
   */
  getLogPath: (): string | null => {
    return logFilePath;
  },
};
