/**
 * platform 유틸리티 테스트
 */

import {
  isElectron,
  isWeb,
  getElectronAPI,
  getEnvironment,
} from '@/lib/platform';

describe('platform utilities', () => {
  const originalWindow = global.window;

  afterEach(() => {
    // Restore window after each test
    global.window = originalWindow;
  });

  describe('isElectron', () => {
    it('should return true when electronAPI is available', () => {
      (window as any).electronAPI = {};

      expect(isElectron()).toBe(true);
    });

    it('should return false when electronAPI is undefined', () => {
      delete (window as any).electronAPI;

      expect(isElectron()).toBe(false);
    });

    it('should return false when window is undefined', () => {
      delete (global as any).window;

      expect(isElectron()).toBe(false);

      // Restore window
      global.window = originalWindow;
    });
  });

  describe('isWeb', () => {
    it('should return true when window exists and not Electron', () => {
      delete (window as any).electronAPI;

      expect(isWeb()).toBe(true);
    });

    it('should return false when in Electron environment', () => {
      (window as any).electronAPI = {};

      expect(isWeb()).toBe(false);
    });
  });

  describe('getElectronAPI', () => {
    it('should return electronAPI when available', () => {
      const mockAPI = { test: 'api' };
      (window as any).electronAPI = mockAPI;

      expect(getElectronAPI()).toBe(mockAPI);
    });

    it('should return null when not in Electron', () => {
      delete (window as any).electronAPI;

      expect(getElectronAPI()).toBeNull();
    });

    it('should return null when window is undefined', () => {
      delete (global as any).window;

      expect(getElectronAPI()).toBeNull();

      // Restore window
      global.window = originalWindow;
    });
  });

  describe('getEnvironment', () => {
    it('should return "electron" when in Electron environment', () => {
      (window as any).electronAPI = {};

      expect(getEnvironment()).toBe('electron');
    });

    it('should return "web" when in browser environment', () => {
      delete (window as any).electronAPI;

      expect(getEnvironment()).toBe('web');
    });
  });
});
