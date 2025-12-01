import { StateGraph, END } from '@langchain/langgraph';
import { Annotation } from '@langchain/langgraph';
import { Message } from '@/types';
import { LLMService } from '@/lib/llm/service';
import { createBaseSystemMessage } from '../utils/system-message';
import { emitStreamingChunk, getCurrentGraphConfig } from '@/lib/llm/streaming-callback';
import { generateWithToolsNode } from '../nodes/generate';
import { toolsNode } from '../nodes/tools';

/**
 * Tree of Thought Graph
 *
 * 여러 사고 경로를 탐색하고 평가하여 최선의 답변을 생성
 * 1. 문제 분해 (Decompose)
 * 2. 다중 경로 생성 (Generate Branches)
 * 3. 각 경로 평가 (Evaluate)
 * 4. 최선의 경로 선택 및 답변 생성 (Select & Synthesize)
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

    console.log('[ToT] RAG enabled, retrieving documents...');
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
      console.log(`[ToT] Found ${results.length} documents`);
      return results.map((doc, i) => `[참고 문서 ${i + 1}]\n${doc.content}`).join('\n\n');
    }
  } catch (error) {
    console.error('[ToT] RAG retrieval failed:', error);
  }
  return '';
}

/**
 * 0단계: 정보 수집 (Research)
 */
