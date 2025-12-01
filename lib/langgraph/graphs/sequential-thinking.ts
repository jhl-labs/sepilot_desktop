import { StateGraph, END } from '@langchain/langgraph';
import { ChatStateAnnotation, ChatState } from '../state';
import { LLMService } from '@/lib/llm/service';
import { Message } from '@/types';
import { createBaseSystemMessage } from '../utils/system-message';
import { emitStreamingChunk, getCurrentGraphConfig } from '@/lib/llm/streaming-callback';
import { generateWithToolsNode } from '../nodes/generate';
import { toolsNode } from '../nodes/tools';

/**
 * Sequential Thinking Graph
 *
 * 단계별로 사고하여 문제를 해결하는 그래프
 * 1. 문제 분석 (Analyze)
 * 2. 단계별 계획 수립 (Plan)
 * 3. 각 단계 실행 (Execute)
 * 4. 최종 답변 생성 (Synthesize)
 */

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

    console.log('[Sequential] RAG enabled, retrieving documents...');
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
      console.log(`[Sequential] Found ${results.length} documents`);
      return results.map((doc, i) => `[참고 문서 ${i + 1}]\n${doc.content}`).join('\n\n');
    }
  } catch (error) {
    console.error('[Sequential] RAG retrieval failed:', error);
  }
  return '';
}

/**
 * 0단계: 정보 수집 (Research)
 */
async function researchNode(state: ChatState) {
  console.log('[Sequential] Step 0: Researching...');
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
      toolCalls: [],
      toolResults: [],
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
      toolCalls: [],
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

  console.log('[Sequential] Research complete');

  return {
    context: gatheredInfo,
  };
}

/**
 * 1단계: 문제 분석
 */
