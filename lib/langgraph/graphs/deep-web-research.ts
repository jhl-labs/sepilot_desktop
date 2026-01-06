import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation, AgentState } from '../state';
import { toolsNode } from '../nodes/tools';
import type { Message } from '@/types';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';
import { LLMService } from '@/lib/llm/service';
import {
  getUserLanguage,
  getLanguageInstruction,
  getFollowUpLanguageInstruction,
} from '../utils/language-utils';
import { retrieveContextIfEnabled } from '../utils/rag-utils';
import { logger } from '@/lib/utils/logger';
const MAX_ITERATIONS = 3;

/**
 * 1단계: 검색 계획 수립 (Plan Node)
 */
async function planNode(state: AgentState): Promise<Partial<AgentState>> {
  let iteration = state.planningNotes?.iteration || 0;
  const isFirstStep = iteration === 0;
  const query = state.messages[state.messages.length - 1].content;

  // 이전 검색 결과 확인 - 모두 실패했다면 iteration을 증가시키지 않음 (재시도)
  const toolResults = state.toolResults || [];
  const lastBatchStart = state.planningNotes?.lastSearchCount || 0;
  const lastBatchResults = toolResults.slice(lastBatchStart);
  const allFailed = lastBatchResults.length > 0 && lastBatchResults.every((r) => !!r.error);

  if (allFailed && !isFirstStep) {
    logger.info(
      '[DeepWebResearch] Previous searches all failed. Retrying without incrementing iteration.'
    );
    emitStreamingChunk(
      `⚠️ **이전 검색 실패. 다른 방법으로 재시도합니다...**\n\n`,
      state.conversationId
    );
    // iteration을 증가시키지 않고 재시도
  } else if (!isFirstStep) {
    // 성공적인 검색이 있었으면 iteration 증가
    iteration += 1;
  }

  // RAG Context (첫 턴에만 수행)
  let ragContext = '';
  if (isFirstStep) {
    ragContext = await retrieveContextIfEnabled(query, 'DeepWebResearch');
  }

  logger.info(`[DeepWebResearch] Planning Step (Iter ${iteration + 1}, Actual: ${iteration})`);

  if (isFirstStep) {
    emitStreamingChunk('\n\n## 🧠 심층 웹 연구 시작\n\n', state.conversationId);
  } else {
    emitStreamingChunk(
      `\n\n### 🔄 추가 정보 수집 (단계 ${iteration + 1}/${MAX_ITERATIONS})\n\n`,
      state.conversationId
    );
  }

  // 이전 검색 결과 요약 문자열 생성 (위에서 이미 선언한 toolResults 재사용)
  const previousResults = toolResults
    .map(
      (r, i) =>
        `[검색 결과 ${i + 1}] (${r.toolName}):\n${typeof r.result === 'string' ? r.result.substring(0, 1000) : JSON.stringify(r.result).substring(0, 1000)}...`
    )
    .join('\n\n');

  const systemMessage: Message = {
    id: 'system-plan',
    role: 'system',
    content: `당신은 전문적인 'Deep Web Researcher'입니다.
사용자의 질문에 대해 깊이 있고 포괄적인 답변을 제공하기 위해 단계별로 웹 검색을 수행합니다.

현재 단계: ${iteration + 1} / ${MAX_ITERATIONS}

[핵심 원칙: 깊이 있는 다각도 탐색]
- 첫 검색에서 만족하지 말고, 다양한 관점에서 정보를 수집하세요.
- 최소 2-3번의 검색을 통해 정보의 깊이와 폭을 확보하세요.
- 각 iteration마다 새로운 키워드나 관점으로 접근하세요.
- 진짜 충분한 정보가 모였을 때만 검색을 종료하세요.

[지시사항]
1. 현재까지 수집된 정보를 분석하여, 더 필요한 정보가 무엇인지 판단하세요.
2. **정보가 진짜 충분할 때만** 'queries'를 빈 배열 []로 반환하세요.
   - 단순히 "뭔가 나왔다"가 아니라 "질문에 완전히 답할 수 있다"를 기준으로 판단하세요.
   - 첫 검색 결과가 불충분하거나 일부 관점만 다룬다면 계속 검색하세요.
3. 더 정보가 필요하다면, Tavily 검색 도구를 위한 최적의 쿼리를 생성하세요.

4. **🚨 절대 준수 사항 (파라미터 제한) 🚨**
   'tavily_search' 도구는 **오직 2개의 파라미터만** 허용합니다:

   ✅ **허용된 파라미터 (이것만 사용):**
   - "query": (string, 필수) 검색어 - 반드시 의미 있는 문자열을 입력하세요
   - "max_results": (number, 선택) 최대 결과 수 (기본값: 5, 범위: 1-10)

   ❌ **금지된 모든 파라미터 (시스템 에러 발생):**
   아래 파라미터들은 절대 사용하지 마세요. 사용하면 검색이 실패합니다:
   - "top_n", "topn", "country", "topic", "search_depth", "days", "time_range"
   - "include_domains", "exclude_domains", "include_answer"
   - "include_raw_content", "include_images", "select_paths", "exclude_paths"
   - 기타 query, max_results 이외의 모든 파라미터

   **빈 값도 절대 금지:**
   - 빈 문자열 (""), null, undefined 값을 파라미터로 보내지 마세요
   - 사용하지 않을 파라미터는 아예 포함하지 마세요

   **✅ 올바른 예시 (이 형식만 사용하세요):**
   {"query": "latest AI news 2025", "max_results": 5} ✅
   {"query": "Python tutorial beginners"} ✅ (max_results 생략 가능)
   {"query": "climate change statistics", "max_results": 3} ✅

   **❌ 잘못된 예시 (절대 사용 금지):**
   {"query": "news", "max_results": 5, "country": "ko"} ❌ (country 파라미터 사용)
   {"query": "AI", "top_n": 10} ❌ (top_n은 금지, max_results 사용)
   {"query": "research", "time_range": ""} ❌ (time_range 파라미터 + 빈 문자열)
   {"query": "search", "search_depth": "advanced"} ❌ (search_depth 금지)
   {"query": "data", "select_paths": [], "exclude_paths": []} ❌ (paths 파라미터 금지)
   {"query": "", "max_results": 5} ❌ (빈 query 금지)

   **⚠️ 중요:
   - 파라미터는 query와 max_results만 사용하세요
   - 다른 파라미터를 추가하면 에러가 발생합니다
   - 빈 값을 보내지 마세요**

5. 한 번에 최대 3개의 병렬 쿼리를 생성할 수 있습니다.
6. 반드시 아래 JSON 형식으로만 응답하세요.

[JSON 형식 예시]
{
  "thought": "사용자가 ...에 대해 물었으므로, 먼저 최신 동향을 검색하고, 이어서 기술적 세부사항과 실제 사례를 추가로 조사해야 합니다.",
  "queries": [
    {"tool_name": "tavily_search", "parameters": {"query": "Gemini 3.0 latest news 2025", "max_results": 5}},
    {"tool_name": "tavily_search", "parameters": {"query": "Gemini 3.0 technical specifications", "max_results": 5}}
  ]
}`,
    created_at: Date.now(),
  };

  const planPrompt: Message = {
    id: 'plan-prompt',
    role: 'user',
    content: `원본 질문: ${query}

${ragContext ? `[사전 RAG 정보]\n${ragContext}\n\n` : ''}
[현재까지 수집된 정보]
${previousResults || '(없음)'}

위 정보를 바탕으로 다음 검색 계획을 JSON으로 작성하세요.`,
    created_at: Date.now(),
  };

  let planOutput = '';
  // 도구 호출 없이 순수 텍스트 생성을 위해 tools: []
  for await (const chunk of LLMService.streamChat([systemMessage, planPrompt], {
    tools: [],
    tool_choice: 'none',
  })) {
    // 계획 생성 과정은 사용자에게 보여주지 않거나 간략히만 보여줄 수 있음
    // 여기서는 디버깅을 위해 로그로만 남기고, 실제 계획된 쿼리는 아래에서 출력
    planOutput += chunk;
  }

  logger.info('[DeepWebResearch] Plan Output:', planOutput);

  // 파싱
  let plannedQueries: any[] = [];
  let thought = '';

  try {
    // JSON 추출
    const jsonMatch = planOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      plannedQueries = parsed.queries || [];
      thought = parsed.thought || '';
    } else {
      console.warn('[DeepWebResearch] Failed to find JSON in plan output');
    }
  } catch (e) {
    console.error('[DeepWebResearch] JSON parse error:', e);
  }

  // 화면에 계획 알림
  if (thought) {
    emitStreamingChunk(`🤔 **생각:** ${thought}\n\n`, state.conversationId);
  }
  if (plannedQueries.length > 0) {
    const queryList = plannedQueries.map((q) => `- "${q.parameters.query}"`).join('\n');
    emitStreamingChunk(`📝 **검색 계획:**\n${queryList}\n\n`, state.conversationId);
  } else {
    emitStreamingChunk(`✅ **정보 수집 완료. 답변을 생성합니다.**\n\n`, state.conversationId);
  }

  return {
    messages: state.messages, // 메시지 히스토리는 유지
    planningNotes: {
      queries: plannedQueries,
      iteration,
      thought,
      lastSearchCount: toolResults.length, // 현재까지의 검색 결과 수 저장
    },
  };
}

