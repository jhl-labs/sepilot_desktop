/**
 * Host 초기화 모듈 - Host App 전용
 *
 * Host App이 Extension 로드 전에 initializeSDK()를 호출하여
 * 모든 SDK 모듈에 실제 구현체를 주입합니다.
 *
 * @example
 * ```typescript
 * // Host App (lib/extensions/loader.ts)
 * import { initializeSDK } from '@sepilot/extension-sdk/host';
 *
 * initializeSDK({
 *   storeAccessor: useChatStore,
 *   chatComponents: { UnifiedChatArea, UnifiedChatInput, ... },
 *   hooks: { useLangGraphStream },
 * });
 * ```
 */

import type { ComponentType } from 'react';
import type { AgentGraphServices } from '../agent/services';
import type { AgentRuntime } from '../agent/runtime';
import type { ChatComponents } from '../chat';
import type { StoreHook } from '../store';
import { registerStoreAccessor } from '../store';
import { registerChatComponents } from '../chat';
import { registerLangGraphStreamHook } from '../hooks/use-langgraph-stream';

/**
 * Host App이 제공해야 하는 브릿지 인터페이스
 */
export interface HostBridge {
  /** Zustand store accessor (useChatStore) */
  storeAccessor?: StoreHook;

  /** Agent 서비스 (Main Process용) */
  agentServices?: AgentGraphServices;

  /** Agent 런타임 (Main Process용) */
  agentRuntime?: AgentRuntime;

  /** Chat UI 컴포넌트 (Renderer용) */
  chatComponents?: Partial<ChatComponents>;

  /** 훅 구현체 (Renderer용) */
  hooks?: {
    useLangGraphStream?: (...args: any[]) => any;
  };
}

// globalThis를 사용하여 싱글톤 보장 (webpack/tsup 여러 인스턴스 대응)
const GLOBAL_KEY = '__SEPILOT_SDK_INITIALIZED__';

function isInitialized(): boolean {
  return (globalThis as any)[GLOBAL_KEY] === true;
}

function setInitialized(value: boolean): void {
  (globalThis as any)[GLOBAL_KEY] = value;
}

/**
 * SDK 초기화 - Host App이 Extension 로드 전에 호출
 *
 * Renderer Process와 Main Process에서 각각 필요한 부분만 등록합니다.
 */
export function initializeSDK(bridge: HostBridge): void {
  // Store accessor 등록 (Renderer)
  if (bridge.storeAccessor) {
    registerStoreAccessor(bridge.storeAccessor);
  }

  // Chat 컴포넌트 등록 (Renderer)
  if (bridge.chatComponents) {
    registerChatComponents(bridge.chatComponents);
  }

  // Hooks 등록 (Renderer)
  if (bridge.hooks?.useLangGraphStream) {
    registerLangGraphStreamHook(bridge.hooks.useLangGraphStream);
  }

  setInitialized(true);
}

/**
 * SDK가 초기화되었는지 확인
 */
export function isSDKInitialized(): boolean {
  return isInitialized();
}
