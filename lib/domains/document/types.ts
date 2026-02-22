/**
 * 문서 소스 타입
 */
export type DocumentSourceType = 'manual' | 'http' | 'github';

/**
 * 문서 소스 설정
 */
export interface DocumentSource {
  type: DocumentSourceType;

  // HTTP 문서용
  url?: string;

  // GitHub Repo용
  repoUrl?: string;
  path?: string;
  branch?: string;
  token?: string;
}

/**
 * 가져온 문서 데이터
 */
export interface FetchedDocument {
  content: string;
  metadata: Record<string, any>;
}
