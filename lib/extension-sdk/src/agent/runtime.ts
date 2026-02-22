/**
 * AgentRuntime - Host App이 구현하는 Agent 실행 환경 인터페이스
 *
 * Extension의 BaseAgentGraph를 컴파일하고 실행하는 역할을 합니다.
 * 실제 구현은 Host App의 LangGraph 인프라를 사용합니다.
 */

import type {
  BaseAgentGraph,
  BaseAgentState,
  AgentGraphExecutionOptions,
} from './base-agent-graph';

/**
 * 컴파일된 그래프 (Host에서 생성)
 */
export interface CompiledAgentGraph<TState = any> {
  /** 동기 실행 */
  invoke(state: TState, options?: any): Promise<TState>;
  /** 스트리밍 실행 */
  stream(state: TState, options?: any): AsyncGenerator<any>;
}

/**
 * AgentRuntime 인터페이스
 *
 * Host App이 이 인터페이스를 구현하여 Extension Agent를 실행합니다.
 */
export interface AgentRuntime {
  /** BaseAgentGraph를 컴파일하여 실행 가능한 그래프 생성 */
  compile<TState extends BaseAgentState>(graph: BaseAgentGraph<TState>): CompiledAgentGraph<TState>;

  /** 컴파일된 그래프 동기 실행 */
  invoke<TState extends BaseAgentState>(
    compiled: CompiledAgentGraph<TState>,
    state: TState,
    options?: AgentGraphExecutionOptions
  ): Promise<TState>;

  /** 컴파일된 그래프 스트리밍 실행 */
  stream<TState extends BaseAgentState>(
    compiled: CompiledAgentGraph<TState>,
    state: TState,
    options?: AgentGraphExecutionOptions
  ): AsyncGenerator<any>;
}
