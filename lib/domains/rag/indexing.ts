import { VectorDB } from './interface';
import { EmbeddingProvider } from './embeddings/interface';
import { RawDocument, VectorDocument, IndexingOptions, ChunkStrategy, SearchResult } from './types';

import { logger } from '@/lib/utils/logger';
/**
 * Character-based 청킹 (기존 방식 - 컨텍스트 손실 가능)
 */
function chunkTextCharacter(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);

    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }

    start += chunkSize - chunkOverlap;
  }

  return chunks;
}

/**
 * Sentence-boundary 청킹 (문장 경계 기반)
 * 장점: 컨텍스트 보존, 빠른 속도
 * 단점: 언어별 구분자 차이
 *
 * 개행과 공백을 보존합니다.
 */
function chunkTextSentence(text: string, chunkSize: number, chunkOverlap: number): string[] {
  // 문장 경계 정규식 (한글/영어 모두 지원, 개행 보존)
  const sentenceRegex = /[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g;
  const sentences = text.match(sentenceRegex) || [text];

  const chunks: string[] = [];
  let currentChunk = '';
  let overlapBuffer: string[] = [];

  for (const sentence of sentences) {
    // trim()을 제거하여 개행과 공백 보존
    if (!sentence) {
      continue;
    }

    // 현재 청크 + 새 문장이 chunkSize를 초과하면 청크 저장
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      // 앞뒤 공백만 제거
      chunks.push(currentChunk.trim());

      // Overlap 처리: 마지막 N개 문장 유지 (원본 그대로 유지)
      const overlapText = overlapBuffer.join('');
      currentChunk = overlapText + sentence;
      overlapBuffer = [sentence];
    } else {
      currentChunk += sentence;
      overlapBuffer.push(sentence);

      // Overlap 버퍼가 너무 크면 앞에서 제거
      while (overlapBuffer.join('').length > chunkOverlap && overlapBuffer.length > 1) {
        overlapBuffer.shift();
      }
    }
  }

  // 마지막 청크 추가
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Structure-aware 청킹 (Markdown/코드 블록 구조 보존)
 * 장점: 구조 보존, 의미 단위 유지
 * 단점: Markdown 전용
 *
 * 개행과 공백을 보존하면서 구조적 경계를 유지합니다.
 */
function chunkTextStructure(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const chunks: string[] = [];

  // 코드 블록, 제목, 리스트 등을 구분자로 사용
  const structureRegex = /(^#{1,6}\s+.+$|^```[\s\S]*?^```$|^[-*+]\s+.+$|^\d+\.\s+.+$)/gm;

  const sections: string[] = [];
  let lastIndex = 0;

  // 구조적 섹션 추출 (원본 그대로 유지)
  text.replace(structureRegex, (match, _, offset) => {
    if (offset > lastIndex) {
      const beforeSection = text.slice(lastIndex, offset);
      if (beforeSection) {
        sections.push(beforeSection);
      }
    }
    sections.push(match);
    lastIndex = offset + match.length;
    return match;
  });

  // 마지막 섹션 추가
  if (lastIndex < text.length) {
    const lastSection = text.slice(lastIndex);
    if (lastSection) {
      sections.push(lastSection);
    }
  }

  // 섹션을 청크로 그룹화
  let currentChunk = '';
  let overlapBuffer: string[] = [];

  for (const section of sections) {
    // 빈 섹션은 건너뛰되, 공백은 유지
    if (!section) {
      continue;
    }

    if (currentChunk.length + section.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());

      // Overlap 처리 (원본 그대로 연결)
      const overlapText = overlapBuffer.join('');
      currentChunk = overlapText + section;
      overlapBuffer = [section];
    } else {
      currentChunk += section;
      overlapBuffer.push(section);

      while (overlapBuffer.join('').length > chunkOverlap && overlapBuffer.length > 1) {
        overlapBuffer.shift();
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // 구조가 없으면 sentence 방식으로 폴백
  return chunks.length > 0 ? chunks : chunkTextSentence(text, chunkSize, chunkOverlap);
}

/**
 * Token-based 청킹 (LLM 토큰 기준)
 * 장점: 가장 정확한 LLM 호환성
 * 단점: tiktoken 의존성 필요 (향후 구현)
 *
 * 현재는 character-based로 폴백
 */
function chunkTextToken(text: string, chunkSize: number, chunkOverlap: number): string[] {
  // TODO: tiktoken 또는 LLM tokenizer 통합
  // 현재는 sentence-based로 폴백 (character보다 나음)
  logger.warn(
    '[Chunking] Token-based chunking not yet implemented. Falling back to sentence-based.',
    {
      chunkSize,
      chunkOverlap,
    }
  );
  return chunkTextSentence(text, chunkSize, chunkOverlap);
}

/**
 * 텍스트 청킹 (전략 선택 가능)
 */
export function chunkText(
  text: string,
  chunkSize: number,
  chunkOverlap: number,
  strategy: ChunkStrategy = 'sentence'
): string[] {
  switch (strategy) {
    case 'character':
      return chunkTextCharacter(text, chunkSize, chunkOverlap);
    case 'sentence':
      return chunkTextSentence(text, chunkSize, chunkOverlap);
    case 'structure':
      return chunkTextStructure(text, chunkSize, chunkOverlap);
    case 'token':
      return chunkTextToken(text, chunkSize, chunkOverlap);
    default:
      logger.warn('[Chunking] Unknown strategy. Falling back to sentence.', { strategy });
      return chunkTextSentence(text, chunkSize, chunkOverlap);
  }
}

/**
 * Raw 문서를 청크로 분할 (Parent Document Retrieval 지원)
 */
export function chunkDocuments(documents: RawDocument[], options: IndexingOptions): RawDocument[] {
  const chunkedDocs: RawDocument[] = [];
  const strategy = options.chunkStrategy || 'sentence';
  const storeParent = options.storeParentDocument !== false; // 기본값 true

  for (const doc of documents) {
    const chunks = chunkText(doc.content, options.chunkSize, options.chunkOverlap, strategy);

    // Parent Document Retrieval: 원본 문서 전체를 별도로 저장
    if (storeParent && chunks.length > 1) {
      // 원본 문서는 검색되지 않지만 참조용으로 저장
      const parentDocId = `${doc.id}_parent`;
      chunkedDocs.push({
        id: parentDocId,
        content: doc.content, // 전체 원본 내용
        metadata: {
          ...doc.metadata,
          isParentDoc: true, // 원본 문서 표시
          originalId: doc.id,
          totalChunks: chunks.length,
          chunkStrategy: strategy,
          // 문서 컨텍스트 (선택적)
          documentContext: options.addDocumentContext
            ? `문서 "${doc.metadata.title || 'Untitled'}"의 전체 내용 (${chunks.length}개 청크로 분할됨)`
            : undefined,
        },
      });
    }

    // 청크 생성 (개선된 메타데이터)
    chunks.forEach((chunk, index) => {
      const parentDocId = storeParent && chunks.length > 1 ? `${doc.id}_parent` : undefined;

      chunkedDocs.push({
        id: `${doc.id}_chunk_${index}`,
        content: chunk,
        metadata: {
          ...doc.metadata,
          originalId: doc.id,
          parentDocId, // 원본 문서 참조
          chunkIndex: index,
          totalChunks: chunks.length,
          chunkStrategy: strategy,
          // Contextual Enhancement: 각 청크에 문서 컨텍스트 추가
          documentContext: options.addDocumentContext
            ? `이 청크는 "${doc.metadata.title || 'Untitled'}" 문서의 ${index + 1}/${chunks.length} 부분입니다.`
            : undefined,
        },
      });
    });
  }

  return chunkedDocs;
}

/**
 * 문서 인덱싱
 */
export async function indexDocuments(
  vectorDB: VectorDB,
  embedder: EmbeddingProvider,
  documents: RawDocument[],
  options: IndexingOptions
): Promise<void> {
  logger.info('Indexing documents', { documentCount: documents.length });

  // 1. 문서 청킹
  const chunkedDocs = chunkDocuments(documents, options);
  logger.info('Chunking complete', { chunkCount: chunkedDocs.length });

  // 2. 배치 처리
  const batches: RawDocument[][] = [];
  for (let i = 0; i < chunkedDocs.length; i += options.batchSize) {
    batches.push(chunkedDocs.slice(i, i + options.batchSize));
  }

  logger.info('Processing batches', { batchCount: batches.length });

  // 3. 각 배치 임베딩 및 삽입
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    logger.debug(`Processing batch ${i + 1}/${batches.length}`, { chunkCount: batch.length });

    // 임베딩 생성
    const texts = batch.map((doc) => doc.content);
    const embeddings = await embedder.embedBatch(texts);

    // VectorDocument 생성
    const vectorDocs: VectorDocument[] = batch.map((doc, index) => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata,
      embedding: embeddings[index],
    }));

    // 삽입
    await vectorDB.insert(vectorDocs);
  }

  logger.info('Indexing complete');
}

/**
 * 쿼리 검색
 */
export async function searchDocuments(
  vectorDB: VectorDB,
  embedder: EmbeddingProvider,
  query: string,
  k: number = 5
): Promise<SearchResult[]> {
  // 쿼리 임베딩
  const queryEmbedding = await embedder.embed(query);

  // 벡터 검색
  const results = await vectorDB.searchByVector(queryEmbedding, k);

  return results;
}
