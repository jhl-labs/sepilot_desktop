import { VectorDocument, SearchResult, VectorDBConfig } from './types';

/**
 * VectorDB 추상 인터페이스
 *
 * 모든 벡터 DB 어댑터가 구현해야 하는 표준 인터페이스
 */
export abstract class VectorDB {
  protected config: VectorDBConfig;

  constructor(config: VectorDBConfig) {
    this.config = config;
  }

  /**
   * DB 연결
   */
  abstract connect(): Promise<void>;

  /**
   * DB 연결 해제
   */
  abstract disconnect(): Promise<void>;

  /**
   * 인덱스 생성
   */
  abstract createIndex(name: string, dimension: number): Promise<void>;

  /**
   * 인덱스 삭제
   */
  abstract deleteIndex(name: string): Promise<void>;

  /**
   * 인덱스 존재 여부 확인
   */
  abstract indexExists(name: string): Promise<boolean>;

  /**
   * 문서 삽입
   */
  abstract insert(documents: VectorDocument[]): Promise<void>;

  /**
   * 벡터 검색 (쿼리 임베딩으로)
   */
  abstract searchByVector(queryEmbedding: number[], k: number): Promise<SearchResult[]>;

  /**
   * 문서 삭제
   */
  abstract delete(ids: string[]): Promise<void>;

  /**
   * 인덱스의 문서 개수
   */
  abstract count(): Promise<number>;

  /**
   * 모든 문서 가져오기
   */
  abstract getAll(): Promise<VectorDocument[]>;
}
