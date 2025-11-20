import { RAGState } from '../types';
import { generateWithContextNode } from '../nodes/generate';
import { retrieveNode, rerankNode } from '../nodes/retrieve';
import { LLMService } from '@/lib/llm/service';
import { Message } from '@/types';
import { createRAGSystemMessage } from '../utils/system-message';

/**
 * RAG (Retrieval-Augmented Generation) 그래프 - 간단한 구현
 */
export class RAGGraph {
  async invoke(initialState: RAGState): Promise<RAGState> {
    let state = { ...initialState };

    // 1. retrieve 노드 실행
    const retrieveResult = await retrieveNode(state);
    state = {
      ...state,
      documents: retrieveResult.documents ?? state.documents,
      query: retrieveResult.query ?? state.query,
    };

    // 2. rerank 노드 실행
    const rerankResult = await rerankNode(state);
    state = {
      ...state,
      documents: rerankResult.documents ?? state.documents,
    };

    // 3. generate 노드 실행 (제너레이터를 순회하여 최종 결과 얻기)
    let finalGenerateResult: Partial<RAGState> = {};

    for await (const result of generateWithContextNode(state)) {
      finalGenerateResult = result;
    }

    state = {
      ...state,
      messages: [...state.messages, ...(finalGenerateResult.messages || [])],
      context: finalGenerateResult.context ?? state.context,
    };

    return state;
  }

  async *stream(initialState: RAGState): AsyncGenerator<any> {
    let state = { ...initialState };

    // 1. retrieve
    const retrieveResult = await retrieveNode(state);
    state = {
      ...state,
      documents: retrieveResult.documents ?? state.documents,
      query: retrieveResult.query ?? state.query,
    };
    yield { retrieve: retrieveResult };

    // 2. rerank
    const rerankResult = await rerankNode(state);
    state = {
      ...state,
      documents: rerankResult.documents ?? state.documents,
    };
    yield { rerank: rerankResult };

    // 3. generate with streaming
    const messages = [
      {
        id: 'system',
        role: 'system' as const,
        content: createRAGSystemMessage(state.documents),
        created_at: Date.now(),
      },
      ...state.messages,
    ];

    const context = state.documents.length > 0
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
      // LLM 스트리밍 호출
      for await (const chunk of LLMService.streamChat(messages)) {
        accumulatedContent += chunk;

        const assistantMessage: Message = {
          id: messageId,
          role: 'assistant',
          content: accumulatedContent,
          created_at: Date.now(),
          referenced_documents: referencedDocs,
        };

        // 각 청크마다 이벤트 발생
        yield {
          generate: {
            messages: [assistantMessage],
            context,
          },
        };
      }
    } catch (error: any) {
      console.error('RAGGraph stream error:', error);

      const errorMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to generate response'}`,
        created_at: Date.now(),
        referenced_documents: referencedDocs,
      };

      yield {
        generate: {
          messages: [errorMessage],
          context,
        },
      };
    }
  }
}

export function createRAGGraph() {
  return new RAGGraph();
}
