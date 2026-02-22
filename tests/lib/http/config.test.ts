/**
 * HTTP Config 테스트
 */

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the database import used in loadFromDatabase
jest.mock(
  '@/electron/services/database',
  () => ({
    databaseService: {
      getSetting: jest.fn(),
    },
  }),
  { virtual: true }
);

import {
  detectEnvironment,
  isElectron,
  getNetworkConfig,
  clearNetworkConfigCache,
  setNetworkConfig,
  createDefaultNetworkConfig,
} from '@/lib/http/config';
import type { NetworkConfig } from '@/types';

describe('HTTP Config', () => {
  describe('detectEnvironment', () => {
    it('should detect browser when window exists without electronAPI', () => {
      const originalWindow = (global as any).window;
      (global as any).window = { electronAPI: undefined };

      const env = detectEnvironment();

      expect(env).toBe('browser');

      (global as any).window = originalWindow;
    });

    it('should detect electron-renderer when electronAPI exists', () => {
      const originalWindow = (global as any).window;
      (global as any).window = { electronAPI: {} };

      const env = detectEnvironment();

      expect(env).toBe('electron-renderer');

      (global as any).window = originalWindow;
    });

    it('should detect node when window is undefined', () => {
      const originalWindow = (global as any).window;
      delete (global as any).window;

      const env = detectEnvironment();

      // Without process.versions.electron, should be 'node'
      expect(env).toBe('node');

      (global as any).window = originalWindow;
    });
  });

  describe('isElectron', () => {
    it('should return false for browser', () => {
      const originalWindow = (global as any).window;
      (global as any).window = { electronAPI: undefined };

      expect(isElectron()).toBe(false);

      (global as any).window = originalWindow;
    });

    it('should return true for electron-renderer', () => {
      const originalWindow = (global as any).window;
      (global as any).window = { electronAPI: {} };

      expect(isElectron()).toBe(true);

      (global as any).window = originalWindow;
    });
  });

  describe('clearNetworkConfigCache', () => {
    it('should clear the cache', () => {
      // Set a config first
      setNetworkConfig({
        proxy: { enabled: false, mode: 'none', url: '' },
      });

      clearNetworkConfigCache();

      // After clearing, we can't directly inspect the cache,
      // but we can verify it works without error
      expect(() => clearNetworkConfigCache()).not.toThrow();
    });
  });

  describe('setNetworkConfig', () => {
    afterEach(() => {
      clearNetworkConfigCache();
    });

    it('should set config directly', () => {
      const config: NetworkConfig = {
        proxy: {
          enabled: true,
          mode: 'manual',
          url: 'http://proxy:8080',
        },
        ssl: {
          verify: true,
        },
      };

      setNetworkConfig(config);

      // After setting, getNetworkConfig should return the cached value
      // (no environment loading needed)
    });
  });

  describe('createDefaultNetworkConfig', () => {
    it('should create default config with proxy disabled', () => {
      const config = createDefaultNetworkConfig();

      expect(config).toEqual({
        proxy: {
          enabled: false,
          mode: 'none',
          url: '',
        },
        ssl: {
          verify: true,
        },
        customHeaders: {},
      });
    });

    it('should return a new object each time', () => {
      const config1 = createDefaultNetworkConfig();
      const config2 = createDefaultNetworkConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });
  });

  describe('getNetworkConfig', () => {
    afterEach(() => {
      clearNetworkConfigCache();
    });

    it('should return cached config when available and not expired', async () => {
      const config: NetworkConfig = {
        proxy: { enabled: false, mode: 'none', url: '' },
      };

      setNetworkConfig(config);

      const result = await getNetworkConfig();

      expect(result).toEqual(config);
    });

    it('should return null for pure node environment', async () => {
      clearNetworkConfigCache();

      const originalWindow = (global as any).window;
      delete (global as any).window;

      const result = await getNetworkConfig(true);

      expect(result).toBeNull();

      (global as any).window = originalWindow;
    });

    it('should load from localStorage in browser environment', async () => {
      clearNetworkConfigCache();

      const originalWindow = (global as any).window;
      const originalLocalStorage = (global as any).localStorage;
      const networkConfig = {
        proxy: { enabled: true, mode: 'manual', url: 'http://proxy:8080' },
      };

      const mockLocalStorage = {
        getItem: jest.fn((key: string) => {
          if (key === 'sepilot_network_config') {
            return JSON.stringify(networkConfig);
          }
          return null;
        }),
      };

      (global as any).window = {
        electronAPI: undefined,
        localStorage: mockLocalStorage,
      };
      (global as any).localStorage = mockLocalStorage;

      const result = await getNetworkConfig(true);

      expect(result).toEqual(networkConfig);

      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    });

    it('should fall back to app_config in localStorage', async () => {
      clearNetworkConfigCache();

      const originalWindow = (global as any).window;
      const originalLocalStorage = (global as any).localStorage;
      const appConfig = {
        network: {
          proxy: { enabled: false, mode: 'none', url: '' },
          ssl: { verify: true },
        },
      };

      const mockLocalStorage = {
        getItem: jest.fn((key: string) => {
          if (key === 'sepilot_network_config') {
            return null;
          }
          if (key === 'sepilot_app_config') {
            return JSON.stringify(appConfig);
          }
          return null;
        }),
      };

      (global as any).window = {
        electronAPI: undefined,
        localStorage: mockLocalStorage,
      };
      (global as any).localStorage = mockLocalStorage;

      const result = await getNetworkConfig(true);

      expect(result).toEqual(appConfig.network);

      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    });

    it('should return null when localStorage has no config', async () => {
      clearNetworkConfigCache();

      const originalWindow = (global as any).window;
      const originalLocalStorage = (global as any).localStorage;
      const mockLocalStorage = {
        getItem: jest.fn().mockReturnValue(null),
      };

      (global as any).window = {
        electronAPI: undefined,
        localStorage: mockLocalStorage,
      };
      (global as any).localStorage = mockLocalStorage;

      const result = await getNetworkConfig(true);

      expect(result).toBeNull();

      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    });

    it('should handle localStorage parse errors gracefully', async () => {
      clearNetworkConfigCache();

      const originalWindow = (global as any).window;
      const originalLocalStorage = (global as any).localStorage;
      const mockLocalStorage = {
        getItem: jest.fn().mockReturnValue('invalid json{'),
      };

      (global as any).window = {
        electronAPI: undefined,
        localStorage: mockLocalStorage,
      };
      (global as any).localStorage = mockLocalStorage;

      const result = await getNetworkConfig(true);

      expect(result).toBeNull();

      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    });

    it('should load via IPC in electron-renderer', async () => {
      clearNetworkConfigCache();

      const originalWindow = (global as any).window;
      const networkConfig = {
        proxy: { enabled: false, mode: 'none', url: '' },
      };

      (global as any).window = {
        electronAPI: {
          config: {
            load: jest.fn().mockResolvedValue({
              success: true,
              data: {
                network: networkConfig,
              },
            }),
          },
        },
        localStorage: {
          getItem: jest.fn().mockReturnValue(null),
        },
      };

      const result = await getNetworkConfig(true);

      expect(result).toEqual(networkConfig);

      (global as any).window = originalWindow;
    });

    it('should fall back to localStorage when IPC fails', async () => {
      clearNetworkConfigCache();

      const originalWindow = (global as any).window;
      const originalLocalStorage = (global as any).localStorage;
      const networkConfig = {
        proxy: { enabled: true, mode: 'manual', url: 'http://fallback:8080' },
      };

      const mockLocalStorage = {
        getItem: jest.fn((key: string) => {
          if (key === 'sepilot_network_config') {
            return JSON.stringify(networkConfig);
          }
          return null;
        }),
      };

      (global as any).window = {
        electronAPI: {
          config: {
            load: jest.fn().mockRejectedValue(new Error('IPC error')),
          },
        },
        localStorage: mockLocalStorage,
      };
      (global as any).localStorage = mockLocalStorage;

      const result = await getNetworkConfig(true);

      expect(result).toEqual(networkConfig);

      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    });

    it('should handle forceRefresh parameter', async () => {
      const config: NetworkConfig = {
        proxy: { enabled: false, mode: 'none', url: '' },
      };
      setNetworkConfig(config);

      // Without forceRefresh, returns cached
      const cached = await getNetworkConfig();
      expect(cached).toEqual(config);

      // With forceRefresh, reloads (in browser env, from localStorage)
      const originalWindow = (global as any).window;
      const originalLocalStorage = (global as any).localStorage;
      const mockLocalStorage = {
        getItem: jest.fn().mockReturnValue(null),
      };

      (global as any).window = {
        electronAPI: undefined,
        localStorage: mockLocalStorage,
      };
      (global as any).localStorage = mockLocalStorage;

      const refreshed = await getNetworkConfig(true);
      expect(refreshed).toBeNull();

      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    });
  });

  describe('normalizeNetworkConfig (via getNetworkConfig)', () => {
    afterEach(() => {
      clearNetworkConfigCache();
    });

    it('should normalize enabled:true + mode:none to enabled:false', async () => {
      clearNetworkConfigCache();

      const originalWindow = (global as any).window;
      const originalLocalStorage = (global as any).localStorage;
      const mockLocalStorage = {
        getItem: jest.fn((key: string) => {
          if (key === 'sepilot_network_config') {
            return JSON.stringify({
              proxy: { enabled: true, mode: 'none', url: '' },
            });
          }
          return null;
        }),
      };

      (global as any).window = {
        electronAPI: undefined,
        localStorage: mockLocalStorage,
      };
      (global as any).localStorage = mockLocalStorage;

      const result = await getNetworkConfig(true);

      expect(result?.proxy?.enabled).toBe(false);
      expect(result?.proxy?.mode).toBe('none');

      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    });

    it('should normalize enabled:false + mode:manual to mode:none', async () => {
      clearNetworkConfigCache();

      const originalWindow = (global as any).window;
      const originalLocalStorage = (global as any).localStorage;
      const mockLocalStorage = {
        getItem: jest.fn((key: string) => {
          if (key === 'sepilot_network_config') {
            return JSON.stringify({
              proxy: { enabled: false, mode: 'manual', url: 'http://proxy:8080' },
            });
          }
          return null;
        }),
      };

      (global as any).window = {
        electronAPI: undefined,
        localStorage: mockLocalStorage,
      };
      (global as any).localStorage = mockLocalStorage;

      const result = await getNetworkConfig(true);

      expect(result?.proxy?.enabled).toBe(false);
      expect(result?.proxy?.mode).toBe('none');

      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    });

    it('should migrate deprecated system mode to none', async () => {
      clearNetworkConfigCache();

      const originalWindow = (global as any).window;
      const originalLocalStorage = (global as any).localStorage;
      const mockLocalStorage = {
        getItem: jest.fn((key: string) => {
          if (key === 'sepilot_network_config') {
            return JSON.stringify({
              proxy: { enabled: true, mode: 'system', url: '' },
            });
          }
          return null;
        }),
      };

      (global as any).window = {
        electronAPI: undefined,
        localStorage: mockLocalStorage,
      };
      (global as any).localStorage = mockLocalStorage;

      const result = await getNetworkConfig(true);

      expect(result?.proxy?.enabled).toBe(false);
      expect(result?.proxy?.mode).toBe('none');

      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    });

    it('should pass through valid config unchanged', async () => {
      clearNetworkConfigCache();

      const originalWindow = (global as any).window;
      const originalLocalStorage = (global as any).localStorage;
      const validConfig = {
        proxy: { enabled: true, mode: 'manual', url: 'http://proxy:8080' },
        ssl: { verify: true },
      };

      const mockLocalStorage = {
        getItem: jest.fn((key: string) => {
          if (key === 'sepilot_network_config') {
            return JSON.stringify(validConfig);
          }
          return null;
        }),
      };

      (global as any).window = {
        electronAPI: undefined,
        localStorage: mockLocalStorage,
      };
      (global as any).localStorage = mockLocalStorage;

      const result = await getNetworkConfig(true);

      expect(result).toEqual(validConfig);

      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    });

    it('should handle null network config', async () => {
      clearNetworkConfigCache();

      const originalWindow = (global as any).window;
      const originalLocalStorage = (global as any).localStorage;
      const mockLocalStorage = {
        getItem: jest.fn((key: string) => {
          if (key === 'sepilot_app_config') {
            return JSON.stringify({ network: null });
          }
          return null;
        }),
      };

      (global as any).window = {
        electronAPI: undefined,
        localStorage: mockLocalStorage,
      };
      (global as any).localStorage = mockLocalStorage;

      const result = await getNetworkConfig(true);

      expect(result).toBeNull();

      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    });
  });
});
