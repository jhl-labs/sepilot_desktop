/**
 * Embedding Provider 인터페이스
 */
export abstract class EmbeddingProvider {
  /**
   * 단일 텍스트 임베딩
   */
  abstract embed(text: string): Promise<number[]>;

  /**
   * 배치 텍스트 임베딩
   */
  abstract embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * 임베딩 차원
   */
  abstract getDimension(): number;

  /**
   * 설정 검증
   */
  abstract validate(): Promise<boolean>;
}
