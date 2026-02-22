/**
 * Extension Agent Runtime
 *
 * Agent Manifest 기반으로 Agent를 실행하는 엔진입니다.
 * VSCode Extension처럼 선언적 구조를 지원합니다.
 */

import type {
  AgentManifest,
  ExtensionRuntimeContext,
  AgentRunOptions,
} from '@sepilot/extension-sdk';
import Mustache from 'mustache';

export class ExtensionAgentRuntime {
  constructor(
    private extensionId: string,
    private agentManifest: AgentManifest,
    private context: ExtensionRuntimeContext
  ) {}

  /**
   * Agent 실행
   */
  async *run<TInput = any, TOutput = any>(
    input: TInput,
    options?: AgentRunOptions
  ): AsyncGenerator<TOutput> {
    const startTime = Date.now();
    console.log(`[AgentRuntime] Starting agent: ${this.agentManifest.id}`, {
      extensionId: this.extensionId,
      input,
      options,
    });

    try {
      // 1. System Prompt 렌더링
      const systemPrompt = this.renderSystemPrompt(input);
      yield {
        type: 'system_prompt',
        content: systemPrompt,
      } as TOutput;

      // 2. Tool 수집
      const tools = this.collectTools();
      if (tools.length > 0) {
        yield {
          type: 'tools_collected',
          count: tools.length,
          tools: tools.map((t) => t.function.name),
        } as TOutput;
      }

      // 3. LLM Provider 확인
      if (!this.context.llm && this.agentManifest.llmConfig?.requiresProvider) {
        throw new Error(
          `Agent ${this.agentManifest.id} requires LLM Provider but none is available`
        );
      }

      // 4. Agent 루프 실행
      const maxIterations =
        options?.maxIterations || this.agentManifest.options?.maxIterations || 10;
      const streaming = options?.streaming ?? this.agentManifest.options?.streaming ?? true;

      yield {
        type: 'agent_started',
        agentId: this.agentManifest.id,
        maxIterations,
        streaming,
      } as TOutput;

      // TODO: 실제 Agent 루프 구현
      // - LLM 호출
      // - Tool 실행
      // - 결과 처리
      // - 반복

      // 임시: 간단한 완료 메시지
      yield {
        type: 'agent_completed',
        agentId: this.agentManifest.id,
        duration: Date.now() - startTime,
      } as TOutput;
    } catch (error) {
      console.error(`[AgentRuntime] Error in agent ${this.agentManifest.id}:`, error);
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      } as TOutput;
    }
  }

  /**
   * System Prompt 렌더링 (Mustache 템플릿)
   */
  private renderSystemPrompt(input: any): string {
    try {
      const template = this.agentManifest.systemPromptTemplate;
      const view = {
        ...input,
        extensionId: this.extensionId,
        agentId: this.agentManifest.id,
        workingDirectory: this.context.workspace?.getWorkingDirectory(),
      };

      return Mustache.render(template, view);
    } catch (error) {
      console.error('[AgentRuntime] Error rendering system prompt:', error);
      return this.agentManifest.systemPromptTemplate;
    }
  }

  /**
   * Tool 수집 (Extension의 Tool Registry에서)
   */
  private collectTools(): any[] {
    if (!this.agentManifest.tools || this.agentManifest.tools.length === 0) {
      return [];
    }

    const toolRegistry = this.context.tools;
    if (!toolRegistry) {
      console.warn('[AgentRuntime] Tool Registry not available');
      return [];
    }

    // Tool Registry에서 OpenAI 포맷으로 변환
    try {
      return toolRegistry.toOpenAIFormat();
    } catch (error) {
      console.error('[AgentRuntime] Error collecting tools:', error);
      return [];
    }
  }

  /**
   * Tool 실행
   */
  private async executeTools(toolCalls: any[]): Promise<any[]> {
    if (!this.context.tools) {
      throw new Error('Tool Registry not available');
    }

    const results = [];

    for (const toolCall of toolCalls) {
      try {
        const result = await this.context.tools.execute(
          toolCall.function.name,
          toolCall.function.arguments
        );
        results.push({
          tool_call_id: toolCall.id,
          output: result,
        });
      } catch (error) {
        results.push({
          tool_call_id: toolCall.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Agent 정보 조회
   */
  getInfo() {
    return {
      extensionId: this.extensionId,
      agentId: this.agentManifest.id,
      name: this.agentManifest.name,
      description: this.agentManifest.description,
      type: this.agentManifest.type,
      hasLLM: !!this.context.llm,
      hasTools: !!this.context.tools,
      toolCount: this.collectTools().length,
    };
  }
}
