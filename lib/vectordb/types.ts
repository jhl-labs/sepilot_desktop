/**
 * Vector DB 타입 정의
 */

/**
 * 지원하는 벡터 DB 타입
 */
export type VectorDBType = 'sqlite-vec' | 'opensearch' | 'elasticsearch' | 'pgvector';

/**
 * 문서 인터페이스
 */
export interface VectorDocument {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embedding?: number[];
}

/**
 * 검색 결과
 */
export interface SearchResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  score: number;
}

/**
 * VectorDB 설정
 */
export interface VectorDBConfig {
  type: VectorDBType;

  // SQLite-vec용
  dbPath?: string;

  // OpenSearch/Elasticsearch용
  host?: string;
  port?: number;
  username?: string;
  password?: string;

  // pgvector용
  connectionString?: string;

  // 공통
  indexName: string;
  dimension: number;
}

/**
 * Embedding 설정
 */
export interface EmbeddingConfig {
  provider: 'openai' | 'local';
  apiKey?: string;
  baseURL?: string;
  model?: string;
  dimension: number;
  networkConfig?: any; // LLMConfig['network'] 타입, 순환 참조 방지를 위해 any 사용
}

/**
 * 인덱싱 옵션
 */
export interface IndexingOptions {
  chunkSize: number;
  chunkOverlap: number;
  batchSize: number;
}

/**
 * Raw 문서 (인덱싱 전)
 */
export interface RawDocument {
  id: string;
  content: string;
  metadata: Record<string, any>;
}
