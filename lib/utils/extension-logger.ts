/**
 * Extension Loading Logger
 *
 * Specialized logger for tracking Extension loading process in production.
 * Logs are written to userData/logs/extension-loading.log
 */

import { logger } from './logger';

// File logging (Node.js only)
let extensionFileLogger: ExtensionFileLogger | null = null;
let isInitialized = false;

/**
 * Initialize extension file logger (must be called in Node.js environment)
 */
export function initializeExtensionLogger(logDir: string): void {
  if (typeof window !== 'undefined' || isInitialized) {
    return; // Only in Node.js and once
  }

  const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === undefined;

  // File logging only in production
  if (isProd) {
    extensionFileLogger = new ExtensionFileLogger(logDir);
    isInitialized = true;
  }
}

/**
 * Extension file logger implementation
 */
class ExtensionFileLogger {
  private logPath: string;
  private writeQueue: string[] = [];
  private isWriting = false;
  private maxFileSize = 10 * 1024 * 1024; // 10MB

  constructor(logDir: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.logPath = path.join(logDir, 'extension-loading.log');

    // Log rotation check
    this.checkRotation();

    // Write header
    const separator = '='.repeat(80);
    const header = `\n${separator}\nExtension Loading Session Started: ${new Date().toISOString()}\n${separator}\n`;
    this.write(header);
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
      console.error('[ExtensionFileLogger] Failed to rotate log file:', error);
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
    const content = messages.join('');

    try {
      // Async append
      await fs.promises.appendFile(this.logPath, content, 'utf-8');
    } catch (error) {
      console.error('[ExtensionFileLogger] Failed to write log:', error);
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
function formatLogMessage(level: string, context: string, message: string, data?: any): string {
  const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
  let formatted = `[${timestamp}] [${level}] [${context}] ${message}`;

  if (data) {
    try {
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      formatted = `${formatted}\n  Data: ${dataStr}`;
    } catch {
      formatted = `${formatted}\n  Data: ${String(data)}`;
    }
  }

  return `${formatted}\n`;
}

/**
 * Extension logger API
 */
export const extensionLogger = {
  /**
   * Log Extension loading start
   */
  loadingStarted: (context: 'Main' | 'Renderer') => {
    const message = `Extension loading started`;
    logger.info(`[${context}] ${message}`);

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('INFO', context, message));
    }
  },

  /**
   * Log .sepx search paths
   */
  searchPaths: (context: 'Main' | 'Renderer', paths: string[]) => {
    const message = `Searching .sepx files in ${paths.length} path(s)`;
    logger.info(`[${context}] ${message}`, { paths });

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('INFO', context, message, { paths }));
    }
  },

  /**
   * Log .sepx files found
   */
  filesFound: (context: 'Main' | 'Renderer', count: number, files: string[]) => {
    const message = `Found ${count} .sepx file(s)`;
    logger.info(`[${context}] ${message}`, { files });

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('INFO', context, message, { files }));
    }
  },

  /**
   * Log Extension extraction
   */
  extracting: (context: 'Main' | 'Renderer', extensionId: string, sepxPath: string) => {
    const message = `Extracting ${extensionId}`;
    logger.info(`[${context}] ${message}`, { sepxPath });

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('INFO', context, message, { sepxPath }));
    }
  },

  /**
   * Log Extension extraction success
   */
  extractionSuccess: (
    context: 'Main' | 'Renderer',
    extensionId: string,
    extractPath: string,
    duration: number
  ) => {
    const message = `Extracted ${extensionId} in ${duration}ms`;
    logger.info(`[${context}] ${message}`, { extractPath });

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('INFO', context, message, { extractPath }));
    }
  },

  /**
   * Log Extension extraction failure
   */
  extractionFailed: (context: 'Main' | 'Renderer', extensionId: string, error: any) => {
    const message = `Failed to extract ${extensionId}`;
    logger.error(`[${context}] ${message}`, error);

    if (extensionFileLogger) {
      const errorData =
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : { error: String(error) };
      extensionFileLogger.write(formatLogMessage('ERROR', context, message, errorData));
    }
  },

  /**
   * Log Extension registry registration
   */
  registering: (context: 'Main' | 'Renderer', extensionId: string) => {
    const message = `Registering ${extensionId} in registry`;
    logger.info(`[${context}] ${message}`);

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('INFO', context, message));
    }
  },

  /**
   * Log Extension registry registration success
   */
  registrationSuccess: (context: 'Main' | 'Renderer', extensionId: string) => {
    const message = `Registered ${extensionId} in registry`;
    logger.info(`[${context}] ${message}`);

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('INFO', context, message));
    }
  },

  /**
   * Log Extension activation
   */
  activating: (context: 'Main' | 'Renderer', extensionId: string) => {
    const message = `Activating ${extensionId}`;
    logger.info(`[${context}] ${message}`);

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('INFO', context, message));
    }
  },

  /**
   * Log Extension activation success
   */
  activationSuccess: (context: 'Main' | 'Renderer', extensionId: string, duration: number) => {
    const message = `Activated ${extensionId} in ${duration}ms`;
    logger.info(`[${context}] ${message}`);

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('INFO', context, message));
    }
  },

  /**
   * Log Extension activation failure
   */
  activationFailed: (context: 'Main' | 'Renderer', extensionId: string, error: any) => {
    const message = `Failed to activate ${extensionId}`;
    logger.error(`[${context}] ${message}`, error);

    if (extensionFileLogger) {
      const errorData =
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : { error: String(error) };
      extensionFileLogger.write(formatLogMessage('ERROR', context, message, errorData));
    }
  },

  /**
   * Log extensionsReady flag set
   */
  readyFlagSet: (context: 'Main' | 'Renderer', value: boolean) => {
    const message = `extensionsReady flag set to ${value}`;
    logger.info(`[${context}] ${message}`);

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('INFO', context, message));
    }
  },

  /**
   * Log Renderer waiting for Main extensions
   */
  waitingForMain: (attempt: number, maxAttempts: number) => {
    const message = `Waiting for main extensions... (attempt ${attempt}/${maxAttempts})`;
    logger.info(`[Renderer] ${message}`);

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('INFO', 'Renderer', message));
    }
  },

  /**
   * Log Renderer received Main extensions ready signal
   */
  mainReady: () => {
    const message = `Main extensions ready signal received`;
    logger.info(`[Renderer] ${message}`);

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('INFO', 'Renderer', message));
    }
  },

  /**
   * Log IPC call
   */
  ipcCall: (context: 'Main' | 'Renderer', channel: string, data?: any) => {
    const message = `IPC call: ${channel}`;
    logger.debug(`[${context}] ${message}`, data);

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('DEBUG', context, message, data));
    }
  },

  /**
   * Log IPC result
   */
  ipcResult: (context: 'Main' | 'Renderer', channel: string, success: boolean, data?: any) => {
    const message = `IPC result: ${channel} - ${success ? 'SUCCESS' : 'FAILED'}`;
    logger.debug(`[${context}] ${message}`, data);

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('DEBUG', context, message, data));
    }
  },

  /**
   * Log Extension loading completion
   */
  loadingComplete: (
    context: 'Main' | 'Renderer',
    totalExtensions: number,
    successCount: number
  ) => {
    const message = `Extension loading complete: ${successCount}/${totalExtensions} succeeded`;
    logger.info(`[${context}] ${message}`);

    if (extensionFileLogger) {
      extensionFileLogger.write(formatLogMessage('INFO', context, message));
      const separator = '='.repeat(80);
      extensionFileLogger.write(`${separator}\n\n`);
    }
  },
};
