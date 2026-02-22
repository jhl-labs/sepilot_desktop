/**
 * Host UI Components Registry
 *
 * Host App이 제공하는 UI 컴포넌트를 Extension에서 사용할 수 있도록 하는 레지스트리입니다.
 */

import type { ComponentType } from 'react';

export interface HostUIComponents {
  SettingsSectionHeader?: ComponentType<any>;
  ErrorBoundary?: ComponentType<any>;
}

// globalThis를 사용하여 싱글톤 보장 (webpack/tsup 여러 인스턴스 대응)
const GLOBAL_KEY = '__SEPILOT_SDK_HOST_UI_COMPONENTS__';

function getRegistry(): HostUIComponents {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = {};
  }
  return (globalThis as any)[GLOBAL_KEY];
}

/**
 * Host UI 컴포넌트 등록
 */
export function registerHostUIComponents(components: Partial<HostUIComponents>): void {
  Object.assign(getRegistry(), components);
}

/**
 * Main Process 환경인지 확인
 */
function isMainProcess(): boolean {
  return typeof window === 'undefined';
}

/**
 * 더미 컴포넌트 (Main Process에서 사용)
 */
const DummyComponent: ComponentType<any> = () => null;

/**
 * SettingsSectionHeader 컴포넌트 가져오기
 */
export function getSettingsSectionHeader(): ComponentType<any> {
  // Main Process에서는 더미 컴포넌트 반환 (UI 렌더링 없음)
  if (isMainProcess()) {
    return DummyComponent;
  }
  
  const registry = getRegistry();
  if (!registry.SettingsSectionHeader) {
    throw new Error(
      '[SDK] SettingsSectionHeader not registered. Host must call registerHostUIComponents() first.'
    );
  }
  return registry.SettingsSectionHeader;
}

/**
 * ErrorBoundary 컴포넌트 가져오기
 */
export function getErrorBoundary(): ComponentType<any> {
  // Main Process에서는 더미 컴포넌트 반환 (UI 렌더링 없음)
  if (isMainProcess()) {
    return DummyComponent;
  }
  
  const registry = getRegistry();
  if (!registry.ErrorBoundary) {
    throw new Error(
      '[SDK] ErrorBoundary not registered. Host must call registerHostUIComponents() first.'
    );
  }
  return registry.ErrorBoundary;
}

/**
 * 등록된 Host UI 컴포넌트 전체 가져오기
 */
export function getHostUIComponents(): HostUIComponents {
  return getRegistry();
}
