---
name: RAG & Vector Search
description: >
  Expert knowledge of RAG (Retrieval-Augmented Generation) and vector
  search implementation for SEPilot Desktop. Use when implementing
  document search, semantic retrieval, or knowledge base features.
  Ensures efficient embeddings, vector storage, and retrieval patterns.
---

# RAG & Vector Search Skill

## Overview

SEPilot Desktop uses RAG to enhance LLM responses with relevant context from documents and knowledge bases:

- **Embeddings**: Text를 vector로 변환
- **Vector Store**: 효율적인 similarity search
- **Retrieval**: 사용자 쿼리와 관련된 문서 찾기
- **Augmentation**: LLM 프롬프트에 검색된 문서 추가

## Architecture

```
┌──────────┐     Embed      ┌────────────┐    Search    ┌─────────────┐
│ Document │ ────────────→  │   Vector   │ ←──────────  │ User Query  │
│          │                │   Store    │              │             │
└──────────┘                └────────────┘              └─────────────┘
                                  │                            │
                                  │        Retrieved Docs      │
                                  └────────────────────────────┘
                                                │
                                                ↓
                                         ┌─────────────┐
                                         │  LLM with   │
                                         │  Context    │
                                         └─────────────┘
```

## Embedding Models

### OpenAI Embeddings

```typescript
import { OpenAIEmbeddings } from '@langchain/openai';

const embeddings = new OpenAIEmbeddings({
  modelName: 'text-embedding-3-small', // 빠르고 저렴
  // modelName: 'text-embedding-3-large', // 더 정확하지만 비쌈
  apiKey: process.env.OPENAI_API_KEY,
});

const vector = await embeddings.embedQuery('사용자 쿼리');
```

### Anthropic Embeddings (Claude)

```typescript
import { AnthropicEmbeddings } from '@langchain/anthropic';

const embeddings = new AnthropicEmbeddings({
  modelName: 'claude-embed-3',
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

### Local Embeddings (무료, 오프라인)

```typescript
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/hf_transformers';

const embeddings = new HuggingFaceTransformersEmbeddings({
  modelName: 'Xenova/all-MiniLM-L6-v2', // 경량 모델
});
```

## Vector Stores

### In-Memory (개발/테스트용)

```typescript
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Document } from 'langchain/document';

const vectorStore = await MemoryVectorStore.fromDocuments(
  [
    new Document({
      pageContent: '문서 내용',
      metadata: { source: 'doc1.txt' },
    }),
  ],
  embeddings
);
```

### File-Based (Electron 앱에 적합)

```typescript
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { app } from 'electron';
import * as path from 'path';

const vectorStorePath = path.join(app.getPath('userData'), 'vectorstores', 'main');

// Save vector store
const vectorStore = await FaissStore.fromDocuments(documents, embeddings);
await vectorStore.save(vectorStorePath);

// Load vector store
const loadedStore = await FaissStore.load(vectorStorePath, embeddings);
```

### ChromaDB (고급 기능)

```typescript
import { Chroma } from '@langchain/community/vectorstores/chroma';

const vectorStore = await Chroma.fromDocuments(documents, embeddings, {
  collectionName: 'sepilot-docs',
  url: 'http://localhost:8000', // ChromaDB 서버
});
```

## Document Processing

### Text Splitting

긴 문서를 작은 청크로 분할:

```typescript
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000, // 청크 크기 (토큰 수)
  chunkOverlap: 200, // 청크 간 겹침 (컨텍스트 유지)
});

const docs = await splitter.createDocuments([longText]);
```

### Document Loaders

다양한 파일 형식 로드:

```typescript
// PDF
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
const pdfLoader = new PDFLoader('file.pdf');

// Markdown
import { TextLoader } from 'langchain/document_loaders/fs/text';
const mdLoader = new TextLoader('README.md');

// JSON
import { JSONLoader } from 'langchain/document_loaders/fs/json';
const jsonLoader = new JSONLoader('data.json');

// CSV
import { CSVLoader } from 'langchain/document_loaders/fs/csv';
const csvLoader = new CSVLoader('data.csv');

const docs = await loader.load();
```

## RAG Implementation

### Basic RAG Pattern

```typescript
// lib/rag/basic-rag.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';

export class BasicRAG {
  constructor(
    private vectorStore: MemoryVectorStore,
    private llm: ChatAnthropic
  ) {}

  async query(question: string, k: number = 3): Promise<string> {
    // 1. Retrieve relevant documents
    const relevantDocs = await this.vectorStore.similaritySearch(question, k);

    // 2. Build context from retrieved docs
    const context = relevantDocs
      .map((doc) => `Source: ${doc.metadata.source}\n${doc.pageContent}`)
      .join('\n\n---\n\n');

    // 3. Augment prompt with context
    const prompt = `다음 문서들을 참고하여 질문에 답변해주세요:

${context}

질문: ${question}

답변:`;

    // 4. Generate response
    const response = await this.llm.invoke(prompt);
    return response.content as string;
  }
}
```

### Advanced RAG with Reranking

```typescript
import { CohereRerank } from '@langchain/cohere';

export class AdvancedRAG extends BasicRAG {
  private reranker = new CohereRerank({
    apiKey: process.env.COHERE_API_KEY,
    topN: 3,
  });