/**
 * 2단계: 웹 검색 실행 (Search Node)
 */
async function searchNode(state: AgentState): Promise<Partial<AgentState>> {
  const notes = state.planningNotes;
  const queries = notes?.queries || [];

  if (queries.length === 0) {
    return {};
  }

  logger.info(`[DeepWebResearch] Executing ${queries.length} searches...`);
  emitStreamingChunk(`🚀 **검색 실행 중...**\n`, state.conversationId);

  let newToolResults: any[] = [];

  // 병렬 실행을 위해 Promise.all 사용
  // toolsNode는 tool_calls 메시지를 받아 처리하므로, 직접 MCPServerManager나 builtin tools를 호출하는 게 나을 수 있음.
  // 하지만 여기서는 일관성을 위해 toolsNode 로직을 흉내내거나 재사용.
  // 여기서는 각 쿼리를 개별 tool call로 만들어 처리.

  // 주의: 실제 도구 실행은 toolsNode를 통해야 활동 로그 등이 남음.
  // 하지만 toolsNode는 state.messages의 마지막 메시지의 tool_calls를 봅니다.
  // 여기서는 임시 메시지를 만들어 toolsNode에 넘깁니다.

  // Filter tool parameters to only include allowed fields
  const tempToolCalls = queries.map((q: any, idx: number) => {
    let cleanedParams = q.parameters;

    // Tavily Search: Only allow query and max_results
    if (q.tool_name === 'tavily_search') {
      const params = q.parameters || {};

      // Extract query (support multiple field names)
      let query = params.query || params.search_query || '';
      if (typeof query !== 'string') {
        query = String(query);
      }
      query = query.trim();

      // Extract max_results (support multiple field names and map old names)
      let maxResults = params.max_results || params.maxResults || params.top_n || params.topn || 5;
      if (typeof maxResults === 'string') {
        maxResults = parseInt(maxResults, 10) || 5;
      }
      maxResults = Math.max(1, Math.min(maxResults, 10)); // Clamp to 1-10

      // Only include non-empty values
      cleanedParams = {};
      if (query) {
        cleanedParams.query = query;
      }
      if (maxResults) {
        cleanedParams.max_results = maxResults;
      }

      logger.info('[DeepWebResearch] Original params:', params);
      logger.info('[DeepWebResearch] Cleaned params:', cleanedParams);
    }

    return {
      id: `call-${Date.now()}-${idx}`,
      name: q.tool_name,
      arguments: cleanedParams,
    };
  });

  const tempMessage: Message = {
    id: `temp-tool-msg-${Date.now()}`,
    role: 'assistant',
    content: '',
    tool_calls: tempToolCalls,
    created_at: Date.now(),
  };

  // toolsNode 호출
  try {
    const resultState = await toolsNode({
      ...state,
      messages: [...state.messages, tempMessage],
    } as any); // AgentState 호환성

    newToolResults = resultState.toolResults || [];

    // 결과 로깅
    for (const res of newToolResults) {
      if (res.error) {
        emitStreamingChunk(`❌ **실패:** ${res.toolName} - ${res.error}\n`, state.conversationId);
      } else {
        // 결과가 너무 길면 요약해서 보여줄 수도 있음
        emitStreamingChunk(`✅ **완료:** ${res.toolName}\n`, state.conversationId);
      }
    }
  } catch (e: any) {
    emitStreamingChunk(`❌ **검색 실패:** ${e.message}\n`, state.conversationId);
    newToolResults.push({ error: e.message, toolName: 'tavily_search' } as any);

    // Rate Limit이나 치명적 에러 감지
    if (
      e.message.includes('429') ||
      e.message.toLowerCase().includes('limit') ||
      e.message.toLowerCase().includes('quota') ||
      e.message.toLowerCase().includes('unauthorized')
    ) {
      emitStreamingChunk(
        `⚠️ **검색 제한 감지:** 추가 검색을 중단하고 현재 정보로 답변을 생성합니다.\n`,
        state.conversationId
      );
      return {
        toolResults: [...(state.toolResults || []), ...newToolResults],
        planningNotes: { ...state.planningNotes, forceSynthesize: true },
      };
    }
  }

  return {
    // 기존 toolResults에 누적
    toolResults: [...(state.toolResults || []), ...newToolResults],
  };
}

