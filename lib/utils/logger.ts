/**
 * Logger utility for consistent logging across the application
 *
 * In production, debug logs are automatically disabled
 *
 * Note: console usage is centralized here to keep ESLint noise out of other files.
 */

const isDev = process.env.NODE_ENV === 'development';

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
