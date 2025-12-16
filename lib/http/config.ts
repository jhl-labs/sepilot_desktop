/**
 * HTTP 통신 중앙 집중화 모듈 - NetworkConfig 로딩
 *
 * 환경별 NetworkConfig 로드 전략:
 * - Electron Main Process: Database 직접 접근
 * - Electron Renderer: IPC 통해 로드
 * - 브라우저: localStorage
 */

import { NetworkConfig } from '@/types';
import { Environment } from './types';
import { logger } from '@/lib/utils/logger';

/** 캐시된 NetworkConfig */
let cachedConfig: NetworkConfig | null = null;

/** 캐시 유효 시간 (ms) - 5분 */
const CACHE_TTL = 5 * 60 * 1000;

/** 마지막 캐시 시간 */
let lastCacheTime = 0;

/**
 * 현재 실행 환경 감지
 */
export function detectEnvironment(): Environment {
  // Node.js 환경 (Electron Main 또는 순수 Node.js)
  if (typeof window === 'undefined') {
    const isElectron = typeof process !== 'undefined' && process.versions?.electron;
    return isElectron ? 'electron-main' : 'node';
  }

  // 브라우저 환경 (Electron Renderer 또는 순수 브라우저)
  const isElectronRenderer =
    typeof window !== 'undefined' && (window as any).electronAPI !== undefined;

  return isElectronRenderer ? 'electron-renderer' : 'browser';
}

/**
 * Electron 환경 여부 확인
 */
export function isElectron(): boolean {
  const env = detectEnvironment();
  return env === 'electron-main' || env === 'electron-renderer';
}

/**
 * NetworkConfig 가져오기 (캐싱 포함)
 *
 * @param forceRefresh - 캐시 무시하고 새로 로드
 * @returns NetworkConfig 또는 null
 */
export async function getNetworkConfig(forceRefresh = false): Promise<NetworkConfig | null> {
  const now = Date.now();

  // 캐시가 유효하면 반환
  if (!forceRefresh && cachedConfig && now - lastCacheTime < CACHE_TTL) {
    return cachedConfig;
  }

  const env = detectEnvironment();

  try {
    switch (env) {
      case 'electron-main':
        cachedConfig = await loadFromDatabase();
        break;
      case 'electron-renderer':
        cachedConfig = await loadViaIPC();
        break;
      case 'browser':
        cachedConfig = loadFromLocalStorage();
        break;
      case 'node':
        // 순수 Node.js 환경에서는 환경 변수 사용
        cachedConfig = loadFromEnvironment();
        break;
    }

    lastCacheTime = now;
    return cachedConfig;
  } catch (error) {
    logger.warn('[HTTP Config] Failed to load NetworkConfig:', error);
    return null;
  }
}

/**
 * 설정 캐시 초기화 (설정 변경 시 호출)
 */
export function clearNetworkConfigCache(): void {
  cachedConfig = null;
  lastCacheTime = 0;
  logger.debug('[HTTP Config] Cache cleared');
}

/**
 * NetworkConfig 직접 설정 (의존성 주입용)
 */
export function setNetworkConfig(config: NetworkConfig): void {
  cachedConfig = config;
  lastCacheTime = Date.now();
  logger.debug('[HTTP Config] Config set directly');
}

/**
 * Electron Main Process: Database에서 로드
 */
async function loadFromDatabase(): Promise<NetworkConfig | null> {
  try {
    // 동적 import로 순환 참조 방지
    const { databaseService } = await import('@/electron/services/database');
    const configStr = databaseService.getSetting('app_config');

    if (configStr) {
      const appConfig = JSON.parse(configStr);
      return appConfig.network || null;
    }
  } catch (error) {
    logger.warn('[HTTP Config] Failed to load from database:', error);
  }
  return null;
}

/**
 * Electron Renderer: IPC 통해 로드
 */
async function loadViaIPC(): Promise<NetworkConfig | null> {
  try {
    const electronAPI = (window as any).electronAPI;

    if (electronAPI?.config) {
      const result = await electronAPI.config.load();
      if (result.success !== false && result?.network) {
        return result.network;
      }
      // result가 직접 AppConfig인 경우
      if (result && typeof result === 'object' && 'network' in result) {
        return result.network || null;
      }
    }
  } catch (error) {
    logger.warn('[HTTP Config] Failed to load via IPC:', error);
  }
  return null;
}

/**
 * 브라우저: localStorage에서 로드
 */
function loadFromLocalStorage(): NetworkConfig | null {
  try {
    const configStr = localStorage.getItem('sepilot_app_config');
    if (configStr) {
      const appConfig = JSON.parse(configStr);
      return appConfig.network || null;
    }
  } catch (error) {
    logger.warn('[HTTP Config] Failed to load from localStorage:', error);
  }
  return null;
}

/**
 * 순수 Node.js: 환경 변수에서 로드
 */
function loadFromEnvironment(): NetworkConfig | null {
  const proxyUrl =
    process.env.HTTP_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.https_proxy;

  if (proxyUrl) {
    return {
      proxy: {
        enabled: true,
        mode: 'manual',
        url: proxyUrl,
      },
      ssl: {
        verify: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
      },
    };
  }

  return null;
}

/**
 * 기본 NetworkConfig 생성
 */
export function createDefaultNetworkConfig(): NetworkConfig {
  return {
    proxy: {
      enabled: false,
      mode: 'none',
      url: '',
    },
    ssl: {
      verify: true,
    },
    customHeaders: {},
  };
}
