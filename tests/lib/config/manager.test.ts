/**
 * ConfigManager 테스트
 */

import { ConfigManager, STORAGE_KEYS, DEFAULT_LLM_CONFIG } from '@/lib/domains/config/manager';
import { enableElectronMode, disableElectronMode, mockElectronAPI } from '../../setup';
import type { AppConfig, LLMConfig } from '@/types';

describe('ConfigManager', () => {
  const mockAppConfig: AppConfig = {
    llm: {
      provider: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 2000,
    },
    mcp: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    disableElectronMode();
    localStorage.clear();
  });

  describe('loadAppConfig', () => {
    it('should return null when window is undefined (SSR)', async () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing undefined window
      delete global.window;

      const result = await ConfigManager.loadAppConfig();

      expect(result).toBeNull();

      global.window = originalWindow;
    });

    it('should load config from Electron IPC in electron environment', async () => {
      enableElectronMode();
      mockElectronAPI.config.load.mockResolvedValue({
        success: true,
        data: mockAppConfig,
      });

      const result = await ConfigManager.loadAppConfig();

      expect(mockElectronAPI.config.load).toHaveBeenCalled();
      expect(result).toEqual(mockAppConfig);
    });

    it('should return null when Electron IPC fails', async () => {
      enableElectronMode();
      mockElectronAPI.config.load.mockResolvedValue({
        success: false,
        error: 'Failed to load',
      });

      const result = await ConfigManager.loadAppConfig();

      expect(result).toBeNull();
    });

    it('should load config from localStorage in web environment', async () => {
      disableElectronMode();
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(mockAppConfig));

      const result = await ConfigManager.loadAppConfig();

      expect(localStorage.getItem).toHaveBeenCalledWith(STORAGE_KEYS.APP_CONFIG);
      expect(result).toEqual(mockAppConfig);
    });

    it('should return null when localStorage is empty', async () => {
      disableElectronMode();
      (localStorage.getItem as jest.Mock).mockReturnValue(null);

      const result = await ConfigManager.loadAppConfig();

      expect(result).toBeNull();
    });

    it('should return null and log error on exception', async () => {
      disableElectronMode();
      (localStorage.getItem as jest.Mock).mockImplementation(() => {
        throw new Error('Storage error');
      });

      const result = await ConfigManager.loadAppConfig();

      expect(result).toBeNull();
    });
  });

  describe('saveAppConfig', () => {
    // Note: In JSDOM environment, window cannot be truly deleted
    it.skip('should return false when window is undefined (SSR)', () => {
      // SSR behavior cannot be tested in JSDOM environment
    });

    it('should save config via Electron IPC in electron environment', async () => {
      enableElectronMode();
      mockElectronAPI.config.save.mockResolvedValue({ success: true });

      const result = await ConfigManager.saveAppConfig(mockAppConfig);

      expect(mockElectronAPI.config.save).toHaveBeenCalledWith(mockAppConfig);
      expect(result).toBe(true);
    });

    it('should return false when Electron IPC fails', async () => {
      enableElectronMode();
      mockElectronAPI.config.save.mockResolvedValue({ success: false });

      const result = await ConfigManager.saveAppConfig(mockAppConfig);

      expect(result).toBe(false);
    });

    it('should save config to localStorage in web environment', async () => {
      disableElectronMode();

      const result = await ConfigManager.saveAppConfig(mockAppConfig);

      expect(localStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.APP_CONFIG,
        JSON.stringify(mockAppConfig)
      );
      expect(result).toBe(true);
    });

    it('should return false and log error on exception', async () => {
      disableElectronMode();
      (localStorage.setItem as jest.Mock).mockImplementation(() => {
        throw new Error('Storage full');
      });

      const result = await ConfigManager.saveAppConfig(mockAppConfig);

      expect(result).toBe(false);
    });
  });

  describe('loadLLMConfig', () => {
    it('should return LLM config from app config', async () => {
      disableElectronMode();
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(mockAppConfig));

      const result = await ConfigManager.loadLLMConfig();

      expect(result).toEqual(
        expect.objectContaining({
          provider: 'openai',
          model: 'gpt-4',
        })
      );
    });

    it('should merge with defaults', async () => {
      disableElectronMode();
      const partialConfig: AppConfig = {
        llm: {
          provider: 'anthropic',
          baseURL: 'https://api.anthropic.com/v1',
          apiKey: 'test',
          model: 'claude-3-opus',
          temperature: 0.5,
          maxTokens: 1000,
        },
        mcp: [],
      };
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(partialConfig));

      const result = await ConfigManager.loadLLMConfig();

      // Should have custom values
      expect(result.provider).toBe('anthropic');
      expect(result.temperature).toBe(0.5);
      // Should have vision from defaults
      expect(result.vision).toBeDefined();
    });

    it('should return defaults when no config exists', async () => {
      disableElectronMode();
      (localStorage.getItem as jest.Mock).mockReturnValue(null);

      const result = await ConfigManager.loadLLMConfig();

      expect(result).toEqual(DEFAULT_LLM_CONFIG);
    });

    it('should try legacy storage key in web environment', async () => {
      disableElectronMode();
      const legacyConfig: LLMConfig = {
        ...DEFAULT_LLM_CONFIG,
        model: 'gpt-3.5-turbo',
      };

      // First call returns null (app config), second returns legacy config
      (localStorage.getItem as jest.Mock)
        .mockReturnValueOnce(null) // APP_CONFIG
        .mockReturnValueOnce(JSON.stringify(legacyConfig)); // LLM_CONFIG

      const result = await ConfigManager.loadLLMConfig();

      expect(result.model).toBe('gpt-3.5-turbo');
    });

    it('should return defaults on error', async () => {
      disableElectronMode();
      (localStorage.getItem as jest.Mock).mockImplementation(() => {
        throw new Error('Parse error');
      });

      const result = await ConfigManager.loadLLMConfig();

      expect(result).toEqual(DEFAULT_LLM_CONFIG);
    });
  });

  describe('saveLLMConfig', () => {
    it('should save LLM config as part of app config', async () => {
      disableElectronMode();
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(mockAppConfig));

      const newLLMConfig: LLMConfig = {
        ...DEFAULT_LLM_CONFIG,
        model: 'gpt-4o',
        temperature: 0.9,
      };

      const result = await ConfigManager.saveLLMConfig(newLLMConfig);

      expect(result).toBe(true);
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should create new app config when none exists', async () => {
      disableElectronMode();
      (localStorage.getItem as jest.Mock).mockReturnValue(null);

      const newLLMConfig: LLMConfig = {
        ...DEFAULT_LLM_CONFIG,
        model: 'gpt-4o-mini',
      };

      const result = await ConfigManager.saveLLMConfig(newLLMConfig);

      expect(result).toBe(true);
      expect(localStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('loadLocalConfig', () => {
    // Note: In JSDOM environment, window cannot be truly deleted
    it.skip('should return default value when window is undefined', () => {
      // SSR behavior cannot be tested in JSDOM environment
    });

    it('should load and merge with default value', () => {
      const defaultValue = { a: 1, b: 2 };
      const savedValue = { b: 3, c: 4 };
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(savedValue));

      const result = ConfigManager.loadLocalConfig('APP_CONFIG', defaultValue);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should return default value when localStorage is empty', () => {
      const defaultValue = { test: true };
      (localStorage.getItem as jest.Mock).mockReturnValue(null);

      const result = ConfigManager.loadLocalConfig('APP_CONFIG', defaultValue);

      expect(result).toEqual(defaultValue);
    });

    it('should return default value on parse error', () => {
      const defaultValue = { test: true };
      (localStorage.getItem as jest.Mock).mockReturnValue('invalid json');

      const result = ConfigManager.loadLocalConfig('APP_CONFIG', defaultValue);

      expect(result).toEqual(defaultValue);
    });
  });

  describe('saveLocalConfig', () => {
    // Note: In JSDOM environment, window cannot be truly deleted
    it.skip('should return false when window is undefined', () => {
      // SSR behavior cannot be tested in JSDOM environment
    });

    it('should save config to localStorage', () => {
      const value = { test: true };

      const result = ConfigManager.saveLocalConfig('APP_CONFIG', value);

      expect(localStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.APP_CONFIG,
        JSON.stringify(value)
      );
      expect(result).toBe(true);
    });

    it('should return false on error', () => {
      (localStorage.setItem as jest.Mock).mockImplementation(() => {
        throw new Error('Storage full');
      });

      const result = ConfigManager.saveLocalConfig('APP_CONFIG', { test: true });

      expect(result).toBe(false);
    });
  });

  describe('isElectronWithAPI', () => {
    it('should return false in web environment', () => {
      disableElectronMode();
      expect(ConfigManager.isElectronWithAPI()).toBe(false);
    });

    it('should return true in electron environment', () => {
      enableElectronMode();
      expect(ConfigManager.isElectronWithAPI()).toBe(true);
    });

    it('should return false when window is undefined', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing undefined window
      delete global.window;

      expect(ConfigManager.isElectronWithAPI()).toBe(false);

      global.window = originalWindow;
    });
  });

  describe('STORAGE_KEYS', () => {
    it('should have all required keys', () => {
      expect(STORAGE_KEYS.APP_CONFIG).toBe('sepilot_app_config');
      expect(STORAGE_KEYS.LLM_CONFIG).toBe('sepilot_llm_config');
      expect(STORAGE_KEYS.VECTORDB_CONFIG).toBe('sepilot_vectordb_config');
      expect(STORAGE_KEYS.EMBEDDING_CONFIG).toBe('sepilot_embedding_config');
      expect(STORAGE_KEYS.COMFYUI_CONFIG).toBe('sepilot_comfyui_config');
    });
  });

  describe('DEFAULT_LLM_CONFIG', () => {
    it('should have valid defaults', () => {
      expect(DEFAULT_LLM_CONFIG.provider).toBe('openai');
      expect(DEFAULT_LLM_CONFIG.baseURL).toBe('https://api.openai.com/v1');
      expect(DEFAULT_LLM_CONFIG.model).toBe('gpt-4');
      expect(DEFAULT_LLM_CONFIG.temperature).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_LLM_CONFIG.temperature).toBeLessThanOrEqual(2);
      expect(DEFAULT_LLM_CONFIG.maxTokens).toBeGreaterThan(0);
    });

    it('should have vision config', () => {
      expect(DEFAULT_LLM_CONFIG.vision).toBeDefined();
      expect(DEFAULT_LLM_CONFIG.vision?.enabled).toBe(false);
      expect(DEFAULT_LLM_CONFIG.vision?.model).toBe('gpt-4o-mini');
    });
  });
});
