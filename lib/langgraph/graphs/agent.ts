import { AgentState } from '../types';
import { generateWithToolsNode } from '../nodes/generate';
import { toolsNode, shouldUseTool } from '../nodes/tools';
import { LLMService } from '@/lib/llm/service';
import { Message } from '@/types';
import { createBaseSystemMessage } from '../utils/system-message';

/**
 * Tool-Using Agent 그래프 - 간단한 구현
 */
export class AgentGraph {
  async invoke(initialState: AgentState, maxIterations = 50): Promise<AgentState> {
    let state = { ...initialState };
    let iterations = 0;

    while (iterations < maxIterations) {
      // 1. generate 노드 실행
      const generateResult = await generateWithToolsNode(state);
      state = {
        ...state,
        messages: [...state.messages, ...(generateResult.messages || [])],
      };

      // 2. 도구 사용 여부 판단
      const decision = shouldUseTool(state);
      if (decision === 'end') {
        break;
      }

      // 3. tools 노드 실행
      const toolsResult = await toolsNode(state);
      state = {
        ...state,
        toolResults: [...state.toolResults, ...(toolsResult.toolResults || [])],
      };

      iterations++;
    }

    return state;
  }

  async *stream(initialState: AgentState, maxIterations = 50): AsyncGenerator<any> {
    let state = { ...initialState };
    let iterations = 0;

    console.log('[AgentGraph] Starting stream with initial state');

    let hasError = false;
    let errorMessage = '';

    while (iterations < maxIterations) {
      console.log(`[AgentGraph] ===== Iteration ${iterations + 1}/${maxIterations} =====`);
      console.log('[AgentGraph] Current state before generate:', {
        messageCount: state.messages.length,
        lastMessageRole: state.messages[state.messages.length - 1]?.role,
        toolResultsCount: state.toolResults.length,
      });

      // 1. generate with tools (non-streaming for now)
      // TODO: Implement proper streaming with tool calls support
      let generateResult;
      try {
        console.log('[AgentGraph] Calling generateWithToolsNode...');
        generateResult = await generateWithToolsNode(state);
        console.log('[AgentGraph] generateWithToolsNode completed');
      } catch (error: any) {
        console.error('[AgentGraph] Generate node error:', error);
        console.error('[AgentGraph] Error stack:', error.stack);
        hasError = true;
        errorMessage = error.message || 'Failed to generate response';
        break; // Exit loop on error
      }

      if (generateResult.messages && generateResult.messages.length > 0) {
        const newMessage = generateResult.messages[0];

        console.log('[AgentGraph] Generated message:', {
          content: newMessage.content?.substring(0, 100),
          hasToolCalls: !!newMessage.tool_calls,
          toolCallsCount: newMessage.tool_calls?.length,
        });

        state = {
          ...state,
          messages: [...state.messages, newMessage],
          toolResults: generateResult.toolResults || state.toolResults,
        };

        // Yield the message
        yield {
          generate: {
            messages: [newMessage],
          },
        };
      }

      // 2. 도구 사용 여부 판단
      const decision = shouldUseTool(state);
      console.log('[AgentGraph] Decision:', decision);

      if (decision === 'end') {
        console.log('[AgentGraph] Ending - no more tools to call');
        break;
      }

      // 3. tools 노드 실행
      console.log('[AgentGraph] Executing tools node');
      const toolsResult = await toolsNode(state);
      state = {
        ...state,
        toolResults: toolsResult.toolResults || [],
      };

      console.log('[AgentGraph] Tool results:', toolsResult.toolResults);

      yield { tools: toolsResult };

      iterations++;
    }

    console.log('[AgentGraph] Stream completed, total iterations:', iterations);

    // Reporter node: Always generate a final summary message
    const finalReportMessage: Message = (() => {
      if (hasError) {
        return {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `❌ 작업 중 오류가 발생했습니다: ${errorMessage}`,
          created_at: Date.now(),
        };
      } else if (iterations >= maxIterations) {
        return {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ 최대 반복 횟수(${maxIterations})에 도달했습니다. 작업이 복잡하여 완료하지 못했을 수 있습니다.`,
          created_at: Date.now(),
        };
      } else {
        // Normal completion - no additional message needed
        return null as any;
      }
    })();

    if (finalReportMessage) {
      console.log('[AgentGraph] Generating final report message:', finalReportMessage.content.substring(0, 100));
      yield {
        reporter: {
          messages: [finalReportMessage],
        },
      };
    }
  }
}

export function createAgentGraph() {
  return new AgentGraph();
}
