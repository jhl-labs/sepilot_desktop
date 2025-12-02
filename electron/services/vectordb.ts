import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import {
  VectorDocument,
  SearchResult,
  RawDocument,
  IndexingOptions,
} from '../../lib/vectordb/types';
import { chunkDocuments } from '../../lib/vectordb/indexing';
import { getEmbeddingProvider } from '../../lib/vectordb/embeddings/client';

interface VectorDBServiceConfig {
  indexName: string;
  dimension: number;
}

class VectorDBService {
  private db: Database | null = null;
  private dbPath: string = '';
  private config: VectorDBServiceConfig | null = null;

  /**
   * 인덱스/테이블 이름 검증 (SQL Injection 방지)
   */
  private validateIndexName(name: string): void {
    // 영문자, 숫자, 언더스코어만 허용 (첫 글자는 영문자 또는 언더스코어)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(
        `Invalid index name: "${name}". Only alphanumeric characters and underscores are allowed.`
      );
    }
    // 예약어 체크
    const reservedWords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'TABLE'];
    if (reservedWords.includes(name.toUpperCase())) {
      throw new Error(`Index name cannot be a SQL reserved word: "${name}"`);
    }
  }

  async initialize(config: VectorDBServiceConfig) {
    // 인덱스 이름 검증
    this.validateIndexName(config.indexName);
    this.config = config;

    const userDataPath = app.getPath('userData');

    // Ensure userData directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    this.dbPath = path.join(userDataPath, 'vectors.db');

    console.log('[VectorDB] Initializing database at:', this.dbPath);

    const SQL = await initSqlJs({
      locateFile: (file) => {
        // In production, the wasm file should be in the app's resources
        // In development, use node_modules from project root
        const isDev = !app.isPackaged;

        if (isDev) {
          // Development: use node_modules from project root
          return path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file);
        } else {
          // Production: WASM file is bundled in node_modules by electron-builder
          const possiblePaths = [
            path.join(
              process.resourcesPath,
              'app.asar.unpacked',
              'node_modules',
              'sql.js',
              'dist',
              file
            ),
            path.join(process.resourcesPath, 'app', 'node_modules', 'sql.js', 'dist', file),
            path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file),
          ];

          for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
              console.log('[VectorDB] Found WASM file at:', testPath);
              return testPath;
            }
          }

          // Fallback to default
          console.warn('[VectorDB] WASM file not found, using default path');
          return path.join(
            process.resourcesPath,
            'app.asar.unpacked',
            'node_modules',
            'sql.js',
            'dist',
            file
          );
        }
      },
    });

    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    // Create index table
    await this.createIndex(config.indexName, config.dimension);
    this.saveDatabase();

    console.log('[VectorDB] Initialized successfully');
  }

  private saveDatabase() {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  async createIndex(name: string, dimension: number): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    // 인덱스 이름 검증 (SQL Injection 방지)
    this.validateIndexName(name);

    // 테이블 생성
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${name} (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL,
        embedding TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // 인덱스 생성
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_${name}_created_at ON ${name}(created_at)
    `);

    this.saveDatabase();
    console.log(`[VectorDB] Created index: ${name} (dimension: ${dimension})`);
  }

  async deleteIndex(name: string): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    // 인덱스 이름 검증 (SQL Injection 방지)
    this.validateIndexName(name);

    this.db.exec(`DROP TABLE IF EXISTS ${name}`);
    this.saveDatabase();
    console.log(`[VectorDB] Deleted index: ${name}`);
  }

  async indexExists(name: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not connected');

    const result = this.db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [
      name,
    ]);

    return result.length > 0 && result[0].values.length > 0;
  }

  async insert(documents: VectorDocument[]): Promise<void> {
    if (!this.db || !this.config) throw new Error('Database not initialized');

    const indexName = this.config.indexName;

    // 인덱스가 없으면 생성
    if (!(await this.indexExists(indexName))) {
      await this.createIndex(indexName, this.config.dimension);
    }

    for (const doc of documents) {
      if (!doc.embedding) {
        throw new Error(`Document ${doc.id} has no embedding`);
      }

      this.db.run(
        `INSERT OR REPLACE INTO ${indexName} (id, content, metadata, embedding, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          doc.id,
          doc.content,
          JSON.stringify(doc.metadata),
          JSON.stringify(doc.embedding),
          Date.now(),
        ]
      );
    }

    this.saveDatabase();
    console.log(`[VectorDB] Inserted ${documents.length} documents into ${indexName}`);
  }

  async searchByVector(queryEmbedding: number[], k: number): Promise<SearchResult[]> {
    if (!this.db || !this.config) throw new Error('Database not initialized');

    const indexName = this.config.indexName;

    // 모든 문서 가져오기
    const result = this.db.exec(`SELECT id, content, metadata, embedding FROM ${indexName}`);

    if (result.length === 0) return [];

    const rows = result[0].values;
    const totalDocs = rows.length;

    // 최적화 전략: 문서 수에 따라 다른 알고리즘 사용
    // 소량(k*2 이하): 전체 정렬이 더 빠름
    // 대량: Min-Heap 기반 Top-K 추출로 메모리 효율성 향상
    if (totalDocs <= k * 2) {
      // 소량 문서: 전체 정렬
      const results: SearchResult[] = [];
      for (const row of rows) {
        const embedding = JSON.parse(row[3] as string);
        const similarity = this.cosineSimilarity(queryEmbedding, embedding);

        results.push({
          id: row[0] as string,
          content: row[1] as string,
          metadata: JSON.parse(row[2] as string),
          score: similarity,
        });
      }

      results.sort((a, b) => b.score - a.score);
      return results.slice(0, k);
    }

    // 대량 문서: Min-Heap 기반 Top-K 추출
    const topK: SearchResult[] = [];
    let minScore = -Infinity;

    for (const row of rows) {
      const embedding = JSON.parse(row[3] as string);
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);

      if (topK.length < k) {
        // k개 미만일 때는 무조건 추가
        topK.push({
          id: row[0] as string,
          content: row[1] as string,
          metadata: JSON.parse(row[2] as string),
          score: similarity,
        });

        if (topK.length === k) {
          // k개가 채워지면 정렬하고 최소값 캐시
          topK.sort((a, b) => b.score - a.score);
          minScore = topK[k - 1].score;
        }
      } else if (similarity > minScore) {
        // 현재 최소값보다 높은 점수만 처리 (조기 종료 최적화)
        topK[k - 1] = {
          id: row[0] as string,
          content: row[1] as string,
          metadata: JSON.parse(row[2] as string),
          score: similarity,
        };

        // 삽입 정렬 (부분 정렬에 효율적)
        let i = k - 1;
        while (i > 0 && topK[i].score > topK[i - 1].score) {
          [topK[i], topK[i - 1]] = [topK[i - 1], topK[i]];
          i--;
        }
        minScore = topK[k - 1].score;
      }
      // else: 점수가 minScore 이하면 스킵 (성능 향상)
    }

    return topK;
  }

  async delete(ids: string[]): Promise<void> {
    if (!this.db || !this.config) throw new Error('Database not initialized');

    const indexName = this.config.indexName;

    for (const id of ids) {
      this.db.run(`DELETE FROM ${indexName} WHERE id = ?`, [id]);
    }

    this.saveDatabase();
    console.log(`[VectorDB] Deleted ${ids.length} documents from ${indexName}`);
  }

  async updateMetadata(id: string, metadata: Record<string, any>): Promise<void> {
    if (!this.db || !this.config) throw new Error('Database not initialized');

    const indexName = this.config.indexName;

    this.db.run(`UPDATE ${indexName} SET metadata = ? WHERE id = ?`, [
      JSON.stringify(metadata),
      id,
    ]);

    this.saveDatabase();
    console.log(`[VectorDB] Updated metadata for document ${id}`);
  }

  async count(): Promise<number> {
    if (!this.db || !this.config) throw new Error('Database not initialized');

    const indexName = this.config.indexName;

    const result = this.db.exec(`SELECT COUNT(*) as count FROM ${indexName}`);

    if (result.length === 0 || result[0].values.length === 0) return 0;

    return result[0].values[0][0] as number;
  }

  async getAllDocuments(): Promise<VectorDocument[]> {
    if (!this.db || !this.config) throw new Error('Database not initialized');

    const indexName = this.config.indexName;

    const result = this.db.exec(
      `SELECT id, content, metadata, embedding, created_at FROM ${indexName} ORDER BY created_at DESC`
    );

    if (result.length === 0) return [];

    const documents: VectorDocument[] = [];
    for (const row of result[0].values) {
      documents.push({
        id: row[0] as string,
        content: row[1] as string,
        metadata: JSON.parse(row[2] as string),
        embedding: JSON.parse(row[3] as string),
      });
    }

    return documents;
  }

  /**
   * 문서 인덱싱 (청킹 + 임베딩 + 삽입)
   */
  async indexDocuments(documents: RawDocument[], options: IndexingOptions): Promise<void> {
    console.log(`[VectorDB] Indexing ${documents.length} documents...`);

    // Embedding Provider 가져오기
    const embedder = getEmbeddingProvider();

    // 1. 문서 청킹
    const chunkedDocs = chunkDocuments(documents, options);
    console.log(`[VectorDB] Created ${chunkedDocs.length} chunks`);

    // 2. 배치 처리
    const batches: RawDocument[][] = [];
    for (let i = 0; i < chunkedDocs.length; i += options.batchSize) {
      batches.push(chunkedDocs.slice(i, i + options.batchSize));
    }

    console.log(`[VectorDB] Processing ${batches.length} batches...`);

    // 3. 각 배치 임베딩 및 삽입
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      console.log(
        `[VectorDB] Processing batch ${i + 1}/${batches.length} (${batch.length} chunks)...`
      );

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
      await this.insert(vectorDocs);
    }

    console.log('[VectorDB] Indexing complete!');
  }

  /**
   * 코사인 유사도 계산
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);

    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  close() {
    if (this.db) {
      this.saveDatabase();
      this.db.close();
      this.db = null;
      console.log('[VectorDB] Closed');
    }
  }
}

// Singleton instance
export const vectorDBService = new VectorDBService();
