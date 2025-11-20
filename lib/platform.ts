/**
 * 플랫폼 감지 및 Electron API 타입 가드 유틸리티
 */

/**
 * Electron 환경인지 확인
 */
export function isElectron(): boolean {
  // 브라우저 환경이 아니면 false
  if (typeof window === 'undefined') {
    return false;
  }

  // Electron API가 있으면 Electron 환경
  // (preload.ts의 contextBridge를 통해 안전하게 노출된 API)
  return window.electronAPI !== undefined;
}

/**
 * 웹 브라우저 환경인지 확인
 */
export function isWeb(): boolean {
  return typeof window !== 'undefined' && !isElectron();
}

/**
 * Electron API를 안전하게 가져오기
 */
export function getElectronAPI() {
  if (isElectron()) {
    return window.electronAPI;
  }
  return null;
}

/**
 * 환경 타입
 */
export type Environment = 'electron' | 'web' | 'server';

/**
 * 현재 실행 환경 가져오기
 */
export function getEnvironment(): Environment {
  if (typeof window === 'undefined') {
    return 'server';
  }
  return isElectron() ? 'electron' : 'web';
}
