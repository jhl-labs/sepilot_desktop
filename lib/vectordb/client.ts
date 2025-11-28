import { VectorDB } from './interface';
import { VectorDBConfig, VectorDocument } from './types';
import { isElectron } from '@/lib/platform';

/**
 * VectorDB Client Singleton
 * Electron 환경에서는 IPC를 통해 Main 프로세스에서 VectorDB를 관리합니다.
 */
class VectorDBClientClass {
  private db: VectorDB | null = null;
  private config: VectorDBConfig | null = null;
  private initialized: boolean = false;

  async initialize(config: VectorDBConfig): Promise<void> {
    this.config = config;

    // Electron 환경에서 SQLite-vec는 Main 프로세스에서 처리
    if (isElectron() && config.type === 'sqlite-vec') {
      if (typeof window !== 'undefined' && window.electronAPI?.vectorDB) {
        const result = await window.electronAPI.vectorDB.initialize({
          indexName: config.indexName,
          dimension: config.dimension,
        });

        if (!result.success) {
          throw new Error(result.error || 'VectorDB 초기화 실패');
        }

        this.initialized = true;
        console.log('VectorDB initialized via IPC:', config.type);
        return;
      }
    }

    // 브라우저 환경 또는 다른 타입의 VectorDB
    switch (config.type) {
      case 'sqlite-vec': {
        // SQLite-vec는 Node.js 환경에서만 동작
        if (typeof window !== 'undefined') {
          console.warn('SQLite-vec는 브라우저에서 사용할 수 없습니다. 설정만 저장됩니다.');
          this.initialized = false;
          return;
        }
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
    this.initialized = true;

    console.log('VectorDB initialized:', config.type);
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      await this.db.disconnect();
      this.db = null;
    }
    this.config = null;
    this.initialized = false;
  }

  getDB(): VectorDB {
    if (!this.db && !this.initialized) {
      throw new Error(
        'VectorDB not initialized. Please configure VectorDB in Settings > VectorDB tab first.'
      );
    }
    if (!this.db) {
      // Electron IPC 모드에서는 db가 null이지만 initialized는 true
      throw new Error('VectorDB is in IPC mode. Use IPC methods directly.');
    }
    return this.db;
  }

  isConfigured(): boolean {
    return this.initialized || this.db !== null;
  }

  /**
   * VectorDB가 초기화되었는지 확인 (IPC 모드 포함)
   */
  isInitialized(): boolean {
    return this.initialized;
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
 * Electron 환경에서는 IPC를 통해 Main 프로세스에서 가져옵니다.
 */
export async function getAllDocuments(): Promise<VectorDocument[]> {
  // Electron 환경: IPC를 통해 Main 프로세스에서 가져옴
  if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.vectorDB) {
    const result = await window.electronAPI.vectorDB.getAll();

    if (!result.success) {
      throw new Error(result.error || '문서 목록 로드 실패');
    }

    return result.data || [];
  }

  // 브라우저 환경: 직접 VectorDB 클라이언트 사용
  const db = VectorDBClient.getDB();
  return await db.getAll();
}

/**
 * 문서 삭제하기
 * Electron 환경에서는 IPC를 통해 Main 프로세스에서 삭제합니다.
 */
export async function deleteDocuments(ids: string[]): Promise<void> {
  // Electron 환경: IPC를 통해 Main 프로세스에서 삭제
  if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.vectorDB) {
    const result = await window.electronAPI.vectorDB.delete(ids);

    if (!result.success) {
      throw new Error(result.error || '문서 삭제 실패');
    }

    return;
  }

  // 브라우저 환경: 직접 VectorDB 클라이언트 사용
  const db = VectorDBClient.getDB();
  await db.delete(ids);
}
