import { ChatState } from '../types';
import { generateNode } from '../nodes/generate';
import { LLMService } from '@/lib/llm/service';
import { Message } from '@/types';
import { createBaseSystemMessage, createVisionSystemMessage } from '../utils/system-message';

/**
 * 기본 채팅 그래프 - 간단한 구현
 *
 * LangGraph의 복잡한 API 대신 직접 구현
 * Phase 5-6에서 더 복잡한 워크플로우 필요 시 개선
 */
export class ChatGraph {
  async invoke(initialState: ChatState): Promise<ChatState> {
    // generate 노드 실행 (제너레이터를 순회하여 최종 결과 얻기)
    let finalResult: Partial<ChatState> = {};

    for await (const result of generateNode(initialState)) {
      finalResult = result;
    }

    // 상태 병합
    return {
      ...initialState,
      messages: [...initialState.messages, ...(finalResult.messages || [])],
      context: finalResult.context ?? initialState.context,
    };
  }

  async *stream(initialState: ChatState): AsyncGenerator<{ generate: Partial<ChatState> }> {
    // 이미지 유무 체크
    const hasImages = initialState.messages.some(msg => msg.images && msg.images.length > 0);

    // 시스템 메시지 구성
    const additionalContext = initialState.context
      ? `# 추가 컨텍스트\n\n${initialState.context}`
      : undefined;

    // 이미지가 있으면 짧은 시스템 메시지 사용 (Ollama vision 호환성)
    const systemContent = hasImages
      ? createVisionSystemMessage()
      : createBaseSystemMessage(additionalContext);

    const messages = [
      {
        id: 'system',
        role: 'system' as const,
        content: systemContent,
        created_at: Date.now(),
      },
      ...initialState.messages,
    ];

    let accumulatedContent = '';
    const messageId = `msg-${Date.now()}`;

    try {
      console.log('[ChatGraph] Starting stream for message:', messageId);
      let chunkCount = 0;

      // LLM 스트리밍 호출
      for await (const chunk of LLMService.streamChat(messages)) {
        chunkCount++;
        accumulatedContent += chunk;

        // 로그 제거: 매 청크마다 찍으면 렉 발생

        const assistantMessage: Message = {
          id: messageId,
          role: 'assistant',
          content: accumulatedContent,
          created_at: Date.now(),
        };

        // 각 청크마다 이벤트 발생
        yield {
          generate: {
            messages: [assistantMessage],
          },
        };
      }

      console.log(`[ChatGraph] Stream complete. Total chunks: ${chunkCount}, final length: ${accumulatedContent.length}`);
    } catch (error: any) {
      console.error('ChatGraph stream error:', error);

      const errorMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to generate response'}`,
        created_at: Date.now(),
      };

      yield {
        generate: {
          messages: [errorMessage],
        },
      };
    }
  }
}

export function createChatGraph() {
  return new ChatGraph();
}