  async query(question: string): Promise<string> {
    // 1. Initial retrieval (get more docs)
    const candidateDocs = await this.vectorStore.similaritySearch(question, 10);

    // 2. Rerank for better relevance
    const rerankedDocs = await this.reranker.rerank(
      question,
      candidateDocs.map((doc) => doc.pageContent)
    );

    // 3. Use top reranked docs
    const relevantDocs = rerankedDocs.slice(0, 3).map((item) => candidateDocs[item.index]);

    // 4. Generate response
    const context = relevantDocs.map((doc) => doc.pageContent).join('\n\n---\n\n');

    const prompt = `${context}\n\n질문: ${question}\n\n답변:`;
    const response = await this.llm.invoke(prompt);
    return response.content as string;
  }
}
```

## IPC Integration

### Backend Handler

```typescript
// electron/ipc/handlers/rag.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { RAGService } from '../services/rag-service';

const ragService = new RAGService();

export function setupRAGHandlers() {
  // Index documents
  ipcMain.handle(
    'rag:index',
    async (
      event: IpcMainInvokeEvent,
      request: {
        documents: Array<{ content: string; metadata: Record<string, unknown> }>;
        collectionName: string;
      }
    ) => {
      try {
        await ragService.indexDocuments(request.documents, request.collectionName);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // Query documents
  ipcMain.handle(
    'rag:query',
    async (
      event: IpcMainInvokeEvent,
      request: {
        question: string;
        collectionName: string;
        k?: number;
      }
    ) => {
      try {
        const response = await ragService.query(
          request.question,
          request.collectionName,
          request.k
        );
        return { success: true, response };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // Search similar documents
  ipcMain.handle(
    'rag:search',
    async (
      event: IpcMainInvokeEvent,
      request: {
        query: string;
        collectionName: string;
        k?: number;
      }
    ) => {
      try {
        const documents = await ragService.search(request.query, request.collectionName, request.k);
        return { success: true, documents };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );
}
```

### Frontend Usage

```typescript
// lib/hooks/useRAG.ts
export function useRAG() {
  const indexDocuments = async (
    documents: Array<{ content: string; metadata: Record<string, unknown> }>,
    collectionName: string
  ): Promise<void> => {
    const result = await window.electron.invoke('rag:index', {
      documents,
      collectionName,
    });

    if (!result.success) {
      throw new Error(result.error);
    }
  };

  const query = async (question: string, collectionName: string, k = 3): Promise<string> => {
    const result = await window.electron.invoke('rag:query', {
      question,
      collectionName,
      k,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    return result.response;
  };

  const search = async (query: string, collectionName: string, k = 5): Promise<Document[]> => {
    const result = await window.electron.invoke('rag:search', {
      query,
      collectionName,
      k,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    return result.documents;
  };

  return { indexDocuments, query, search };
}
```

## Metadata Filtering

```typescript
// Search with metadata filters
const results = await vectorStore.similaritySearch('TypeScript patterns', 5, {
  fileType: 'typescript', // Only .ts files
  category: 'backend', // Only backend code
});
```

## Hybrid Search

Vector search + Keyword search:

```typescript
export class HybridSearch {
  async search(query: string, k: number = 5): Promise<Array<Document & { score: number }>> {
    // 1. Vector search
    const vectorResults = await this.vectorStore.similaritySearchWithScore(query, k);

    // 2. Keyword search (BM25)
    const keywordResults = await this.keywordSearch(query, k);

    // 3. Combine and rerank
    const combined = this.combineResults(vectorResults, keywordResults);

    return combined.slice(0, k);
  }
}
```

## Performance Optimization

### Caching

```typescript
class RAGCache {
  private cache = new Map<string, { response: string; timestamp: number }>();
  private ttl = 1000 * 60 * 5; // 5 minutes

  get(query: string): string | null {
    const cached = this.cache.get(query);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(query);
      return null;
    }

    return cached.response;
  }

  set(query: string, response: string): void {
    this.cache.set(query, { response, timestamp: Date.now() });
  }
}
```

### Batch Processing

```typescript
// Index documents in batches
async function indexInBatches(documents: Document[], batchSize: number = 100): Promise<void> {
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    await vectorStore.addDocuments(batch);
  }
}
```

## Best Practices

1. **Chunk Size**: 1000-1500 characters가 일반적으로 최적
2. **Overlap**: 10-20% overlap으로 context 유지
3. **Top K**: 3-5개 문서가 적당 (너무 많으면 noise)
4. **Metadata**: 출처, 날짜, 카테고리 등 메타데이터 포함
5. **Updates**: 문서 변경 시 벡터 스토어도 업데이트
6. **Caching**: 자주 사용되는 쿼리는 캐싱

## Real-World Example

```typescript
// components/DocumentSearch.tsx
export function DocumentSearch() {
  const { query, indexDocuments } = useRAG();
  const [result, setResult] = useState<string>('');

  const handleSearch = async (question: string): Promise<void> => {
    const response = await query(question, 'main-docs', 3);
    setResult(response);
  };

  const handleIndexFiles = async (files: File[]): Promise<void> => {
    const documents = await Promise.all(
      files.map(async (file) => ({
        content: await file.text(),
        metadata: { source: file.name, type: file.type },
      }))
    );

    await indexDocuments(documents, 'main-docs');
  };

  return <div>{/* UI implementation */}</div>;
}
```

## Testing

```typescript
// tests/rag/basic-rag.test.ts
describe('BasicRAG', () => {
  let rag: BasicRAG;

  beforeAll(async () => {
    const docs = [
      new Document({
        pageContent: 'TypeScript is a typed superset of JavaScript',
        metadata: { source: 'ts-intro.md' },
      }),
    ];

    const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
    rag = new BasicRAG(vectorStore, llm);
  });

  it('should answer questions based on indexed documents', async () => {
    const response = await rag.query('What is TypeScript?');
    expect(response).toContain('typed');
    expect(response).toContain('JavaScript');
  });
});
```
