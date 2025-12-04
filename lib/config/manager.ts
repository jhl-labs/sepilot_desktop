/**
 * ConfigManager
 * Electron/Web 환경에서 설정 로드/저장을 추상화
 */

import { AppConfig, LLMConfig } from '@/types';
import { isElectron } from '@/lib/platform';

/**
 * Storage keys for localStorage (web fallback)
 */
const STORAGE_KEYS = {
  APP_CONFIG: 'sepilot_app_config',
  LLM_CONFIG: 'sepilot_llm_config',
  VECTORDB_CONFIG: 'sepilot_vectordb_config',
  EMBEDDING_CONFIG: 'sepilot_embedding_config',
  COMFYUI_CONFIG: 'sepilot_comfyui_config',
} as const;

/**
 * Default LLM configuration
 */
const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'openai',
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4',
  temperature: 0,
  maxTokens: 4096,
  vision: {
    enabled: false,
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    maxImageTokens: 4096,
  },
};

/**
 * ConfigManager provides a unified interface for loading/saving configurations
 * across Electron (SQLite) and Web (localStorage) environments.
 */
export class ConfigManager {
  /**
   * Load full app config
   */
  static async loadAppConfig(): Promise<AppConfig | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      if (isElectron() && window.electronAPI) {
        const result = await window.electronAPI.config.load();
        if (result.success && result.data) {
          return result.data;
        }
        return null;
      }

      // Web: localStorage
      const saved = localStorage.getItem(STORAGE_KEYS.APP_CONFIG);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.error('[ConfigManager] Failed to load app config:', error);
      return null;
    }
  }

  /**
   * Save full app config
   */
  static async saveAppConfig(config: AppConfig): Promise<boolean> {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      if (isElectron() && window.electronAPI) {
        const result = await window.electronAPI.config.save(config);
        return result.success;
      }

      // Web: localStorage
      localStorage.setItem(STORAGE_KEYS.APP_CONFIG, JSON.stringify(config));
      return true;
    } catch (error) {
      console.error('[ConfigManager] Failed to save app config:', error);
      return false;
    }
  }

  /**
   * Load LLM config with defaults
   */
  static async loadLLMConfig(): Promise<LLMConfig> {
    try {
      const appConfig = await this.loadAppConfig();
      if (appConfig?.llm) {
        return { ...DEFAULT_LLM_CONFIG, ...appConfig.llm };
      }

      // Web fallback: try legacy storage key
      if (typeof window !== 'undefined' && !isElectron()) {
        const saved = localStorage.getItem(STORAGE_KEYS.LLM_CONFIG);
        if (saved) {
          return { ...DEFAULT_LLM_CONFIG, ...JSON.parse(saved) };
        }
      }

      return DEFAULT_LLM_CONFIG;
    } catch (error) {
      console.error('[ConfigManager] Failed to load LLM config:', error);
      return DEFAULT_LLM_CONFIG;
    }
  }

  /**
   * Save LLM config
   */
  static async saveLLMConfig(config: LLMConfig): Promise<boolean> {
    try {
      const appConfig = await this.loadAppConfig();
      const updatedConfig: AppConfig = {
        ...appConfig,
        llm: config,
      } as AppConfig;

      return await this.saveAppConfig(updatedConfig);
    } catch (error) {
      console.error('[ConfigManager] Failed to save LLM config:', error);
      return false;
    }
  }

  /**
   * Load a specific config section from localStorage (web only)
   */
  static loadLocalConfig<T>(key: keyof typeof STORAGE_KEYS, defaultValue: T): T {
    if (typeof window === 'undefined') {
      return defaultValue;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEYS[key]);
      return saved ? { ...defaultValue, ...JSON.parse(saved) } : defaultValue;
    } catch (error) {
      console.error(`[ConfigManager] Failed to load ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Save a config section to localStorage (web only)
   */
  static saveLocalConfig<T>(key: keyof typeof STORAGE_KEYS, value: T): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`[ConfigManager] Failed to save ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if running in Electron with config API available
   */
  static isElectronWithAPI(): boolean {
    return typeof window !== 'undefined' && isElectron() && !!window.electronAPI;
  }
}

export { STORAGE_KEYS, DEFAULT_LLM_CONFIG };
