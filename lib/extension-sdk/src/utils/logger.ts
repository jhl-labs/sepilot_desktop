/**
 * Logger utility for consistent logging across the application
 *
 * In production, debug logs are automatically disabled
 * Browser-safe: Uses safe environment detection for browser and Node.js
 */

// Browser-safe environment detection
const getEnv = (): string => {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined' && typeof process === 'undefined') {
    // Browser without process polyfill - assume production for safety
    return 'production';
  }

  // Check if process.env exists (Node.js or bundled with process polyfill)
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV) {
    return process.env.NODE_ENV;
  }

  // Fallback to production
  return 'production';
};

const isDev = getEnv() === 'development';

type LogArgs = unknown[];

export const logger = {
  /**
   * Debug level - only shown in development
   */
  debug: (...args: LogArgs) => {
    if (isDev) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Info level - shown in all environments
   */
  info: (...args: LogArgs) => {
    console.log('[INFO]', ...args);
  },

  /**
   * Warning level - shown in all environments
   */
  warn: (...args: LogArgs) => {
    console.warn('[WARN]', ...args);
  },

  /**
   * Error level - shown in all environments
   */
  error: (...args: LogArgs) => {
    console.error('[ERROR]', ...args);
  },
};

/**
 * Create a namespaced logger for extensions
 */
export function createLogger(namespace: string) {
  return {
    debug: (...args: LogArgs) => logger.debug(`[${namespace}]`, ...args),
    info: (...args: LogArgs) => logger.info(`[${namespace}]`, ...args),
    warn: (...args: LogArgs) => logger.warn(`[${namespace}]`, ...args),
    error: (...args: LogArgs) => logger.error(`[${namespace}]`, ...args),
  };
}
