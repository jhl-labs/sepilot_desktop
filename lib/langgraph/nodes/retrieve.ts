import { RAGState, Document } from '../types';
import { VectorDBClient } from '@/lib/vectordb/client';
import { EmbeddingClient } from '@/lib/vectordb/embeddings/client';

/**
 * 벡터 검색 노드
 */
export async function retrieveNode(state: RAGState): Promise<Partial<RAGState>> {
  try {
    // 마지막 사용자 메시지를 쿼리로 사용
    const lastMessage = state.messages[state.messages.length - 1];
    const query = lastMessage?.content || '';

    console.log('Retrieving documents for query:', query);

    let documents: Document[] = [];

    // VectorDB가 설정되어 있으면 실제 검색 수행
    if (VectorDBClient.isConfigured() && EmbeddingClient.isConfigured()) {
      try {
        const vectorDB = VectorDBClient.getDB();
        const embedder = EmbeddingClient.getProvider();

        // 쿼리 임베딩
        const queryEmbedding = await embedder.embed(query);

        // 벡터 검색 (상위 5개)
        const results = await vectorDB.searchByVector(queryEmbedding, 5);

        // Document 형식으로 변환
        documents = results.map((result) => ({
          id: result.id,
          content: result.content,
          metadata: result.metadata,
          score: result.score,
        }));

        console.log(`Found ${documents.length} documents`);
      } catch (error: any) {
        console.error('Vector search error:', error);
        // 에러 시 더미 문서 반환
        documents = getDummyDocuments(query);
      }
    } else {
      // VectorDB가 설정되지 않았으면 더미 문서 반환
      console.log('VectorDB not configured, using dummy documents');
      documents = getDummyDocuments(query);
    }

    return {
      documents,
      query,
    };
  } catch (error: any) {
    console.error('Retrieve node error:', error);
    return {
      documents: getDummyDocuments(''),
      query: state.query,
    };
  }
}

/**
 * 더미 문서 생성 (VectorDB 미설정 시)
 */
function getDummyDocuments(query: string): Document[] {
  return [
    {
      id: 'doc-1',
      content: `"${query}"에 대한 샘플 문서입니다. VectorDB를 설정하면 실제 문서 검색이 가능합니다.`,
      metadata: { source: 'sample', page: 1 },
      score: 0.95,
    },
    {
      id: 'doc-2',
      content: 'SEPilot Desktop은 LangGraph 기반 워크플로우와 벡터 검색을 지원하는 LLM 애플리케이션입니다.',
      metadata: { source: 'sepilot-docs', page: 1 },
      score: 0.85,
    },
  ];
}

/**
 * 문서 재정렬 노드 (선택적)
 */
export async function rerankNode(state: RAGState): Promise<Partial<RAGState>> {
  try {
    // TODO: Phase 5에서 재정렬 알고리즘 구현
    // 현재는 점수 기준으로 정렬만 수행
    const rankedDocuments = [...state.documents].sort((a, b) => {
      return (b.score || 0) - (a.score || 0);
    });

    return {
      documents: rankedDocuments.slice(0, 3), // 상위 3개만 사용
    };
  } catch (error: any) {
    console.error('Rerank node error:', error);
    return {
      documents: state.documents,
    };
  }
}