async function researchNode(state: TreeOfThoughtState) {
  console.log('[ToT] Step 0: Researching...');
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
    // AgentState 호환성을 위해 toolCalls와 toolResults 추가
    const genResult = await generateWithToolsNode({
      ...state,
      messages: currentMessages,
      toolCalls: [],
      toolResults: [],
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
      toolCalls: [],
      toolResults: [],
      planningNotes: {},
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

  console.log('[ToT] Research complete');

  return {
    context: gatheredInfo,
  };
}

/**
 * Tree of Thought State
 */
export const TreeOfThoughtStateAnnotation = Annotation.Root({
  messages: Annotation<Message[]>({
    reducer: (existing: Message[], updates: Message[]) => [...existing, ...updates],
    default: () => [],
  }),
  context: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  branches: Annotation<Array<{ id: string; content: string; score: number }>>({
    reducer: (_existing: any[], updates: any[]) => updates,
    default: () => [],
  }),
  selectedBranch: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  // conversationId: 동시 대화 시 스트리밍 격리를 위해 필수
  conversationId: Annotation<string>({
    reducer: (_existing: string, update: string) => update || _existing,
    default: () => '',
  }),
});

export type TreeOfThoughtState = typeof TreeOfThoughtStateAnnotation.State;

/**
 * 1단계: 문제 분해
 */
async function decomposeNode(state: TreeOfThoughtState) {
  console.log('[ToT] Step 1: Decomposing problem...');

  // 단계 시작 알림

  emitStreamingChunk('\n\n## 🌳 1단계: 문제 분해\n\n', state.conversationId);

  emitStreamingChunk(
    '**단계 진행 중:** 문제를 핵심 측면으로 분해 중입니다...\n\n',
    state.conversationId
  );

  // 수집된 정보(Research/RAG) 가져오기

  const query = state.messages[state.messages.length - 1].content;

  const researchContext = state.context;

  if (researchContext) {
    emitStreamingChunk(
      `\n📚 **사전 수집된 정보를 참조합니다.**\n\n`,

      state.conversationId
    );
  }

  const systemMessage: Message = {
    id: 'system',

    role: 'system',

    content: `당신은 복잡한 문제를 핵심 측면과 고려사항으로 분해하는 분석적 AI입니다.

  

  질문을 분석하고 다음을 파악하세요:

  1. 핵심 질문

  2. 고려해야 할 주요 측면들

  3. 답변에 대한 가능한 접근 방식들

  

  포괄적이면서도 간결하게 작성하세요. 반드시 한국어로 답변하세요.`,

    created_at: Date.now(),
  };

  const decomposePrompt: Message = {
    id: 'decompose-prompt',

    role: 'user',

    content: `다음 질문을 핵심 측면들로 분해하세요:\n\n${query}\n\n${researchContext ? `수집된 정보:\n${researchContext}\n\n` : ''}위 정보를 활용하여 분해하세요.`,

    created_at: Date.now(),
  };

  let decomposition = '';
  for await (const chunk of LLMService.streamChat(
    [systemMessage, ...state.messages, decomposePrompt],
    { tools: [], tool_choice: 'none' }
  )) {
    decomposition += chunk;
    // 실시간 스트리밍 (conversationId로 격리)
    emitStreamingChunk(chunk, state.conversationId);
  }

  console.log('[ToT] Decomposition complete');

  return {
    context: decomposition,
  };
}

/**
 * 2단계: 다중 경로 생성 (3개의 다른 접근 방식)
 */
async function generateBranchesNode(state: TreeOfThoughtState) {
  console.log('[ToT] Step 2: Generating multiple thought branches...');

  // 단계 시작 알림
  emitStreamingChunk('\n\n---\n\n## 🌿 2단계: 다중 사고 경로 생성\n\n', state.conversationId);
  emitStreamingChunk(
    '**단계 진행 중:** 다양한 사고 경로를 생성 중입니다...\n\n',
    state.conversationId
  );

  const branches: Array<{ id: string; content: string; score: number }> = [];

  // 3가지 다른 접근 방식으로 답변 생성
  const approaches = [
    { name: '실용적 접근', desc: '실용적이고 실행 가능한 조언에 집중' },
    { name: '이론적 접근', desc: '이론적 이해와 원칙에 집중' },
    { name: '균형적 접근', desc: '장단점을 고려한 균형 잡힌 관점에 집중' },
  ];

  for (let i = 0; i < 3; i++) {
    // 각 브랜치 시작 알림
    emitStreamingChunk(`\n### 🔀 경로 ${i + 1}: ${approaches[i].name}\n\n`, state.conversationId);

    const systemMessage: Message = {
      id: `system-branch-${i}`,
      role: 'system',
      content: `당신은 질문에 대해 다양한 관점을 제공하는 사려 깊은 AI 어시스턴트입니다.

${approaches[i].desc}

아래 분해를 바탕으로 이 특정 접근 방식에 집중하여 답변을 제공하세요. 반드시 한국어로 답변하세요.`,
      created_at: Date.now(),
    };

    const branchPrompt: Message = {
      id: `branch-prompt-${i}`,
      role: 'user',
      content: `분해:\n${state.context}\n\n원본 질문: ${state.messages[state.messages.length - 1].content}\n\n${approaches[i].desc}을 사용하여 답변을 제공하세요`,
      created_at: Date.now(),
    };

    let branchContent = '';
    for await (const chunk of LLMService.streamChat([systemMessage, branchPrompt], {
      tools: [],
      tool_choice: 'none',
    })) {
      branchContent += chunk;
      // 실시간 스트리밍 (conversationId로 격리)
      emitStreamingChunk(chunk, state.conversationId);
    }

    branches.push({
      id: `branch-${i}`,
      content: branchContent,
      score: 0, // Will be evaluated in next step
    });

    console.log(`[ToT] Branch ${i + 1} generated`);
  }

  return {
    branches,
  };
}

/**
 * 3단계: 각 경로 평가
 */
async function evaluateBranchesNode(state: TreeOfThoughtState) {
  console.log('[ToT] Step 3: Evaluating branches...');

  // 단계 시작 알림
  emitStreamingChunk('\n\n---\n\n## ⚖️ 3단계: 경로 평가\n\n', state.conversationId);
  emitStreamingChunk(
    '**단계 진행 중:** 생성된 사고 경로들을 평가 중입니다...\n\n',
    state.conversationId
  );

  const systemMessage: Message = {
    id: 'system-eval',
    role: 'system',
    content: `당신은 답변의 품질을 평가하는 평가 AI입니다.

각 답변을 다음 기준으로 평가하세요:
1. 질문과의 관련성 (0-10)
2. 완전성 (0-10)
3. 명확성과 일관성 (0-10)
4. 통찰의 깊이 (0-10)

각 답변에 대해 총점(0-40)만 제공하세요. 형식: "점수: X". 반드시 한국어로 답변하세요.`,
    created_at: Date.now(),
  };

  const evaluatedBranches: Array<{ id: string; content: string; score: number }> = [];

  for (let idx = 0; idx < state.branches.length; idx++) {
    const branch = state.branches[idx];

    emitStreamingChunk(`\n### 📊 경로 ${idx + 1} 평가 중...\n\n`, state.conversationId);

    const evalPrompt: Message = {
      id: `eval-prompt-${idx}`,
      role: 'user',
      content: `원본 질문: ${state.messages[state.messages.length - 1].content}\n\n평가할 답변:\n${branch.content}\n\n총점(0-40)을 제공하세요:`,
      created_at: Date.now(),
    };

    let scoreText = '';
    for await (const chunk of LLMService.streamChat([systemMessage, evalPrompt], {
      tools: [],
      tool_choice: 'none',
    })) {
      scoreText += chunk;
      // 실시간 스트리밍 (conversationId로 격리)
      emitStreamingChunk(chunk, state.conversationId);
    }

    // Extract score
    const match = scoreText.match(/(\d+)/);
    const score = match ? parseInt(match[1]) : 20; // Default to middle score if parsing fails

    console.log(`[ToT] Branch ${idx + 1} score: ${score}`);

    evaluatedBranches.push({
      ...branch,
      score,
    });
  }

  // Sort by score and select best
  const sortedBranches = evaluatedBranches.sort((a, b) => b.score - a.score);
  const selectedBranch = sortedBranches[0].content;

  emitStreamingChunk(
    `\n\n**🏆 최고 점수 경로 선택됨 (점수: ${sortedBranches[0].score})**\n`,
    state.conversationId
  );

  console.log('[ToT] Best branch selected');

  return {
    branches: evaluatedBranches,
    selectedBranch,
  };
}

/**
 * 4단계: 최종 답변 생성
 */
async function synthesizeNode(state: TreeOfThoughtState) {
  console.log('[ToT] Step 4: Synthesizing final answer...');

  // 단계 시작 알림
  emitStreamingChunk('\n\n---\n\n## ✨ 4단계: 최종 답변 통합\n\n', state.conversationId);
  emitStreamingChunk(
    '**단계 진행 중:** 최적 경로를 기반으로 최종 답변을 통합 중입니다...\n\n',
    state.conversationId
  );

  const systemMessage: Message = {
    id: 'system-synth',
    role: 'system',
    content: createBaseSystemMessage(),
    created_at: Date.now(),
  };

  // 상위 2개 브랜치를 통합
  const topBranches = state.branches
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((b, idx) => `### Approach ${idx + 1} (Score: ${b.score}):\n${b.content}`)
    .join('\n\n');

  const synthesizePrompt: Message = {
    id: 'synthesize-prompt',
    role: 'user',
    content: `당신은 이 질문에 답하기 위해 여러 접근 방식을 탐색했습니다.
이제 상위 접근 방식들의 최고의 통찰을 포괄적이고 잘 구조화된 답변으로 종합하세요.

원본 질문: ${state.messages[state.messages.length - 1].content}

탐색된 상위 접근 방식들:
${topBranches}

이러한 접근 방식들의 최고의 측면을 포함하는 최종적이고 포괄적인 답변을 제공하세요. 반드시 한국어로 답변하세요.`,
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

  console.log('[ToT] Final answer synthesized');

  return {
    messages: [assistantMessage],
  };
}

/**
 * Tree of Thought Graph 생성
 */
export function createTreeOfThoughtGraph() {
  const workflow = new StateGraph(TreeOfThoughtStateAnnotation)
    // 노드 추가
    .addNode('research', researchNode)
    .addNode('decompose', decomposeNode)
    .addNode('generate_branches', generateBranchesNode)
    .addNode('evaluate', evaluateBranchesNode)
    .addNode('synthesize', synthesizeNode)
    // 순차적 엣지
    .addEdge('__start__', 'research')
    .addEdge('research', 'decompose')
    .addEdge('decompose', 'generate_branches')
    .addEdge('generate_branches', 'evaluate')
    .addEdge('evaluate', 'synthesize')
    .addEdge('synthesize', END);

  return workflow.compile();
}