/**
 * 조건부 엣지 함수
 */
function checkPlan(state: AgentState) {
  const notes = state.planningNotes;

  // 강제 종료 플래그 확인
  if (notes?.forceSynthesize) {
    logger.info('[DeepWebResearch] Force synthesize flag detected');
    return 'synthesize';
  }

  // 쿼리가 없으면 종료 (Synthesize) - LLM이 충분하다고 판단
  if (!notes || !notes.queries || notes.queries.length === 0) {
    logger.info('[DeepWebResearch] No more queries planned. Moving to synthesize.');
    return 'synthesize';
  }

  // 최대 반복 횟수 도달 시 종료 (>= 사용하여 정확히 MAX_ITERATIONS만큼만 실행)
  if (notes.iteration >= MAX_ITERATIONS) {
    logger.info(
      `[DeepWebResearch] Max iterations reached (${notes.iteration}/${MAX_ITERATIONS}). Moving to synthesize.`
    );
    emitStreamingChunk(
      `\n⏸️ **최대 검색 횟수 도달 (${notes.iteration}/${MAX_ITERATIONS}). 수집된 정보로 답변을 생성합니다.**\n\n`,
      state.conversationId
    );
    return 'synthesize';
  }

  logger.info(
    `[DeepWebResearch] Proceeding to search (iteration ${notes.iteration + 1}/${MAX_ITERATIONS})`
  );
  return 'search';
}

