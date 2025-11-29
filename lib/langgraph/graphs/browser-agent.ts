import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation, AgentState } from '../state';
import { generateWithToolsNode } from '../nodes/generate';
import { toolsNode, shouldUseTool } from '../nodes/tools';
import type { Message } from '@/types';
import type { ToolApprovalCallback } from '../types';

/**
 * Browser Agent 그래프
 *
 * Browser Control Tools를 사용하여 웹 브라우징 자동화
 * - browser_get_page_content: 페이지 내용 파악
 * - browser_get_interactive_elements: 클릭/입력 가능한 요소 찾기
 * - browser_click_element: 요소 클릭
 * - browser_type_text: 텍스트 입력
 * - browser_scroll: 페이지 스크롤
 */
export class BrowserAgentGraph {
  async invoke(initialState: AgentState, maxIterations = 15): Promise<AgentState> {
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

  async *stream(
    initialState: AgentState,
    maxIterations = 15,
    toolApprovalCallback?: ToolApprovalCallback
  ): AsyncGenerator<any> {
    let state = { ...initialState };
    let iterations = 0;

    console.log('[BrowserAgent] Starting stream with initial state');
    console.log('[BrowserAgent] Available browser tools: get_page_content, get_interactive_elements, click_element, type_text, scroll');

    let hasError = false;
    let errorMessage = '';

    while (iterations < maxIterations) {
      console.log(`[BrowserAgent] ===== Iteration ${iterations + 1}/${maxIterations} =====`);

      // 1. generate with tools
      let generateResult;
      try {
        console.log('[BrowserAgent] Calling generateWithToolsNode...');
        generateResult = await generateWithToolsNode(state);
        console.log('[BrowserAgent] generateWithToolsNode completed');
      } catch (error: any) {
        console.error('[BrowserAgent] Generate node error:', error);
        hasError = true;
        errorMessage = error.message || 'Failed to generate response';
        break;
      }

      if (generateResult.messages && generateResult.messages.length > 0) {
        const newMessage = generateResult.messages[0];

        console.log('[BrowserAgent] Generated message:', {
          content: newMessage.content?.substring(0, 100),
          hasToolCalls: !!newMessage.tool_calls,
          toolCallsCount: newMessage.tool_calls?.length,
          toolNames: newMessage.tool_calls?.map(tc => tc.name),
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
      console.log('[BrowserAgent] Decision:', decision);

      if (decision === 'end') {
        console.log('[BrowserAgent] Ending - no more tools to call');
        break;
      }

      // 3. Human-in-the-loop: Tool approval (선택적)
      const lastMessage = state.messages[state.messages.length - 1];
      if (toolApprovalCallback && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        console.log('[BrowserAgent] Requesting tool approval for:', lastMessage.tool_calls.map(tc => tc.name));

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
            console.log('[BrowserAgent] Tools rejected by user');
            const rejectionMessage: Message = {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content: '브라우저 작업이 사용자에 의해 취소되었습니다.',
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
            break;
          }

          console.log('[BrowserAgent] Tools approved by user');
        } catch (approvalError: any) {
          console.error('[BrowserAgent] Tool approval error:', approvalError);
          hasError = true;
          errorMessage = approvalError.message || 'Tool approval failed';
          break;
        }
      }

      // 4. tools 노드 실행
      console.log('[BrowserAgent] Executing browser tools node');
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

      console.log('[BrowserAgent] Tool results:', toolsResult.toolResults);

      yield { tools: toolsResult };

      iterations++;
    }

    console.log('[BrowserAgent] Stream completed, total iterations:', iterations);

    // Final report message
    const finalReportMessage: Message = (() => {
      if (hasError) {
        return {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `❌ 브라우저 작업 중 오류가 발생했습니다: ${errorMessage}`,
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
      console.log('[BrowserAgent] Generating final report message:', finalReportMessage.content.substring(0, 100));
      yield {
        reporter: {
          messages: [finalReportMessage],
        },
      };
    }
  }
}

export function createBrowserAgentGraph() {
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
