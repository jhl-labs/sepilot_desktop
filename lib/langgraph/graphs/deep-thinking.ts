import { StateGraph, END } from '@langchain/langgraph';
import { Annotation } from '@langchain/langgraph';
import { Message } from '@/types';
import { LLMService } from '@/lib/llm/service';
import { createBaseSystemMessage } from '../utils/system-message';
import { emitStreamingChunk, getCurrentGraphConfig } from '@/lib/llm/streaming-callback';
import { generateWithToolsNode } from '../nodes/generate';
import { toolsNode } from '../nodes/tools';

import { logger } from '@/lib/utils/logger';
import type { SupportedLanguage } from '@/lib/i18n';
/**
 * Deep Thinking Graph
 *
 * Sequential Thinking과 Tree of Thought를 결합한 가장 깊은 사고 방식
 *
 * 프로세스:
 * 1. 초기 분석 (Initial Analysis)
 * 2. 다중 관점 탐색 (Multi-Perspective Exploration)
 * 3. 각 관점에 대한 심화 분석 (Deep Analysis per Perspective)
 * 4. 통합 및 검증 (Integration & Verification)
 * 5. 최종 답변 생성 (Final Synthesis)
 */

/**
 * 사용자 언어 설정 가져오기
 */
async function getUserLanguage(): Promise<SupportedLanguage> {
  try {
    // Main Process에서만 동작
    if (typeof window !== 'undefined') {
      // Renderer 프로세스에서는 localStorage에서 가져오기
      try {
        const saved = localStorage.getItem('sepilot_language');
        if (saved && ['ko', 'en', 'zh'].includes(saved)) {
          return saved as SupportedLanguage;
        }
      } catch {
        // localStorage 접근 실패 시 기본값
      }
      return 'ko';
    }

    const { databaseService } = await import('../../../electron/services/database');
    const configStr = databaseService.getSetting('app_config');
    if (!configStr) {
      return 'ko';
    }

    const appConfig = JSON.parse(configStr);
    if (appConfig?.general?.language && ['ko', 'en', 'zh'].includes(appConfig.general.language)) {
      return appConfig.general.language as SupportedLanguage;
    }
  } catch (error) {
    logger.error('[Deep] Failed to get user language:', error);
  }
  return 'ko';
}

/**
 * 언어에 따른 답변 언어 지시 메시지 생성
 */
function getLanguageInstruction(language: SupportedLanguage): string {
  switch (language) {
    case 'ko':
      return '반드시 한국어로 답변하세요.';
    case 'en':
      return 'Please respond in English.';
    case 'zh':
      return '请用中文回答。';
    default:
      return '반드시 한국어로 답변하세요.';
  }
}

/**
 * RAG 검색 헬퍼 함수
 */
async function retrieveContextIfEnabled(query: string): Promise<string> {
  const config = getCurrentGraphConfig();
  if (!config?.enableRAG) {
    return '';
  }

  try {
    // Main Process 전용 로직
    if (typeof window !== 'undefined') {
      return '';
    }

    logger.info('[Deep] RAG enabled, retrieving documents...');
    const { vectorDBService } = await import('../../../electron/services/vectordb');
    const { databaseService } = await import('../../../electron/services/database');
    const { initializeEmbedding, getEmbeddingProvider } =
      await import('@/lib/vectordb/embeddings/client');

    const configStr = databaseService.getSetting('app_config');
    if (!configStr) {
      return '';
    }
    const appConfig = JSON.parse(configStr);
    if (!appConfig.embedding) {
      return '';
    }

    initializeEmbedding(appConfig.embedding);
    const embedder = getEmbeddingProvider();
    const queryEmbedding = await embedder.embed(query);
    const results = await vectorDBService.searchByVector(queryEmbedding, 5);

    if (results.length > 0) {
      logger.info(`[Deep] Found ${results.length} documents`);
      return results.map((doc, i) => `[참고 문서 ${i + 1}]\n${doc.content}`).join('\n\n');
    }
  } catch (error) {
    console.error('[Deep] RAG retrieval failed:', error);
  }
  return '';
}

