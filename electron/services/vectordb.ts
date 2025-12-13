import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import {
  VectorDocument,
  SearchResult,
  RawDocument,
  IndexingOptions,
  SearchOptions,
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

  async searchByVector(
    queryEmbedding: number[],
    k: number,
    options?: SearchOptions,
    queryText?: string
  ): Promise<SearchResult[]> {
    if (!this.db || !this.config) throw new Error('Database not initialized');

    const indexName = this.config.indexName;

    // 옵션 기본값 설정
    const opts: Required<SearchOptions> = {
      folderPath: options?.folderPath || '',
      tags: options?.tags || [],
      category: options?.category || '',
      source: options?.source || '',
      docGroup: options?.docGroup || 'all',
      folderPathBoost: options?.folderPathBoost ?? 0.2,
      titleBoost: options?.titleBoost ?? 0.3,
      tagBoost: options?.tagBoost ?? 0.15,
      useHybridSearch: options?.useHybridSearch ?? true,
      hybridAlpha: options?.hybridAlpha ?? 0.7,
      includeAllMetadata: options?.includeAllMetadata ?? true,
      recentBoost: options?.recentBoost ?? false,
      recentBoostDecay: options?.recentBoostDecay ?? 30,
    };

    // 모든 문서 가져오기
    const result = this.db.exec(
      `SELECT id, content, metadata, embedding, created_at FROM ${indexName}`
    );

    if (result.length === 0) return [];

    const rows = result[0].values;
    console.log(
      `[VectorDB] Total documents in DB: ${rows.length}, docGroup filter: ${opts.docGroup}`
    );

    // 전체 문서의 docGroup 및 isParentDoc 분포
    const allDocGroupCount: Record<string, { total: number; parent: number; chunk: number }> = {};
    rows.forEach((row) => {
      const metadata = JSON.parse(row[2] as string);
      const docGroup = metadata.docGroup || 'personal';
      if (!allDocGroupCount[docGroup]) {
        allDocGroupCount[docGroup] = { total: 0, parent: 0, chunk: 0 };
      }
      allDocGroupCount[docGroup].total++;
      if (metadata.isParentDoc) {
        allDocGroupCount[docGroup].parent++;
      } else {
        allDocGroupCount[docGroup].chunk++;
      }
    });
    console.log('[VectorDB] Document distribution before filtering:', allDocGroupCount);

    // 1단계: 메타데이터 기반 필터링 (Parent 문서와 폴더 제외)
    let filteredOutCount = 0;
    let parentDocCount = 0;
    let folderDocCount = 0;
    const filteredRows = rows.filter((row) => {
      const metadata = JSON.parse(row[2] as string);

      // Parent 문서는 검색에서 제외 (참조용으로만 사용)
      if (metadata.isParentDoc) {
        parentDocCount++;
        if (parentDocCount <= 2) {
          console.log(
            `[VectorDB] Filtered out parent doc: ${metadata.title}, docGroup=${metadata.docGroup}`
          );
        }
        return false;
      }

      // 폴더 경로 필터
      if (opts.folderPath && metadata.folderPath !== opts.folderPath) {
        // 하위 폴더도 포함
        if (!metadata.folderPath?.startsWith(opts.folderPath + '/')) {
          return false;
        }
      }

      // 태그 필터
      if (opts.tags.length > 0) {
        const docTags = metadata.tags || [];
        if (!opts.tags.some((tag) => docTags.includes(tag))) {
          return false;
        }
      }

      // 카테고리 필터
      if (opts.category && metadata.category !== opts.category) {
        return false;
      }

      // 출처 필터
      if (opts.source && metadata.source !== opts.source) {
        return false;
      }

      // docGroup 필터 (personal, team, all)
      if (opts.docGroup && opts.docGroup !== 'all') {
        const docGroup = metadata.docGroup || 'personal'; // 기본값: personal
        if (opts.docGroup !== docGroup) {
          // 필터링 로그 (처음 5개만)
          if (filteredOutCount < 5) {
            console.log(
              `[VectorDB] Filtered out document: docGroup='${docGroup}' (filter='${opts.docGroup}'), title='${metadata.title}'`
            );
          }
          filteredOutCount++;
          return false;
        }
      }

      // 특수 문서 제외 (폴더 등)
      if (metadata._docType === 'folder') {
        folderDocCount++;
        return false;
      }

      return true;
    });

    console.log(`[VectorDB] After filtering: ${filteredRows.length} documents`);
    console.log(
      `[VectorDB] Filtered out: ${parentDocCount} parent docs, ${folderDocCount} folders, ${filteredOutCount} by docGroup`
    );

    // 필터링 후 docGroup 분포 확인
    const filteredDocGroupCount: Record<string, number> = {};
    filteredRows.forEach((row) => {
      const metadata = JSON.parse(row[2] as string);
      const docGroup = metadata.docGroup || 'personal';
      filteredDocGroupCount[docGroup] = (filteredDocGroupCount[docGroup] || 0) + 1;
    });
    console.log('[VectorDB] After filtering by docGroup:', filteredDocGroupCount);

    if (filteredRows.length > 0) {
      const sampleMetadata = JSON.parse(filteredRows[0][2] as string);
      console.log('[VectorDB] Sample document metadata:', {
        title: sampleMetadata.title,
        docGroup: sampleMetadata.docGroup,
        teamName: sampleMetadata.teamName,
        source: sampleMetadata.source,
      });
    }

    if (filteredRows.length === 0) return [];

    // 2단계: 벡터 유사도 + 하이브리드 검색 계산
    const chunkResults: Array<{
      id: string;
      content: string;
      metadata: any;
      score: number;
      parentDocId?: string;
    }> = [];

    for (const row of filteredRows) {
      const id = row[0] as string;
      const content = row[1] as string;
      const metadata = JSON.parse(row[2] as string);
      const embedding = JSON.parse(row[3] as string);
      const createdAt = row[4] as number;

      // 벡터 유사도 (코사인 유사도)
      const vectorScore = this.cosineSimilarity(queryEmbedding, embedding);

      // BM25 유사도 (키워드 기반)
      const bm25Score =
        opts.useHybridSearch && queryText
          ? this.calculateBM25Score(queryText, content, metadata)
          : 0;

      // 하이브리드 점수 계산
      let hybridScore = opts.useHybridSearch
        ? opts.hybridAlpha * vectorScore + (1 - opts.hybridAlpha) * bm25Score
        : vectorScore;

      // 3단계: 메타데이터 기반 점수 부스팅
      let boostMultiplier = 1.0;

      // 제목 키워드 매칭 (쿼리 텍스트로 키워드 체크)
      if (queryText && metadata.title && this.containsKeywords(metadata.title, queryText)) {
        boostMultiplier += opts.titleBoost;
      }

      // 폴더 경로 매칭
      if (
        metadata.folderPath &&
        opts.folderPath &&
        metadata.folderPath.startsWith(opts.folderPath)
      ) {
        boostMultiplier += opts.folderPathBoost;
      }

      // 태그 매칭
      if (opts.tags.length > 0 && metadata.tags) {
        const matchingTags = opts.tags.filter((tag) => metadata.tags.includes(tag));
        if (matchingTags.length > 0) {
          boostMultiplier += opts.tagBoost * (matchingTags.length / opts.tags.length);
        }
      }

      // 최신성 부스팅 (옵션)
      if (opts.recentBoost && createdAt) {
        const ageInDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
        const recencyFactor = Math.exp(-ageInDays / opts.recentBoostDecay);
        boostMultiplier += 0.1 * recencyFactor; // 최대 10% 부스팅
      }

      // 최종 점수 계산
      const finalScore = hybridScore * boostMultiplier;

      chunkResults.push({
        id,
        content,
        metadata,
        score: finalScore,
        parentDocId: metadata.parentDocId,
      });
    }

    // 4단계: Top-K 추출 (점수 기준 정렬)
    chunkResults.sort((a, b) => b.score - a.score);
    const topChunks = chunkResults.slice(0, k);

    // 5단계: Parent Document Retrieval - 청크 대신 원본 문서 반환
    const finalResults: SearchResult[] = [];

    for (const chunk of topChunks) {
      // Parent 문서가 있으면 가져오기
      if (chunk.parentDocId) {
        const parentDoc = await this.getById(chunk.parentDocId);

        if (parentDoc) {
          // 원본 문서 전체 내용 반환 (청크 대신)
          finalResults.push({
            id: chunk.id, // 원래 청크 ID 유지 (중복 제거용)
            content: parentDoc.content, // 원본 전체 내용
            metadata: {
              ...chunk.metadata,
              retrievedFrom: 'parent', // 원본 문서에서 가져왔음을 표시
              chunkScore: chunk.score, // 매칭된 청크의 점수
              matchedChunkIndex: chunk.metadata.chunkIndex, // 매칭된 청크 위치
            },
            score: chunk.score,
          });
          continue;
        }
      }

      // Parent가 없거나 찾지 못한 경우 청크 그대로 반환
      finalResults.push({
        id: chunk.id,
        content: chunk.content,
        metadata: opts.includeAllMetadata ? chunk.metadata : { title: chunk.metadata.title },
        score: chunk.score,
      });
    }

    // 최종 결과의 docGroup 분포 로그
    const finalDocGroupCount: Record<string, number> = {};
    finalResults.forEach((result) => {
      const docGroup = (result.metadata.docGroup as string) || 'personal';
      finalDocGroupCount[docGroup] = (finalDocGroupCount[docGroup] || 0) + 1;
    });
    console.log(`[VectorDB] Final search results by docGroup:`, finalDocGroupCount);
    console.log(`[VectorDB] Returning ${finalResults.length} documents (top ${k})`);

    return finalResults;
  }

  /**
   * 간단한 BM25 유사도 계산 (키워드 기반)
   * 실제 BM25는 복잡하지만, 여기서는 단순화된 버전 사용
   */
  private simpleBM25Score(
    content: string,
    metadata: Record<string, any>,
    _queryEmbedding: number[]
  ): number {
    // 임베딩에서 쿼리 텍스트를 추출할 수 없으므로,
    // 메타데이터와 컨텐츠의 길이 기반으로 간단한 점수 계산
    // 실제로는 쿼리 텍스트가 필요하므로, 향후 개선 필요

    // 제목과 컨텐츠 길이 기반 점수 (0.0 ~ 1.0)
    const titleLength = (metadata.title as string)?.length || 0;
    const contentLength = content.length;

    // 짧고 간결한 문서에 약간 더 높은 점수 (정보 밀도가 높을 가능성)
    const lengthScore = 1.0 / (1.0 + Math.log(contentLength + 1) / 10);

    return Math.min(lengthScore, 1.0);
  }

  /**
   * BM25 점수 계산 (키워드 기반 검색)
   * @param queryText 검색 쿼리 텍스트
   * @param content 문서 내용
   * @param metadata 문서 메타데이터
   * @returns BM25 점수 (0~1 정규화)
   */
  private calculateBM25Score(
    queryText: string,
    content: string,
    metadata: Record<string, any>
  ): number {
    const k1 = 1.5; // Term frequency saturation parameter
    const b = 0.75; // Length normalization parameter

    // 쿼리와 문서를 토큰화
    const queryTerms = this.tokenize(queryText);
    const docText = `${metadata.title || ''} ${content}`.toLowerCase();
    const docTerms = this.tokenize(docText);

    if (queryTerms.length === 0 || docTerms.length === 0) {
      return 0;
    }

    const docLength = docTerms.length;
    const avgDocLength = 100; // 평균 문서 길이 추정값

    let score = 0;

    // 각 쿼리 term에 대해 BM25 점수 계산
    for (const term of queryTerms) {
      // Term frequency (TF)
      const tf = docTerms.filter((t) => t === term).length;

      if (tf === 0) {
        continue;
      }

      // IDF는 단순화 (전체 문서 수를 모르므로 1.0으로 고정)
      const idf = 1.0;

      // BM25 공식
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));

      score += (idf * numerator) / denominator;
    }

    // 쿼리 term 수로 정규화하여 0~1 범위로 변환
    return Math.min(score / queryTerms.length, 1.0);
  }

  /**
   * 텍스트를 토큰으로 분할 (한글 지원)
   * @param text 토큰화할 텍스트
   * @returns 토큰 배열
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\sㄱ-ㅎ가-힣]/g, ' ') // 영문, 숫자, 한글만 유지
      .split(/\s+/)
      .filter((token) => token.length > 1); // 1글자 토큰 제거
  }

  /**
   * 키워드 포함 여부 체크
   * @param text 검사할 텍스트
   * @param queryText 쿼리 텍스트
   * @returns 키워드 포함 여부
   */
  private containsKeywords(text: string, queryText: string): boolean {
    const textLower = text.toLowerCase();
    const queryTerms = this.tokenize(queryText);
    return queryTerms.some((term) => textLower.includes(term));
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

  async getById(id: string): Promise<VectorDocument | null> {
    if (!this.db || !this.config) throw new Error('Database not initialized');

    const indexName = this.config.indexName;

    const result = this.db.exec(
      `SELECT id, content, metadata, embedding FROM ${indexName} WHERE id = ?`,
      [id]
    );

    if (result.length === 0 || result[0].values.length === 0) return null;

    const row = result[0].values[0];

    return {
      id: row[0] as string,
      content: row[1] as string,
      metadata: JSON.parse(row[2] as string),
      embedding: JSON.parse(row[3] as string),
    };
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
    let personalCount = 0;
    let teamCount = 0;
    for (const row of result[0].values) {
      const metadata = JSON.parse(row[2] as string);
      const docGroup = metadata.docGroup || 'personal';
      if (docGroup === 'team') teamCount++;
      else personalCount++;

      documents.push({
        id: row[0] as string,
        content: row[1] as string,
        metadata: metadata,
        embedding: JSON.parse(row[3] as string),
      });
    }

    console.log(
      `[VectorDB] getAllDocuments: Total ${documents.length} (personal: ${personalCount}, team: ${teamCount})`
    );

    return documents;
  }

  /**
   * 문서 인덱싱 (청킹 + 임베딩 + 삽입)
   */
  async indexDocuments(documents: RawDocument[], options: IndexingOptions): Promise<void> {
    console.log(`[VectorDB] Indexing ${documents.length} documents...`);

    // docGroup 분포 확인
    const docGroupCount: Record<string, number> = {};
    documents.forEach((doc) => {
      const docGroup = (doc.metadata.docGroup as string) || 'personal';
      docGroupCount[docGroup] = (docGroupCount[docGroup] || 0) + 1;
    });
    console.log(`[VectorDB] Documents by docGroup:`, docGroupCount);

    // 샘플 문서 로그
    if (documents.length > 0) {
      const sampleDoc = documents[0];
      console.log(`[VectorDB] Sample document metadata:`, {
        title: sampleDoc.metadata.title,
        docGroup: sampleDoc.metadata.docGroup,
        teamName: sampleDoc.metadata.teamName,
        source: sampleDoc.metadata.source,
      });
    }

    // Embedding Provider 가져오기
    const embedder = getEmbeddingProvider();

    // 1. 문서 청킹
    const chunkedDocs = chunkDocuments(documents, options);
    console.log(`[VectorDB] Created ${chunkedDocs.length} chunks`);

    // 청킹 후 docGroup 확인
    const chunkedDocGroupCount: Record<string, number> = {};
    chunkedDocs.forEach((doc) => {
      const docGroup = (doc.metadata.docGroup as string) || 'personal';
      chunkedDocGroupCount[docGroup] = (chunkedDocGroupCount[docGroup] || 0) + 1;
    });
    console.log(`[VectorDB] Chunks by docGroup:`, chunkedDocGroupCount);

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

  /**
   * List all collections/indices in the database
   */
  async listCollections(): Promise<string[]> {
    if (!this.db) {
      throw new Error('VectorDB not initialized');
    }

    try {
      const result = this.db.exec(`SELECT name FROM sqlite_master WHERE type='table'`);

      if (result.length === 0) return [];

      const tables = result[0].values.map((row) => row[0] as string);

      // Filter out internal SQLite tables and return unique collection names
      const collections = new Set<string>();
      tables.forEach((table) => {
        if (!table.startsWith('sqlite_')) {
          collections.add(table);
        }
      });

      return Array.from(collections);
    } catch (error) {
      console.error('[VectorDB] Failed to list collections:', error);
      return [];
    }
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
