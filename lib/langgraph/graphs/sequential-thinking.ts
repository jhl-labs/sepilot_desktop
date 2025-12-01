import { StateGraph, END } from '@langchain/langgraph';
import { ChatStateAnnotation, ChatState } from '../state';
import { LLMService } from '@/lib/llm/service';
import { Message } from '@/types';
import { createBaseSystemMessage } from '../utils/system-message';
import { emitStreamingChunk, getCurrentGraphConfig } from '@/lib/llm/streaming-callback';

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
 * 1단계: 문제 분석
 */
async function analyzeNode(state: ChatState) {
  console.log('[Sequential] Step 1: Analyzing problem...');

  // 단계 시작 알림 + 로딩 표시
  emitStreamingChunk('\n\n## 🔍 1단계: 문제 분석\n\n', state.conversationId);
  emitStreamingChunk('*분석 중...*\n\n', state.conversationId);

  // RAG 컨텍스트 가져오기
  const query = state.messages[state.messages.length - 1].content;
  const ragContext = await retrieveContextIfEnabled(query);

  if (ragContext) {
    emitStreamingChunk(
      `\n📚 **관련 문서 ${ragContext.split('[참고 문서').length - 1}개를 참조합니다.**\n\n`,
      state.conversationId
    );
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
    content: `다음 질문을 분석하고 분해하세요:\n\n${query}\n\n${ragContext ? `참고 문서:\n${ragContext}\n\n` : ''}위 참고 문서를 활용하여 분석하세요.`,
    created_at: Date.now(),
  };

  let analysis = '';
  for await (const chunk of LLMService.streamChat([
    systemMessage,
    ...state.messages,
    analysisPrompt,
  ])) {
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
  emitStreamingChunk('*계획 수립 중...*\n\n', state.conversationId);

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
  for await (const chunk of LLMService.streamChat([systemMessage, planPrompt])) {
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
  emitStreamingChunk('*실행 중...*\n\n', state.conversationId);

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
  for await (const chunk of LLMService.streamChat([systemMessage, executePrompt])) {
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
  emitStreamingChunk('*답변 생성 중...*\n\n', state.conversationId);

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

  for await (const chunk of LLMService.streamChat([systemMessage, synthesizePrompt])) {
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
    .addNode('analyze', analyzeNode)
    .addNode('plan', planNode)
    .addNode('execute', executeNode)
    .addNode('synthesize', synthesizeNode)
    // 순차적 엣지
    .addEdge('__start__', 'analyze')
    .addEdge('analyze', 'plan')
    .addEdge('plan', 'execute')
    .addEdge('execute', 'synthesize')
    .addEdge('synthesize', END);

  return workflow.compile();
}
