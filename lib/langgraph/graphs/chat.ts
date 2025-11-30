import { StateGraph, END } from '@langchain/langgraph';
import { ChatStateAnnotation } from '../state';
import { LLMService } from '@/lib/llm/service';
import { Message } from '@/types';
import { createBaseSystemMessage, createVisionSystemMessage } from '../utils/system-message';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';

/**
 * 기본 채팅 그래프 노드 - 스트리밍 지원
 */
async function chatGenerateNode(state: typeof ChatStateAnnotation.State) {
  // 이미지 유무 체크
  const hasImages = state.messages.some((msg) => msg.images && msg.images.length > 0);

  // Check if there's already a system message (e.g., from Quick Question)
  const hasSystemMessage = state.messages.some((msg) => msg.role === 'system');

  let messages: Message[];

  if (hasSystemMessage) {
    // Use existing system message from state (e.g., Quick Question)
    messages = [...state.messages];
    console.log('[ChatGraph] Using existing system message from state');
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
    console.log('[ChatGraph] Starting generation');

    // LLM 스트리밍 호출 - 각 청크를 즉시 렌더러로 전송
    for await (const chunk of LLMService.streamChat(messages)) {
      accumulatedContent += chunk;
      // Send each chunk to renderer via callback (conversationId로 격리)
      emitStreamingChunk(chunk, state.conversationId);
    }

    const assistantMessage: Message = {
      id: messageId,
      role: 'assistant',
      content: accumulatedContent,
      created_at: Date.now(),
    };

    console.log(`[ChatGraph] Generation complete. Length: ${accumulatedContent.length}`);

    return {
      messages: [assistantMessage],
    };
  } catch (error: any) {
    console.error('[ChatGraph] Generation error:', error);

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

/**
 * 기본 채팅 그래프 - LangGraph StateGraph 사용
 */
export function createChatGraph() {
  // StateGraph 생성
  const workflow = new StateGraph(ChatStateAnnotation)
    // 노드 추가
    .addNode('generate', chatGenerateNode)
    // 엔트리 포인트 설정
    .addEdge('__start__', 'generate')
    // generate 완료 후 종료
    .addEdge('generate', END);

  // 컴파일된 그래프 반환
  return workflow.compile();
}
