/**
 * Logger utility for consistent logging across the application
 *
 * Log levels (from most to least verbose):
 * - debug: Development only, detailed debugging information
 * - info: Important application events (development + production)
 * - warn: Warning messages (all environments)
 * - error: Error messages (all environments)
 *
 * Environment-based filtering:
 * - Development: All logs shown
 * - Production: Only warn and error shown (info filtered for performance)
 *
 * File logging:
 * - Production only: Logs written to userData/logs/
 * - Automatic log rotation when file exceeds 10MB
 * - Async writes for minimal performance impact
 *
 * Note: console usage is centralized here to keep ESLint noise out of other files.
 * Browser-safe: Uses globalThis instead of process for environment detection
 */

// Browser-safe environment detection
// In browser: process is undefined or polyfilled
// In Node.js: process.env is available
const getEnv = (): string => {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined' && typeof process === 'undefined') {
    // Browser without process polyfill - assume production
    return 'production';
  }

  // Check if process.env exists
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV) {
    return process.env.NODE_ENV;
  }

  // Fallback to production
  return 'production';
};

const currentEnv = getEnv();
const isDev = currentEnv === 'development';

type LogArgs = unknown[];

// File logging (Node.js only)
let fileLogger: FileLogger | null = null;

/**
 * Initialize file logger (must be called in Node.js environment)
 */
export function initializeFileLogger(logDir: string, logFileName: string): void {
  if (typeof window === 'undefined') {
    // Node.js environment (both development and production)
    fileLogger = new FileLogger(logDir, logFileName);
  }
}

/**
 * File logger implementation
 */
class FileLogger {
  private logPath: string;
  private writeQueue: string[] = [];
  private isWriting = false;
  private maxFileSize = 10 * 1024 * 1024; // 10MB

  constructor(logDir: string, logFileName: string) {
    // Lazy load fs and path (Node.js only)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.logPath = path.join(logDir, logFileName);

    // Log rotation check
    this.checkRotation();
  }

  private checkRotation(): void {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');

    try {
      if (fs.existsSync(this.logPath)) {
        const stats = fs.statSync(this.logPath);
        if (stats.size > this.maxFileSize) {
          // Rotate: rename to .old and start fresh
          const oldPath = this.logPath.replace(/\.log$/, '.old.log');
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
          fs.renameSync(this.logPath, oldPath);
        }
      }
    } catch (error) {
      console.error('[FileLogger] Failed to rotate log file:', error);
    }
  }

  public write(message: string): void {
    this.writeQueue.push(message);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) {
      return;
    }

    this.isWriting = true;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const messages = this.writeQueue.splice(0, this.writeQueue.length);
    const content = `${messages.join('')}\n`;

    try {
      // Async append
      await fs.promises.appendFile(this.logPath, content, 'utf-8');
    } catch (error) {
      console.error('[FileLogger] Failed to write log:', error);
    } finally {
      this.isWriting = false;
      // Process remaining queue
      if (this.writeQueue.length > 0) {
        // Use setTimeout instead of setImmediate for browser compatibility
        setTimeout(() => this.processQueue(), 0);
      }
    }
  }
}

/**
 * Format log message for file output
 */
function formatLogMessage(level: string, context: string, args: LogArgs): string {
  const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const argsStr = args
    .map((arg) => {
      if (typeof arg === 'string') {
        return arg;
      }
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack}`;
      }
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');

  return `[${timestamp}] [${level}] [${context}] ${argsStr}\n`;
}

/**
 * Write to file log (if initialized)
 */
function writeToFile(level: string, context: string, args: LogArgs): void {
  if (fileLogger) {
    const message = formatLogMessage(level, context, args);
    fileLogger.write(message);
  }
}

export const logger = {
  /**
   * Debug level - only shown in development
   * Use for detailed debugging information
   */
  debug: (...args: LogArgs) => {
    if (isDev) {
      console.log('[DEBUG]', ...args);
    }
    writeToFile('DEBUG', 'General', args);
  },

  /**
   * Info level - shown in development, filtered in production
   * Use for important application events
   */
  info: (...args: LogArgs) => {
    // Always log to console for now
    console.log('[INFO]', ...args);
    writeToFile('INFO', 'General', args);
  },

  /**
   * Warning level - shown in all environments
   * Use for warning messages that don't prevent operation
   */
  warn: (...args: LogArgs) => {
    console.warn('[WARN]', ...args);
    writeToFile('WARN', 'General', args);
  },

  /**
   * Error level - shown in all environments
   * Use for error messages that affect operation
   */
  error: (...args: LogArgs) => {
    console.error('[ERROR]', ...args);
    writeToFile('ERROR', 'General', args);
  },
};
