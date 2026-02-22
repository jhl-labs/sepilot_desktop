/**
 * Agent Tools Registry
 *
 * Host App이 toolsNode, shouldUseTool 함수를 등록하면,
 * Extension에서 직접 호출할 수 있도록 하는 서비스 레지스트리입니다.
 */

export interface AgentToolsRegistry {
  /** 도구 실행 노드 */
  toolsNode: (state: any) => Promise<any>;
  /** 도구 사용 여부 판단 */
  shouldUseTool: (state: any) => 'tools' | 'end';
}

// globalThis를 사용하여 싱글톤 보장 (webpack/tsup 여러 인스턴스 대응)
const GLOBAL_KEY = '__SEPILOT_SDK_AGENT_TOOLS_REGISTRY__';

function getRegistry(): AgentToolsRegistry | null {
  return (globalThis as any)[GLOBAL_KEY] ?? null;
}

function setRegistry(registry: AgentToolsRegistry): void {
  (globalThis as any)[GLOBAL_KEY] = registry;
}

/**
 * Host App에서 도구 레지스트리를 등록합니다.
 */
export function registerToolsRegistry(registry: AgentToolsRegistry): void {
  setRegistry(registry);
}

/**
 * toolsNode 함수 가져오기
 */
export function getToolsNode(): (state: any) => Promise<any> {
  const registry = getRegistry();
  if (!registry) {
    throw new Error(
      '[SDK] AgentToolsRegistry not initialized. Host must call registerToolsRegistry() first.'
    );
  }
  return registry.toolsNode;
}

/**
 * shouldUseTool 함수 가져오기
 */
export function getShouldUseTool(): (state: any) => 'tools' | 'end' {
  const registry = getRegistry();
  if (!registry) {
    throw new Error(
      '[SDK] AgentToolsRegistry not initialized. Host must call registerToolsRegistry() first.'
    );
  }
  return registry.shouldUseTool;
}
