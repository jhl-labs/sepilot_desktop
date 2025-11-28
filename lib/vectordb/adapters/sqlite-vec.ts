import { VectorDB } from '../interface';
import { VectorDocument, SearchResult, VectorDBConfig } from '../types';

/**
 * SQLite-vec Adapter
 *
 * Electron IPC를 통해 main process의 VectorDB 서비스 사용
 */
export class SQLiteVecAdapter extends VectorDB {
  private initialized: boolean = false;

  constructor(config: VectorDBConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    // Electron 환경 확인
    if (typeof window === 'undefined' || !window.electronAPI?.vectorDB) {
      throw new Error('SQLite-vec는 Electron 환경에서만 사용 가능합니다.');
    }

    // VectorDB 초기화
    const result = await window.electronAPI.vectorDB.initialize({
      indexName: this.config.indexName,
      dimension: this.config.dimension,
    });

    if (!result.success) {
      throw new Error(result.error || 'VectorDB 초기화 실패');
    }

    this.initialized = true;
    console.log('SQLite-vec connected via IPC');
  }

  async disconnect(): Promise<void> {
    this.initialized = false;
    console.log('SQLite-vec disconnected');
  }

  async createIndex(name: string, dimension: number): Promise<void> {
    if (!window.electronAPI?.vectorDB) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.vectorDB.createIndex(name, dimension);

    if (!result.success) {
      throw new Error(result.error || 'Failed to create index');
    }
  }

  async deleteIndex(name: string): Promise<void> {
    if (!window.electronAPI?.vectorDB) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.vectorDB.deleteIndex(name);

    if (!result.success) {
      throw new Error(result.error || 'Failed to delete index');
    }
  }

  async indexExists(name: string): Promise<boolean> {
    if (!window.electronAPI?.vectorDB) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.vectorDB.indexExists(name);

    if (!result.success) {
      throw new Error(result.error || 'Failed to check index existence');
    }

    return result.data ?? false;
  }

  async insert(documents: VectorDocument[]): Promise<void> {
    if (!window.electronAPI?.vectorDB) {
      throw new Error('Electron API not available');
    }

    // Convert VectorDocument to Electron API format
    const electronDocs = documents.map(doc => ({
      id: doc.id,
      content: doc.content,
      embedding: doc.embedding || [],
      metadata: doc.metadata || {},
    }));

    const result = await window.electronAPI.vectorDB.insert(electronDocs);

    if (!result.success) {
      throw new Error(result.error || 'Failed to insert documents');
    }
  }

  async searchByVector(queryEmbedding: number[], k: number): Promise<SearchResult[]> {
    if (!window.electronAPI?.vectorDB) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.vectorDB.search(queryEmbedding, k);

    if (!result.success) {
      throw new Error(result.error || 'Failed to search documents');
    }

    // Convert Electron API format to SearchResult
    const searchResults = (result.data ?? []).map(doc => ({
      id: doc.id,
      content: doc.text || '',
      metadata: doc.metadata ?? {},
      score: doc.score,
    }));

    return searchResults;
  }

  async delete(ids: string[]): Promise<void> {
    if (!window.electronAPI?.vectorDB) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.vectorDB.delete(ids);

    if (!result.success) {
      throw new Error(result.error || 'Failed to delete documents');
    }
  }

  async count(): Promise<number> {
    if (!window.electronAPI?.vectorDB) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.vectorDB.count();

    if (!result.success) {
      throw new Error(result.error || 'Failed to get document count');
    }

    return result.data ?? 0;
  }

  async getAll(): Promise<VectorDocument[]> {
    if (!window.electronAPI?.vectorDB) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.vectorDB.getAll();

    if (!result.success) {
      throw new Error(result.error || 'Failed to get all documents');
    }

    // Convert Electron API format to VectorDocument
    const documents = (result.data || []).map(doc => ({
      id: doc.id,
      content: doc.content || '',
      metadata: doc.metadata ?? {},
      embedding: doc.embedding,
    }));

    return documents;
  }
}