/**
 * 0단계: 정보 수집 (Research)
 */
async function researchNode(state: DeepThinkingState) {
  logger.info('[Deep] Step 0: Researching...');
  emitStreamingChunk('\n\n## 🔎 0단계: 정보 수집 (Research)\n\n', state.conversationId);

  // RAG 검색
  const query = state.messages[state.messages.length - 1].content;
  const ragContext = await retrieveContextIfEnabled(query);

  let gatheredInfo = ragContext ? `[RAG 검색 결과]\n${ragContext}\n\n` : '';

  // 도구 사용 루프 (최대 5회)
  let currentMessages = [...state.messages];

  // 시스템 메시지: 정보 수집가 페르소나
  const researchSystemMsg: Message = {
    id: 'system-research',
    role: 'system',
    content: `당신은 사용자의 질문에 대해 심층 분석을 하기 전, 필요한 배경 지식과 최신 정보를 수집하는 연구원입니다.
주어진 도구(검색 등)를 활용하여 필요한 정보를 수집하세요.
이미 충분한 정보가 있거나 도구가 없다면 즉시 종료하세요.
최대 3회의 기회가 있습니다.`,
    created_at: Date.now(),
  };

  currentMessages = [researchSystemMsg, ...currentMessages];

  for (let i = 0; i < 3; i++) {
    // Generate (도구 사용 결정)
    const genResult = await generateWithToolsNode({
      ...state,
      messages: currentMessages,
      context: '',
      toolCalls: [],
      toolResults: [],
      generatedImages: [],
      planningNotes: {},
    });
    const responseMsg = genResult.messages?.[0];

    if (!responseMsg) {
      break;
    }

    currentMessages.push(responseMsg);

    if (!responseMsg.tool_calls || responseMsg.tool_calls.length === 0) {
      break;
    }

    // Tools Execute
    const toolNames = responseMsg.tool_calls.map((tc) => tc.name).join(', ');
    emitStreamingChunk(`\n🛠️ **정보 수집 중:** ${toolNames}...\n`, state.conversationId);

    const toolResult = await toolsNode({
      ...state,
      messages: currentMessages,
      planningNotes: {},
      context: '',
      toolCalls: [],
      generatedImages: [],
      toolResults: [],
    });

    // 결과 메시지 생성
    const toolMessages = (toolResult.toolResults || []).map((res) => ({
      role: 'tool' as const,
      tool_call_id: res.toolCallId,
      name: res.toolName,
      content: res.result || res.error || '',
      id: `tool-${res.toolCallId}`,
      created_at: Date.now(),
    }));

    currentMessages.push(...toolMessages);

    // 수집된 정보 누적
    gatheredInfo += `[도구 실행 결과: ${toolNames}]\n${toolMessages.map((m) => m.content).join('\n')}\n\n`;

    emitStreamingChunk(`✅ **수집 완료**\n`, state.conversationId);
  }

  logger.info('[Deep] Research complete');

  return {
    researchContext: gatheredInfo,
  };
}

export const DeepThinkingStateAnnotation = Annotation.Root({
  messages: Annotation<Message[]>({
    reducer: (existing: Message[], updates: Message[]) => [...existing, ...updates],
    default: () => [],
  }),
  initialAnalysis: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  researchContext: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  perspectives: Annotation<
    Array<{ id: string; name: string; content: string; deepAnalysis: string }>
  >({
    reducer: (_existing: any[], updates: any[]) => updates,
    default: () => [],
  }),
  integration: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  verification: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  // conversationId: 동시 대화 시 스트리밍 격리를 위해 필수
  conversationId: Annotation<string>({
    reducer: (_existing: string, update: string) => update || _existing,
    default: () => '',
  }),
});

