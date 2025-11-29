import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation, AgentState } from '../state';
import { toolsNode, shouldUseTool } from '../nodes/tools';
import type { Message } from '@/types';
import type { ToolApprovalCallback } from '../types';
import { LLMService } from '@/lib/llm/service';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';
import {
  browserGetInteractiveElementsTool,
  browserGetPageContentTool,
  browserClickElementTool,
  browserTypeTextTool,
  browserScrollTool,
} from '@/lib/mcp/tools/builtin-tools';

/**
 * Browser Agent용 generate 노드 - Browser Control Tools 포함
 */
async function generateWithBrowserToolsNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    console.log('[BrowserAgent.Generate] ===== generateWithBrowserToolsNode called =====');
    console.log('[BrowserAgent.Generate] Current state:', {
      messageCount: state.messages.length,
      lastMessageRole: state.messages[state.messages.length - 1]?.role,
      toolResultsCount: state.toolResults.length,
    });

    // Browser Control Tools만 포함 (5개 도구)
    const browserTools = [
      browserGetInteractiveElementsTool,
      browserGetPageContentTool,
      browserClickElementTool,
      browserTypeTextTool,
      browserScrollTool,
    ];

    console.log(`[BrowserAgent.Generate] Available Browser Control tools: ${browserTools.length}`);
    console.log('[BrowserAgent.Generate] Tool details:', browserTools.map(t => t.name));

    // OpenAI compatible tools 형식으로 변환
    const toolsForLLM = browserTools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description || `Tool: ${tool.name}`,
        parameters: tool.inputSchema || {
          type: 'object',
          properties: {},
        },
      },
    }));

    // Tool 결과가 있으면 메시지에 추가
    const toolMessages: Message[] = state.toolResults.map((result) => {
      let content = '';

      if (result.error) {
        content = `Error: ${result.error}`;
      } else if (result.result !== null && result.result !== undefined) {
        content = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
      } else {
        content = 'No result';
      }

      console.log('[BrowserAgent.Generate] Creating tool result message:', {
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        hasError: !!result.error,
        contentPreview: content.substring(0, 100),
      });

      return {
        id: `tool-${result.toolCallId}`,
        role: 'tool' as const,
        content,
        created_at: Date.now(),
        tool_call_id: result.toolCallId,
        name: result.toolName,
      };
    });

    // Browser-specific 시스템 프롬프트
    const systemMessage: Message = {
      id: 'system-browser',
      role: 'system',
      content: `You are a browser automation assistant with REAL access to control a web browser.

# CRITICAL RULES

1. **You HAVE REAL BROWSER ACCESS** - This is NOT a simulation. You can actually see and control the browser.
2. **ALWAYS USE TOOLS** - Never say you cannot access the browser. Use tools immediately for ALL browser operations.
3. **ACTION OVER EXPLANATION** - Don't just explain what you see. DO IT using browser tools.
4. **CHECK FIRST** - Always use browser_get_page_content to see what's on the page before taking action.
5. **VERIFY YOUR WORK** - After clicking or typing, check the page again to confirm success.

# AVAILABLE TOOLS

## Page Inspection
- **browser_get_page_content**: Get the current page's URL, title, and text content
  - Use this FIRST to understand what page you're on
  - Returns: { url, title, text, html }
  - Example: "현재 접속한 주소가?" → Use this tool immediately!

- **browser_get_interactive_elements**: Find all clickable/interactive elements
  - Returns buttons, links, inputs, textareas with IDs
  - Use this to find what you can click or type into

## Page Interaction
- **browser_click_element**: Click an element by its ID
  - Get element IDs from browser_get_interactive_elements
  - Example: browser_click_element({ element_id: "ai-element-5" })

- **browser_type_text**: Type text into an input field
  - Get element IDs from browser_get_interactive_elements
  - Example: browser_type_text({ element_id: "ai-element-10", text: "search query" })

- **browser_scroll**: Scroll the page up or down
  - Directions: "up" or "down"
  - Example: browser_scroll({ direction: "down", amount: 500 })

# WORKFLOW

For "현재 접속한 주소가?" or similar questions:
1. **Immediately** call browser_get_page_content (no thinking needed)
2. Report the URL, title, and brief page description

For navigation tasks:
1. Use browser_get_page_content to see current page
2. Use browser_get_interactive_elements to find clickable elements
3. Click or type as needed
4. Verify with browser_get_page_content again

# IMPORTANT

- You have ACTUAL browser access - use it!
- ALWAYS use tools for browser questions - never guess or say you can't access
- The user is looking at the same browser - help them navigate it
- Be concise but thorough in your responses

Remember: This is a REAL browser. Use the tools!`,
      created_at: Date.now(),
    };

    const messages = [systemMessage, ...state.messages, ...toolMessages];

    console.log('[BrowserAgent.Generate] Messages to LLM:', messages.map(m => ({
      role: m.role,
      contentPreview: m.content?.substring(0, 50),
    })));

    // LLM 호출 (스트리밍, tools 포함)
    let accumulatedContent = '';
    let finalToolCalls: any[] | undefined = undefined;

    console.log('[BrowserAgent.Generate] Starting streaming with browser tools...');

    for await (const chunk of LLMService.streamChatWithChunks(messages, {
      tools: toolsForLLM,
    })) {
      // Accumulate content and emit to renderer
      if (!chunk.done && chunk.content) {
        accumulatedContent += chunk.content;
        emitStreamingChunk(chunk.content, state.conversationId);
      }

      // Last chunk contains tool calls (if any)
      if (chunk.done && chunk.toolCalls) {
        finalToolCalls = chunk.toolCalls;
        console.log('[BrowserAgent.Generate] Received tool calls from stream:', finalToolCalls);
      }
    }

    console.log('[BrowserAgent.Generate] Streaming complete. Content length:', accumulatedContent.length);

    // Tool calls 파싱
    const toolCalls = finalToolCalls?.map((tc: any, index: number) => {
      const toolCallId = tc.id || `call_${Date.now()}_${index}`;

      console.log('[BrowserAgent.Generate] Tool call:', {
        id: toolCallId,
        name: tc.function.name,
        arguments: tc.function.arguments,
      });

      return {
        id: toolCallId,
        type: tc.type || 'function',
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      };
    });

    const assistantMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: accumulatedContent || '',
      created_at: Date.now(),
      tool_calls: toolCalls,
    };

    console.log('[BrowserAgent.Generate] Assistant message created:', {
      hasContent: !!assistantMessage.content,
      hasToolCalls: !!assistantMessage.tool_calls,
      toolCallsCount: assistantMessage.tool_calls?.length,
    });

    return {
      messages: [assistantMessage],
      toolResults: [], // 다음 iteration을 위해 초기화
    };
  } catch (error: any) {
    console.error('[BrowserAgent.Generate] Error:', error);

    const errorMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `Error: ${error.message || 'Failed to generate response'}`,
      created_at: Date.now(),
    };

    return {
      messages: [errorMessage],
    };
  }
}

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
      // 1. generate 노드 실행 (Browser Tools 포함)
      const generateResult = await generateWithBrowserToolsNode(state);
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

      // 1. generate with Browser Control Tools
      let generateResult;
      try {
        console.log('[BrowserAgent] Calling generateWithBrowserToolsNode...');
        generateResult = await generateWithBrowserToolsNode(state);
        console.log('[BrowserAgent] generateWithBrowserToolsNode completed');
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
    // 노드 추가 (Browser-specific generate 노드 사용)
    .addNode('generate', generateWithBrowserToolsNode)
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
