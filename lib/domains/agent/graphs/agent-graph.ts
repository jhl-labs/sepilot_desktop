/**
 * AgentGraph - Tool 사용을 지원하는 Agent 그래프
 *
 * BaseGraph를 상속하여 MCP Tools와 Human-in-the-Loop 지원
 *
 * 노드:
 * - generate: LLM 응답 생성 (도구 호출 포함)
 * - tools: 도구 실행
 *
 * 흐름:
 * START → generate → [decision] → tools → generate (루프) → END
 *
 * 특징:
 * - Tool 루프 지원 (최대 반복 횟수 제한)
 * - Human-in-the-loop (도구 승인 콜백)
 * - 안전 장치 (중복 검사, 빈도 제한)
 * - Skills 자동 주입
 */

import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation, AgentState } from '../state';
import { BaseGraph } from '../base/base-graph';
import { generateWithToolsNode } from '../nodes/generate';
import { toolsNode, shouldUseTool } from '../nodes/tools';
import type { Message } from '@/types';
import type { ToolApprovalCallback } from '../types';
import { logger } from '@/lib/utils/logger';

/**
 * AgentGraph 클래스
 */
export class AgentGraph extends BaseGraph<AgentState> {
  /**
   * State Annotation 생성
   */
  protected createStateAnnotation(): typeof AgentStateAnnotation {
    return AgentStateAnnotation;
  }

  /**
   * 노드 추가
   */
  protected buildNodes(workflow: StateGraph<any>): any {
    return workflow.addNode('generate', generateWithToolsNode).addNode('tools', toolsNode);
  }

  /**
   * 엣지 추가
   */
  protected buildEdges(workflow: any): any {
    return workflow
      .addEdge('__start__', 'generate')
      .addConditionalEdges('generate', shouldUseTool, {
        tools: 'tools',
        end: END,
      })
      .addEdge('tools', 'generate');
  }

  /**
   * Invoke the agent graph.
   * This now uses the stream method internally to ensure consistent behavior
   * (safeguards, loop protection, etc.) between stream and invoke.
   */
  async invoke(
    initialState: AgentState,
    options?: { maxIterations?: number; [key: string]: any }
  ): Promise<AgentState> {
    const maxIterations = options?.maxIterations || 50;
    return this.executeLoop(initialState, maxIterations);
  }

  /**
   * Internal execution loop shared by invoke and stream (conceptually).
   * Since `stream` is a generator, `invoke` can just consume it and build the state.
   */
  private async executeLoop(initialState: AgentState, maxIterations: number): Promise<AgentState> {
    const state = { ...initialState };
    const generator = this.stream(initialState, maxIterations);

    // We need to mirror state accumulation from the stream events
    for await (const event of generator) {
      if (event.generate?.messages) {
        state.messages = [...state.messages, ...event.generate.messages];
      }
      if (event.tools?.toolResults) {
        state.toolResults = [...(state.toolResults || []), ...event.tools.toolResults];
        state.generatedImages = [
          ...(state.generatedImages || []),
          ...(event.tools.generatedImages || []),
        ];
      }
      if (event.reporter?.messages) {
        state.messages = [...state.messages, ...event.reporter.messages];
      }
    }
    return state;
  }