export type DeepThinkingState = typeof DeepThinkingStateAnnotation.State;

/**
 * 1단계: 초기 분석
 */
async function initialAnalysisNode(state: DeepThinkingState) {
  logger.info('[Deep] Step 1/5: Initial comprehensive analysis...');

  // 사용자 언어 설정 가져오기
  const userLanguage = await getUserLanguage();
  const languageInstruction = getLanguageInstruction(userLanguage);

  // 단계 시작 알림
  emitStreamingChunk('\n\n## 🧠 1단계: 초기 심층 분석 (1/5)\n\n', state.conversationId);
  emitStreamingChunk(
    '**단계 진행 중:** 문제에 대한 포괄적인 초기 분석을 수행 중입니다...\n\n',
    state.conversationId
  );

  // 수집된 정보(Research/RAG) 가져오기
  const query = state.messages[state.messages.length - 1].content;
  const researchContext = state.researchContext;

  if (researchContext) {
    emitStreamingChunk(`\n📚 **사전 수집된 정보를 참조합니다.**\n\n`, state.conversationId);
  }

  const systemMessage: Message = {
    id: 'system',
    role: 'system',
    content: `당신은 포괄적인 초기 분석을 수행하는 고도로 분석적인 AI입니다.

당신의 과제:
1. 핵심 질문을 깊이 이해하기
2. 모든 관련 측면과 차원 파악하기
3. 이 질문이 복잡하거나 미묘한 이유 고려하기
4. 탐색할 가치가 있는 관점 결정하기

철저하고 상세하게 분석하세요. ${languageInstruction}`,
    created_at: Date.now(),
  };

  const analysisPrompt: Message = {
    id: 'analysis-prompt',
    role: 'user',
    content: `다음 질문에 대해 포괄적인 초기 분석을 수행하세요:\n\n${query}\n\n${researchContext ? `수집된 정보:\n${researchContext}\n\n` : ''}위 정보를 활용하여 분석하세요.`,
    created_at: Date.now(),
  };

  let analysis = '';
  for await (const chunk of LLMService.streamChat(
    [systemMessage, ...state.messages, analysisPrompt],
    { tools: [], tool_choice: 'none' }
  )) {
    analysis += chunk;
    // 실시간 스트리밍 (conversationId로 격리)
    emitStreamingChunk(chunk, state.conversationId);
  }

  logger.info('[Deep] Initial analysis complete');

  return {
    initialAnalysis: analysis,
  };
}

/**
 * 2단계: 다중 관점 탐색
 */
async function explorePerspectivesNode(state: DeepThinkingState) {
  logger.info('[Deep] Step 2/5: Exploring multiple perspectives...');

  // 단계 시작 알림
  emitStreamingChunk('\n\n---\n\n## 🔭 2단계: 다중 관점 탐색 (2/5)\n\n', state.conversationId);
  emitStreamingChunk(
    '**단계 진행 중:** 다양한 관점에서 문제 해결 방법을 탐색 중입니다...\n\n',
    state.conversationId
  );

  const perspectiveTypes = [
    { name: '분석적 관점', focus: '논리적 추론, 사실, 데이터, 체계적 분석' },
    { name: '실용적 관점', focus: '실제 적용, 실행 가능한 조언, 실용적 해결책' },
    { name: '비판적 관점', focus: '잠재적 문제, 한계, 반론, 엣지 케이스' },
    { name: '창의적 관점', focus: '혁신적 아이디어, 대안적 접근, 비전통적 사고' },
  ];

  const perspectives: Array<{ id: string; name: string; content: string; deepAnalysis: string }> =
    [];

  // 사용자 언어 설정 가져오기
  const userLanguage = await getUserLanguage();
  const languageInstruction = getLanguageInstruction(userLanguage);

  for (const type of perspectiveTypes) {
    // 각 관점 시작 알림
    emitStreamingChunk(`\n### 👁️ ${type.name}\n\n`, state.conversationId);

    const systemMessage: Message = {
      id: `system-${type.name}`,
      role: 'system',
      content: `당신은 질문에 대해 ${type.name} 관점을 탐색하고 있습니다.

집중 영역: ${type.focus}

초기 분석을 바탕으로 이 특정 관점에서 통찰을 제공하세요. ${languageInstruction}`,
      created_at: Date.now(),
    };

    const perspectivePrompt: Message = {
      id: `perspective-${type.name}`,
      role: 'user',
      content: `초기 분석:\n${state.initialAnalysis}\n\n원본 질문: ${state.messages[state.messages.length - 1].content}\n\n${type.name}에서 이 질문을 탐색하세요:`,
      created_at: Date.now(),
    };

    let content = '';
    for await (const chunk of LLMService.streamChat([systemMessage, perspectivePrompt], {
      tools: [],
      tool_choice: 'none',
    })) {
      content += chunk;
      // 실시간 스트리밍 (conversationId로 격리)
      emitStreamingChunk(chunk, state.conversationId);
    }

    logger.info(`[Deep] ${type.name} perspective explored`);

    perspectives.push({
      id: type.name.toLowerCase(),
      name: type.name,
      content,
      deepAnalysis: '', // Will be filled in next step
    });
  }

  return {
    perspectives,
  };
}

