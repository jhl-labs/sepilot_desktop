import { VectorDB } from './interface';
import { EmbeddingProvider } from './embeddings/interface';
import { RawDocument, VectorDocument, IndexingOptions } from './types';

/**
 * 텍스트 청킹 (간단한 구현)
 */
export function chunkText(text: string, chunkSize: number, chunkOverlap: number): string[] {
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
 * Raw 문서를 청크로 분할
 */
export function chunkDocuments(documents: RawDocument[], options: IndexingOptions): RawDocument[] {
  const chunkedDocs: RawDocument[] = [];

  for (const doc of documents) {
    const chunks = chunkText(doc.content, options.chunkSize, options.chunkOverlap);

    chunks.forEach((chunk, index) => {
      chunkedDocs.push({
        id: `${doc.id}_chunk_${index}`,
        content: chunk,
        metadata: {
          ...doc.metadata,
          originalId: doc.id,
          chunkIndex: index,
          totalChunks: chunks.length,
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
  console.log(`Indexing ${documents.length} documents...`);

  // 1. 문서 청킹
  const chunkedDocs = chunkDocuments(documents, options);
  console.log(`Created ${chunkedDocs.length} chunks`);

  // 2. 배치 처리
  const batches: RawDocument[][] = [];
  for (let i = 0; i < chunkedDocs.length; i += options.batchSize) {
    batches.push(chunkedDocs.slice(i, i + options.batchSize));
  }

  console.log(`Processing ${batches.length} batches...`);

  // 3. 각 배치 임베딩 및 삽입
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} chunks)...`);

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

  console.log('Indexing complete!');
}

/**
 * 쿼리 검색
 */
export async function searchDocuments(
  vectorDB: VectorDB,
  embedder: EmbeddingProvider,
  query: string,
  k: number = 5
) {
  // 쿼리 임베딩
  const queryEmbedding = await embedder.embed(query);

  // 벡터 검색
  const results = await vectorDB.searchByVector(queryEmbedding, k);

  return results;
}
