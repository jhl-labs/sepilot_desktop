/**
 * VectorDB 통합 - 메인 엔트리 포인트
 */

export * from './types';
export * from './interface';
export * from './client';
export * from './indexing';

export * from './embeddings/interface';
export * from './embeddings/client';
export * from './embeddings/openai';

// Note: sqlite-vec adapter is NOT exported here to prevent
// better-sqlite3 from being included in client bundle.
// Import it directly in server-side code only:
// import { SQLiteVecAdapter } from '@/lib/domains/rag/adapters/sqlite-vec';
