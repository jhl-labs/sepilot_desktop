import { VectorDB } from './interface';
import { VectorDBConfig } from './types';

/**
 * VectorDB Client Singleton
 */
class VectorDBClientClass {
  private db: VectorDB | null = null;
  private config: VectorDBConfig | null = null;

  async initialize(config: VectorDBConfig): Promise<void> {
    this.config = config;

    switch (config.type) {
      case 'sqlite-vec': {
        // Dynamic import to prevent better-sqlite3 from being bundled in client
        const { SQLiteVecAdapter } = await import('./adapters/sqlite-vec');
        this.db = new SQLiteVecAdapter(config);
        break;
      }

      case 'opensearch':
        // TODO: OpenSearch 어댑터 구현
        throw new Error('OpenSearch adapter not yet implemented');

      case 'elasticsearch':
        // TODO: Elasticsearch 어댑터 구현
        throw new Error('Elasticsearch adapter not yet implemented');

      case 'pgvector':
        // TODO: pgvector 어댑터 구현
        throw new Error('pgvector adapter not yet implemented');

      default:
        throw new Error(`Unknown vector DB type: ${config.type}`);
    }

    // 연결
    await this.db.connect();

    console.log('VectorDB initialized:', config.type);
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      await this.db.disconnect();
      this.db = null;
      this.config = null;
    }
  }

  getDB(): VectorDB {
    if (!this.db) {
      throw new Error(
        'VectorDB not initialized. Please configure VectorDB in Settings > VectorDB tab first.'
      );
    }
    return this.db;
  }

  isConfigured(): boolean {
    return this.db !== null;
  }

  /**
   * VectorDB를 안전하게 가져오기 (초기화되지 않았으면 null 반환)
   */
  getDBSafe(): VectorDB | null {
    return this.db;
  }

  getConfig(): VectorDBConfig | null {
    return this.config;
  }
}

export const VectorDBClient = new VectorDBClientClass();

/**
 * VectorDB 초기화 헬퍼
 */
export async function initializeVectorDB(config: VectorDBConfig): Promise<void> {
  await VectorDBClient.initialize(config);
}

/**
 * VectorDB 가져오기
 */
export function getVectorDB(): VectorDB {
  return VectorDBClient.getDB();
}

/**
 * 모든 문서 가져오기
 */
export async function getAllDocuments() {
  const db = VectorDBClient.getDB();
  return await db.getAll();
}
