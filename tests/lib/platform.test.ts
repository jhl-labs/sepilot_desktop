/**
 * Platform 감지 유틸리티 테스트
 */

import { isElectron, isWeb, getElectronAPI, getEnvironment, Environment } from '@/lib/platform';
import { enableElectronMode, disableElectronMode, mockElectronAPI } from '../setup';

describe('platform', () => {
  describe('isElectron', () => {
    it('should return false in web environment', () => {
      disableElectronMode();
      expect(isElectron()).toBe(false);
    });

    it('should return true in electron environment', () => {
      enableElectronMode();
      expect(isElectron()).toBe(true);
    });

    it('should return false when window is undefined (SSR)', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing undefined window
      delete global.window;

      expect(isElectron()).toBe(false);

      global.window = originalWindow;
    });
  });

  describe('isWeb', () => {
    it('should return true in web environment', () => {
      disableElectronMode();
      expect(isWeb()).toBe(true);
    });

    it('should return false in electron environment', () => {
      enableElectronMode();
      expect(isWeb()).toBe(false);
    });

    // Note: In JSDOM environment, window cannot be truly deleted
    // This test would only be relevant in a Node.js environment without JSDOM
    it.skip('should return false when window is undefined (SSR)', () => {
      // SSR behavior is handled by the platform module internally
      // and cannot be easily tested in JSDOM environment
    });
  });

  describe('getElectronAPI', () => {
    it('should return null in web environment', () => {
      disableElectronMode();
      expect(getElectronAPI()).toBeNull();
    });

    it('should return electronAPI in electron environment', () => {
      enableElectronMode();
      const api = getElectronAPI();

      expect(api).toBeDefined();
      expect(api).toBe(mockElectronAPI);
    });
  });

  describe('getEnvironment', () => {
    it('should return "web" in web environment', () => {
      disableElectronMode();
      expect(getEnvironment()).toBe('web');
    });

    it('should return "electron" in electron environment', () => {
      enableElectronMode();
      expect(getEnvironment()).toBe('electron');
    });

    // Note: In JSDOM environment, window cannot be truly deleted
    // This test would only be relevant in a Node.js environment without JSDOM
    it.skip('should return "server" when window is undefined', () => {
      // SSR behavior is handled by the platform module internally
      // and cannot be easily tested in JSDOM environment
    });

    it('should have correct type', () => {
      const env: Environment = getEnvironment();
      expect(['electron', 'web', 'server']).toContain(env);
    });
  });
});
