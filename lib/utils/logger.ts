/**
 * Logger utility for consistent logging across the application
 *
 * In production, debug logs are automatically disabled
 */

const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  /**
   * Debug level - only shown in development
   */
  debug: (...args: any[]) => {
    if (isDev) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Info level - shown in all environments
   */
  info: (...args: any[]) => {
    console.log('[INFO]', ...args);
  },

  /**
   * Warning level - shown in all environments
   */
  warn: (...args: any[]) => {
    console.warn('[WARN]', ...args);
  },

  /**
   * Error level - shown in all environments
   */
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
  },
};
