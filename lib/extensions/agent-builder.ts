/**
 * Agent Builder 구현
 *
 * Agent Manifest 기반으로 Agent를 실행합니다.
 */

import type {
  AgentBuilder,
  AgentInfo,
  AgentRunOptions,
  LLMProvider,
  ToolRegistry,
} from '@sepilot/extension-sdk';

export class AgentBuilderImpl implements AgentBuilder {
  private agents = new Map<string, AgentInfo>();

  constructor(
    private extensionId: string,
    private llmProvider?: LLMProvider,
    private toolRegistry?: ToolRegistry
  ) {}

  /**
   * Agent 등록
   */
  registerAgent(agentInfo: AgentInfo): void {
    this.agents.set(agentInfo.id, agentInfo);
    console.debug(`[AgentBuilder] Registered agent: ${agentInfo.id}`);
  }

  /**
   * Agent 실행
   */
  async *run<TInput = any, TOutput = any>(
    agentId: string,
    input: TInput,
    options?: AgentRunOptions
  ): AsyncGenerator<TOutput> {
    const agentInfo = this.agents.get(agentId);

    if (!agentInfo) {
      throw new Error(`Agent not found: ${agentId} in extension ${this.extensionId}`);
    }

    console.log(`[AgentBuilder] Running agent: ${agentId}`, { input, options });

    // TODO: Agent 실행 로직 구현
    // 1. System Prompt 렌더링
    // 2. Tool 수집
    // 3. LLM 호출
    // 4. Agent 루프 실행

    // 임시: 간단한 메시지 반환
    yield {
      type: 'info',
      message: `Agent ${agentId} started (implementation pending)`,
    } as TOutput;

    yield {
      type: 'info',
      message: `Agent ${agentId} completed (implementation pending)`,
    } as TOutput;
  }

  /**
   * Agent 정보 조회
   */
  getAgentInfo(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 등록된 모든 Agent 조회
   */
  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Agent Builder 정리
   */
  dispose(): void {
    this.agents.clear();
  }
}