async function analyzeNode(state: ChatState) {
  console.log('[Sequential] Step 1: Analyzing problem...');

  // 단계 시작 알림 + 로딩 표시
  emitStreamingChunk('\n\n## 🔍 1단계: 문제 분석\n\n', state.conversationId);
  emitStreamingChunk('**단계 진행 중:** 문제 분석을 시작합니다...\n\n', state.conversationId);

  // 수집된 정보(Research/RAG) 가져오기
  const query = state.messages[state.messages.length - 1].content;
  const researchContext = state.context;

  if (researchContext) {
    emitStreamingChunk(`\n📚 **사전 수집된 정보를 참조합니다.**\n\n`, state.conversationId);
  }

  const systemMessage: Message = {
    id: 'system',
    role: 'system',
    content: `당신은 복잡한 문제를 단계별로 분해하는 사려 깊은 AI 어시스턴트입니다.

당신의 과제는 사용자의 질문을 분석하고 다음을 파악하는 것입니다:
1. 주요 질문 또는 문제
2. 관련된 핵심 개념들
3. 답변에 필요한 정보

명확하고 구조화된 형식으로 분석을 제공하세요. 반드시 한국어로 답변하세요.`,
    created_at: Date.now(),
  };

  const analysisPrompt: Message = {
    id: 'analysis-prompt',
    role: 'user',
    content: `다음 질문을 분석하고 분해하세요:\n\n${query}\n\n${researchContext ? `수집된 정보:\n${researchContext}\n\n` : ''}위 정보를 활용하여 분석하세요.`,
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

  console.log('[Sequential] Analysis complete:', `${analysis.substring(0, 100)}...`);

  return {
    context: `# Analysis\n\n${analysis}`,
  };
}

/**
 * 2단계: 단계별 계획 수립
 */
async function planNode(state: ChatState) {
  console.log('[Sequential] Step 2: Planning solution steps...');

  // 단계 시작 알림 + 로딩 표시
  emitStreamingChunk('\n\n---\n\n## 📋 2단계: 계획 수립\n\n', state.conversationId);
  emitStreamingChunk('**단계 진행 중:** 실행 계획을 수립 중입니다...\n\n', state.conversationId);

  const systemMessage: Message = {
    id: 'system',
    role: 'system',
    content: `당신은 전략적 계획 AI입니다. 분석을 바탕으로 질문에 답하기 위한 단계별 계획을 수립하세요.

포괄적인 답변으로 이어질 단계 목록(3-5단계)을 번호를 붙여 작성하세요.
각 단계는 명확하고 실행 가능해야 합니다. 반드시 한국어로 답변하세요.`,
    created_at: Date.now(),
  };

  const planPrompt: Message = {
    id: 'plan-prompt',
    role: 'user',
    content: `다음 분석을 바탕으로 단계별 계획을 수립하세요:\n\n${state.context}\n\n원본 질문: ${state.messages[state.messages.length - 1].content}`,
    created_at: Date.now(),
  };

  let plan = '';
  for await (const chunk of LLMService.streamChat([systemMessage, planPrompt], {
    tools: [],
    tool_choice: 'none',
  })) {
    plan += chunk;
    // 실시간 스트리밍 (conversationId로 격리)
    emitStreamingChunk(chunk, state.conversationId);
  }

  console.log('[Sequential] Plan complete:', `${plan.substring(0, 100)}...`);

  return {
    context: `${state.context}\n\n# Plan\n\n${plan}`,
  };
}

/**
 * 3단계: 단계별 실행
 */
async function executeNode(state: ChatState) {
  console.log('[Sequential] Step 3: Executing plan...');

  // 단계 시작 알림 + 로딩 표시
  emitStreamingChunk('\n\n---\n\n## ⚙️ 3단계: 계획 실행\n\n', state.conversationId);
  emitStreamingChunk('**단계 진행 중:** 수립된 계획을 실행 중입니다...\n\n', state.conversationId);

  const systemMessage: Message = {
    id: 'system',
    role: 'system',
    content: `당신은 계획의 각 단계를 신중하게 실행하는 세부 지향적인 AI입니다.

각 단계를 거치면서 상세한 추론과 정보를 제공하세요.
철저하게 여러 각도를 고려하세요. 반드시 한국어로 답변하세요.`,
    created_at: Date.now(),
  };

  const executePrompt: Message = {
    id: 'execute-prompt',
    role: 'user',
    content: `이 계획의 각 단계를 상세히 실행하세요:\n\n${state.context}\n\n원본 질문: ${state.messages[state.messages.length - 1].content}`,
    created_at: Date.now(),
  };

  let execution = '';
  for await (const chunk of LLMService.streamChat([systemMessage, executePrompt], {
    tools: [],
    tool_choice: 'none',
  })) {
    execution += chunk;
    // 실시간 스트리밍 (conversationId로 격리)
    emitStreamingChunk(chunk, state.conversationId);
  }

  console.log('[Sequential] Execution complete:', `${execution.substring(0, 100)}...`);

  return {
    context: `${state.context}\n\n# Execution\n\n${execution}`,
  };
}

/**
 * 4단계: 최종 답변 생성
 */
async function synthesizeNode(state: ChatState) {
  console.log('[Sequential] Step 4: Synthesizing final answer...');

  // 단계 시작 알림 + 로딩 표시
  emitStreamingChunk('\n\n---\n\n## ✨ 4단계: 최종 답변\n\n', state.conversationId);
  emitStreamingChunk('**단계 진행 중:** 최종 답변을 생성 중입니다...\n\n', state.conversationId);

  const systemMessage: Message = {
    id: 'system',
    role: 'system',
    content: createBaseSystemMessage(),
    created_at: Date.now(),
  };

  const synthesizePrompt: Message = {
    id: 'synthesize-prompt',
    role: 'user',
    content: `위의 모든 분석, 계획, 실행을 바탕으로 원본 질문에 대한 포괄적인 최종 답변을 제공하세요.

${state.context}

원본 질문: ${state.messages[state.messages.length - 1].content}

위 사고 과정의 모든 통찰을 포함하는 명확하고 잘 구조화된 답변을 제공하세요. 반드시 한국어로 답변하세요.`,
    created_at: Date.now(),
  };

  let finalAnswer = '';
  const messageId = `msg-${Date.now()}`;

  for await (const chunk of LLMService.streamChat([systemMessage, synthesizePrompt], {
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
    content: finalAnswer,
    created_at: Date.now(),
  };

  console.log('[Sequential] Final answer generated:', `${finalAnswer.substring(0, 100)}...`);

  return {
    messages: [assistantMessage],
  };
}

/**
 * Sequential Thinking Graph 생성
 */
export function createSequentialThinkingGraph() {
  const workflow = new StateGraph(ChatStateAnnotation)
    // 노드 추가
    .addNode('research', researchNode)
    .addNode('analyze', analyzeNode)
    .addNode('plan', planNode)
    .addNode('execute', executeNode)
    .addNode('synthesize', synthesizeNode)
    // 순차적 엣지
    .addEdge('__start__', 'research')
    .addEdge('research', 'analyze')
    .addEdge('analyze', 'plan')
    .addEdge('plan', 'execute')
    .addEdge('execute', 'synthesize')
    .addEdge('synthesize', END);

  return workflow.compile();
}