/**
 * 3단계: 각 관점에 대한 심화 분석
 */
async function deepAnalysisNode(state: DeepThinkingState) {
  logger.info('[Deep] Step 3/5: Performing deep analysis on each perspective...');

  // 단계 시작 알림
  emitStreamingChunk('\n\n---\n\n## 🔬 3단계: 관점별 심화 분석 (3/5)\n\n', state.conversationId);
  emitStreamingChunk(
    '**단계 진행 중:** 각 관점에 대한 심화 분석을 수행 중입니다...\n\n',
    state.conversationId
  );

  const deepAnalyzedPerspectives: Array<{
    id: string;
    name: string;
    content: string;
    deepAnalysis: string;
  }> = [];

  // 사용자 언어 설정 가져오기
  const userLanguage = await getUserLanguage();
  const languageInstruction = getLanguageInstruction(userLanguage);

  for (const perspective of state.perspectives) {
    // 각 심화 분석 시작 알림
    emitStreamingChunk(`\n### 🔍 ${perspective.name} 심화 분석\n\n`, state.conversationId);

    const systemMessage: Message = {
      id: `system-deep-${perspective.id}`,
      role: 'system',
      content: `당신은 ${perspective.name}에 대한 심화 분석을 수행하고 있습니다.

당신의 과제:
1. 핵심 포인트를 더 깊이 검토하기
2. 함의와 결과 고려하기
3. 아이디어 연결 및 패턴 파악하기
4. 논증을 추론으로 강화하기

상세하고 심층적인 분석을 제공하세요. ${languageInstruction}`,
      created_at: Date.now(),
    };

    const deepAnalysisPrompt: Message = {
      id: `deep-analysis-${perspective.id}`,
      role: 'user',
      content: `${perspective.name}:\n${perspective.content}\n\n원본 질문: ${state.messages[state.messages.length - 1].content}\n\n이 관점에 대한 심화 분석을 수행하세요:`,
      created_at: Date.now(),
    };

    let deepAnalysis = '';
    for await (const chunk of LLMService.streamChat([systemMessage, deepAnalysisPrompt], {
      tools: [],
      tool_choice: 'none',
    })) {
      deepAnalysis += chunk;
      // 실시간 스트리밍 (conversationId로 격리)
      emitStreamingChunk(chunk, state.conversationId);
    }

    logger.info(`[Deep] ${perspective.name} perspective deeply analyzed`);

    deepAnalyzedPerspectives.push({
      ...perspective,
      deepAnalysis,
    });
  }

  return {
    perspectives: deepAnalyzedPerspectives,
  };
}

