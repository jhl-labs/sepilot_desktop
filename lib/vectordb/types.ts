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
 * 특수 문서 타입
 */
export type SpecialDocumentType = 'folder' | 'normal';

/**
 * 문서 메타데이터 확장 (Tree 구조용)
 */
export interface DocumentMetadata {
  title?: string;
  source?: string;
  uploadedAt?: string;
  cleaned?: boolean;
  originalId?: string;
  chunkIndex?: number;
  _chunks?: Array<{ index: number; content: string }>;

  // Tree 구조용 필드
  parentId?: string | null; // 부모 문서 ID (null이면 루트)
  folderPath?: string; // 폴더 경로 (예: "프로젝트/API문서")
  tags?: string[]; // 태그 배열
  category?: string; // 카테고리
  order?: number; // 정렬 순서

  // 특수 문서 타입 (빈 폴더 등)
  _docType?: SpecialDocumentType; // 'folder' | 'normal' (기본값: 'normal')
}

/**
 * Tree 노드 (UI 표시용)
 */
export interface DocumentTreeNode {
  id: string;
  type: 'folder' | 'document';
  name: string;
  document?: VectorDocument; // type이 'document'인 경우에만 존재
  children?: DocumentTreeNode[];
  isExpanded?: boolean;
  parentId?: string | null;
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
 * 청킹 전략
 */
export type ChunkStrategy = 'character' | 'sentence' | 'structure' | 'token';

/**
 * 인덱싱 옵션
 */
export interface IndexingOptions {
  chunkSize: number;
  chunkOverlap: number;
  batchSize: number;
  chunkStrategy?: ChunkStrategy; // 청킹 전략 (기본값: 'sentence')
}

/**
 * Raw 문서 (인덱싱 전)
 */
export interface RawDocument {
  id: string;
  content: string;
  metadata: Record<string, any>;
}

/**
 * Export/Import용 문서 포맷
 */
export interface ExportedDocument {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embedding?: number[];
}

/**
 * Export 데이터 포맷
 */
export interface ExportData {
  version: string;
  exportedAt: string;
  documents: ExportedDocument[];
  totalCount: number;
}
