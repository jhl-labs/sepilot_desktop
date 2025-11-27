/**
 * Logger 유틸리티 테스트
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
  });

  describe('info', () => {
    it('should always log info messages', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      logger.info('info message', 'extra');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'info message', 'extra');
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
  });

  describe('error', () => {
    it('should always log error messages', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { logger } = require('@/lib/utils/logger');

      logger.error('error message', new Error('test'));

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'error message', expect.any(Error));
    });
  });
});
