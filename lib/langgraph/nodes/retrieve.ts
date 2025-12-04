import { RAGState } from '../state';
import { Document } from '../types';

/**
 * Main Process 환경인지 확인
 */
function isMainProcess(): boolean {
  return typeof window === 'undefined';
}

/**
 * 벡터 검색 노드
 */
export async function retrieveNode(state: RAGState): Promise<Partial<RAGState>> {
  try {
    // 마지막 사용자 메시지를 쿼리로 사용
    const lastMessage = state.messages[state.messages.length - 1];
    const query = lastMessage?.content || '';

    console.log('[RetrieveNode] Retrieving documents for query:', query);

    let documents: Document[] = [];

    // Main Process 환경에서는 vectorDBService와 EmbeddingClient 사용
    if (isMainProcess()) {
      try {
        // Dynamic import to avoid bundling in renderer process
        const { vectorDBService } = await import('../../../electron/services/vectordb');
        const { databaseService } = await import('../../../electron/services/database');
        const { initializeEmbedding, getEmbeddingProvider } =
          await import('@/lib/vectordb/embeddings/client');

        console.log('[RetrieveNode] Using vectorDBService in Main Process');

        // Embedding config 로드 및 초기화
        const configStr = databaseService.getSetting('app_config');
        if (!configStr) {
          throw new Error('App config not found');
        }

        const appConfig = JSON.parse(configStr);
        if (!appConfig.embedding) {
          throw new Error('Embedding config not found');
        }

        // Embedding 초기화 (이미 초기화되어 있으면 무시됨)
        initializeEmbedding(appConfig.embedding);

        // 쿼리 임베딩
        const embedder = getEmbeddingProvider();
        const queryEmbedding = await embedder.embed(query);

        // 벡터 검색 (상위 5개) - 개선된 하이브리드 검색 사용
        // 메타데이터 기반 필터링 및 점수 부스팅 활성화
        const results = await vectorDBService.searchByVector(queryEmbedding, 5, {
          useHybridSearch: true,
          hybridAlpha: 0.7, // 벡터 70%, BM25 30%
          titleBoost: 0.3, // 제목 매칭 시 30% 부스팅
          folderPathBoost: 0.2, // 폴더 경로 매칭 시 20% 부스팅
          tagBoost: 0.15, // 태그 매칭 시 15% 부스팅
          includeAllMetadata: true,
          docGroup: 'all', // personal + team 문서 모두 검색
          // 필터링은 기본적으로 비활성화 (모든 문서 검색)
          // 필요 시 folderPath, tags, category, source로 필터링 가능
        });

        // Document 형식으로 변환
        documents = results.map((result) => ({
          id: result.id,
          content: result.content,
          metadata: result.metadata,
          score: result.score,
        }));

        console.log(`[RetrieveNode] Found ${documents.length} documents in Main Process`);
      } catch (error: any) {
        console.error('[RetrieveNode] Vector search error:', error);
        // 에러 시 더미 문서 반환
        documents = getDummyDocuments(query);
      }
    } else {
      // Renderer Process는 이 코드에 도달하지 않아야 함
      console.error('[RetrieveNode] Renderer Process should not call retrieveNode directly');
      documents = getDummyDocuments(query);
    }

    return {
      documents,
      query,
    };
  } catch (error: any) {
    console.error('[RetrieveNode] Retrieve node error:', error);
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
      content:
        'SEPilot Desktop은 LangGraph 기반 워크플로우와 벡터 검색을 지원하는 LLM 애플리케이션입니다.',
      metadata: { source: 'sepilot-docs', page: 1 },
      score: 0.85,
    },
  ];
}

/**
 * 문서 재정렬 노드 (선택적)
 * 메타데이터 기반 재정렬 + 쿼리 관련성 재평가
 */
export async function rerankNode(state: RAGState): Promise<Partial<RAGState>> {
  try {
    const query = state.query || '';
    const queryLower = query.toLowerCase();

    // 1단계: 메타데이터 기반 점수 재조정
    const rerankedDocuments = state.documents.map((doc) => {
      let adjustedScore = doc.score || 0;

      // 제목에 쿼리 키워드 포함 시 점수 부스팅
      if (doc.metadata?.title) {
        const titleLower = (doc.metadata.title as string).toLowerCase();
        const queryWords = queryLower.split(/\s+/);
        const matchingWords = queryWords.filter((word) => titleLower.includes(word));
        if (matchingWords.length > 0) {
          adjustedScore *= 1.0 + 0.2 * (matchingWords.length / queryWords.length);
        }
      }

      // 폴더 경로가 쿼리와 관련있으면 점수 부스팅
      if (doc.metadata?.folderPath) {
        const folderPathLower = (doc.metadata.folderPath as string).toLowerCase();
        const queryWords = queryLower.split(/\s+/);
        const matchingWords = queryWords.filter((word) => folderPathLower.includes(word));
        if (matchingWords.length > 0) {
          adjustedScore *= 1.0 + 0.15 * (matchingWords.length / queryWords.length);
        }
      }

      // 태그가 쿼리와 관련있으면 점수 부스팅
      if (doc.metadata?.tags && Array.isArray(doc.metadata.tags)) {
        const tags = doc.metadata.tags as string[];
        const tagsLower = tags.map((t) => t.toLowerCase());
        const queryWords = queryLower.split(/\s+/);
        const matchingWords = queryWords.filter((word) =>
          tagsLower.some((tag) => tag.includes(word))
        );
        if (matchingWords.length > 0) {
          adjustedScore *= 1.0 + 0.1 * (matchingWords.length / queryWords.length);
        }
      }

      // 컨텐츠에 쿼리 키워드 직접 포함 시 추가 점수
      const contentLower = doc.content.toLowerCase();
      const queryWords = queryLower.split(/\s+/);
      const matchingWords = queryWords.filter((word) => contentLower.includes(word));
      if (matchingWords.length > 0) {
        adjustedScore *= 1.0 + 0.1 * (matchingWords.length / queryWords.length);
      }

      return {
        ...doc,
        score: adjustedScore,
      };
    });

    // 2단계: 점수 기준 정렬
    rerankedDocuments.sort((a, b) => (b.score || 0) - (a.score || 0));

    console.log(`[RerankNode] Reranked ${rerankedDocuments.length} documents, returning top 3`);
    console.log(
      '[RerankNode] Top 3 scores:',
      rerankedDocuments.slice(0, 3).map((d) => ({
        title: d.metadata?.title,
        score: d.score,
        folder: d.metadata?.folderPath,
      }))
    );

    return {
      documents: rerankedDocuments.slice(0, 3), // 상위 3개만 사용
    };
  } catch (error: any) {
    console.error('[RerankNode] Rerank node error:', error);
    return {
      documents: state.documents.slice(0, 3),
    };
  }
}
