/**
 * Store 추상화 - Extension에서 Host의 상태 저장소에 접근
 *
 * Host App이 registerStoreAccessor()로 useChatStore를 등록하고,
 * Extension은 useExtensionStore(selector)로 접근합니다.
 *
 * ⚠️ 중요: Extension IIFE 런타임에서 Zustand의 useSyncExternalStoreWithSelector와
 * React의 native useSyncExternalStore 모두 리렌더링을 트리거하지 않는 문제가 있어,
 * useState + useEffect + subscribe 패턴을 사용합니다.
 *
 * @example
 * ```typescript
 * // Host App (loader.ts)
 * import { registerStoreAccessor } from '@sepilot/extension-sdk/store';
 * import { useChatStore } from '@/lib/store/chat-store';
 * registerStoreAccessor(useChatStore);
 *
 * // Extension (React 컴포넌트 내부)
 * import { useExtensionStore } from '@sepilot/extension-sdk/store';
 * const { messages, addMessage } = useExtensionStore();
 *
 * // Extension (비-React 코드)
 * import { getExtensionStoreState } from '@sepilot/extension-sdk/store';
 * const state = getExtensionStoreState();
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type StoreHook = {
  (): any; // selector 없이 호출 시 전체 상태 반환
  <T>(selector: (state: any) => T): T; // selector로 호출 시 선택된 값 반환
  getState: () => any;
  setState: (partial: any) => void;
  subscribe: (listener: (state: any) => void) => () => void;
};

// globalThis를 사용하여 싱글톤 보장 (webpack/tsup 여러 인스턴스 대응)
const GLOBAL_KEY = '__SEPILOT_SDK_STORE__';
const DEBUG = typeof window !== 'undefined' && (window as any).__SEPILOT_SDK_DEBUG__;

function getStore(): StoreHook | null {
  return (globalThis as any)[GLOBAL_KEY] ?? null;
}

function setStore(store: StoreHook): void {
  (globalThis as any)[GLOBAL_KEY] = store;
}

/**
 * Host App이 Store accessor를 등록
 * Extension 로드 전에 호출되어야 합니다.
 *
 * @param store - Zustand store 훅 (useChatStore)
 */
export function registerStoreAccessor(store: StoreHook): void {
  if (DEBUG) {
    console.log('[Extension SDK Store] registerStoreAccessor called', {
      hasSubscribe: typeof store?.subscribe === 'function',
      hasGetState: typeof store?.getState === 'function',
      hasSetState: typeof store?.setState === 'function',
    });
  }
  setStore(store);
}

/**
 * Extension에서 Host Store에 접근하는 React 훅
 *
 * useState + useEffect + subscribe 패턴을 사용하여
 * Extension IIFE 런타임에서도 확실한 리렌더링을 보장합니다.
 *
 * useSyncExternalStore, Zustand hook 모두 Extension IIFE 런타임에서
 * 리렌더링을 트리거하지 않는 문제가 있어 가장 원시적인 패턴을 사용합니다.
 *
 * @param selector - 상태 선택 함수 (생략하면 전체 상태)
 * @returns 선택된 상태 값
 */
export function useExtensionStore<T>(selector?: (state: any) => T): T | any {
  const store = getStore();
  if (!store) {
    throw new Error(
      '[Extension SDK] Store accessor not registered. Host App must call registerStoreAccessor() before Extension loading.'
    );
  }

  // useState + useEffect + subscribe 패턴
  // useSyncExternalStore와 Zustand hook 모두 Extension IIFE 런타임에서
  // 리렌더링을 트리거하지 않아, 가장 원시적이고 확실한 패턴 사용
  const [state, setState] = useState(() => store.getState());
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  });

  const onStoreChange = useCallback(() => {
    const nextState = store.getState();
    // 참조가 다를 때만 setState (Zustand은 set() 시 항상 새 객체 생성)
    if (!Object.is(nextState, stateRef.current)) {
      if (DEBUG) {
        console.log('[Extension SDK Store] State changed, triggering re-render');
      }
      setState(nextState);
    }
  }, [store]);

  useEffect(() => {
    if (DEBUG) {
      console.log('[Extension SDK Store] Subscribing to store');
    }
    const unsubscribe = store.subscribe(onStoreChange);
    return () => {
      if (DEBUG) {
        console.log('[Extension SDK Store] Unsubscribing from store');
      }
      unsubscribe();
    };
  }, [store, onStoreChange]);

  return selector ? selector(state) : state;
}

/**
 * React 외부에서 Store 상태에 접근
 *
 * `useChatStore.getState()` 대체용.
 * 비-React 코드 (agent, tool 등)에서 사용합니다.
 */
export function getExtensionStoreState(): any {
  const store = getStore();
  if (!store) {
    throw new Error(
      '[Extension SDK] Store accessor not registered. Host App must call registerStoreAccessor() before Extension loading.'
    );
  }
  return store.getState();
}

/**
 * React 외부에서 Store 상태 변경
 *
 * `useChatStore.setState()` 대체용.
 */
export function setExtensionStoreState(partial: any): void {
  const store = getStore();
  if (!store) {
    throw new Error(
      '[Extension SDK] Store accessor not registered. Host App must call registerStoreAccessor() before Extension loading.'
    );
  }
  store.setState(partial);
}

/**
 * Store 변경 구독
 */
export function subscribeExtensionStore(listener: (state: any) => void): () => void {
  const store = getStore();
  if (!store) {
    throw new Error(
      '[Extension SDK] Store accessor not registered. Host App must call registerStoreAccessor() before Extension loading.'
    );
  }
  return store.subscribe(listener);
}

/**
 * Store accessor가 등록되었는지 확인
 */
export function isStoreRegistered(): boolean {
  return getStore() !== null;
}