  async *stream(
    initialState: AgentState,
    maxIterationsOrOptions?:
      | number
      | { maxIterations?: number; toolApprovalCallback?: ToolApprovalCallback },
    toolApprovalCallbackLegacy?: ToolApprovalCallback
  ): AsyncGenerator<any> {
    // Handle both old and new signatures
    let maxIterations = 50;
    let toolApprovalCallback: ToolApprovalCallback | undefined;

    if (typeof maxIterationsOrOptions === 'number') {
      // Legacy signature: stream(state, maxIterations, callback)
      maxIterations = maxIterationsOrOptions;
      toolApprovalCallback = toolApprovalCallbackLegacy;
    } else if (maxIterationsOrOptions) {
      // New signature: stream(state, options)
      maxIterations = maxIterationsOrOptions.maxIterations || 50;
      toolApprovalCallback = maxIterationsOrOptions.toolApprovalCallback;
    }

    const normalizedMaxIterations =
      Number.isFinite(maxIterations) && maxIterations > 0 ? Math.floor(maxIterations) : 50;
    const actualMaxIterations = normalizedMaxIterations;
    let state = { ...initialState };
    let iterations = 0;

    logger.info(
      `[AgentGraph] Starting stream with initial state (Max iterations: ${actualMaxIterations})`
    );

    let hasError = false;
    let errorMessage = '';

    // Track tool usage count to detect repetitive behavior
    const toolUsageCount = new Map<string, number>();
    let previousToolNames: string[] = [];

    // Skills 주입 (BaseGraph의 메서드 활용)
    try {
      const skillMessages = await this.injectSkills(state);
      if (skillMessages.length > 0) {
        state.messages = [...state.messages, ...skillMessages];
      }
    } catch (skillError) {
      logger.error('[AgentGraph] Skills injection error:', skillError);
      // Skill 주입 실패는 치명적이지 않으므로 계속 진행
    }

    while (iterations < actualMaxIterations) {
      logger.info(`[AgentGraph] ===== Iteration ${iterations + 1}/${actualMaxIterations} =====`);

      // 1. Generate Node
      let generateResult;
      try {
        generateResult = await generateWithToolsNode(state);
      } catch (error: any) {
        logger.error('[AgentGraph] Generate node error:', error);
        hasError = true;
        errorMessage = error.message || 'Failed to generate response';
        break;
      }

      if (generateResult.messages && generateResult.messages.length > 0) {
        const newMessage = generateResult.messages[0];
        // Merge state
        state = this.mergeState(state, {
          messages: [newMessage],
          toolResults: generateResult.toolResults,
          generatedImages: generateResult.generatedImages,
        });

        yield {
          generate: {
            messages: [newMessage],
          },
        };
      }

      // 2. Decision
      const decision = shouldUseTool(state);
      if (decision === 'end') {
        break;
      }

      // 3. Approval
      const lastMessage = state.messages[state.messages.length - 1];
      const approved = await this.handleToolApproval(lastMessage, toolApprovalCallback);
      if (!approved) {
        const rejectionMessage: Message = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: '도구 실행이 사용자에 의해 거부되었습니다.',
          created_at: Date.now(),
        };
        state = this.mergeState(state, { messages: [rejectionMessage] });
        yield {
          generate: { messages: [rejectionMessage] },
        };
        break;
      }

      // 4. Execute Tools
      this.logToolExecutionStart(
        lastMessage,
        iterations,
        actualMaxIterations,
        state.conversationId
      );

      const toolsResult = await toolsNode(state);

      this.logToolExecutionEnd(toolsResult, state.conversationId);

      // Merge state (preserve tool_calls in message history)
      state = this.mergeState(state, {
        toolResults: toolsResult.toolResults,
        generatedImages: toolsResult.generatedImages,
      });

      // Yield tools result
      yield { tools: toolsResult };

      // 5. Checks & Loop Protection
      const result = this.checkToolUsage(
        toolsResult,
        previousToolNames,
        toolUsageCount,
        state.conversationId
      );
      if (result.shouldStop) {
        iterations = actualMaxIterations; // Force exit
        break;
      }
      previousToolNames = result.currentToolNames;

      iterations++;
    } // End while

