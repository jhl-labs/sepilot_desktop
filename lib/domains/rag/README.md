# lib/domains/rag/ - RAG & VectorDB

> RAG (Retrieval-Augmented Generation) 및 벡터 데이터베이스를 담당하는 도메인

## 📋 목차

- [개요](#개요)
- [폴더 구조](#폴더-구조)
- [주요 파일](#주요-파일)
- [사용 방법](#사용-방법)
- [문서 인덱싱](#문서-인덱싱)
- [벡터 검색](#벡터-검색)
- [Embedding 생성](#embedding-생성)
- [예제 코드](#예제-코드)
- [관련 문서](#관련-문서)

---

## 개요

RAG 도메인은 문서 검색 및 벡터 데이터베이스를 담당합니다. 사용자가 업로드한 문서를 인덱싱하고, 유사도 검색을 통해 관련 정보를 검색합니다.

**핵심 원칙:**

- **고성능 검색**: sqlite-vec를 사용한 빠른 벡터 검색
- **다양한 Embedding**: OpenAI, Ollama 등 다양한 Embedding 모델 지원
- **문서 청킹**: 문서를 적절한 크기로 분할하여 인덱싱
- **의미 기반 검색**: 키워드가 아닌 의미 기반 유사도 검색

**지원 기능:**

- 문서 인덱싱 (PDF, Word, Excel, 이미지, 텍스트)
- 벡터 검색 (코사인 유사도)
- Embedding 생성 (OpenAI, Ollama)
- 문서 메타데이터 관리
- 청크 관리 (Chunk Size, Overlap)

---

## 폴더 구조

```
lib/domains/rag/
├── client.ts               # VectorDB 클라이언트
├── indexing.ts             # 문서 인덱싱
├── types.ts                # RAG 타입 정의
├── interface.ts            # VectorDB 인터페이스
├── adapters/               # 데이터베이스 어댑터
│   └── sqlite-vec.ts       # SQLite-Vec 어댑터
├── embeddings/             # Embedding 생성
│   ├── client.ts           # Embedding 클라이언트
│   ├── interface.ts        # Embedding 인터페이스
│   └── openai.ts           # OpenAI Embedding
└── index.ts                # Export
```

---

## 주요 파일

### client.ts - VectorDBClient

**역할:** 벡터 데이터베이스 클라이언트

**주요 메서드:**

```typescript
class VectorDBClient {
  constructor(adapter: VectorDBAdapter);

  // 문서 삽입
  async insertDocuments(documents: Document[]): Promise<void>;

  // 벡터 검색
  async search(query: string, topK?: number): Promise<SearchResult[]>;

  // 문서 삭제
  async deleteDocument(id: string): Promise<void>;

  // 모든 문서 삭제
  async clearAll(): Promise<void>;

  // 문서 개수 조회
  async countDocuments(): Promise<number>;

  // 문서 목록 조회
  async listDocuments(offset?: number, limit?: number): Promise<Document[]>;
}
```

**사용 예:**

```typescript
import { VectorDBClient } from '@/lib/domains/rag/client';
import { SQLiteVecAdapter } from '@/lib/domains/rag/adapters/sqlite-vec';

const adapter = new SQLiteVecAdapter(dbPath);
const client = new VectorDBClient(adapter);

// 문서 삽입
await client.insertDocuments([
  {
    id: 'doc-1',
    content: '문서 내용...',
    metadata: { title: '제목', source: 'PDF' },
  },
]);

// 벡터 검색
const results = await client.search('검색 쿼리', 5);
console.log('검색 결과:', results);
```

---

### indexing.ts - Document Indexing

**역할:** 문서를 청킹하고 인덱싱

**주요 함수:**

```typescript
// 문서 청킹
export function chunkDocument(content: string, options?: ChunkOptions): string[];

// 문서 인덱싱
export async function indexDocument(
  document: Document,
  client: VectorDBClient,
  embeddingClient: EmbeddingClient
): Promise<void>;

// 여러 문서 인덱싱
export async function indexDocuments(
  documents: Document[],
  client: VectorDBClient,
  embeddingClient: EmbeddingClient,
  onProgress?: (current: number, total: number) => void
): Promise<void>;
```

**청킹 옵션:**

```typescript
interface ChunkOptions {
  chunkSize?: number; // 청크 크기 (기본: 1000)
  overlap?: number; // 오버랩 (기본: 200)
  separator?: string; // 구분자 (기본: '\n\n')
}
```

---

### adapters/sqlite-vec.ts - SQLite-Vec Adapter

**역할:** SQLite-Vec 데이터베이스 어댑터

**주요 메서드:**

```typescript
class SQLiteVecAdapter implements VectorDBAdapter {
  constructor(dbPath: string);

  // 초기화 (테이블 생성)
  async initialize(): Promise<void>;

  // 벡터 삽입
  async insert(id: string, vector: number[], metadata: any): Promise<void>;

  // 벡터 검색
  async search(queryVector: number[], topK: number): Promise<SearchResult[]>;

  // 삭제
  async delete(id: string): Promise<void>;

  // 전체 삭제
  async clear(): Promise<void>;
}
```

**SQLite 스키마:**

```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  content TEXT,
  metadata TEXT,
  embedding BLOB,
  created_at INTEGER
);

CREATE INDEX idx_documents_created_at ON documents(created_at);
```

---

### embeddings/client.ts - Embedding Client

**역할:** Embedding 클라이언트 (Provider 관리)

**주요 메서드:**

```typescript
class EmbeddingClient {
  constructor(provider: EmbeddingProvider);

  // 텍스트 → Embedding
  async embed(text: string): Promise<number[]>;

  // 여러 텍스트 → Embedding (배치)
  async embedBatch(texts: string[]): Promise<number[][]>;

  // Embedding 차원
  getDimension(): number;
}
```

**Provider:**

- `OpenAIEmbedding` - OpenAI text-embedding-3-small/large
- `OllamaEmbedding` - Ollama 로컬 Embedding (향후 추가)

---

### embeddings/openai.ts - OpenAI Embedding

**역할:** OpenAI Embedding Provider

**지원 모델:**

- `text-embedding-3-small` (1536 차원)
- `text-embedding-3-large` (3072 차원)
- `text-embedding-ada-002` (1536 차원, 레거시)

**사용 예:**

```typescript
import { OpenAIEmbedding } from '@/lib/domains/rag/embeddings/openai';

const embedding = new OpenAIEmbedding({
  apiKey: 'sk-...',
  model: 'text-embedding-3-small',
});

const vector = await embedding.embed('Hello, world!');
console.log('Embedding 차원:', vector.length); // 1536
```

---

## 사용 방법

### 1. VectorDB 초기화

```typescript
import { VectorDBClient } from '@/lib/domains/rag/client';
import { SQLiteVecAdapter } from '@/lib/domains/rag/adapters/sqlite-vec';

const dbPath = '/path/to/vectordb.sqlite';
const adapter = new SQLiteVecAdapter(dbPath);
await adapter.initialize();

const client = new VectorDBClient(adapter);
```

### 2. Embedding 클라이언트 초기화

```typescript
import { EmbeddingClient } from '@/lib/domains/rag/embeddings/client';
import { OpenAIEmbedding } from '@/lib/domains/rag/embeddings/openai';

const embeddingProvider = new OpenAIEmbedding({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'text-embedding-3-small',
});

const embeddingClient = new EmbeddingClient(embeddingProvider);
```

### 3. 문서 인덱싱

```typescript
import { indexDocuments } from '@/lib/domains/rag/indexing';

const documents = [
  {
    id: 'doc-1',
    content: '문서 1의 내용...',
    metadata: { title: '문서 1', source: 'PDF' },
  },
  {
    id: 'doc-2',
    content: '문서 2의 내용...',
    metadata: { title: '문서 2', source: 'Word' },
  },
];

await indexDocuments(documents, client, embeddingClient, (current, total) => {
  console.log(`인덱싱 진행: ${current}/${total}`);
});
```

### 4. 벡터 검색

```typescript
const query = '사용자가 검색하는 질문';
const results = await client.search(query, 5);

results.forEach((result, index) => {
  console.log(`${index + 1}. ${result.content}`);
  console.log(`   유사도: ${result.similarity}`);
  console.log(`   메타데이터:`, result.metadata);
});
```

### 5. 문서 삭제

```typescript
// 특정 문서 삭제
await client.deleteDocument('doc-1');

// 전체 문서 삭제
await client.clearAll();
```

---

## 문서 인덱싱

### 청킹 전략

**기본 설정:**

```typescript
const defaultChunkOptions = {
  chunkSize: 1000, // 청크 크기 (토큰 기준)
  overlap: 200, // 오버랩 크기
  separator: '\n\n', // 단락 구분자
};
```

**청킹 예시:**

```typescript
import { chunkDocument } from '@/lib/domains/rag/indexing';

const content = `
긴 문서 내용...
여러 단락으로 구성...
`;

const chunks = chunkDocument(content, {
  chunkSize: 500,
  overlap: 100,
});

console.log(`청크 개수: ${chunks.length}`);
chunks.forEach((chunk, i) => {
  console.log(`청크 ${i + 1}:`, chunk.substring(0, 50) + '...');
});
```

### 인덱싱 파이프라인

```
문서 로드
  ↓
청킹 (chunkDocument)
  ↓
각 청크별로:
  ├── Embedding 생성 (embeddingClient.embed)
  ├── 메타데이터 추가 (청크 번호, 원본 문서 ID 등)
  └── VectorDB에 삽입 (client.insertDocuments)
  ↓
인덱싱 완료
```

---

## 벡터 검색

### 검색 파이프라인

```
사용자 쿼리
  ↓
Query Embedding 생성
  ↓
VectorDB 코사인 유사도 검색
  ↓
Top-K 결과 반환
  ↓
결과 재정렬 (선택)
  ↓
사용자에게 제공
```

### 검색 옵션

```typescript
interface SearchOptions {
  topK?: number; // 반환할 결과 개수 (기본: 5)
  minSimilarity?: number; // 최소 유사도 (0~1, 기본: 0)
  filter?: Record<string, any>; // 메타데이터 필터
}
```

### 고급 검색

```typescript
// 메타데이터 필터링
const results = await client.search(query, 10, {
  filter: { source: 'PDF' }, // PDF 문서만 검색
});

// 최소 유사도 설정
const results = await client.search(query, 10, {
  minSimilarity: 0.7, // 유사도 0.7 이상만 반환
});
```

---

## Embedding 생성

### OpenAI Embedding

```typescript
import { OpenAIEmbedding } from '@/lib/domains/rag/embeddings/openai';

const embedding = new OpenAIEmbedding({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'text-embedding-3-small',
});

// 단일 텍스트 Embedding
const vector = await embedding.embed('Hello, world!');

// 배치 Embedding (효율적)
const vectors = await embedding.embedBatch(['Text 1', 'Text 2', 'Text 3']);
```

### 커스텀 Embedding Provider

```typescript
import type { EmbeddingProvider } from '@/lib/domains/rag/embeddings/interface';

class MyEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    // 커스텀 Embedding 로직
    return [0.1, 0.2, 0.3 /* ... */];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  getDimension(): number {
    return 1536;
  }
}

const embeddingClient = new EmbeddingClient(new MyEmbeddingProvider());
```

---

## 예제 코드

### 예제 1: PDF 문서 인덱싱

```typescript
import { VectorDBClient } from '@/lib/domains/rag/client';
import { SQLiteVecAdapter } from '@/lib/domains/rag/adapters/sqlite-vec';
import { EmbeddingClient } from '@/lib/domains/rag/embeddings/client';
import { OpenAIEmbedding } from '@/lib/domains/rag/embeddings/openai';
import { indexDocuments } from '@/lib/domains/rag/indexing';
import { parsePDF } from '@/lib/domains/document/parsers/pdf';

async function indexPDF(pdfPath: string) {
  // VectorDB 초기화
  const adapter = new SQLiteVecAdapter('/path/to/db.sqlite');
  await adapter.initialize();
  const vectorDB = new VectorDBClient(adapter);

  // Embedding 클라이언트 초기화
  const embedding = new EmbeddingClient(
    new OpenAIEmbedding({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'text-embedding-3-small',
    })
  );

  // PDF 파싱
  const content = await parsePDF(pdfPath);

  // 문서 인덱싱
  await indexDocuments(
    [
      {
        id: `pdf-${Date.now()}`,
        content,
        metadata: {
          title: pdfPath,
          source: 'PDF',
          createdAt: Date.now(),
        },
      },
    ],
    vectorDB,
    embedding,
    (current, total) => {
      console.log(`인덱싱 진행: ${current}/${total}`);
    }
  );

  console.log('PDF 인덱싱 완료!');
}
```

### 예제 2: RAG 채팅

```typescript
import { VectorDBClient } from '@/lib/domains/rag/client';
import { LLMClient } from '@/lib/domains/llm/client';

async function ragChat(userQuery: string) {
  const vectorDB = new VectorDBClient(adapter);
  const llm = LLMClient.getInstance();

  // 1. 관련 문서 검색
  const searchResults = await vectorDB.search(userQuery, 3);

  // 2. 컨텍스트 생성
  const context = searchResults
    .map((result, i) => `[문서 ${i + 1}]\n${result.content}`)
    .join('\n\n');

  // 3. LLM 프롬프트 구성
  const messages = [
    {
      role: 'system',
      content: `다음 문서를 참고하여 사용자의 질문에 답변하세요.\n\n${context}`,
    },
    {
      role: 'user',
      content: userQuery,
    },
  ];

  // 4. LLM 응답 생성
  let response = '';
  for await (const chunk of llm.stream(messages)) {
    response += chunk;
    process.stdout.write(chunk);
  }

  return response;
}

// 사용
await ragChat('SEPilot Desktop의 Extension 시스템은 어떻게 동작하나요?');
```

### 예제 3: LangGraph RAG Agent

```typescript
import { StateGraph } from '@langchain/langgraph';

const ragGraph = new StateGraph({
  channels: {
    messages: { value: (x, y) => x.concat(y) },
    documents: { value: (x, y) => y || x },
  },
})
  .addNode('retrieve', async (state) => {
    // 문서 검색
    const query = state.messages[state.messages.length - 1].content;
    const results = await vectorDB.search(query, 5);

    return { documents: results };
  })
  .addNode('generate', async (state) => {
    // LLM 생성
    const context = state.documents.map((d) => d.content).join('\n\n');
    const messages = [
      {
        role: 'system',
        content: `다음 문서를 참고하여 답변하세요:\n\n${context}`,
      },
      ...state.messages,
    ];

    const llm = LLMClient.getInstance();
    const response = await llm.chat(messages);

    return { messages: [{ role: 'assistant', content: response }] };
  })
  .addEdge('__start__', 'retrieve')
  .addEdge('retrieve', 'generate')
  .addEdge('generate', '__end__');

// 실행
const stream = await ragGraph.stream({ messages: [{ role: 'user', content: 'Query' }] });
for await (const event of stream) {
  console.log(event);
}
```

### 예제 4: 문서 관리 UI

```typescript
import { useState, useEffect } from 'react';
import { VectorDBClient } from '@/lib/domains/rag/client';

function DocumentManager() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    const client = new VectorDBClient(adapter);
    const docs = await client.listDocuments();
    const count = await client.countDocuments();

    setDocuments(docs);
    setCount(count);
  };

  const handleDelete = async (id: string) => {
    const client = new VectorDBClient(adapter);
    await client.deleteDocument(id);
    await loadDocuments();
  };

  return (
    <div>
      <h2>인덱싱된 문서 ({count}개)</h2>
      {documents.map((doc) => (
        <div key={doc.id}>
          <h3>{doc.metadata.title}</h3>
          <p>{doc.content.substring(0, 100)}...</p>
          <button onClick={() => handleDelete(doc.id)}>삭제</button>
        </div>
      ))}
    </div>
  );
}
```

---

## 관련 문서

### 도메인

- [lib/README.md](../../README.md) - lib 폴더 가이드
- [lib/domains/llm/README.md](../llm/README.md) - LLM 클라이언트
- [lib/domains/agent/README.md](../agent/README.md) - LangGraph Agent

### 아키텍처

- [docs/architecture/dependency-rules.md](../../../docs/architecture/dependency-rules.md) - 의존성 규칙

### IPC 통신

- [electron/ipc/README.md](../../../electron/ipc/README.md) - IPC 핸들러 가이드

### 개발 가이드

- [CLAUDE.md](../../../CLAUDE.md) - 프로젝트 전체 가이드

### 외부 리소스

- [SQLite-Vec 공식 문서](https://github.com/asg017/sqlite-vec)
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)

---

## 변경 이력

- **2025-02-10**: Phase 3 리팩토링 완료 (도메인 구조화)
- **2025-01-17**: 초기 RAG & VectorDB 구축
