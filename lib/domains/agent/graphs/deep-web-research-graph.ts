/**
 * DeepWebResearchGraph - 심층 웹 연구 그래프
 *
 * BaseGraph를 상속하여 3단계 반복 검색 프로세스 제공
 *
 * 단계:
 * 1. Plan: 검색 계획 수립
 * 2. Search: 웹 검색 실행
 * 3. Synthesize: 최종 답변 생성
 *
 * 흐름:
 * START → plan → [checkPlan] → search → plan (loop, max 3회) → synthesize → END
 */

import { StateGraph, END } from '@langchain/langgraph';
import { AgentStateAnnotation, AgentState } from '../state';
import { BaseGraph } from '../base/base-graph';
import { toolsNode } from '../nodes/tools';
import type { Message } from '@/types';
import { retrieveContextIfEnabled } from '../utils/rag-utils';
import { logger } from '@/lib/utils/logger';

const MAX_ITERATIONS = 3;

/**
 * DeepWebResearchGraph 클래스
 */
export class DeepWebResearchGraph extends BaseGraph<AgentState> {
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
    return workflow
      .addNode('plan', this.planNode.bind(this))
      .addNode('search', this.searchNode.bind(this))
      .addNode('synthesize', this.synthesizeNode.bind(this));
  }

  /**
   * 엣지 추가
   */
  protected buildEdges(workflow: any): any {
    return workflow
      .addEdge('__start__', 'plan')
      .addConditionalEdges('plan', this.checkPlan.bind(this), {
        search: 'search',
        synthesize: 'synthesize',
      })
      .addEdge('search', 'plan')
      .addEdge('synthesize', END);
  }

  /**
   * 1단계: 검색 계획 수립 (Plan Node)
   */
  private async planNode(state: AgentState): Promise<Partial<AgentState>> {
    let iteration = state.planningNotes?.iteration || 0;
    const isFirstStep = (state.toolResults || []).length === 0;
    const query = (await this.getLastUserMessage(state))?.content || '';

    // 이전 검색 결과 확인 - 모두 실패했다면 iteration을 증가시키지 않음 (재시도)
    const toolResults = state.toolResults || [];
    const lastBatchStart = state.planningNotes?.lastSearchCount || 0;
    const lastBatchResults = toolResults.slice(lastBatchStart);
    const allFailed = lastBatchResults.length > 0 && lastBatchResults.every((r) => !!r.error);

    if (allFailed && !isFirstStep) {
      logger.info(
        '[DeepWebResearch] Previous searches all failed. Retrying without incrementing iteration.'
      );
      this.emitChunk(
        `⚠️ **이전 검색 실패. 다른 방법으로 재시도합니다...**\n\n`,
        state.conversationId
      );
    } else if (!isFirstStep) {
      iteration += 1;
    }

    // RAG Context (첫 턴에만 수행)
    let ragContext = '';
    if (isFirstStep) {
      ragContext = await retrieveContextIfEnabled(query, 'DeepWebResearch', state.conversationId);
    }

    logger.info(`[DeepWebResearch] Planning Step (Iter ${iteration + 1}, Actual: ${iteration})`);

    if (isFirstStep) {
      this.emitChunk('\n\n## 🧠 심층 웹 연구 시작\n\n', state.conversationId);
    } else {
      this.emitChunk(
        `\n\n### 🔄 추가 정보 수집 (단계 ${iteration + 1}/${MAX_ITERATIONS})\n\n`,
        state.conversationId
      );
    }

    // 이전 검색 결과 요약
    const previousResults = toolResults
      .map(
        (r, i) =>
          `[검색 결과 ${i + 1}] (${r.toolName}):\n${typeof r.result === 'string' ? r.result.substring(0, 1000) : JSON.stringify(r.result).substring(0, 1000)}...`
      )
      .join('\n\n');

    // 사용자 언어 설정
    const userLanguage = await this.getUserLanguage('DeepWebResearch');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    const systemContent = `당신은 전문적인 'Deep Web Researcher'입니다.
사용자의 질문에 대해 깊이 있고 포괄적인 답변을 제공하기 위해 단계별로 웹 검색을 수행합니다.

현재 단계: ${iteration + 1} / ${MAX_ITERATIONS}

[핵심 원칙: 깊이 있는 다각도 탐색]
- 첫 검색에서 만족하지 말고, 다양한 관점에서 정보를 수집하세요.
- 최소 2-3번의 검색을 통해 정보의 깊이와 폭을 확보하세요.
- 각 iteration마다 새로운 키워드나 관점으로 접근하세요.
- 진짜 충분한 정보가 모였을 때만 검색을 종료하세요.

[중복 검색 방지 - 필수 준수]
- 아래 "이미 실행한 검색 쿼리" 목록을 반드시 확인하세요.
- 이미 실행한 쿼리와 동일하거나 단어만 바꾼 유사한 쿼리는 절대 생성하지 마세요.
- 새로운 관점, 키워드, 또는 하위 주제로 접근하세요.
- 이미 충분한 정보가 수집되었다면 queries를 빈 배열 []로 반환하세요.

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
6. 반드시 아래 JSON 형식으로만 응답하세요. ${languageInstruction}

[JSON 형식 예시]
{
  "thought": "사용자가 ...에 대해 물었으므로, 먼저 최신 동향을 검색하고, 이어서 기술적 세부사항과 실제 사례를 추가로 조사해야 합니다.",
  "queries": [
    {"tool_name": "tavily_search", "parameters": {"query": "Gemini 3.0 latest news 2025", "max_results": 5}},
    {"tool_name": "tavily_search", "parameters": {"query": "Gemini 3.0 technical specifications", "max_results": 5}}
  ]
}`;

    // 쿼리 이력 섹션 생성
    const executedQueries: string[] = state.planningNotes?.executedQueries || [];
    const executedQueriesSection =
      executedQueries.length > 0
        ? `[이미 실행한 검색 쿼리 - 이 쿼리들은 다시 검색하지 마세요]\n${executedQueries.map((q: string, i: number) => `${i + 1}. "${q}"`).join('\n')}\n\n`
        : '';

    const prompt = `원본 질문: ${query}

${ragContext ? `[사전 RAG 정보]\n${ragContext}\n\n` : ''}
${executedQueriesSection}[현재까지 수집된 정보]
${previousResults || '(없음)'}

위 정보를 바탕으로 다음 검색 계획을 JSON으로 작성하세요. 이미 실행한 쿼리와 동일하거나 유사한 쿼리는 절대 반복하지 마세요.`;

    let planOutput = '';
    for await (const chunk of this.streamLLM(
      [
        {
          id: 'system-plan',
          role: 'system',
          content: systemContent,
          created_at: Date.now(),
        },
        {
          id: 'plan-prompt',
          role: 'user',
          content: prompt,
          created_at: Date.now(),
        },
      ],
      { tools: [], tool_choice: 'none' }
    )) {
      planOutput += chunk;
    }

    logger.info('[DeepWebResearch] Plan Output:', planOutput);

    // JSON 파싱
    let plannedQueries: any[] = [];
    let thought = '';

    try {
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

    // 계획 알림
    if (thought) {
      this.emitChunk(`🤔 **생각:** ${thought}\n\n`, state.conversationId);
    }
    if (plannedQueries.length > 0) {
      const queryList = plannedQueries
        .map((q) => {
          const query = q?.parameters?.query;
          return typeof query === 'string' && query.trim() ? `- "${query}"` : null;
        })
        .filter(Boolean)
        .join('\n');

      if (queryList) {
        this.emitChunk(`📝 **검색 계획:**\n${queryList}\n\n`, state.conversationId);
      } else {
        this.emitChunk(`⚠️ **유효한 검색 쿼리를 생성하지 못했습니다.**\n\n`, state.conversationId);
      }
    } else {
      this.emitChunk(`✅ **정보 수집 완료. 답변을 생성합니다.**\n\n`, state.conversationId);
    }

    // 코드 레벨 중복 제거 필터
    if (plannedQueries.length > 0 && executedQueries.length > 0) {
      const originalCount = plannedQueries.length;
      plannedQueries = plannedQueries.filter((q: any) => {
        const newQuery = (q?.parameters?.query || '').trim().toLowerCase();
        if (!newQuery) {
          return false;
        }
        return !executedQueries.some((executed: string) => {
          const existing = executed.trim().toLowerCase();
          // 정확히 동일한 쿼리
          if (existing === newQuery) {
            return true;
          }
          // 하나가 다른 하나를 포함 (부분 중복)
          if (existing.includes(newQuery) || newQuery.includes(existing)) {
            return true;
          }
          // 단어 기반 유사도 (Jaccard 70% 이상이면 중복으로 판단)
          const existingWords = new Set(existing.split(/\s+/));
          const newWordsSet = new Set(newQuery.split(/\s+/));
          const overlapCount = [...newWordsSet].filter((w: string) => existingWords.has(w)).length;
          const unionSize = existingWords.size + newWordsSet.size - overlapCount;
          return unionSize > 0 && overlapCount / unionSize > 0.7;
        });
      });
      if (originalCount !== plannedQueries.length) {
        logger.info(`[DeepWebResearch] Dedup: ${originalCount} → ${plannedQueries.length} queries`);
      }
    }

    // executedQueries 누적
    const prevExecutedQueries: string[] = state.planningNotes?.executedQueries || [];
    const newQueryStrings = plannedQueries
      .map((q: any) => q?.parameters?.query)
      .filter((q: string | undefined): q is string => typeof q === 'string' && q.trim().length > 0);

    return {
      planningNotes: {
        queries: plannedQueries,
        iteration,
        thought,
        lastSearchCount: toolResults.length,
        executedQueries: [...prevExecutedQueries, ...newQueryStrings],
      },
    };
  }

  /**
   * 2단계: 웹 검색 실행 (Search Node)
   */
  private async searchNode(state: AgentState): Promise<Partial<AgentState>> {
    const notes = state.planningNotes;
    const queries = notes?.queries || [];

    if (queries.length === 0) {
      return {};
    }

    logger.info(`[DeepWebResearch] Executing ${queries.length} searches...`);
    this.emitChunk(`🚀 **검색 실행 중...**\n`, state.conversationId);

    let newToolResults: any[] = [];

    // Filter tool parameters to only include allowed fields
    const tempToolCalls = queries.map((q: any, idx: number) => {
      let cleanedParams = q.parameters;

      // Tavily Search: Only allow query and max_results
      if (q.tool_name === 'tavily_search') {
        const params = q.parameters || {};

        // Extract query
        let query = params.query || params.search_query || '';
        if (typeof query !== 'string') {
          query = String(query);
        }
        query = query.trim();

        // Extract max_results
        let maxResults =
          params.max_results || params.maxResults || params.top_n || params.topn || 5;
        if (typeof maxResults === 'string') {
          maxResults = parseInt(maxResults, 10) || 5;
        }
        maxResults = Math.max(1, Math.min(maxResults, 10));

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
      } as any);

      newToolResults = resultState.toolResults || [];

      // 결과 로깅
      for (const res of newToolResults) {
        if (res.error) {
          this.emitChunk(`❌ **실패:** ${res.toolName} - ${res.error}\n`, state.conversationId);
        } else {
          this.emitChunk(`✅ **완료:** ${res.toolName}\n`, state.conversationId);
        }
      }
    } catch (e: any) {
      this.emitChunk(`❌ **검색 실패:** ${e.message}\n`, state.conversationId);
      newToolResults.push({ error: e.message, toolName: 'tavily_search' } as any);

      // Rate Limit 감지
      if (
        e.message.includes('429') ||
        e.message.toLowerCase().includes('limit') ||
        e.message.toLowerCase().includes('quota') ||
        e.message.toLowerCase().includes('unauthorized')
      ) {
        this.emitChunk(
          `⚠️ **검색 제한 감지:** 추가 검색을 중단하고 현재 정보로 답변을 생성합니다.\n`,
          state.conversationId
        );
        return {
          // AgentStateAnnotation reducer가 append 하므로 "신규 결과"만 반환
          toolResults: newToolResults,
          planningNotes: { ...state.planningNotes, forceSynthesize: true },
        };
      }
    }

    return {
      // AgentStateAnnotation reducer가 append 하므로 "신규 결과"만 반환
      toolResults: newToolResults,
    };
  }

  /**
   * 조건부 엣지: 계획 확인
   */
  private checkPlan(state: AgentState): string {
    const notes = state.planningNotes;

    // 강제 종료 플래그
    if (notes?.forceSynthesize) {
      logger.info('[DeepWebResearch] Force synthesize flag detected');
      return 'synthesize';
    }

    // 쿼리가 없으면 종료
    if (!notes || !notes.queries || notes.queries.length === 0) {
      logger.info('[DeepWebResearch] No more queries planned. Moving to synthesize.');
      return 'synthesize';
    }

    // 최대 반복 횟수 도달
    if (notes.iteration >= MAX_ITERATIONS) {
      logger.info(
        `[DeepWebResearch] Max iterations reached (${notes.iteration}/${MAX_ITERATIONS}). Moving to synthesize.`
      );
      this.emitChunk(
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
  private async synthesizeNode(state: AgentState): Promise<Partial<AgentState>> {
    logger.info('[DeepWebResearch] Step 3: Synthesizing answer...');
    this.emitChunk('\n\n## ✨ 최종 답변 생성\n\n', state.conversationId);
    this.emitChunk(
      '**단계 진행 중:** 수집된 방대한 정보를 바탕으로 최종 답변을 작성합니다...\n\n',
      state.conversationId
    );

    // 사용자 언어 설정
    const userLanguage = await this.getUserLanguage('DeepWebResearch');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    const allSearchOutputs =
      state.toolResults
        ?.map((r) => {
          const content = typeof r.result === 'string' ? r.result : JSON.stringify(r.result);
          return `[출처: ${r.toolName}]\n${content.substring(0, 2000)}...`;
        })
        .join('\n\n---\n\n') || '검색 결과 없음';

    const systemContent = `당신은 웹 검색 결과를 바탕으로 사용자의 질문에 대해 포괄적이고 정확한 답변을 생성하는 AI입니다.
수집된 정보를 정확하게 요약하고, 질문에 직접적으로 답변하세요.

만약 검색 결과가 없거나 불충분하다면(검색 실패, 제한 등), 당신의 내부 지식을 최대한 활용하여 답변하고 검색에 어려움이 있었음을 사용자에게 알리세요. ${languageInstruction}`;

    const query = (await this.getLastUserMessage(state))?.content || '';
    const prompt = `원본 질문: ${query}

[수집된 연구 자료]
${allSearchOutputs}

위 자료를 바탕으로 최종 보고서를 작성하세요.`;

    let finalAnswer = '';
    for await (const chunk of this.streamLLM(
      [
        {
          id: 'system-synth',
          role: 'system',
          content: systemContent,
          created_at: Date.now(),
        },
        {
          id: 'synth-prompt',
          role: 'user',
          content: prompt,
          created_at: Date.now(),
        },
      ],
      { tools: [], tool_choice: 'none' }
    )) {
      finalAnswer += chunk;
      this.emitChunk(chunk, state.conversationId);
    }

    // 후속 질문 생성 (Perplexity 스타일)
    let followUpQuestions = '';
    if (finalAnswer) {
      this.emitChunk('\n\n---\n### 💡 추천 후속 질문\n', state.conversationId);

      // 사용자 언어에 맞는 지시문
      const followUpLanguage =
        userLanguage === 'ko' ? '한국어로' : userLanguage === 'en' ? 'in English' : '';

      const followUpPrompt = `위 답변을 바탕으로 사용자가 이어서 궁금해할 만한 "추천 후속 질문" 3가지를 ${followUpLanguage} 제안해주세요.\n질문 내용만 간결하게 번호를 매겨 작성하세요. (설명 불필요)`;

      try {
        for await (const chunk of this.streamLLM(
          [
            {
              id: 'system-synth',
              role: 'system',
              content: systemContent,
              created_at: Date.now(),
            },
            {
              id: 'synth-prompt',
              role: 'user',
              content: prompt,
              created_at: Date.now(),
            },
            {
              id: 'temp-assistant',
              role: 'assistant',
              content: finalAnswer,
              created_at: Date.now(),
            },
            {
              id: 'follow-up-prompt',
              role: 'user',
              content: followUpPrompt,
              created_at: Date.now(),
            },
          ],
          { tools: [], tool_choice: 'none' }
        )) {
          followUpQuestions += chunk;
          this.emitChunk(chunk, state.conversationId);
        }
      } catch (e) {
        console.error('[DeepWebResearch] Failed to generate follow-up questions', e);
      }
    }

    const finalContent = followUpQuestions
      ? `${finalAnswer}\n\n---\n### 💡 추천 후속 질문\n${followUpQuestions}`
      : finalAnswer;

    logger.info('[DeepWebResearch] Final answer synthesized');

    return {
      messages: [
        {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: finalContent,
          created_at: Date.now(),
        },
      ],
    };
  }
}

/**
 * 팩토리 함수 (하위 호환성 유지용)
 * @deprecated - DeepWebResearchGraph 클래스를 직접 사용하세요
 */
export function createDeepWebResearchGraph() {
  const graph = new DeepWebResearchGraph();
  return graph.compile();
}