/**
 * 3단계: 결과 종합 및 답변 생성 (Synthesize Node)
 */
async function synthesizeNode(state: AgentState): Promise<Partial<AgentState>> {
  logger.info('[DeepWebResearch] Step 3: Synthesizing answer...');
  emitStreamingChunk('\n\n## ✨ 최종 답변 생성\n\n', state.conversationId);
  emitStreamingChunk(
    '**단계 진행 중:** 수집된 방대한 정보를 바탕으로 최종 답변을 작성합니다...\n\n',
    state.conversationId
  );

  // 사용자 언어 설정 가져오기
  const userLanguage = await getUserLanguage();
  const languageInstruction = getLanguageInstruction(userLanguage);

  const allSearchOutputs =
    state.toolResults
      ?.map((r) => {
        const content = typeof r.result === 'string' ? r.result : JSON.stringify(r.result);
        return `[출처: ${r.toolName}]\n${content.substring(0, 2000)}... (생략됨)`; // 컨텍스트 제한 고려
      })
      .join('\n\n---\n\n') || '검색 결과 없음';

  const systemMessage: Message = {
    id: 'system-synth',
    role: 'system',
    content: `당신은 웹 검색 결과를 바탕으로 사용자의 질문에 대해 포괄적이고 정확한 답변을 생성하는 AI입니다.
수집된 정보를 정확하게 요약하고, 질문에 직접적으로 답변하세요.

만약 검색 결과가 없거나 불충분하다면(검색 실패, 제한 등), 당신의 내부 지식을 최대한 활용하여 답변하고 검색에 어려움이 있었음을 사용자에게 알리세요. ${languageInstruction}`,
    created_at: Date.now(),
  };

  const synthesizePrompt: Message = {
    id: 'synth-prompt',
    role: 'user',
    content: `원본 질문: ${state.messages[state.messages.length - 1].content}

[수집된 연구 자료]
${allSearchOutputs}

위 자료를 바탕으로 최종 보고서를 작성하세요.`,
    created_at: Date.now(),
  };

  let finalAnswer = '';
  // 사고 모델과 달리 도구를 사용하지 않으므로 { tools: [], tool_choice: 'none' }
  for await (const chunk of LLMService.streamChat([systemMessage, synthesizePrompt], {
    tools: [],
    tool_choice: 'none',
  })) {
    finalAnswer += chunk;
    emitStreamingChunk(chunk, state.conversationId);
  }

  // 후속 질문 생성 (Perplexity 스타일)
  let followUpQuestions = '';
  if (finalAnswer) {
    emitStreamingChunk('\n\n---\n### 💡 추천 후속 질문\n', state.conversationId);

    const tempAssistantMessage: Message = {
      id: 'temp-assistant',
      role: 'assistant',
      content: finalAnswer,
      created_at: Date.now(),
    };

    // 사용자 언어 설정 가져오기
    const userLanguage = await getUserLanguage();
    const followUpLanguage = getFollowUpLanguageInstruction(userLanguage);

    const followUpPrompt: Message = {
      id: 'follow-up-prompt',
      role: 'user',
      content: `위 답변을 바탕으로 사용자가 이어서 궁금해할 만한 "추천 후속 질문" 3가지를 ${followUpLanguage} 제안해주세요.\n질문 내용만 간결하게 번호를 매겨 작성하세요. (설명 불필요)`,
      created_at: Date.now(),
    };

    try {
      for await (const chunk of LLMService.streamChat(
        [systemMessage, synthesizePrompt, tempAssistantMessage, followUpPrompt],
        { tools: [], tool_choice: 'none' }
      )) {
        followUpQuestions += chunk;
        emitStreamingChunk(chunk, state.conversationId);
      }
    } catch (e) {
      console.error('[DeepWebResearch] Failed to generate follow-up questions', e);
    }
  }

  const finalContent = followUpQuestions
    ? `${finalAnswer}\n\n---\n### 💡 추천 후속 질문\n${followUpQuestions}`
    : finalAnswer;

  const assistantMessage: Message = {
    id: `msg-${Date.now()}`,
    role: 'assistant',
    content: finalContent,
    created_at: Date.now(),
  };

  logger.info('[DeepWebResearch] Final answer synthesized');

  return {
    messages: [assistantMessage],
  };
}

/**
 * Deep Web Research Graph 생성
 */
export function createDeepWebResearchGraph() {
  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode('plan', planNode)
    .addNode('search', searchNode)
    .addNode('synthesize', synthesizeNode)

    .addEdge('__start__', 'plan')

    // plan -> checkPlan -> (search | synthesize)
    .addConditionalEdges('plan', checkPlan, {
      search: 'search',
      synthesize: 'synthesize',
    })

    // search -> plan (Loop)
    .addEdge('search', 'plan')

    .addEdge('synthesize', END);

  return workflow.compile();
}
