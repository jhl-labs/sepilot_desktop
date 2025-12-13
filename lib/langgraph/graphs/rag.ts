import { StateGraph, END } from '@langchain/langgraph';
import { RAGStateAnnotation } from '../state';
import { retrieveNode, rerankNode } from '../nodes/retrieve';
import { LLMService } from '@/lib/llm/service';
import { Message } from '@/types';
import { createRAGSystemMessage } from '../utils/system-message';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';

import { logger } from '@/lib/utils/logger';
/**
 * RAG 생성 노드
 */
async function ragGenerateNode(state: typeof RAGStateAnnotation.State) {
  // Main Process 환경에서 LLM 클라이언트 초기화 확인 및 설정
  if (typeof window === 'undefined') {
    try {
      const { databaseService } = await import('../../../electron/services/database');
      const { initializeLLMClient, getLLMClient } = await import('@/lib/llm/client');
      const { isLLMConfigV2, convertV2ToV1 } = await import('@/lib/config/llm-config-migration');

      const client = getLLMClient();
      if (!client.isConfigured()) {
        logger.info('[RAGGraph] LLM client not configured, initializing from database...');

        const configStr = databaseService.getSetting('app_config');
        if (!configStr) {
          throw new Error('App config not found in database');
        }

        const appConfig = JSON.parse(configStr);
        if (!appConfig.llm) {
          throw new Error('LLM config not found in app_config');
        }

        // V2 설정이면 V1으로 변환
        if (isLLMConfigV2(appConfig.llm)) {
          logger.info('[RAGGraph] Converting V2 LLM config to V1');
          appConfig.llm = convertV2ToV1(appConfig.llm);
        }

        // LLM 클라이언트 초기화
        initializeLLMClient(appConfig.llm);
        logger.info('[RAGGraph] LLM client initialized successfully');
      }
    } catch (error: any) {
      console.error('[RAGGraph] Failed to initialize LLM client:', error);
      throw error;
    }
  }

  const messages = [
    {
      id: 'system',
      role: 'system' as const,
      content: createRAGSystemMessage(state.documents),
      created_at: Date.now(),
    },
    ...state.messages,
  ];

  const context =
    state.documents.length > 0
      ? state.documents.map((doc, i) => `[문서 ${i + 1}]\n${doc.content}`).join('\n\n')
      : '';

  let accumulatedContent = '';
  const messageId = `msg-${Date.now()}`;

  // 참조 문서 정보 생성
  const referencedDocs = state.documents.map((doc) => ({
    id: doc.id,
    title: doc.metadata?.title || '제목 없음',
    source: doc.metadata?.source || 'manual',
    content: doc.content,
  }));

  try {
    logger.info('[RAGGraph] Starting generation with documents:', state.documents.length);
    if (state.documents.length > 0) {
      logger.info(
        '[RAGGraph] Document titles:',
        state.documents.map((d) => d.metadata?.title)
      );
      logger.info('[RAGGraph] Total context length:', context.length, 'chars');
      logger.info(
        '[RAGGraph] System message length:',
        messages.find((m) => m.role === 'system')?.content.length,
        'chars'
      );
    } else {
      console.warn('[RAGGraph] WARNING: No documents found for RAG!');
    }

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
      referenced_documents: referencedDocs,
    };

    logger.info(`[RAGGraph] Generation complete. Length: ${accumulatedContent.length}`);

    return {
      messages: [assistantMessage],
      context,
    };
  } catch (error: any) {
    console.error('[RAGGraph] Generation error:', error);

    const errorMessage: Message = {
      id: messageId,
      role: 'assistant',
      content: `Error: ${error.message || 'Failed to generate response'}`,
      created_at: Date.now(),
      referenced_documents: referencedDocs,
    };

    return {
      messages: [errorMessage],
      context,
    };
  }
}

/**
 * RAG (Retrieval-Augmented Generation) 그래프 - LangGraph StateGraph 사용
 */
export function createRAGGraph() {
  // StateGraph 생성
  const workflow = new StateGraph(RAGStateAnnotation)
    // 노드 추가
    .addNode('retrieve', retrieveNode)
    .addNode('rerank', rerankNode)
    .addNode('generate', ragGenerateNode)
    // 엔트리 포인트 설정
    .addEdge('__start__', 'retrieve')
    // 선형 흐름: retrieve -> rerank -> generate -> end
    .addEdge('retrieve', 'rerank')
    .addEdge('rerank', 'generate')
    .addEdge('generate', END);

  // 컴파일된 그래프 반환
  return workflow.compile();
}
