import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation, AgentState } from '../state';
import { generateWithToolsNode } from '../nodes/generate';
import { toolsNode, shouldUseTool } from '../nodes/tools';
import type { Message } from '@/types';
import type { ToolApprovalCallback } from '../types';

/**
 * Tool-Using Agent 그래프 - LangGraph StateGraph 사용
 */
export class AgentGraph {
  async invoke(initialState: AgentState, maxIterations = 10): Promise<AgentState> {
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

      // 이미지 생성 도구가 성공적으로 실행되었으면 루프 종료
      const hasSuccessfulImageGeneration = toolsResult.toolResults?.some(
        (result) => result.toolName === 'generate_image' && !result.error
      );
      if (hasSuccessfulImageGeneration) {
        console.log('[AgentGraph.invoke] Image generation completed, ending loop');
        break;
      }

      iterations++;
    }

    return state;
  }

  async *stream(
    initialState: AgentState,
    maxIterations = 10,
    toolApprovalCallback?: ToolApprovalCallback
  ): AsyncGenerator<any> {
    let state = { ...initialState };
    let iterations = 0;

    console.log('[AgentGraph] Starting stream with initial state');
    console.log('[AgentGraph] Tool approval callback:', toolApprovalCallback ? 'provided' : 'not provided');

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

      // 3. Human-in-the-loop: Tool approval
      const lastMessage = state.messages[state.messages.length - 1];
      if (toolApprovalCallback && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        console.log('[AgentGraph] Requesting tool approval for:', lastMessage.tool_calls.map(tc => tc.name));

        // Yield tool approval request event
        yield {
          type: 'tool_approval_request',
          messageId: lastMessage.id,
          toolCalls: lastMessage.tool_calls,
        };

        try {
          // Wait for user approval
          const approved = await toolApprovalCallback(lastMessage.tool_calls);

          // Yield approval result
          yield {
            type: 'tool_approval_result',
            approved,
          };

          if (!approved) {
            console.log('[AgentGraph] Tools rejected by user');
            // Add a message indicating tools were rejected
            const rejectionMessage: Message = {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content: '도구 실행이 사용자에 의해 거부되었습니다.',
              created_at: Date.now(),
            };
            state = {
              ...state,
              messages: [...state.messages, rejectionMessage],
            };
            yield {
              generate: {
                messages: [rejectionMessage],
              },
            };
            break; // End the loop
          }

          console.log('[AgentGraph] Tools approved by user');
        } catch (approvalError: any) {
          console.error('[AgentGraph] Tool approval error:', approvalError);
          hasError = true;
          errorMessage = approvalError.message || 'Tool approval failed';
          break;
        }
      }

      // 4. tools 노드 실행
      console.log('[AgentGraph] Executing tools node');
      const toolsResult = await toolsNode(state);

      // Remove tool_calls from the last message to prevent duplicate execution
      const updatedMessages = [...state.messages];
      const lastMessageIndex = updatedMessages.length - 1;
      if (lastMessageIndex >= 0 && updatedMessages[lastMessageIndex].tool_calls) {
        updatedMessages[lastMessageIndex] = {
          ...updatedMessages[lastMessageIndex],
          tool_calls: undefined,
        };
      }

      state = {
        ...state,
        messages: updatedMessages,
        toolResults: toolsResult.toolResults || [],
      };

      console.log('[AgentGraph] Tool results:', toolsResult.toolResults);

      yield { tools: toolsResult };

      // 이미지 생성 도구가 성공적으로 실행되었으면 루프 종료
      // (이미지 생성은 일회성 작업이므로 추가 반복 불필요)
      const hasSuccessfulImageGeneration = toolsResult.toolResults?.some(
        (result) => result.toolName === 'generate_image' && !result.error
      );
      if (hasSuccessfulImageGeneration) {
        console.log('[AgentGraph] Image generation completed successfully, ending loop');
        break;
      }

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
  // StateGraph 생성
  const workflow = new StateGraph(AgentStateAnnotation)
    // 노드 추가
    .addNode('generate', generateWithToolsNode)
    .addNode('tools', toolsNode)
    // 엔트리 포인트 설정
    .addEdge('__start__', 'generate')
    // 조건부 엣지: generate 후 도구 사용 여부 결정
    .addConditionalEdges('generate', shouldUseTool, {
      tools: 'tools',
      end: END,
    })
    // tools 실행 후 다시 generate로 (순환)
    .addEdge('tools', 'generate');

  // 컴파일된 그래프 반환
  return workflow.compile();
}
