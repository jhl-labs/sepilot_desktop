/**
 * Chat 컴포넌트 레지스트리 - Extension에서 Host의 Chat UI 컴포넌트 사용
 *
 * Host App이 registerChatComponents()로 UnifiedChatArea 등을 등록하고,
 * Extension은 이 모듈에서 export된 컴포넌트를 사용합니다.
 *
 * @example
 * ```typescript
 * // Host App (loader.ts)
 * import { registerChatComponents } from '@sepilot/extension-sdk/chat';
 * import { UnifiedChatArea } from '@/components/chat/unified/UnifiedChatArea';
 * registerChatComponents({ UnifiedChatArea, UnifiedChatInput, MarkdownRenderer });
 *
 * // Extension
 * import { UnifiedChatArea, UnifiedChatInput } from '@sepilot/extension-sdk/chat';
 * ```
 */

import { type ComponentType, createElement, forwardRef } from 'react';

/**
 * 등록 가능한 Chat 컴포넌트 목록
 */
export interface ChatComponents {
  UnifiedChatArea: ComponentType<any>;
  UnifiedChatInput: ComponentType<any>;
  MarkdownRenderer: ComponentType<any>;
  AgentLogsPlugin: ComponentType<any>;
  ErrorBoundary: ComponentType<any>;
}

// globalThis를 사용하여 싱글톤 보장 (webpack/tsup 여러 인스턴스 대응)
const GLOBAL_KEY = '__SEPILOT_SDK_CHAT_COMPONENTS__';

function getComponents(): Partial<ChatComponents> {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = {};
  }
  return (globalThis as any)[GLOBAL_KEY];
}

/**
 * Host App이 Chat 컴포넌트를 등록
 */
export function registerChatComponents(components: Partial<ChatComponents>): void {
  Object.assign(getComponents(), components);
}

/**
 * 등록된 컴포넌트를 가져오는 내부 함수
 */
function getComponent(name: keyof ChatComponents): ComponentType<any> {
  const component = getComponents()[name];
  if (!component) {
    throw new Error(
      `[Extension SDK] Chat component '${name}' not registered. Host App must call registerChatComponents() before Extension loading.`
    );
  }
  return component;
}

/**
 * 프록시 컴포넌트 생성 — 런타임에 등록된 실제 컴포넌트로 위임
 */
function createProxyComponent(name: keyof ChatComponents): ComponentType<any> {
  const ProxyComponent = forwardRef((props: any, ref: any) => {
    const Comp = getComponent(name);
    return createElement(Comp, { ...props, ref });
  });
  ProxyComponent.displayName = `SDK.${name}`;
  return ProxyComponent;
}

/** Host의 UnifiedChatArea 컴포넌트 */
export const UnifiedChatArea = createProxyComponent('UnifiedChatArea');

/** Host의 UnifiedChatInput 컴포넌트 */
export const UnifiedChatInput = createProxyComponent('UnifiedChatInput');

/** Host의 MarkdownRenderer 컴포넌트 */
export const MarkdownRenderer = createProxyComponent('MarkdownRenderer');

/** Host의 AgentLogsPlugin 컴포넌트 */
export const AgentLogsPlugin = createProxyComponent('AgentLogsPlugin');

/** Host의 ErrorBoundary 컴포넌트 */
export const ErrorBoundary = createProxyComponent('ErrorBoundary');
