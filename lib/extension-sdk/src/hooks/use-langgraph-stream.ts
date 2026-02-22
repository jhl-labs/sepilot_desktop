/**
 * useLangGraphStream 추상 훅
 *
 * Host App이 registerLangGraphStreamHook()으로 실제 구현을 등록하고,
 * Extension은 useLangGraphStream()을 사용합니다.
 *
 * 싱글톤 보장: globalThis를 사용하여 webpack/tsup이 여러 인스턴스를
 * 생성해도 같은 훅을 공유합니다.
 *
 * @example
 * ```typescript
 * // Host App
 * import { registerLangGraphStreamHook } from '@sepilot/extension-sdk/hooks/use-langgraph-stream';
 * import { useLangGraphStream as hostHook } from '@/lib/hooks/useLangGraphStream';
 * registerLangGraphStreamHook(hostHook);
 *
 * // Extension
 * import { useLangGraphStream } from '@sepilot/extension-sdk/hooks/use-langgraph-stream';
 * const { sendMessage, isStreaming } = useLangGraphStream(graphConfig);
 * ```
 */

type LangGraphStreamHook = (...args: any[]) => any;

// globalThis를 사용하여 싱글톤 보장 (webpack/tsup 여러 인스턴스 대응)
const GLOBAL_KEY = '__SEPILOT_SDK_LANGGRAPH_STREAM_HOOK__';

function getHook(): LangGraphStreamHook | null {
  return (globalThis as any)[GLOBAL_KEY] ?? null;
}

function setHook(hook: LangGraphStreamHook): void {
  (globalThis as any)[GLOBAL_KEY] = hook;
}

/**
 * Host App이 실제 useLangGraphStream 훅을 등록
 */
export function registerLangGraphStreamHook(hook: LangGraphStreamHook): void {
  setHook(hook);
}

/**
 * useLangGraphStream hook is registered check
 */
export function isLangGraphStreamHookRegistered(): boolean {
  return getHook() !== null;
}

/**
 * Extension에서 사용하는 LangGraph Stream 훅
 */
export function useLangGraphStream(...args: any[]): any {
  const hook = getHook();
  if (!hook) {
    // 런타임 에러 메시지 강화
    const errorMsg = '[Extension SDK] useLangGraphStream hook not registered. ' +
      'This usually means @sepilot/extension-sdk/hooks was not registered in the Host Module Registry ' +
      'or initializeSDK() was not called before extension rendering.';
    console.error(errorMsg);
    
    // 훅의 규칙을 지키기 위해 에러를 던지지만, 더 명확한 정보를 제공
    throw new Error(errorMsg);
  }
  return hook(...args);
}
