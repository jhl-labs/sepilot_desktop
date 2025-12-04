import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation, AgentState } from '../state';
import { toolsNode, shouldUseTool } from '../nodes/tools';
import type { Message } from '@/types';
import type { ToolResult } from '../types';
import { LLMService } from '@/lib/llm/service';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';
import { useChatStore } from '@/lib/store/chat-store';
import type {
  BrowserAgentReport,
  BrowserAgentExecutionContext,
  BrowserAgentCompletionStatus,
  BrowserAgentToolStats,
  BrowserAgentVisitedPage,
} from '@/types/browser-agent';
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
  browserWaitForElementTool,
  browserCaptureAnnotatedScreenshotTool,
  browserClickCoordinateTool,
  browserClickMarkerTool,
  browserGetClickableCoordinateTool,
  browserAnalyzeWithVisionTool,
} from '@/lib/mcp/tools/builtin-tools';
import {
  googleSearchTool,
  googleSearchNewsTool,
  googleSearchScholarTool,
  googleSearchImagesTool,
  googleSearchAdvancedTool,
  googleExtractResultsTool,
  googleGetRelatedSearchesTool,
  googleVisitResultTool,
  googleNextPageTool,
} from '@/lib/mcp/tools/google-search-tools';

const TOOL_RESULT_HISTORY_LIMIT = 12;

/**
 * BrowserView가 활성화되어 있는지 확인
 * Electron 환경이 아니면 true로 간주
 */
async function hasActiveBrowserView(): Promise<boolean> {
  try {
    const { getActiveBrowserView } = await import('../../../electron/ipc/handlers/browser-control');
    return typeof getActiveBrowserView === 'function' ? !!getActiveBrowserView() : true;
  } catch (error) {
    console.warn('[BrowserAgent] Unable to verify active browser view, skipping check:', error);
    return true;
  }
}

/**
 * Tool 결과를 누적하면서 프롬프트 크기를 제한
 */
function mergeToolResults(previous: ToolResult[], next?: ToolResult[]): ToolResult[] {
  const combined = [...previous, ...(next || [])];
  if (combined.length <= TOOL_RESULT_HISTORY_LIMIT) {
    return combined;
  }

  return combined.slice(-TOOL_RESULT_HISTORY_LIMIT);
}

/**
 * Exponential Backoff 재시도 유틸리티
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.debug(
          `[BrowserAgent.Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * 컨텍스트 크기 관리 - 오래된 메시지 정리
 */
