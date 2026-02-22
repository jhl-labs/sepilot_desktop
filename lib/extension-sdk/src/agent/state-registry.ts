/**
 * Agent State Registry
 *
 * Host App이 LangGraph StateAnnotation 객체를 등록하면,
 * Extension에서 접근할 수 있도록 하는 서비스 레지스트리입니다.
 */

export interface AgentStateRegistry {
  /** AgentStateAnnotation 객체 반환 */
  getAgentStateAnnotation(): any;
  /** CodingAgentStateAnnotation 객체 반환 */
  getCodingAgentStateAnnotation(): any;
  /** 초기 Agent 상태 생성 */
  createAgentState(partial?: Record<string, any>): any;
  /** 초기 Coding Agent 상태 생성 */
  createCodingAgentState(partial?: Record<string, any>): any;
}

// globalThis를 사용하여 싱글톤 보장 (webpack/tsup 여러 인스턴스 대응)
const GLOBAL_KEY = '__SEPILOT_SDK_AGENT_STATE_REGISTRY__';

function getRegistry(): AgentStateRegistry | null {
  return (globalThis as any)[GLOBAL_KEY] ?? null;
}

function setRegistry(registry: AgentStateRegistry): void {
  (globalThis as any)[GLOBAL_KEY] = registry;
}

/**
 * Host App에서 StateAnnotation 레지스트리를 등록합니다.
 */
export function registerAgentStateRegistry(registry: AgentStateRegistry): void {
  setRegistry(registry);
}

/**
 * AgentStateAnnotation 가져오기
 */
export function getAgentStateAnnotation(): any {
  const registry = getRegistry();
  if (!registry) {
    throw new Error(
      '[SDK] AgentStateRegistry not initialized. Host must call registerAgentStateRegistry() first.'
    );
  }
  return registry.getAgentStateAnnotation();
}

/**
 * CodingAgentStateAnnotation 가져오기
 */
export function getCodingAgentStateAnnotation(): any {
  const registry = getRegistry();
  if (!registry) {
    throw new Error(
      '[SDK] AgentStateRegistry not initialized. Host must call registerAgentStateRegistry() first.'
    );
  }
  return registry.getCodingAgentStateAnnotation();
}

/**
 * 초기 Agent 상태 생성
 */
export function createAgentState(partial?: Record<string, any>): any {
  const registry = getRegistry();
  if (!registry) {
    throw new Error(
      '[SDK] AgentStateRegistry not initialized. Host must call registerAgentStateRegistry() first.'
    );
  }
  return registry.createAgentState(partial);
}

/**
 * 초기 Coding Agent 상태 생성
 */
export function createCodingAgentState(partial?: Record<string, any>): any {
  const registry = getRegistry();
  if (!registry) {
    throw new Error(
      '[SDK] AgentStateRegistry not initialized. Host must call registerAgentStateRegistry() first.'
    );
  }
  return registry.createCodingAgentState(partial);
}