/**
 * 4단계: 통합 및 검증
 */
async function integrateAndVerifyNode(state: DeepThinkingState) {
  logger.info('[Deep] Step 4/5: Integrating perspectives and verifying...');

  // 통합 단계 시작 알림
  emitStreamingChunk('\n\n---\n\n## 🔗 4단계: 통합 및 검증 (4/5)\n\n', state.conversationId);
  emitStreamingChunk(
    '**단계 진행 중:** 관점들을 통합하고 결과의 유효성을 검증 중입니다...\n\n',
    state.conversationId
  );
  emitStreamingChunk('### 📦 관점 통합\n\n', state.conversationId);

  // 사용자 언어 설정 가져오기
  const userLanguage = await getUserLanguage();
  const languageInstruction = getLanguageInstruction(userLanguage);

  const systemMessage1: Message = {
    id: 'system-integrate',
    role: 'system',
    content: `당신은 여러 관점의 통찰을 일관된 이해로 통합하고 있습니다.

당신의 과제:
1. 관점들 간의 공통 주제 파악하기
2. 모순 해결하기
3. 상호보완적 통찰 종합하기
4. 포괄적 이해 구축하기

철저하고 섬세하게 분석하세요. ${languageInstruction}`,
    created_at: Date.now(),
  };

  const allPerspectives = state.perspectives
    .map((p) => `### ${p.name}:\n${p.content}\n\n#### Deep Analysis:\n${p.deepAnalysis}`)
    .join('\n\n---\n\n');

  const integratePrompt: Message = {
    id: 'integrate-prompt',
    role: 'user',
    content: `초기 분석:\n${state.initialAnalysis}\n\n모든 관점:\n${allPerspectives}\n\n원본 질문: ${state.messages[state.messages.length - 1].content}\n\n모든 통찰을 일관된 이해로 통합하세요:`,
    created_at: Date.now(),
  };

  let integration = '';
  for await (const chunk of LLMService.streamChat([systemMessage1, integratePrompt], {
    tools: [],
    tool_choice: 'none',
  })) {
    integration += chunk;
    // 실시간 스트리밍 (conversationId로 격리)
    emitStreamingChunk(chunk, state.conversationId);
  }

  logger.info('[Deep] Integration complete, now verifying...');

  // 검증 단계 알림
  emitStreamingChunk('\n\n### ✅ 검증 단계\n\n', state.conversationId);

  const systemMessage2: Message = {
    id: 'system-verify',
    role: 'system',
    content: `당신은 통합된 이해의 완전성과 정확성을 검증하고 있습니다.

당신의 과제:
1. 질문의 모든 측면이 다뤄졌는지 확인하기
2. 빈틈이나 약점 파악하기
3. 논리적 일관성 확보하기
4. 주요 결론 검증하기

검증 평가를 제공하세요. ${languageInstruction}`,
    created_at: Date.now(),
  };

  const verifyPrompt: Message = {
    id: 'verify-prompt',
    role: 'user',
    content: `통합된 이해:\n${integration}\n\n원본 질문: ${state.messages[state.messages.length - 1].content}\n\n이 이해를 검증하세요:`,
    created_at: Date.now(),
  };

  let verification = '';
  for await (const chunk of LLMService.streamChat([systemMessage2, verifyPrompt], {
    tools: [],
    tool_choice: 'none',
  })) {
    verification += chunk;
    // 실시간 스트리밍 (conversationId로 격리)
    emitStreamingChunk(chunk, state.conversationId);
  }

  logger.info('[Deep] Verification complete');

  return {
    integration,
    verification,
  };
}

/**
 * 5단계: 최종 답변 생성
 */