function pruneContextIfNeeded(messages: Message[], maxMessages: number = 50): Message[] {
  if (messages.length <= maxMessages) {
    return messages;
  }

  console.debug(
    `[BrowserAgent.Context] Pruning context from ${messages.length} to ${maxMessages} messages`
  );

  // 시스템 메시지는 유지하고, 최근 메시지만 유지
  const systemMessages = messages.filter((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');
  const recentMessages = nonSystemMessages.slice(-maxMessages);

  return [...systemMessages, ...recentMessages];
}

/**
 * Browser Agent 최종 보고서 생성
 */
function generateBrowserAgentReport(context: BrowserAgentExecutionContext): BrowserAgentReport {
  const duration = context.endTime
    ? (context.endTime - context.startTime) / 1000
    : (Date.now() - context.startTime) / 1000;

  // 완료 상태 결정
  let status: BrowserAgentCompletionStatus = 'success';
  if (context.wasStopped) {
    status = 'stopped';
  } else if (context.hasError) {
    status = 'error';
  } else if (context.iterations >= context.maxIterations) {
    status = 'max_iterations';
  } else if (context.toolCalls.some((call) => call.error)) {
    status = 'partial_success';
  }

  // Tool 사용 통계 계산
  const toolStatsMap = new Map<string, BrowserAgentToolStats>();

  for (const call of context.toolCalls) {
    const stats = toolStatsMap.get(call.toolName) || {
      toolName: call.toolName,
      callCount: 0,
      successCount: 0,
      failureCount: 0,
    };

    stats.callCount++;
    if (call.error) {
      stats.failureCount++;
    } else {
      stats.successCount++;
      stats.lastResult = call.result?.substring(0, 100);
    }

    toolStatsMap.set(call.toolName, stats);
  }

  const toolStats = Array.from(toolStatsMap.values()).sort((a, b) => b.callCount - a.callCount);

  // 방문한 페이지 정리
  const visitedPages: BrowserAgentVisitedPage[] = context.visitedUrls.map((visit) => ({
    url: visit.url,
    title: visit.title,
    timestamp: visit.timestamp,
    visitedBy: 'browser_navigate', // 간단히 처리
  }));

  // 주요 성과 추출
  const achievements: string[] = [];

  const navigations = context.toolCalls.filter((c) => c.toolName === 'browser_navigate');
  if (navigations.length > 0) {
    achievements.push(`${navigations.length}개의 페이지 방문`);
  }

  const searches = context.toolCalls.filter((c) => c.toolName.startsWith('google_search'));
  if (searches.length > 0) {
    achievements.push(`${searches.length}회의 검색 수행`);
  }

  const clicks = context.toolCalls.filter((c) => c.toolName === 'browser_click_element');
  if (clicks.length > 0) {
    achievements.push(`${clicks.length}개의 요소 클릭`);
  }

  const inputs = context.toolCalls.filter((c) => c.toolName === 'browser_type_text');
  if (inputs.length > 0) {
    achievements.push(`${inputs.length}개의 입력 필드 작성`);
  }

  const extractions = context.toolCalls.filter((c) =>
    ['google_extract_results', 'google_visit_result', 'browser_get_page_content'].includes(
      c.toolName
    )
  );
  if (extractions.length > 0) {
    achievements.push(`${extractions.length}회의 콘텐츠 추출`);
  }

  // 발생한 문제 추출
  const issues: string[] = [];
  const failedCalls = context.toolCalls.filter((c) => c.error);

  if (failedCalls.length > 0) {
    const errorsByTool = new Map<string, number>();
    for (const call of failedCalls) {
      errorsByTool.set(call.toolName, (errorsByTool.get(call.toolName) || 0) + 1);
    }

    for (const [toolName, count] of errorsByTool.entries()) {
      issues.push(`${toolName} 실행 실패 (${count}회)`);
    }
  }

  if (context.iterations >= context.maxIterations) {
    issues.push('최대 반복 횟수에 도달하여 작업이 완료되지 못했을 수 있습니다');
  }

  // 작업 요약 생성
  let summary = '';
  switch (status) {
    case 'success':
      summary = `✅ 작업이 성공적으로 완료되었습니다. ${context.iterations}회 반복, ${duration.toFixed(1)}초 소요`;
      break;
    case 'partial_success':
      summary = `⚠️ 작업이 부분적으로 완료되었습니다. 일부 도구 실행에 실패했습니다. ${context.iterations}회 반복, ${duration.toFixed(1)}초 소요`;
      break;
    case 'stopped':
      summary = `⏹️ 사용자가 작업을 중단했습니다. ${context.iterations}회 반복, ${duration.toFixed(1)}초 소요`;
      break;
    case 'max_iterations':
      summary = `⚠️ 최대 반복 횟수(${context.maxIterations})에 도달했습니다. 작업이 복잡하여 완료하지 못했을 수 있습니다. ${duration.toFixed(1)}초 소요`;
      break;
    case 'error':
      summary = `❌ 작업 중 오류가 발생했습니다: ${context.errorMessage || '알 수 없는 오류'}. ${context.iterations}회 반복, ${duration.toFixed(1)}초 소요`;
      break;
  }

  // 다음 단계 제안
  const nextSteps: string[] = [];

  if (status === 'max_iterations') {
    nextSteps.push('작업을 더 작은 단위로 나누어 다시 시도해보세요');
    nextSteps.push('maxIterations 설정을 늘려보세요');
  }

  if (status === 'partial_success' || status === 'error') {
    const failedTools = Array.from(new Set(failedCalls.map((c) => c.toolName)));
    if (failedTools.length > 0) {
      nextSteps.push(`실패한 도구들을 개별적으로 재시도: ${failedTools.join(', ')}`);
    }
  }

  if (visitedPages.length > 0) {
    nextSteps.push('방문한 페이지들의 정보를 활용하여 추가 작업 수행');
  }

  return {
    status,
    summary,
    details: {
      totalIterations: context.iterations,
      maxIterations: context.maxIterations,
      duration,
      toolStats,
      visitedPages,
      achievements,
      issues,
    },
    nextSteps: nextSteps.length > 0 ? nextSteps : undefined,
    errorMessage: context.errorMessage,
  };
}

/**
 * 보고서를 마크다운 형식으로 포맷팅
 */
function formatBrowserAgentReport(report: BrowserAgentReport): string {
  let output = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `# 📊 Browser Agent 실행 보고서\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // 요약
  output += `## 요약\n${report.summary}\n\n`;

  // 실행 정보
  output += `## 실행 정보\n`;
  output += `- **총 반복 횟수:** ${report.details.totalIterations}/${report.details.maxIterations}\n`;
  output += `- **실행 시간:** ${report.details.duration.toFixed(1)}초\n`;
  output += `- **사용한 도구 수:** ${report.details.toolStats.length}개\n`;
  output += `- **방문한 페이지 수:** ${report.details.visitedPages.length}개\n\n`;

  // 주요 성과
  if (report.details.achievements.length > 0) {
    output += `## ✅ 주요 성과\n`;
    for (const achievement of report.details.achievements) {
      output += `- ${achievement}\n`;
    }
    output += `\n`;
  }

  // 방문한 페이지
  if (report.details.visitedPages.length > 0) {
    output += `## 🌐 방문한 페이지\n`;
    const recentPages = report.details.visitedPages.slice(-5);
    for (const page of recentPages) {
      output += `- **${page.title || '제목 없음'}**\n`;
      output += `  ${page.url}\n`;
    }
    if (report.details.visitedPages.length > 5) {
      output += `  ... 외 ${report.details.visitedPages.length - 5}개\n`;
    }
    output += `\n`;
  }

  // Tool 사용 통계
  if (report.details.toolStats.length > 0) {
    output += `## 🛠️ Tool 사용 통계\n`;
    const topTools = report.details.toolStats.slice(0, 10);
    for (const stat of topTools) {
      const successRate =
        stat.callCount > 0 ? ((stat.successCount / stat.callCount) * 100).toFixed(0) : '0';
      output += `- **${stat.toolName}**: ${stat.callCount}회 호출 (성공: ${stat.successCount}, 실패: ${stat.failureCount}, 성공률: ${successRate}%)\n`;
    }
    output += `\n`;
  }

  // 발생한 문제
  if (report.details.issues.length > 0) {
    output += `## ⚠️ 발생한 문제\n`;
    for (const issue of report.details.issues) {
      output += `- ${issue}\n`;
    }
    output += `\n`;
  }

  // 다음 단계
  if (report.nextSteps && report.nextSteps.length > 0) {
    output += `## 💡 다음 단계 제안\n`;
    for (const step of report.nextSteps) {
      output += `- ${step}\n`;
    }
    output += `\n`;
  }

  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  return output;
}

/**
 * Browser Agent용 generate 노드 - Browser Control Tools 포함
 */
async function generateWithBrowserToolsNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    console.debug('[BrowserAgent.Generate] ===== generateWithBrowserToolsNode called =====');
    console.debug('[BrowserAgent.Generate] Current state:', {
      messageCount: state.messages.length,
      lastMessageRole: state.messages[state.messages.length - 1]?.role,
      toolResultsCount: state.toolResults.length,
    });

    // Browser Control Tools (27개 도구 - Vision + Google Search 포함)
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
      browserWaitForElementTool,
      // Tab management
      browserListTabsTool,
      browserCreateTabTool,
      browserSwitchTabTool,
      browserCloseTabTool,
      // Vision-based tools
      browserCaptureAnnotatedScreenshotTool, // Set-of-Mark 스크린샷
      browserClickCoordinateTool, // 좌표 기반 클릭
      browserClickMarkerTool, // 마커 라벨로 클릭
      browserGetClickableCoordinateTool, // 요소의 클릭 가능 좌표
      browserAnalyzeWithVisionTool, // Vision 모델 분석 (향후)
      // Google Search tools (NEW)
      googleSearchTool, // 기본 웹 검색
      googleSearchNewsTool, // 뉴스 검색
      googleSearchScholarTool, // 학술 검색
      googleSearchImagesTool, // 이미지 검색
      googleSearchAdvancedTool, // 고급 검색
      googleExtractResultsTool, // 검색 결과 추출
      googleGetRelatedSearchesTool, // 관련 검색어
      googleVisitResultTool, // 검색 결과 방문
      googleNextPageTool, // 다음 페이지
    ];

    console.debug(
      `[BrowserAgent.Generate] Available Browser Control tools: ${browserTools.length}`
    );
    console.debug(
      '[BrowserAgent.Generate] Tool details:',
      browserTools.map((t) => t.name)
    );

    // OpenAI compatible tools 형식으로 변환
    const toolsForLLM = browserTools.map((tool) => ({
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

      console.debug('[BrowserAgent.Generate] Creating tool result message:', {
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
8. **ALWAYS FETCH FRESH DATA** - NEVER rely on previous tool results or cached information. When asked about "현재 페이지" or "current page", ALWAYS call the browser tools again to get the LATEST page content, even if you analyzed it before. Pages can change at any time.

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

## Google Search Tools (NEW - Perplexity-level search capabilities!)

**Search Tools:**
- **google_search**: 기본 웹 검색 (날짜, 사이트, 파일타입, 언어/지역 필터 지원)
  - Example: google_search({ query: "최신 AI 뉴스", dateFilter: "week", language: "ko" })
- **google_search_news**: 뉴스 검색 (최신 기사)
- **google_search_scholar**: 학술 검색 (Google Scholar, 논문/연구 자료)
- **google_search_images**: 이미지 검색
- **google_search_advanced**: 고급 검색 (정확한 문구, 제외 단어, OR 연산)

**Extraction Tools:**
- **google_extract_results**: 검색 결과 추출 (제목, URL, 스니펫, 날짜, 출처)
- **google_get_related_searches**: 관련 검색어 추출 (검색 쿼리 확장)

**Navigation Tools:**
- **google_visit_result**: 특정 순위의 검색 결과 방문 및 콘텐츠 추출
  - Example: google_visit_result({ rank: 1, extractType: "summary" })
- **google_next_page**: 다음 페이지 이동 (더 많은 결과 탐색)

**Typical Google Search Workflow:**
1. google_search({ query: "검색어", dateFilter: "week" }) // 검색 수행
2. google_extract_results({ maxResults: 10 }) // 결과 추출
3. google_visit_result({ rank: 1, extractType: "summary", maxWaitTime: 10 }) // 상위 결과 방문
   - Use default maxWaitTime (10s) - do NOT increase it
   - If timeout occurs, use browser_navigate instead immediately
4. google_get_related_searches() // 관련 검색어 확인 (선택)

**IMPORTANT: google_visit_result Parameters:**
- maxWaitTime: Keep at default (10 seconds). Longer timeouts waste time.
- If it fails, the page is too slow - use browser_navigate with the URL instead
- Never retry google_visit_result with same rank after timeout

## Browser Navigation (Direct URL navigation)
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

- **browser_wait_for_element** (NEW): Wait for a CSS selector to appear
  - Use after navigation or dynamic actions
  - Example: browser_wait_for_element({ selector: "input[type=search]", timeout_ms: 5000 })

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

# ERROR RECOVERY STRATEGIES

When a tool fails, DON'T GIVE UP! Try these recovery strategies:

**Navigation Failures:**
1. If browser_navigate fails:
   - Check if URL is correct (add https:// if needed)
   - Try alternative domain (.com vs .net)
   - Use browser_create_tab with URL as fallback

**Element Not Found:**
1. If browser_search_elements returns empty:
   - Try browser_get_interactive_elements for full list
   - Use broader search terms ("button" instead of "submit button")
   - Try browser_capture_annotated_screenshot for visual identification

**Click/Type Failures:**
1. If browser_click_element fails (disabled, hidden):
   - Use browser_scroll to bring element into view
   - Wait and retry (page might still be loading)
   - Try browser_click_coordinate with element position
   - Use browser_capture_annotated_screenshot to verify element exists

2. If browser_type_text fails:
   - Click element first to focus it
   - Check if element is disabled or readonly
   - Try alternative input elements (search for similar ones)

**Page Load Issues:**
1. If page content seems incomplete:
   - Use browser_scroll to load dynamic content
   - Wait briefly and call browser_get_page_content again
   - Check browser_list_tabs to verify correct tab is active

**Google Search Result Failures:**
1. If google_visit_result times out or fails ONCE:
   - DO NOT retry with same rank - it will fail again
   - IMMEDIATELY use browser_navigate with the URL from google_extract_results
   - Then use browser_get_page_content to extract content
   - Workflow: google_extract_results → extract URL → browser_navigate → browser_get_page_content
   - Example: If rank 5 fails, get URL from result[4] and use browser_navigate
2. If you want to visit a specific URL:
   - ALWAYS use browser_navigate (NOT "assistant" or any other tool)
   - There is NO "assistant" tool - only browser_navigate for navigation
   - After navigation, use browser_get_page_content, browser_get_interactive_elements, etc.

**CRITICAL: DO NOT REPEAT FAILED ATTEMPTS**
- NEVER call the same tool with the same arguments after it fails
- If a tool fails, try a DIFFERENT approach immediately:
  - google_visit_result fails → browser_navigate instead
  - browser_navigate fails → try different URL or google_search again
  - Timeout errors → use alternative tool, NOT longer timeout
- Maximum 1 retry per unique tool+args combination
- Repeating failures wastes iterations and frustrates users

**General Strategy:**
- Tool failures are TEMPORARY - always try an alternative approach
- Combine tools creatively (screenshot + coordinate click, search + scroll, etc.)
- Verify assumptions with additional tool calls
- Report progress even when encountering obstacles
- If a tool name doesn't exist, check the available tool list and use the correct one

# SUCCESS CRITERIA

- You have ACTUAL browser access - use it!
- Use semantic roles and context for accurate element selection
- Search with natural language when element location is ambiguous
- ALWAYS verify after actions (check page changed, form submitted, etc.)
- Apply error recovery strategies when tools fail
- Be concise but thorough in your responses

Remember: This is a REAL browser with SEMANTIC ANALYSIS and AUTOMATIC RETRY. Use the enhanced tools!`,
      created_at: Date.now(),
    };

    const allMessages = [systemMessage, ...state.messages, ...toolMessages];

    // 컨텍스트 pruning 적용
    const messages = pruneContextIfNeeded(allMessages);

    console.debug(
      '[BrowserAgent.Generate] Messages to LLM:',
      messages.map((m) => ({
        role: m.role,
        contentPreview: m.content?.substring(0, 50),
      }))
    );

    // LLM 호출 (스트리밍, tools 포함)
    let accumulatedContent: string = '';
    let finalToolCalls: any[] | undefined = undefined;

    // Browser Agent LLM 설정 가져오기
    const { browserAgentLLMConfig } = useChatStore.getState();

    console.debug('[BrowserAgent.Generate] Starting streaming with browser tools...');
    console.debug('[BrowserAgent.Generate] LLM Config:', browserAgentLLMConfig);

    // LLM 호출 (재시도 로직 포함)
    try {
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
          console.debug('[BrowserAgent.Generate] Received tool calls from stream:', finalToolCalls);
        }
      }
    } catch (llmError) {
      console.error('[BrowserAgent.Generate] LLM call failed:', llmError);
      throw llmError;
    }

    console.debug(
      '[BrowserAgent.Generate] Streaming complete. Content length:',
      accumulatedContent.length
    );

    // Tool calls 파싱
    const toolCalls = finalToolCalls?.map((tc: any, index: number) => {
      const toolCallId = tc.id || `call_${Date.now()}_${index}`;

      console.debug('[BrowserAgent.Generate] Tool call:', {
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

    console.debug('[BrowserAgent.Generate] Assistant message created:', {
      hasContent: !!assistantMessage.content,
      hasToolCalls: !!assistantMessage.tool_calls,
      toolCallsCount: assistantMessage.tool_calls?.length,
    });

    return {
      messages: [assistantMessage],
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
    const actualMaxIterations = maxIterations ?? Math.max(browserAgentLLMConfig.maxIterations, 50);

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

  async *stream(initialState: AgentState, maxIterations?: number): AsyncGenerator<any> {
    let state = { ...initialState };
    let iterations = 0;
    this.shouldStop = false;

    // Browser Agent LLM 설정 가져오기
    const {
      browserAgentLLMConfig,
      addBrowserAgentLog,
      setBrowserAgentIsRunning,
      clearBrowserAgentLogs,
    } = useChatStore.getState();
    const actualMaxIterations = maxIterations ?? Math.max(browserAgentLLMConfig.maxIterations, 50);

    console.debug('[BrowserAgent] Starting stream with initial state');
    console.debug(
      '[BrowserAgent] Available browser tools: get_page_content, get_interactive_elements, click_element, type_text, scroll'
    );
    console.debug('[BrowserAgent] Max iterations:', actualMaxIterations);

    // Agent 로그 시작
    clearBrowserAgentLogs();

    // 실행 컨텍스트 초기화 (보고서 생성용)
    const executionContext: BrowserAgentExecutionContext = {
      startTime: Date.now(),
      iterations: 0,
      maxIterations: actualMaxIterations,
      wasStopped: false,
      hasError: false,
      toolCalls: [],
      visitedUrls: [],
    };

    // BrowserView 존재 확인 (Electron에서만)
    const activeViewAvailable = await hasActiveBrowserView();
    if (!activeViewAvailable) {
      addBrowserAgentLog({
        level: 'error',
        phase: 'error',
        message: '활성화된 브라우저 탭을 찾지 못했습니다. Browser 탭을 먼저 열어주세요.',
      });

      yield {
        reporter: {
          messages: [
            {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content:
                '❌ 브라우저 탭이 열려 있지 않습니다. Browser 탭을 먼저 연 다음 다시 시도해주세요.',
              created_at: Date.now(),
            },
          ],
        },
      };
      return;
    }

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
    const failureCounts = new Map<string, number>();
    let visionFallbackTriggered = false;
    let postVerifyPending = false;
    let lastPageFingerprint: string | null = null;
    let unchangedCount = 0;
    let scrollRecoveryPending = false;
    let waitInjected = false;

    while (iterations < actualMaxIterations && !this.shouldStop) {
      console.debug(
        `[BrowserAgent] ===== Iteration ${iterations + 1}/${actualMaxIterations} =====`
      );

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

      // Emit progress event with detailed logging
      emitStreamingChunk(
        `\n\n---\n🔄 **Iteration ${iterations + 1}/${actualMaxIterations}**\n💭 AI가 다음 작업을 계획하고 있습니다...\n`,
        state.conversationId
      );

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
        console.debug('[BrowserAgent] Calling generateWithBrowserToolsNode...');

        addBrowserAgentLog({
          level: 'thinking',
          phase: 'thinking',
          message: 'LLM이 다음 동작을 계획하고 있습니다...',
          details: {
            iteration: iterations + 1,
            maxIterations: actualMaxIterations,
          },
        });

        generateResult = await generateWithBrowserToolsNode(state);
        console.debug('[BrowserAgent] generateWithBrowserToolsNode completed');
      } catch (error: any) {
        console.error('[BrowserAgent] Generate node error:', error);

        addBrowserAgentLog({
          level: 'error',
          phase: 'error',
          message: `생성 노드 오류: ${error.message}`,
          details: {
            iteration: iterations + 1,
            maxIterations: actualMaxIterations,
          },
        });

        hasError = true;
        errorMessage = error.message || 'Failed to generate response';
        break;
      }

      if (generateResult.messages && generateResult.messages.length > 0) {
        const newMessage = generateResult.messages[0];

        console.debug('[BrowserAgent] Generated message:', {
          content: newMessage.content?.substring(0, 100),
          hasToolCalls: !!newMessage.tool_calls,
          toolCallsCount: newMessage.tool_calls?.length,
          toolNames: newMessage.tool_calls?.map((tc) => tc.name),
        });

        state = {
          ...state,
          messages: [...state.messages, newMessage],
          toolResults:
            generateResult.toolResults !== undefined
              ? generateResult.toolResults
              : state.toolResults,
        };

        // Yield the message
        yield {
          generate: {
            messages: [newMessage],
          },
        };

        // LLM이 아무 계획도 반환하지 않은 경우 즉시 종료
        if (
          (!newMessage.tool_calls || newMessage.tool_calls.length === 0) &&
          (!newMessage.content || newMessage.content.trim() === '')
        ) {
          addBrowserAgentLog({
            level: 'error',
            phase: 'error',
            message: '모델이 실행 계획을 반환하지 않았습니다. 다시 시도해주세요.',
            details: {
              iteration: iterations + 1,
              maxIterations: actualMaxIterations,
            },
          });
          hasError = true;
          errorMessage = '모델 응답이 비어 있습니다.';
          break;
        }
      }

      // 2. 도구 사용 여부 판단
      const decision = shouldUseTool(state);
      console.debug('[BrowserAgent] Decision:', decision);

      if (decision === 'end') {
        console.debug('[BrowserAgent] Ending - no more tools to call');

        addBrowserAgentLog({
          level: 'success',
          phase: 'decision',
          message: '더 이상 실행할 도구가 없습니다. 작업 완료.',
          details: {
            decision: 'end',
            iteration: iterations + 1,
            maxIterations: actualMaxIterations,
          },
        });

        break;
      }

      // Get tool calls for progress message and loop detection
      const lastMessage = state.messages[state.messages.length - 1];
      const toolSourceIndex = state.messages.length - 1;
      const toolCalls = lastMessage.tool_calls || [];

      // 로그: 도구 호출 계획
      if (toolCalls.length > 0) {
        let logMessage = '\n';

        for (const toolCall of toolCalls) {
          addBrowserAgentLog({
            level: 'info',
            phase: 'tool_call',
            message: `도구 호출: ${toolCall.name}`,
            details: {
              toolName: toolCall.name,
              toolArgs: toolCall.arguments as Record<string, string | number | boolean | null>,
              iteration: iterations + 1,
              maxIterations: actualMaxIterations,
            },
          });

          // Detailed tool call logging (like coding-agent)
          logMessage += `🛠️ **Call:** \`${toolCall.name}\`\n`;
          try {
            const args =
              typeof toolCall.arguments === 'string'
                ? toolCall.arguments
                : JSON.stringify(toolCall.arguments, null, 2);
            logMessage += `📂 **Args:**\n\`\`\`json\n${args}\n\`\`\`\n`;
          } catch {
            logMessage += `📂 **Args:** (parsing failed)\n`;
          }
        }

        emitStreamingChunk(logMessage, state.conversationId);
      }

      // Emit tool execution progress
      if (toolCalls.length > 0) {
        const toolNames = toolCalls.map((tc) => tc.name).join(', ');
        yield {
          progress: {
            iteration: iterations + 1,
            maxIterations: actualMaxIterations,
            status: 'executing',
            message: `브라우저 도구 실행 중: ${toolNames}`,
          },
        };
      }

      // 3. tools 노드 실행 (자동 실행, 승인 불필요, 재시도 포함)
      console.debug('[BrowserAgent] Executing browser tools node');
      let toolsResult;

      try {
        toolsResult = await retryWithBackoff(
          async () => await toolsNode(state),
          2, // 도구 실행은 2번만 재시도
          500 // 500ms base delay
        );
      } catch (toolError) {
        console.error('[BrowserAgent] Tool execution failed after retries:', toolError);

        // Fallback: 도구 실행 실패 시 에러 결과로 대체
        toolsResult = {
          toolResults:
            state.messages.slice(-1)[0]?.tool_calls?.map((tc) => ({
              toolCallId: tc.id,
              toolName: tc.name,
              result: null,
              error: `도구 실행 실패 (재시도 후): ${toolError instanceof Error ? toolError.message : String(toolError)}`,
            })) || [],
        };
      }

      // 로그: 도구 결과
      if (toolsResult.toolResults) {
        const verificationHints: string[] = [];
        const accumulatedFailures: string[] = [];
        let annotatedGuidance: Message | null = null;
        let resultsLogMessage = '\n<small>\n';

        // Tool 호출 기록 (실행 컨텍스트에 추가)
        for (const result of toolsResult.toolResults) {
          executionContext.toolCalls.push({
            toolName: result.toolName,
            arguments:
              lastMessage.tool_calls?.find((tc) => tc.id === result.toolCallId)?.arguments || {},
            result: result.result,
            error: result.error,
            timestamp: Date.now(),
          });

          // URL 방문 추적 (browser_navigate 또는 google 검색)
          if (result.toolName === 'browser_navigate' || result.toolName.startsWith('google_')) {
            try {
              const getActiveBrowserView = (
                await import('../../../electron/ipc/handlers/browser-control')
              ).getActiveBrowserView;
              const browserView = getActiveBrowserView();
              if (browserView) {
                const url = browserView.webContents.getURL();
                const title = browserView.webContents.getTitle();
                if (url && !executionContext.visitedUrls.some((v) => v.url === url)) {
                  executionContext.visitedUrls.push({
                    url,
                    title: title || undefined,
                    timestamp: Date.now(),
                  });
                }
              }
            } catch {
              // Ignore errors in URL tracking
            }
          }
        }

        for (const result of toolsResult.toolResults) {
          if (result.error) {
            const prev = failureCounts.get(result.toolName) ?? 0;
            failureCounts.set(result.toolName, prev + 1);
            accumulatedFailures.push(result.toolName);

            addBrowserAgentLog({
              level: 'error',
              phase: 'tool_result',
              message: `도구 실행 실패: ${result.toolName}`,
              details: {
                toolName: result.toolName,
                toolError: result.error,
                iteration: iterations + 1,
                maxIterations: actualMaxIterations,
              },
            });

            resultsLogMessage += `❌ Error: \`${result.toolName}\`\n`;

            let errorOutput = result.error || '(no error message)';
            if (errorOutput.length > 300) {
              errorOutput = `${errorOutput.substring(0, 300)}\n... (error message truncated)`;
            }

            // Use inline code for short errors
            if (errorOutput.length < 100 && !errorOutput.includes('\n')) {
              resultsLogMessage += `📄 Output: \`${errorOutput}\`\n`;
            } else {
              resultsLogMessage += `📄 Output:\n\`\`\`\n${errorOutput}\n\`\`\`\n`;
            }
          } else {
            // Reset failure counter on success
            failureCounts.delete(result.toolName);

            // Verification hints for actions that alter the page
            if (
              [
                'browser_click_element',
                'browser_type_text',
                'browser_navigate',
                'browser_scroll',
              ].includes(result.toolName)
            ) {
              verificationHints.push(result.toolName);
              postVerifyPending = true;
            }

            // Annotated screenshot → marker guidance
            if (result.toolName === 'browser_capture_annotated_screenshot' && result.result) {
              try {
                const parsed =
                  typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
                const markers = Array.isArray(parsed?.markers) ? parsed.markers.slice(0, 5) : [];
                if (markers.length > 0) {
                  const lines = markers.map(
                    (m: any) =>
                      `- ${m.label}: ${m.elementLabel || m.role || 'unlabeled'} (${
                        m.boundingBox?.x ?? '?'
                      }, ${m.boundingBox?.y ?? '?'})`
                  );
                  annotatedGuidance = {
                    id: `annotated-guidance-${Date.now()}`,
                    role: 'assistant',
                    content: `주석 스크린샷 확보. 상위 마커:\n${lines.join(
                      '\n'
                    )}\n필요하면 browser_click_marker로 해당 마커를 직접 클릭하세요.`,
                    created_at: Date.now(),
                  };
                }
              } catch (err) {
                console.warn('[BrowserAgent] Failed to parse annotated screenshot result', err);
              }
            }

            // Page fingerprint 추적 및 변화 감지
            if (result.toolName === 'browser_get_page_content' && result.result) {
              try {
                const parsed =
                  typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
                const fingerprint = [
                  parsed?.url || '',
                  parsed?.title || '',
                  parsed?.summary || '',
                  parsed?.main_content_preview?.length || parsed?.mainText?.length || 0,
                ].join('|');

                if (lastPageFingerprint && fingerprint === lastPageFingerprint) {
                  addBrowserAgentLog({
                    level: 'warning',
                    phase: 'decision',
                    message: '페이지 상태가 이전과 동일합니다. 다른 접근을 시도하세요.',
                    details: {
                      iteration: iterations + 1,
                      maxIterations: actualMaxIterations,
                    },
                  });

                  unchangedCount += 1;
                  if (unchangedCount >= 1) {
                    scrollRecoveryPending = true;
                  }
                }

                if (!lastPageFingerprint || fingerprint !== lastPageFingerprint) {
                  unchangedCount = 0;
                  scrollRecoveryPending = false;
                }

                lastPageFingerprint = fingerprint;
              } catch (err) {
                console.warn('[BrowserAgent] Failed to parse page content for fingerprint', err);
              }
            }

            addBrowserAgentLog({
              level: 'success',
              phase: 'tool_result',
              message: `도구 실행 성공: ${result.toolName}`,
              details: {
                toolName: result.toolName,
                toolResult:
                  typeof result.result === 'string' ? result.result : JSON.stringify(result.result),
                iteration: iterations + 1,
                maxIterations: actualMaxIterations,
              },
            });

            // Detailed success logging
            resultsLogMessage += `✅ Result: \`${result.toolName}\`\n`;

            let output = result.result || '(no output)';
            if (typeof output !== 'string') {
              output = JSON.stringify(output, null, 2);
            }

            // Shorten output for better UX (300 chars instead of 1000)
            if (output.length > 300) {
              output = `${output.substring(0, 300)}\n... (output truncated for readability)`;
            }

            // Use inline code instead of code block for shorter output
            if (output.length < 100 && !output.includes('\n')) {
              resultsLogMessage += `📄 Output: \`${output}\`\n`;
            } else {
              resultsLogMessage += `📄 Output:\n\`\`\`\n${output}\n\`\`\`\n`;
            }
          }
        }

        // Emit all tool results at once
        if (resultsLogMessage.length > 9) {
          // Changed from 1 to 9 to account for "<small>\n"
          emitStreamingChunk(`${resultsLogMessage}</small>\n---\n`, state.conversationId);
        }

        // Reflection: repeated failures -> guide to alternative strategy
        const reflectionNotes: string[] = [];

        const hasRepeatedFailure = Array.from(failureCounts.entries()).some(
          ([_, count]) => count >= 2
        );

        if (hasRepeatedFailure || accumulatedFailures.length >= 2) {
          reflectionNotes.push(
            `이전 시도에서 도구 실패가 반복되었습니다 (${Array.from(failureCounts.entries())
              .map(([name, count]) => `${name} x${count}`)
              .join(', ')}). 다른 경로를 사용하세요:`
          );
          reflectionNotes.push(
            '- DOM 검색을 다시 시도할 때 검색어를 바꾸거나 범위를 넓히기 (browser_search_elements → browser_get_interactive_elements)'
          );
          reflectionNotes.push(
            '- Annotated 스크린샷을 찍고 마커로 클릭 (browser_capture_annotated_screenshot → browser_click_marker)'
          );
          reflectionNotes.push('- 필요하면 좌표 클릭(browser_click_coordinate)로 우회');
        }

        if (verificationHints.length > 0) {
          reflectionNotes.push(
            `검증 제안: ${verificationHints
              .map((t) => t.replace('browser_', ''))
              .join(
                ', '
              )} 실행 후 페이지 변화를 확인하려면 browser_get_page_content나 browser_search_elements로 결과를 확인하세요.`
          );
        }

        if (reflectionNotes.length > 0) {
          const reflectionMessage: Message = {
            id: `reflection-${Date.now()}`,
            role: 'assistant',
            content: reflectionNotes.join('\n'),
            created_at: Date.now(),
          };

          addBrowserAgentLog({
            level: 'thinking',
            phase: 'thinking',
            message: '대체 경로/검증 안내 추가',
            details: {
              iteration: iterations + 1,
              maxIterations: actualMaxIterations,
            },
          });

          state = {
            ...state,
            messages: [...state.messages, reflectionMessage],
          };
        }

        // Annotated screenshot에서 추출된 마커 힌트 추가
        if (annotatedGuidance) {
          addBrowserAgentLog({
            level: 'info',
            phase: 'thinking',
            message: '주석 스크린샷 마커 힌트 제공',
            details: {
              iteration: iterations + 1,
              maxIterations: actualMaxIterations,
            },
          });

          state = {
            ...state,
            messages: [...state.messages, annotatedGuidance],
          };
        }

        // 반복 실패 시 요소 등장 대기 자동 실행
        if (hasRepeatedFailure && !waitInjected) {
          const waitMessage: Message = {
            id: `wait-${Date.now()}`,
            role: 'assistant',
            content: '동적 요소 로드를 기다립니다.',
            created_at: Date.now(),
            tool_calls: [
              {
                id: `tool-${Date.now()}-wait`,
                name: 'browser_wait_for_element',
                arguments: {
                  selector: 'button, input, form, a[href]',
                  timeout_ms: 5000,
                },
              },
            ],
          };

          addBrowserAgentLog({
            level: 'info',
            phase: 'tool_call',
            message: '동적 요소 대기 실행',
            details: {
              iteration: iterations + 1,
              maxIterations: actualMaxIterations,
            },
          });

          state = {
            ...state,
            messages: [...state.messages, waitMessage],
          };

          waitInjected = true;
        }

        // Annotated marker 기반 검색을 자동 준비 (간단한 OCR-free 하이브리드)
        if (annotatedGuidance && visionFallbackTriggered) {
          const markerSearchMessage: Message = {
            id: `marker-search-${Date.now()}`,
            role: 'assistant',
            content: '마커 라벨 텍스트로 DOM 검색을 시도합니다.',
            created_at: Date.now(),
            tool_calls: [
              {
                id: `tool-${Date.now()}-marker-search`,
                name: 'browser_search_elements',
                arguments: {
                  query: 'button link submit login 검색 search 확인',
                },
              },
            ],
          };

          addBrowserAgentLog({
            level: 'info',
            phase: 'tool_call',
            message: '마커 라벨 기반 검색 시도',
            details: {
              iteration: iterations + 1,
              maxIterations: actualMaxIterations,
            },
          });

          state = {
            ...state,
            messages: [...state.messages, markerSearchMessage],
          };
        }

        // 동일 페이지 상태가 두 번 이상 유지될 때 추가 탐색/비전 플랜 삽입
        if (unchangedCount >= 2 && !visionFallbackTriggered) {
          const unchangedMessage: Message = {
            id: `unchanged-${Date.now()}`,
            role: 'assistant',
            content: '페이지가 변하지 않아 비전 캡처와 요소 검색을 다시 시도합니다.',
            created_at: Date.now(),
            tool_calls: [
              {
                id: `tool-${Date.now()}-unchanged-capture`,
                name: 'browser_capture_annotated_screenshot',
                arguments: {
                  maxMarkers: 25,
                  includeOverlay: true,
                },
              },
              {
                id: `tool-${Date.now()}-unchanged-search`,
                name: 'browser_search_elements',
                arguments: {
                  query: 'button link form input',
                },
              },
            ],
          };

          addBrowserAgentLog({
            level: 'warning',
            phase: 'tool_call',
            message: '페이지 변화 없음 → 비전 캡처 + 검색 재시도',
            details: {
              iteration: iterations + 1,
              maxIterations: actualMaxIterations,
            },
          });

          state = {
            ...state,
            messages: [...state.messages, unchangedMessage],
          };

          visionFallbackTriggered = true;
          unchangedCount = 0;
        }

        // 페이지 변화 없음 → 스크롤 재시도
        if (scrollRecoveryPending) {
          const scrollMessage: Message = {
            id: `scroll-recovery-${Date.now()}`,
            role: 'assistant',
            content: '페이지 변화를 위해 스크롤을 시도합니다.',
            created_at: Date.now(),
            tool_calls: [
              {
                id: `tool-${Date.now()}-scroll-recovery`,
                name: 'browser_scroll',
                arguments: {
                  direction: 'down',
                  amount: 600,
                },
              },
            ],
          };

          addBrowserAgentLog({
            level: 'info',
            phase: 'tool_call',
            message: '페이지 변화 없음 → 스크롤 실행',
            details: {
              iteration: iterations + 1,
              maxIterations: actualMaxIterations,
            },
          });

          state = {
            ...state,
            messages: [...state.messages, scrollMessage],
          };

          scrollRecoveryPending = false;
        }

        // 자동 비전 fallback: 실패 누적 시 Annotated screenshot 호출
        if (hasRepeatedFailure && !visionFallbackTriggered) {
          const visionToolMessage: Message = {
            id: `vision-fallback-${Date.now()}`,
            role: 'assistant',
            content: '반복 실패로 비전 기반 캡처를 실행합니다.',
            created_at: Date.now(),
            tool_calls: [
              {
                id: `tool-${Date.now()}`,
                name: 'browser_capture_annotated_screenshot',
                arguments: {
                  maxMarkers: 30,
                  includeOverlay: true,
                },
              },
            ],
          };

          addBrowserAgentLog({
            level: 'warning',
            phase: 'tool_call',
            message: '비전 캡처 fallback 실행',
            details: {
              iteration: iterations + 1,
              maxIterations: actualMaxIterations,
            },
          });

          state = {
            ...state,
            messages: [...state.messages, visionToolMessage],
          };

          visionFallbackTriggered = true;
        }

        // 자동 검증: 최근 변화가 있을 때 간단한 페이지 요약 요청
        if (postVerifyPending) {
          const verifyToolMessage: Message = {
            id: `verify-${Date.now()}`,
            role: 'assistant',
            content: '동작 검증을 위해 페이지 개요를 확인합니다.',
            created_at: Date.now(),
            tool_calls: [
              {
                id: `tool-${Date.now()}-verify`,
                name: 'browser_get_page_content',
                arguments: {},
              },
            ],
          };

          addBrowserAgentLog({
            level: 'info',
            phase: 'tool_call',
            message: '자동 검증: page content 조회',
            details: {
              iteration: iterations + 1,
              maxIterations: actualMaxIterations,
            },
          });

          state = {
            ...state,
            messages: [...state.messages, verifyToolMessage],
          };

          postVerifyPending = false;
        }
      }

      // 반복 감지: 도구 호출 히스토리에 추가
      for (const toolCall of toolCalls) {
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
            console.warn(
              '[BrowserAgent] Loop detected: same tool called multiple times with same arguments'
            );
            addBrowserAgentLog({
              level: 'warning',
              phase: 'decision',
              message: '동일한 도구 호출이 반복되어 실행을 중단합니다.',
              details: {
                iteration: iterations + 1,
                maxIterations: actualMaxIterations,
                toolName: toolCall.name,
              },
            });
            hasError = true;
            errorMessage = `같은 작업(${toolCall.name})이 반복되고 있습니다. 다른 방법을 시도해야 할 것 같습니다.`;
            break;
          }
        }
      }

      // Remove tool_calls from the source message (방금 실행한 메시지만)
      const updatedMessages = [...state.messages];
      if (toolSourceIndex >= 0 && updatedMessages[toolSourceIndex]?.tool_calls) {
        updatedMessages[toolSourceIndex] = {
          ...updatedMessages[toolSourceIndex],
          tool_calls: undefined,
        };
      }

      state = {
        ...state,
        messages: updatedMessages,
        toolResults: mergeToolResults(state.toolResults, toolsResult.toolResults),
      };

      console.debug('[BrowserAgent] Tool results:', toolsResult.toolResults);

      yield { tools: toolsResult };

      if (hasError) {
        break;
      }

      iterations++;
    }

    console.debug('[BrowserAgent] Stream completed, total iterations:', iterations);

    // Agent 로그 종료
    setBrowserAgentIsRunning(false);

    // 실행 컨텍스트 완료 처리
    executionContext.endTime = Date.now();
    executionContext.iterations = iterations;
    executionContext.wasStopped = this.shouldStop;
    executionContext.hasError = hasError;
    executionContext.errorMessage = errorMessage;

    // 최종 보고서 생성
    const report = generateBrowserAgentReport(executionContext);
    const formattedReport = formatBrowserAgentReport(report);

    // 로그에 완료 상태 기록
    const logLevel =
      report.status === 'success' ? 'success' : report.status === 'error' ? 'error' : 'warning';
    addBrowserAgentLog({
      level: logLevel,
      phase: 'completion',
      message: report.summary,
      details: {
        iteration: iterations,
        maxIterations: actualMaxIterations,
      },
    });

    // 보고서를 스트리밍으로 출력
    emitStreamingChunk(formattedReport, state.conversationId);

    // 최종 메시지 생성
    const finalReportMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: formattedReport,
      created_at: Date.now(),
    };

    console.debug('[BrowserAgent] Final report generated:', {
      status: report.status,
      iterations: report.details.totalIterations,
      toolsUsed: report.details.toolStats.length,
      pagesVisited: report.details.visitedPages.length,
    });

    yield {
      reporter: {
        messages: [finalReportMessage],
        report, // 구조화된 보고서 데이터도 함께 전달
      },
    };
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
