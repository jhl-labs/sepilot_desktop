/**
 * RAGGraph - RAG (Retrieval-Augmented Generation) 그래프
 *
 * BaseGraph를 상속하여 문서 검색 기반 응답 생성
 *
 * 노드:
 * - retrieve: 문서 검색
 * - rerank: 문서 재순위 지정
 * - generate: LLM 응답 생성 (검색된 문서 기반)
 *
 * 흐름:
 * START → retrieve → rerank → generate → END
 */

import { StateGraph, END } from '@langchain/langgraph';
import { RAGStateAnnotation, type RAGState } from '../state';
import { BaseGraph } from '../base/base-graph';
import { retrieveNode, rerankNode } from '../nodes/retrieve';
import type { Message } from '@/types';
import { createRAGSystemMessage } from '../utils/system-message';
import { logger } from '@/lib/utils/logger';

/**
 * RAGGraph 클래스
 */
export class RAGGraph extends BaseGraph<RAGState> {
  /**
   * State Annotation 생성
   */
  protected createStateAnnotation(): typeof RAGStateAnnotation {
    return RAGStateAnnotation;
  }

  /**
   * 노드 추가
   */
  protected buildNodes(workflow: StateGraph<any>): any {
    return workflow
      .addNode('retrieve', retrieveNode)
      .addNode('rerank', rerankNode)
      .addNode('generate', this.generateNode.bind(this));
  }

  /**
   * 엣지 추가
   */
  protected buildEdges(workflow: any): any {
    return workflow
      .addEdge('__start__', 'retrieve')
      .addEdge('retrieve', 'rerank')
      .addEdge('rerank', 'generate')
      .addEdge('generate', END);
  }

  /**
   * Generate 노드: RAG 기반 응답 생성
   */
  private async generateNode(state: RAGState): Promise<Partial<RAGState>> {
    // Main Process 환경에서 LLM 클라이언트 초기화 확인 및 설정
    if (typeof window === 'undefined') {
      try {
        const { databaseService } = await import('../../../../electron/services/database');
        const { initializeLLMClient, getLLMClient } = await import('@/lib/domains/llm/client');
        const { isLLMConfigV2, convertV2ToV1 } =
          await import('@/lib/domains/config/llm-config-migration');

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
        logger.error('[RAGGraph] Failed to initialize LLM client:', error);
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
        logger.warn('[RAGGraph] WARNING: No documents found for RAG!');
      }

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
        referenced_documents: referencedDocs,
      };

      logger.info(`[RAGGraph] Generation complete. Length: ${accumulatedContent.length}`);

      return {
        messages: [assistantMessage],
        context,
      };
    } catch (error: any) {
      logger.error('[RAGGraph] Generation error:', error);

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
}

/**
 * 팩토리 함수 (하위 호환성 유지용)
 * @deprecated - RAGGraph 클래스를 직접 사용하세요
 */
export function createRAGGraph() {
  const ragGraph = new RAGGraph();
  return ragGraph.compile();
}
