/**
 * Logger utility tests
 */

describe('logger', () => {
  let originalEnv: string | undefined;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Save original NODE_ENV
    originalEnv = process.env.NODE_ENV;

    // Restore console spies for this test
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original NODE_ENV
    process.env.NODE_ENV = originalEnv;
    jest.resetModules();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('debug', () => {
    it('should log in development environment', () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      logger.debug('test message', { data: 123 });

      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG]', 'test message', { data: 123 });
    });

    it('should not log in production environment', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      logger.debug('test message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log in test environment', () => {
      process.env.NODE_ENV = 'test';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      logger.debug('test message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      logger.debug('msg', 1, true, [1, 2, 3]);

      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG]', 'msg', 1, true, [1, 2, 3]);
    });
  });

  describe('info', () => {
    it('should always log info messages', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      logger.info('info message', 'extra');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'info message', 'extra');
    });

    it('should log info in development', () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      logger.info('dev info');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'dev info');
    });

    it('should handle objects as arguments', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      const obj = { key: 'value', nested: { a: 1 } };
      logger.info('data:', obj);

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'data:', obj);
    });
  });

  describe('warn', () => {
    it('should always log warning messages', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      logger.warn('warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'warning message');
    });

    it('should log warnings in development', () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      logger.warn('dev warning');

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'dev warning');
    });

    it('should handle Error objects', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      const err = new Error('test error');
      logger.warn('warning:', err);

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'warning:', err);
    });
  });

  describe('error', () => {
    it('should always log error messages', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      logger.error('error message', new Error('test'));

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'error message', expect.any(Error));
    });

    it('should log errors in development', () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      logger.error('dev error');

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'dev error');
    });

    it('should handle multiple error arguments', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      const err = new Error('multi');
      logger.error('context', err, { extra: 'info' });

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'context', err, { extra: 'info' });
    });

    it('should handle string error messages', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      logger.error('something went wrong', 'detailed reason');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR]',
        'something went wrong',
        'detailed reason'
      );
    });
  });

  describe('formatLogMessage', () => {
    it('should be used internally for file logging', () => {
      // The formatLogMessage function is internal, but we can verify
      // the logger itself doesn't crash with various argument types
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      // Should handle all types without crashing
      expect(() => logger.info('string')).not.toThrow();
      expect(() => logger.info(42)).not.toThrow();
      expect(() => logger.info(null)).not.toThrow();
      expect(() => logger.info(undefined)).not.toThrow();
      expect(() => logger.info({ key: 'val' })).not.toThrow();
      expect(() => logger.info([1, 2, 3])).not.toThrow();
      expect(() => logger.info(new Error('test'))).not.toThrow();
    });
  });

  describe('initializeFileLogger', () => {
    it('should be exported and callable', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { initializeFileLogger } = require('@/lib/utils/logger');

      expect(typeof initializeFileLogger).toBe('function');
    });

    it('should not initialize file logger in browser environment (window defined)', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { initializeFileLogger } = require('@/lib/utils/logger');

      // In jsdom environment, window is defined, so file logger should not be initialized
      // This should not throw
      expect(() => initializeFileLogger('/tmp/logs', 'test.log')).not.toThrow();
    });
  });
});
