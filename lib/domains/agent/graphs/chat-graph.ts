/**
 * ChatGraph - 기본 채팅 그래프
 *
 * BaseGraph를 상속하여 간단한 채팅 기능 제공
 *
 * 노드:
 * - generate: LLM 응답 생성 (스트리밍)
 *
 * 흐름:
 * START → generate → END
 */

import { StateGraph, END } from '@langchain/langgraph';
import { ChatStateAnnotation, type ChatState } from '../state';
import { BaseGraph } from '../base/base-graph';
import type { Message } from '@/types';
import { createBaseSystemMessage, createVisionSystemMessage } from '../utils/system-message';
import { logger } from '@/lib/utils/logger';

/**
 * ChatGraph 클래스
 */
export class ChatGraph extends BaseGraph<ChatState> {
  /**
   * State Annotation 생성
   */
  protected createStateAnnotation(): typeof ChatStateAnnotation {
    return ChatStateAnnotation;
  }

  /**
   * 노드 추가
   */
  protected buildNodes(workflow: StateGraph<any>): any {
    return workflow.addNode('generate', this.generateNode.bind(this));
  }

  /**
   * 엣지 추가
   */
  protected buildEdges(workflow: any): any {
    return workflow.addEdge('__start__', 'generate').addEdge('generate', END);
  }

  /**
   * Generate 노드: LLM 응답 생성 (스트리밍)
   */
  private async generateNode(state: ChatState): Promise<Partial<ChatState>> {
    // 이미지 유무 체크
    const hasImages = state.messages.some((msg) => msg.images && msg.images.length > 0);

    // 기존 시스템 메시지 체크 (예: Quick Question에서 주입된 경우)
    const hasSystemMessage = state.messages.some((msg) => msg.role === 'system');

    let messages: Message[];

    if (hasSystemMessage) {
      // 기존 시스템 메시지 사용
      messages = [...state.messages];
      logger.info('[ChatGraph] Using existing system message from state');
    } else {
      // 시스템 메시지 구성
      const additionalContext = state.context ? `# 추가 컨텍스트\n\n${state.context}` : undefined;

      // 이미지가 있으면 짧은 시스템 메시지 사용 (Ollama vision 호환성)
      const systemContent = hasImages
        ? createVisionSystemMessage()
        : createBaseSystemMessage(additionalContext);

      messages = [
        {
          id: 'system',
          role: 'system' as const,
          content: systemContent,
          created_at: Date.now(),
        },
        ...state.messages,
      ];
    }

    let accumulatedContent = '';
    const messageId = `msg-${Date.now()}`;

    try {
      logger.info('[ChatGraph] Starting generation');

      // BaseGraph의 streamLLM 메서드 사용
      for await (const chunk of this.streamLLM(messages)) {
        accumulatedContent += chunk;
        // BaseGraph의 emitChunk 메서드 사용
        this.emitChunk(chunk, state.conversationId);
      }

      const assistantMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: accumulatedContent,
        created_at: Date.now(),
      };

      logger.info(`[ChatGraph] Generation complete. Length: ${accumulatedContent.length}`);

      return {
        messages: [assistantMessage],
      };
    } catch (error: any) {
      logger.error('[ChatGraph] Generation error:', error);

      const errorMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to generate response'}`,
        created_at: Date.now(),
      };

      return {
        messages: [errorMessage],
      };
    }
  }
}

/**
 * 팩토리 함수 (하위 호환성 유지용)
 * @deprecated - ChatGraph 클래스를 직접 사용하세요
 */
export function createChatGraph() {
  const chatGraph = new ChatGraph();
  return chatGraph.compile();
}
