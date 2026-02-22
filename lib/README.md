# lib/ - 비즈니스 로직 라이브러리

> SEPilot Desktop의 핵심 비즈니스 로직이 담긴 도메인별 라이브러리

## 📋 목차

- [개요](#개요)
- [폴더 구조](#폴더-구조)
- [도메인 설명](#도메인-설명)
- [새 도메인 추가 가이드](#새-도메인-추가-가이드)
- [의존성 규칙](#의존성-규칙)
- [명명 규칙](#명명-규칙)

---

## 개요

lib/ 폴더는 SEPilot Desktop의 핵심 비즈니스 로직을 포함합니다. 도메인 주도 설계(DDD) 원칙에 따라 기능별로 명확하게 분리되어 있으며, 각 도메인은 독립적으로 동작할 수 있도록 설계되었습니다.

**핵심 원칙:**

- **도메인 격리**: 각 도메인은 명확한 책임을 가짐
- **재사용성**: 도메인 로직은 Frontend/Backend 모두에서 재사용
- **테스트 용이성**: 독립적인 도메인은 단위 테스트 작성이 쉬움

---

## 폴더 구조

```
lib/
├── domains/                  # 도메인별 비즈니스 로직
│   ├── llm/                  # LLM 클라이언트 및 서비스
│   ├── agent/                # LangGraph 에이전트 (AI 워크플로우)
│   ├── mcp/                  # MCP (Model Context Protocol)
│   ├── rag/                  # RAG & VectorDB (문서 검색)
│   ├── chat/                 # 채팅 로직
│   ├── auth/                 # 인증 (GitHub OAuth)
│   ├── config/               # 설정 관리
│   ├── skill/                # 스킬 관리
│   ├── document/             # 문서 처리 (PDF, Word 등)
│   └── integration/          # 외부 서비스 통합
│       ├── github/           # GitHub API
│       ├── comfyui/          # ComfyUI (이미지 생성)
│       └── imagegen/         # 이미지 생성 서비스
├── extensions/               # Extension 시스템 (로더, 레지스트리)
├── extension-sdk/            # Extension 개발 SDK
├── store/                    # Zustand 전역 상태 관리
├── utils/                    # 공통 유틸리티
├── hooks/                    # React Hooks
├── http/                     # HTTP 클라이언트
├── i18n/                     # 국제화 (i18next)
└── ipc/                      # IPC 통신 유틸리티
```

---

## 도메인 설명

### 🤖 llm/ - LLM 클라이언트

**역할:** LLM API 통신 및 스트리밍 처리

**주요 파일:**

- `client.ts` - LLM 클라이언트 싱글톤
- `base.ts` - BaseLLMProvider 추상 클래스
- `providers/` - OpenAI, Anthropic, Gemini, Ollama 등
- `streaming-callback.ts` - 스트리밍 콜백 (대화별 격리)

**사용 예:**

```typescript
import { LLMClient } from '@/lib/domains/llm';

const client = LLMClient.getInstance();
for await (const chunk of client.stream(messages)) {
  console.log(chunk);
}
```

**상세:** [lib/domains/llm/README.md](./domains/llm/README.md)

---

### 🧠 agent/ - LangGraph 에이전트

**역할:** AI 에이전트 워크플로우 (가장 복잡한 도메인)

**주요 폴더:**

- `graphs/` - 15개 그래프 구현 (chat, coding, rag, deep-thinking 등)
- `nodes/` - 그래프 노드 (generate, retrieve, tools)
- `utils/` - RAG, 도구 선택, 검증 파이프라인
- `factory/` - GraphFactory, GraphRegistry

**사용 예:**

```typescript
import { GraphFactory } from '@/lib/domains/agent';

const stream = await GraphFactory.streamWithConfig(graphConfig, messages, options);

for await (const event of stream) {
  console.log(event);
}
```

**특징:**

- Human-in-the-loop (도구 승인)
- 복잡한 사고 패턴 (Sequential, Tree of Thought, Deep Thinking)
- Tool calling 통합

**상세:** [lib/domains/agent/README.md](./domains/agent/README.md)

---

### 🔌 mcp/ - Model Context Protocol

**역할:** MCP 서버 관리 및 도구 호출

**주요 파일:**

- `server-manager.ts` - MCP 서버 생명주기 관리
- `client.ts` - MCP JSON-RPC 2.0 클라이언트
- `tools/` - Google Search, Browser, 파일 시스템 도구

**사용 예:**

```typescript
import { MCPServerManager } from '@/lib/domains/mcp';

const manager = MCPServerManager.getInstance();
await manager.addServer(config);
const result = await manager.callTool(serverName, toolName, args);
```

**상세:** [lib/domains/mcp/README.md](./domains/mcp/README.md)

---

### 📚 rag/ - RAG & VectorDB

**역할:** 문서 검색 및 벡터 데이터베이스

**주요 파일:**

- `client.ts` - VectorDB 클라이언트
- `indexing.ts` - 문서 인덱싱
- `embeddings/` - Embedding 생성 (OpenAI)
- `adapters/` - SQLite-Vec 어댑터

**사용 예:**

```typescript
import { VectorDBClient } from '@/lib/domains/rag';

const client = new VectorDBClient();
await client.insertDocuments(documents);
const results = await client.search(query, topK);
```

**상세:** [lib/domains/rag/README.md](./domains/rag/README.md)

---

### 💬 chat/ - 채팅 로직

**역할:** 대화 제목 생성 등 채팅 유틸리티

**주요 파일:**

- `title-generator.ts` - 대화 제목 자동 생성

---

### 🔐 auth/ - 인증

**역할:** GitHub OAuth 인증 및 세션 관리

**주요 파일:**

- `github-oauth.ts` - GitHub OAuth 플로우
- `use-session-restore.ts` - 세션 복원 훅

---

### ⚙️ config/ - 설정 관리

**역할:** LLM 설정, 앱 설정 암호화 및 동기화

**주요 파일:**

- `manager.ts` - 설정 관리자
- `encryption.ts` - API 키 암호화
- `sync.ts` - GitHub Gist 동기화

---

### 🎯 skill/ - 스킬 관리

**역할:** 프로젝트별 전문 지식 (Skills) 관리

**주요 파일:**

- `manager.ts` - 스킬 CRUD
- `loader.ts` - 스킬 로딩
- `github-integration.ts` - GitHub에서 스킬 다운로드

---

### 📄 document/ - 문서 처리

**역할:** PDF, Word, Excel 등 문서 파싱

**주요 파일:**

- `fetchers.ts` - 문서 다운로드
- `cleaner.ts` - 문서 정제

---

### 🔗 integration/ - 외부 서비스 통합

#### integration/github/

- `client.ts` - GitHub REST API 클라이언트

#### integration/comfyui/

- `client.ts` - ComfyUI 워크플로우 실행

#### integration/imagegen/

- `nanobanana-client.ts` - NanoBanana 이미지 생성

---

## 공통 폴더

### extensions/ - Extension 시스템

**역할:** Extension 로딩, 레지스트리, 런타임

**주요 파일:**

- `loader-main.ts` - Main Process Extension 로더
- `loader.ts` - Renderer Process Extension 로더
- `registry.ts` - Extension 레지스트리

---

### store/ - 전역 상태 관리

**역할:** Zustand 기반 전역 상태

**주요 파일:**

- `chat-store.ts` - 핵심 상태 (79KB)
- `extension-slices.ts` - Extension Store Slice (동적 병합)
- `scheduler-slice.ts` - 스케줄러 상태

**상세:** [lib/store/README.md](./store/README.md)

---

### utils/ - 공통 유틸리티

**역할:** 로깅, 에러 처리, 토큰 카운팅 등

**주요 파일:**

- `logger.ts` - 통합 로거
- `error-handler.ts` - 에러 처리
- `token-counter.ts` - 토큰 카운팅

---

## 새 도메인 추가 가이드

### 1. 언제 새 도메인을 만들어야 하나?

다음 조건을 **모두** 만족할 때:

- ✅ 독립적인 비즈니스 개념 (예: 결제, 알림, 분석)
- ✅ 10개 이상의 파일로 구성
- ✅ 다른 도메인과 명확히 구분되는 책임
- ✅ 재사용 가능한 로직

**주의:** 단순 유틸리티는 `lib/utils/`에 추가

### 2. 새 도메인 생성 단계

#### Step 1: 폴더 생성

```bash
mkdir -p lib/domains/your-domain
```

#### Step 2: index.ts 작성

```typescript
// lib/domains/your-domain/index.ts
export { YourClient } from './client';
export type { YourConfig } from './types';
```

#### Step 3: README.md 작성

```markdown
# your-domain/ - 도메인 설명

> 역할: ...

## 주요 파일

## 사용 예

## 의존성
```

#### Step 4: 의존성 확인

- [ ] 순환 참조 없음
- [ ] 도메인 간 의존성 매트릭스 준수
- [ ] `docs/architecture/dependency-rules.md` 업데이트

#### Step 5: Export 경로 추가

```typescript
// lib/index.ts (필요시)
export * from './domains/your-domain';
```

---

## 의존성 규칙

### 허용되는 Import ✅

```typescript
// 도메인 → utils
import { logger } from '@/lib/utils/logger';

// 도메인 → http
import { fetchWithConfig } from '@/lib/http';

// 도메인 → types
import type { Message } from '@/types';

// agent → llm, mcp, rag (명시적 허용)
import { LLMClient } from '@/lib/domains/llm';
```

### 금지된 Import ❌

```typescript
// ❌ 도메인 → app
import { HomePage } from '@/app/page';

// ❌ 도메인 → components
import { Button } from '@/components/ui/button';

// ❌ 도메인 → electron (직접)
import { databaseService } from '@/electron/services/database';

// ❌ llm → agent (역방향)
import { CodingAgent } from '@/lib/domains/agent';
```

**상세:** [docs/architecture/dependency-rules.md](../docs/architecture/dependency-rules.md)

---

## 명명 규칙

### 1. 도메인 폴더명

- **단수형** 사용: `skill/` (O), `skills/` (X)
- **소문자**: `llm/`, `mcp/`, `rag/`
- **명확한 의미**: 폴더명만으로 역할 파악 가능

### 2. 파일명

- **kebab-case**: `server-manager.ts`, `github-oauth.ts`
- **기능 중심**: `title-generator.ts`, `context-matcher.ts`

### 3. 클래스/타입명

- **PascalCase**: `LLMClient`, `MCPServerManager`
- **명확한 접미사**: `Client`, `Manager`, `Service`, `Provider`

---

## 테스트 작성

### 도메인별 테스트 위치

```
tests/
├── lib/
│   ├── llm/
│   │   ├── client.test.ts
│   │   └── providers/
│   ├── agent/
│   │   ├── graphs/
│   │   └── nodes/
│   └── mcp/
│       └── server-manager.test.ts
```

### 테스트 예시

```typescript
// tests/lib/llm/client.test.ts
import { LLMClient } from '@/lib/domains/llm';

describe('LLMClient', () => {
  it('should create singleton instance', () => {
    const client1 = LLMClient.getInstance();
    const client2 = LLMClient.getInstance();
    expect(client1).toBe(client2);
  });
});
```

---

## 관련 문서

### 아키텍처

- [docs/architecture/folder-structure.md](../docs/architecture/folder-structure.md)
- [docs/architecture/dependency-rules.md](../docs/architecture/dependency-rules.md)

### 도메인별 가이드

- [lib/domains/llm/README.md](./domains/llm/README.md)
- [lib/domains/agent/README.md](./domains/agent/README.md)
- [lib/domains/mcp/README.md](./domains/mcp/README.md)
- [lib/domains/rag/README.md](./domains/rag/README.md)

### 개발 가이드

- [CLAUDE.md](../CLAUDE.md) - 전체 프로젝트 가이드

---

## 변경 이력

- **2025-02-10**: Phase 3 리팩토링 완료 (도메인별 구조화)
- **2025-01-17**: 초기 문서 작성
