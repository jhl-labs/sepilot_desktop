import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation, AgentState } from '../state';
import { toolsNode, shouldUseTool } from '../nodes/tools';
import type { Message } from '@/types';
import { LLMService } from '@/lib/llm/service';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';
import { useChatStore } from '@/lib/store/chat-store';
import {
  browserGetInteractiveElementsTool,
  browserGetPageContentTool,
  browserClickElementTool,
  browserTypeTextTool,
  browserScrollTool,
  browserNavigateTool,
  browserCreateTabTool,
  browserSwitchTabTool,
  browserCloseTabTool,
  browserListTabsTool,
  browserTakeScreenshotTool,
  browserGetSelectedTextTool,
  browserSearchElementsTool,
  browserCaptureAnnotatedScreenshotTool,
  browserClickCoordinateTool,
  browserClickMarkerTool,
  browserGetClickableCoordinateTool,
  browserAnalyzeWithVisionTool,
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

    // Browser Control Tools (18개 도구 - Vision 포함)
    const browserTools = [
      // Navigation
      browserNavigateTool, // URL 직접 이동 (최우선)
      // Page inspection (Enhanced with Accessibility Tree)
      browserGetPageContentTool, // 개선: 의미론적 페이지 구조 분석
      browserGetInteractiveElementsTool, // 개선: 역할 기반 요소 분류
      browserSearchElementsTool, // 신규: 자연어 요소 검색
      browserGetSelectedTextTool,
      browserTakeScreenshotTool,
      // Page interaction (Enhanced with better verification)
      browserClickElementTool, // 개선: 가시성 및 상태 확인
      browserTypeTextTool, // 개선: 이벤트 트리거링
      browserScrollTool,
      // Tab management
      browserListTabsTool,
      browserCreateTabTool,
      browserSwitchTabTool,
      browserCloseTabTool,
      // Vision-based tools (NEW)
      browserCaptureAnnotatedScreenshotTool, // Set-of-Mark 스크린샷
      browserClickCoordinateTool, // 좌표 기반 클릭
      browserClickMarkerTool, // 마커 라벨로 클릭
      browserGetClickableCoordinateTool, // 요소의 클릭 가능 좌표
      browserAnalyzeWithVisionTool, // Vision 모델 분석 (향후)
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

    // Enhanced Browser-specific 시스템 프롬프트
    const systemMessage: Message = {
      id: 'system-browser',
      role: 'system',
      content: `You are an advanced browser automation assistant with REAL access to control a web browser using state-of-the-art Accessibility Tree analysis.

# CRITICAL RULES

1. **You HAVE REAL BROWSER ACCESS** - This is NOT a simulation. You can actually see and control the browser.
2. **ALWAYS USE TOOLS** - Never say you cannot access the browser. Use tools immediately for ALL browser operations.
3. **ACTION OVER EXPLANATION** - Don't just explain what you see. DO IT using browser tools.
4. **NAVIGATE DIRECTLY** - For simple URL navigation (e.g., "go to naver.com"), use browser_navigate. DON'T use search!
5. **VERIFY YOUR WORK** - After actions, check the page to confirm success.
6. **USE SEMANTIC UNDERSTANDING** - Tools now provide semantic element analysis with roles, labels, and context.
7. **SEARCH WHEN UNSURE** - If you can't find the right element, use browser_search_elements with natural language.

# ENHANCED CAPABILITIES

**NEW: Accessibility Tree Analysis**
- All interactive elements are now analyzed using semantic roles (button, link, textbox, etc.)
- Elements include contextual information (parent, siblings) for better understanding
- Natural language search available via browser_search_elements

**Improved Element Detection**
- Elements are prioritized by interaction likelihood
- Visibility and state (disabled, hidden) are automatically checked
- Better error messages when elements can't be interacted with

# AVAILABLE TOOLS

## Navigation (USE THIS FIRST for URLs!)
- **browser_navigate**: Navigate to a URL directly
  - Use for ANY request to "go to", "visit", "open", or "접속" a website
  - Examples:
    * "naver.com에 접속해줘" → browser_navigate({ url: "naver.com" })
    * "Go to google.com" → browser_navigate({ url: "google.com" })
  - Protocol (http/https) is added automatically
  - **NEVER** use search when user wants to navigate to a URL!

## Page Inspection (ENHANCED)
- **browser_get_page_content**: Get semantic page structure with accessibility analysis
  - Returns: { url, title, summary, headings, structure }
  - Now includes page outline with h1-h6 headings and main sections
  - Provides categorized counts of interactive elements
  - Example: "현재 접속한 주소가?" → Use this tool immediately!

- **browser_get_interactive_elements**: Find all interactive elements with semantic roles
  - Returns elements with: role (button/link/textbox), label, context, placeholder
  - Elements are sorted by interaction likelihood (buttons first, then inputs, etc.)
  - Maximum 50 most relevant elements returned
  - Includes parent/sibling context for disambiguation

- **browser_search_elements** (NEW): Search for elements using natural language
  - Query: "search button", "email input", "login form", "submit"
  - Returns top 10 matching elements with relevance
  - Use this when you know what you're looking for but don't have the element ID
  - Example: "Find the search button" → browser_search_elements({ query: "search button" })

- **browser_get_selected_text**: Get text that user has selected/highlighted
  - Returns the selected text if any
  - Useful for reading specific parts user wants to focus on

- **browser_take_screenshot**: Capture screenshot and get text preview
  - Takes a screenshot of current page
  - Returns visible text preview
  - Useful for understanding what user sees

## Page Interaction (ENHANCED)
- **browser_click_element**: Click an element by its ID (with verification)
  - Get element IDs from browser_get_interactive_elements or browser_search_elements
  - Automatically checks: visibility, disabled state, element exists
  - Scrolls element into view before clicking
  - Returns confirmation with element label
  - Example: browser_click_element({ element_id: "ai-element-5" })

- **browser_type_text**: Type text into an input field (with events)
  - Get element IDs from browser_get_interactive_elements or browser_search_elements
  - Validates element is an input/textarea
  - Checks: disabled state, readonly attribute
  - Triggers proper input/change events for React/Vue apps
  - Returns confirmation with typed value preview
  - Example: browser_type_text({ element_id: "ai-element-10", text: "search query" })

- **browser_scroll**: Scroll the page up or down
  - Directions: "up" or "down"
  - Example: browser_scroll({ direction: "down", amount: 500 })

## Tab Management
- **browser_list_tabs**: List all open tabs with IDs, titles, and URLs
  - Shows which tab is currently active
  - Use this to see all available tabs

- **browser_create_tab**: Open a new browser tab
  - Optional URL parameter (defaults to Google)
  - Example: browser_create_tab({ url: "github.com" })

- **browser_switch_tab**: Switch to a different tab by ID
  - Get tab IDs from browser_list_tabs
  - Example: browser_switch_tab({ tabId: "tab-123" })

- **browser_close_tab**: Close a specific tab by ID
  - Cannot close the last remaining tab
  - Example: browser_close_tab({ tabId: "tab-123" })

## Vision-Based Tools (NEW - Hybrid DOM + Vision)

- **browser_capture_annotated_screenshot**: Capture screenshot with labeled elements (Set-of-Mark)
  - Overlays markers (A, B, C...) on top 30 interactive elements
  - Returns base64 image + marker mapping (label → element info)
  - Use when: Need visual confirmation, elements are hard to identify by DOM alone
  - Example: browser_capture_annotated_screenshot({ max_markers: 30, include_overlay: true })

- **browser_click_coordinate**: Click at exact pixel coordinates
  - Direct coordinate-based clicking (x, y)
  - Use when: DOM-based clicking fails, elements are dynamically positioned, canvas/SVG elements
  - Automatically finds element at coordinates and dispatches click event
  - Example: browser_click_coordinate({ x: 350, y: 120 })

- **browser_click_marker**: Click element by its marker label from screenshot
  - Use marker labels (A, B, C...) from browser_capture_annotated_screenshot
  - Automatically calculates center point and clicks
  - Use when: You've captured annotated screenshot and identified target visually
  - Example: browser_click_marker({ marker_label: "A" })

- **browser_get_clickable_coordinate**: Get exact clickable coordinates for an element
  - Takes element ID, returns center point coordinates + bounding box
  - Verifies that center point is actually clickable (not obscured)
  - Use when: Need to convert element ID to coordinates for precise clicking
  - Example: browser_get_clickable_coordinate({ element_id: "ai-element-5" })

- **browser_analyze_with_vision**: Analyze page with LLM vision model (FUTURE)
  - Captures annotated screenshot and analyzes with vision-capable LLM
  - Provides AI understanding of page layout and suggested actions
  - Currently returns prompt only (vision API integration pending)
  - Example: browser_analyze_with_vision({ user_query: "Find the login button" })

# ENHANCED WORKFLOW

For URL navigation ("go to naver.com", "네이버 접속해줘"):
1. **Immediately** call browser_navigate({ url: "naver.com" })
2. Wait for page load and report success

For "현재 접속한 주소가?" or page understanding:
1. **Immediately** call browser_get_page_content (returns semantic structure)
2. Review the summary, headings, and structure
3. Report URL, title, and main content areas

For finding elements ("Find the search button", "Where is the login form?"):
1. Use browser_search_elements({ query: "search button" }) first (FASTEST)
2. If no results, use browser_get_interactive_elements
3. Review semantic roles and context to identify the right element

For interaction tasks ("Click the submit button", "Type 'hello' in the search box"):
1. First find the element:
   - Option A: browser_search_elements({ query: "submit button" })
   - Option B: browser_get_interactive_elements and find by role/label
2. Then interact: browser_click_element or browser_type_text
3. Verify success using browser_get_page_content

For complex tasks ("Search for X on naver"):
1. Navigate if needed: browser_navigate({ url: "naver.com" })
2. Find search input: browser_search_elements({ query: "search input" })
3. Type query: browser_type_text({ element_id: "...", text: "X" })
4. Find and click search button: browser_search_elements + browser_click_element
5. Verify results loaded

For vision-based interaction (when DOM fails or visual confirmation needed):
1. Capture annotated screenshot: browser_capture_annotated_screenshot({ max_markers: 30 })
2. Review markers and identify target element (e.g., marker "B" is the login button)
3. Click by marker: browser_click_marker({ marker_label: "B" })
4. Or get coordinates: browser_get_clickable_coordinate + browser_click_coordinate

For challenging elements (canvas, SVG, dynamic overlays):
1. Try DOM first: browser_get_interactive_elements
2. If element not found or click fails: browser_capture_annotated_screenshot
3. Identify target visually, then: browser_click_marker or browser_click_coordinate
4. Verify action succeeded

# IMPORTANT - SEMANTIC UNDERSTANDING

- **Elements now have SEMANTIC ROLES**: Use them! (button, link, textbox, etc.)
- **Context is provided**: Parent and sibling information helps disambiguation
- **Natural language search**: When unsure, use browser_search_elements
- **Verification built-in**: Click and type now verify element state automatically
- **Be specific**: Use element roles and labels in your reasoning

Examples of good reasoning:
- "I found 3 buttons with 'search' in the label. The one with role 'button' and parent 'search form' is most likely."
- "The textbox with placeholder 'Enter email' and context 'Parent: login form' is the email input."
- "Using browser_search_elements to find 'submit button' returned ai-element-42 with label 'Submit Form'."

# SUCCESS CRITERIA

- You have ACTUAL browser access - use it!
- Use semantic roles and context for accurate element selection
- Search with natural language when element location is ambiguous
- ALWAYS verify after actions (check page changed, form submitted, etc.)
- Be concise but thorough in your responses

Remember: This is a REAL browser with SEMANTIC ANALYSIS. Use the enhanced tools!`,
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

    // Browser Agent LLM 설정 가져오기
    const { browserAgentLLMConfig } = useChatStore.getState();

    console.log('[BrowserAgent.Generate] Starting streaming with browser tools...');
    console.log('[BrowserAgent.Generate] LLM Config:', browserAgentLLMConfig);

    for await (const chunk of LLMService.streamChatWithChunks(messages, {
      tools: toolsForLLM,
      max_tokens: browserAgentLLMConfig.maxTokens,
      temperature: browserAgentLLMConfig.temperature,
      top_p: browserAgentLLMConfig.topP,
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
  private shouldStop = false;

  public stop() {
    this.shouldStop = true;
  }

  async invoke(initialState: AgentState, maxIterations?: number): Promise<AgentState> {
    let state = { ...initialState };
    let iterations = 0;

    // Browser Agent LLM 설정 가져오기
    const { browserAgentLLMConfig } = useChatStore.getState();
    const actualMaxIterations = maxIterations ?? browserAgentLLMConfig.maxIterations;

    while (iterations < actualMaxIterations) {
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
    maxIterations?: number
  ): AsyncGenerator<any> {
    let state = { ...initialState };
    let iterations = 0;
    this.shouldStop = false;

    // Browser Agent LLM 설정 가져오기
    const { browserAgentLLMConfig, addBrowserAgentLog, setBrowserAgentIsRunning, clearBrowserAgentLogs } = useChatStore.getState();
    const actualMaxIterations = maxIterations ?? browserAgentLLMConfig.maxIterations;

    console.log('[BrowserAgent] Starting stream with initial state');
    console.log('[BrowserAgent] Available browser tools: get_page_content, get_interactive_elements, click_element, type_text, scroll');
    console.log('[BrowserAgent] Max iterations:', actualMaxIterations);

    // Agent 로그 시작
    clearBrowserAgentLogs();
    setBrowserAgentIsRunning(true);

    addBrowserAgentLog({
      level: 'info',
      phase: 'thinking',
      message: 'Browser Agent 시작',
      details: {
        maxIterations: actualMaxIterations,
      },
    });

    let hasError = false;
    let errorMessage = '';

    // 반복 감지를 위한 도구 호출 히스토리 (최근 5개만 추적)
    const toolCallHistory: Array<{ name: string; args: string }> = [];
    const MAX_HISTORY = 5;
    const LOOP_THRESHOLD = 3; // 같은 호출이 3번 반복되면 루프로 간주

    while (iterations < actualMaxIterations && !this.shouldStop) {
      console.log(`[BrowserAgent] ===== Iteration ${iterations + 1}/${actualMaxIterations} =====`);

      // 로그: 반복 시작
      addBrowserAgentLog({
        level: 'info',
        phase: 'thinking',
        message: `반복 ${iterations + 1}/${actualMaxIterations} 시작`,
        details: {
          iteration: iterations + 1,
          maxIterations: actualMaxIterations,
        },
      });

      // Emit progress event
      yield {
        progress: {
          iteration: iterations + 1,
          maxIterations: actualMaxIterations,
          status: 'thinking',
          message: 'AI가 다음 작업을 계획하고 있습니다...',
        },
      };

      // 1. generate with Browser Control Tools
      let generateResult;
      try {
        console.log('[BrowserAgent] Calling generateWithBrowserToolsNode...');

        addBrowserAgentLog({
          level: 'thinking',
          phase: 'thinking',
          message: 'LLM이 다음 동작을 계획하고 있습니다...',
          details: {
            iteration: iterations + 1,
            maxIterations,
          },
        });

        generateResult = await generateWithBrowserToolsNode(state);
        console.log('[BrowserAgent] generateWithBrowserToolsNode completed');
      } catch (error: any) {
        console.error('[BrowserAgent] Generate node error:', error);

        addBrowserAgentLog({
          level: 'error',
          phase: 'error',
          message: `생성 노드 오류: ${error.message}`,
          details: {
            iteration: iterations + 1,
            maxIterations,
          },
        });

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

        addBrowserAgentLog({
          level: 'success',
          phase: 'decision',
          message: '더 이상 실행할 도구가 없습니다. 작업 완료.',
          details: {
            decision: 'end',
            iteration: iterations + 1,
            maxIterations,
          },
        });

        break;
      }

      // Get tool calls for progress message and loop detection
      const lastMessage = state.messages[state.messages.length - 1];
      const toolCalls = lastMessage.tool_calls || [];

      // 로그: 도구 호출 계획
      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          addBrowserAgentLog({
            level: 'info',
            phase: 'tool_call',
            message: `도구 호출: ${toolCall.name}`,
            details: {
              toolName: toolCall.name,
              toolArgs: toolCall.arguments as Record<string, string | number | boolean | null>,
              iteration: iterations + 1,
              maxIterations,
            },
          });
        }
      }

      // Emit tool execution progress
      if (toolCalls.length > 0) {
        const toolNames = toolCalls.map(tc => tc.name).join(', ');
        yield {
          progress: {
            iteration: iterations + 1,
            maxIterations,
            status: 'executing',
            message: `브라우저 도구 실행 중: ${toolNames}`,
          },
        };
      }

      // 3. tools 노드 실행 (자동 실행, 승인 불필요)
      console.log('[BrowserAgent] Executing browser tools node');
      const toolsResult = await toolsNode(state);

      // 로그: 도구 결과
      if (toolsResult.toolResults) {
        for (const result of toolsResult.toolResults) {
          if (result.error) {
            addBrowserAgentLog({
              level: 'error',
              phase: 'tool_result',
              message: `도구 실행 실패: ${result.toolName}`,
              details: {
                toolName: result.toolName,
                toolError: result.error,
                iteration: iterations + 1,
                maxIterations,
              },
            });
          } else {
            addBrowserAgentLog({
              level: 'success',
              phase: 'tool_result',
              message: `도구 실행 성공: ${result.toolName}`,
              details: {
                toolName: result.toolName,
                toolResult: typeof result.result === 'string' ? result.result : JSON.stringify(result.result),
                iteration: iterations + 1,
                maxIterations,
              },
            });
          }
        }
      }

      // 반복 감지: 도구 호출 히스토리에 추가
      for (const toolCall of toolCalls) {
        const callSignature = `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`;
        toolCallHistory.push({ name: toolCall.name, args: JSON.stringify(toolCall.arguments) });

        // 히스토리 크기 제한
        if (toolCallHistory.length > MAX_HISTORY) {
          toolCallHistory.shift();
        }

        // 반복 감지: 같은 호출이 여러 번 반복되는지 확인
        const recentCalls = toolCallHistory.slice(-LOOP_THRESHOLD);
        if (recentCalls.length === LOOP_THRESHOLD) {
          const allSame = recentCalls.every(
            (call) => call.name === recentCalls[0].name && call.args === recentCalls[0].args
          );

          if (allSame) {
            console.warn('[BrowserAgent] Loop detected: same tool called multiple times with same arguments');
            hasError = true;
            errorMessage = `같은 작업(${toolCall.name})이 반복되고 있습니다. 다른 방법을 시도해야 할 것 같습니다.`;
            break;
          }
        }
      }

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

    // Agent 로그 종료
    setBrowserAgentIsRunning(false);

    // Final report message
    const finalReportMessage: Message = (() => {
      if (this.shouldStop) {
        addBrowserAgentLog({
          level: 'warning',
          phase: 'completion',
          message: '사용자가 작업을 중단했습니다',
          details: {
            iteration: iterations,
            maxIterations,
          },
        });

        return {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `⏹️ 사용자가 작업을 중단했습니다. (${iterations}회 반복 완료)`,
          created_at: Date.now(),
        };
      } else if (hasError) {
        addBrowserAgentLog({
          level: 'error',
          phase: 'error',
          message: `브라우저 작업 오류: ${errorMessage}`,
          details: {
            iteration: iterations,
            maxIterations,
          },
        });

        return {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `❌ 브라우저 작업 중 오류가 발생했습니다: ${errorMessage}`,
          created_at: Date.now(),
        };
      } else if (iterations >= actualMaxIterations) {
        addBrowserAgentLog({
          level: 'warning',
          phase: 'completion',
          message: '최대 반복 횟수에 도달했습니다',
          details: {
            iteration: iterations,
            maxIterations,
          },
        });

        return {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ 최대 반복 횟수(${maxIterations})에 도달했습니다. 작업이 복잡하여 완료하지 못했을 수 있습니다.`,
          created_at: Date.now(),
        };
      } else {
        addBrowserAgentLog({
          level: 'success',
          phase: 'completion',
          message: 'Browser Agent 작업 완료',
          details: {
            iteration: iterations,
            maxIterations,
          },
        });

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
