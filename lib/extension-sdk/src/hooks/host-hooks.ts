/**
 * Host Hooks Registry
 *
 * Host App이 제공하는 React 훅을 Extension에서 사용할 수 있도록 하는 레지스트리입니다.
 */

export interface HostHooks {
  useTerminalHotkeys?: (...args: any[]) => any;
}

// globalThis를 사용하여 싱글톤 보장 (webpack/tsup 여러 인스턴스 대응)
const GLOBAL_KEY = '__SEPILOT_SDK_HOST_HOOKS__';

function getRegistry(): HostHooks {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = {};
  }
  return (globalThis as any)[GLOBAL_KEY];
}

/**
 * Host 훅 등록
 */
export function registerHostHooks(hooks: Partial<HostHooks>): void {
  Object.assign(getRegistry(), hooks);
}

/**
 * useTerminalHotkeys 훅 가져오기
 */
export function useTerminalHotkeys(...args: any[]): any {
  const registry = getRegistry();
  if (!registry.useTerminalHotkeys) {
    throw new Error(
      '[SDK] useTerminalHotkeys not registered. Host must call registerHostHooks() first.'
    );
  }
  return registry.useTerminalHotkeys(...args);
}

/**
 * 등록된 Host 훅 전체 가져오기
 */
export function getHostHooks(): HostHooks {
  return getRegistry();
}
