import type { Message } from '@/types';
import { emitStreamingChunk } from '@/lib/domains/llm/streaming-callback';
import { logger } from '@/lib/utils/logger';
import { generateWithToolsNode } from '../nodes/generate';
import { toolsNode } from '../nodes/tools';
import { retrieveContextIfEnabled } from './rag-utils';

/**
 * 연구 노드에 필요한 최소 상태 인터페이스
 */
interface ResearchNodeState {
  messages: Message[];
  conversationId: string;
}

/**
 * 연구 노드 결과
 */
interface ResearchNodeResult {
  context?: string;
  researchContext?: string;
}

/**
 * 0단계: 정보 수집 (Research)
 *
 * 여러 그래프에서 공통으로 사용하는 연구 노드 로직
 */
export function createResearchNode<T extends ResearchNodeState>(
  context: string
): (state: T) => Promise<ResearchNodeResult> {
  return async (state: T): Promise<ResearchNodeResult> => {
    logger.info(`[${context}] Step 0: Researching...`);
    emitStreamingChunk('\n\n## 🔎 0단계: 정보 수집 (Research)\n\n', state.conversationId);

    // RAG 검색
    const query = state.messages[state.messages.length - 1].content;
    const ragContext = await retrieveContextIfEnabled(query, context, state.conversationId);

    let gatheredInfo = ragContext ? `[RAG 검색 결과]\n${ragContext}\n\n` : '';

    // 도구 사용 루프 (최대 3회)
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
      } as any);
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
        context: '',
        toolCalls: [],
        toolResults: [],
        generatedImages: [],
        planningNotes: {},
      } as any);

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

    logger.info(`[${context}] Research complete`);

    return {
      context: gatheredInfo,
    };
  };
}