async function finalSynthesisNode(state: DeepThinkingState) {
  logger.info('[Deep] Step 5/5: Generating final comprehensive answer...');

  // 단계 시작 알림
  emitStreamingChunk('\n\n---\n\n## ✨ 5단계: 최종 답변 (5/5)\n\n', state.conversationId);
  emitStreamingChunk(
    '**단계 진행 중:** 모든 사고 과정을 종합하여 최종 답변을 생성 중입니다...\n\n',
    state.conversationId
  );

  // 사용자 언어 설정 가져오기
  const userLanguage = await getUserLanguage();
  const languageInstruction = getLanguageInstruction(userLanguage);

  const systemMessage: Message = {
    id: 'system-final',
    role: 'system',
    content: `${createBaseSystemMessage()}\n\n당신은 광범위한 사고 과정을 거쳤습니다.
이제 이 모든 심층 사고의 정점을 나타내는 최종적이고 포괄적이며 잘 구조화된 답변을 제공하세요.

명확하고 통찰력 있으며 질문을 철저히 다루는 답변을 작성하세요. ${languageInstruction}`,
    created_at: Date.now(),
  };

  const allContext = `
# 초기 분석
${state.initialAnalysis}

# 탐색된 관점들
${state.perspectives.map((p) => `## ${p.name}\n${p.content}\n\n### 심화 분석\n${p.deepAnalysis}`).join('\n\n')}

# 통합
${state.integration}

# 검증
${state.verification}
`;

  const finalPrompt: Message = {
    id: 'final-prompt',
    role: 'user',
    content: `광범위한 분석 후, 지금까지 수행된 모든 사고 내용입니다:\n\n${allContext}\n\n원본 질문: ${state.messages[state.messages.length - 1].content}\n\n최종적이고 포괄적인 답변을 제공하세요:`,
    created_at: Date.now(),
  };

  let finalAnswer = '';
  const messageId = `msg-${Date.now()}`;

  for await (const chunk of LLMService.streamChat([systemMessage, finalPrompt], {
    tools: [],
    tool_choice: 'none',
  })) {
    finalAnswer += chunk;
    // Send each chunk to renderer via callback for real-time streaming (conversationId로 격리)
    emitStreamingChunk(chunk, state.conversationId);
  }

  const assistantMessage: Message = {
    id: messageId,
    role: 'assistant',
    content:
      `## 🧠 1단계: 초기 심층 분석\n\n${state.initialAnalysis}\n\n` +
      `## 🔭 2단계 & 3단계: 다중 관점 탐색 및 분석\n\n${state.perspectives
        .map((p) => `### 👁️ ${p.name}\n${p.content}\n\n#### 🔍 심화 분석\n${p.deepAnalysis}`)
        .join('\n\n')}\n\n` +
      `## 🔗 4단계: 통합 및 검증\n\n### 📦 관점 통합\n${state.integration}\n\n### ✅ 검증\n${state.verification}\n\n` +
      `---\n\n## ✨ 최종 답변\n\n${finalAnswer}`,
    created_at: Date.now(),
  };

  logger.info('[Deep] Final comprehensive answer generated');

  return {
    messages: [assistantMessage],
  };
}

/**
 * Deep Thinking Graph 생성
 */
export function createDeepThinkingGraph() {
  const workflow = new StateGraph(DeepThinkingStateAnnotation)
    // 노드 추가
    .addNode('research', researchNode)
    .addNode('initial_analysis', initialAnalysisNode)
    .addNode('explore_perspectives', explorePerspectivesNode)
    .addNode('deep_analysis', deepAnalysisNode)
    .addNode('integrate_verify', integrateAndVerifyNode)
    .addNode('final_synthesis', finalSynthesisNode)
    // 순차적 엣지
    .addEdge('__start__', 'research')
    .addEdge('research', 'initial_analysis')
    .addEdge('initial_analysis', 'explore_perspectives')
    .addEdge('explore_perspectives', 'deep_analysis')
    .addEdge('deep_analysis', 'integrate_verify')
    .addEdge('integrate_verify', 'final_synthesis')
    .addEdge('final_synthesis', END);

  return workflow.compile();
}