    // Final Reporting
    if (hasError) {
      yield* this.yieldErrorReport(errorMessage);
    } else if (iterations >= actualMaxIterations) {
      yield* this.yieldMaxIterationsReport(state, actualMaxIterations);
    } else {
      yield { type: 'completion', iterations };
    }
  }

  // --- Helper Methods ---

  private mergeState(currentState: AgentState, partial: Partial<AgentState>): AgentState {
    return {
      ...currentState,
      messages: partial.messages
        ? [...currentState.messages, ...partial.messages]
        : currentState.messages,
      // Keep latest tool batch only; generate node converts it into tool messages and clears it.
      toolResults:
        partial.toolResults !== undefined ? partial.toolResults || [] : currentState.toolResults,
      generatedImages: partial.generatedImages
        ? [...(currentState.generatedImages || []), ...partial.generatedImages]
        : currentState.generatedImages,
    };
  }

  private async handleToolApproval(
    lastMessage: Message,
    callback?: ToolApprovalCallback
  ): Promise<boolean> {
    if (!callback || !lastMessage.tool_calls?.length) {
      return true;
    }

    try {
      const approved = await callback(lastMessage.tool_calls);
      return approved;
    } catch (error) {
      logger.error('[AgentGraph] Tool approval error:', error);
      throw error;
    }
  }

  private checkToolUsage(
    toolsResult: Partial<AgentState>,
    previousToolNames: string[],
    toolUsageCount: Map<string, number>,
    conversationId: string
  ): { shouldStop: boolean; currentToolNames: string[] } {
    if (!toolsResult.toolResults?.length) {
      return { shouldStop: false, currentToolNames: [] };
    }

    const currentToolNames = toolsResult.toolResults.map((r) => r.toolName);
    let shouldStop = false;

    // Duplicate check
    if (previousToolNames.length > 0) {
      const duplicates = currentToolNames.filter((name) => previousToolNames.includes(name));
      if (duplicates.length > 0 && duplicates.length === currentToolNames.length) {
        logger.warn(
          `[AgentGraph] ⚠️ Detected consecutive duplicate tool calls: ${duplicates.join(', ')}`
        );
        this.emitChunk(
          `\n\n⚠️ **중복 감지**: 이전 iteration과 동일한 도구(${duplicates.join(', ')})가 연속으로 호출되었습니다.\n\n`,
          conversationId
        );
      }
    }

    // Frequency check
    for (const result of toolsResult.toolResults) {
      const newCount = (toolUsageCount.get(result.toolName) || 0) + 1;
      toolUsageCount.set(result.toolName, newCount);

      if (newCount >= 3) {
        this.emitChunk(
          `\n\n⚠️ **경고**: \`${result.toolName}\` 도구가 ${newCount}번 호출되었습니다.\n\n`,
          conversationId
        );
        if (newCount >= 5) {
          this.emitChunk(`\n\n🛑 **중단**: 도구 반복 호출 제한 초과.\n\n`, conversationId);
          shouldStop = true;
        }
      }
    }

    return { shouldStop, currentToolNames };
  }

  private logToolExecutionStart(
    message: Message,
    iteration: number,
    maxIter: number,
    conversationId: string
  ) {
    if (!message.tool_calls?.length) {
      return;
    }

    let log = `\n\n---\n🔄 **Iteration ${iteration + 1}/${maxIter}**\n`;
    for (const call of message.tool_calls) {
      log += `\n🛠️ **Call:** \`${call.name}\`\n`;
      // ... args formatting ...
      try {
        const args =
          typeof call.arguments === 'string'
            ? call.arguments
            : JSON.stringify(call.arguments, null, 2);
        log += `📂 **Args:**\n\`\`\`json\n${args}\n\`\`\`\n`;
      } catch {
        log += `📂 **Args:** (parsing failed)\n`;
      }
    }
    this.emitChunk(log, conversationId);
  }

  private logToolExecutionEnd(result: Partial<AgentState>, conversationId: string) {
    if (!result.toolResults?.length) {
      return;
    }

    let log = `\n<small>\n`;
    for (const r of result.toolResults) {
      const status = r.error ? '❌ Error' : '✅ Result';
      log += `${status}: \`${r.toolName}\`\n\n`;

      let output = r.error || r.result || '(no output)';
      if (typeof output !== 'string') {
        output = JSON.stringify(output, null, 2);
      }

      if (output.length > 300) {
        output = `${output.substring(0, 300)}\n... (truncated)`;
      }

      if (output.length < 100 && !output.includes('\n')) {
        log += `📄 Output: \`${output}\`\n\n`;
      } else {
        log += `📄 Output:\n\`\`\`\n${output}\n\`\`\`\n\n`;
      }
    }
    log += `</small>`;
    this.emitChunk(`${log}---\n\n`, conversationId);
  }

  private *yieldErrorReport(errorMessage: string) {
    const msg: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `❌ 작업 중 오류가 발생했습니다: ${errorMessage}`,
      created_at: Date.now(),
    };
    yield { reporter: { messages: [msg] } };
  }

  private async *yieldMaxIterationsReport(state: AgentState, maxIterations: number) {
    logger.info('[AgentGraph] Max iterations reached');
    const summaryMsg: Message = {
      id: `system-summary-${Date.now()}`,
      role: 'system',
      content: `최대 반복 횟수(${maxIterations}) 도달. 진행 상황 요약 요청.`,
      created_at: Date.now(),
    };

    const newState = { ...state, messages: [...state.messages, summaryMsg] };
    try {
      const result = await generateWithToolsNode(newState);
      if (result.messages?.length) {
        yield { generate: { messages: result.messages } };
      }
    } catch {
      const fallback: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ 최대 반복 횟수 도달. (요약 실패)`,
        created_at: Date.now(),
      };
      yield { reporter: { messages: [fallback] } };
    }
  }
}

/**
 * 팩토리 함수 (하위 호환성 유지용)
 * @deprecated - AgentGraph 클래스를 직접 사용하세요
 */
export function createChatAgentGraph() {
  const agentGraph = new AgentGraph();
  return agentGraph.compile();
}
