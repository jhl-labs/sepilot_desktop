# SEPilot Desktop

Electron + Next.js 기반 LLM Desktop Application

- 다중 대화 세션 관리, 이미지 생성/해석, RAG, MCP Tool calling, LangGraph Agent 지원
- Frontend: Next.js (React, TypeScript, shadcn/ui)
- Backend: Electron Main Process (Node.js, TypeScript)
- 통신: IPC (Inter-Process Communication)

## 작업 전 필수 확인

1. 파일 수정 전 반드시 내용을 먼저 읽어서 컨텍스트 파악
2. 새 파일보다 기존 파일 수정 우선
3. 작업 완료 후 `pnpm run lint` 및 `pnpm run type-check` 실행
4. 항상 git pull 을 하여 merge conflict 방지

## 작업 후 해야 할 일

1. release_notes/ 폴더에 있는 현재 버전의 문서를 업데이트 할 것 (한국어로)

## 기술 스택

### Frontend

- **Framework**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui (Radix UI 기반)
- **State Management**: Zustand (슬라이스 패턴)
- **Theme**: next-themes (Dark/Light 모드 지원)
- **I18n**: next-intl (한국어/영어 지원)

### Backend (Electron)

- **Runtime**: Electron 31 (Node.js 기반)
- **Language**: TypeScript (Strict Mode)
- **Database**: better-sqlite3 (로컬 저장소)
- **Vector DB**: SQLite-vec (RAG 지원)
- **File System**: Node.js fs/promises API

### AI & LLM

- **Orchestration**: LangGraph (Chat, RAG, Agent 그래프)
- **Protocol**: MCP (Model Context Protocol) - 도구 및 컨텍스트 표준화
- **LLM Providers**: OpenAI, Anthropic (Claude), Google (Gemini), Custom
- **Embeddings**: OpenAI, Anthropic, Local (HuggingFace)
- **Image Generation**: ComfyUI, Nanobanana

## 아키텍처 원칙

### Electron IPC 통신

**Frontend → Backend 통신:**

```typescript
// Frontend (Renderer Process)
const result = await window.electron.invoke('channel-name', { data: 'value' });
```

**Backend → Frontend 통신:**

```typescript
// Backend (Main Process)
event.sender.send('channel-name', { data: 'value' });
```

**중요 규칙:**

- 스트리밍 데이터는 반드시 IPC 이벤트로 전송 (HTTP 불가)
- IPC 핸들러는 `electron/ipc/handlers/` 에 배치
- 모든 IPC 채널은 명확한 네이밍 규칙 사용 (`module:action` 형식)
- 에러 처리는 `{ success: boolean, error?: string, data?: any }` 형식 반환

### 데이터 저장

**임시/캐시 데이터:**

- localStorage 사용 (Frontend)
- 앱 재시작 시 유지되지 않아도 되는 데이터

**영구 저장:**

- Electron fs API로 파일 시스템에 저장
- `app.getPath('userData')` 디렉토리 사용
- better-sqlite3로 데이터베이스 저장

**예시:**

```typescript
// Frontend
localStorage.setItem('theme', 'dark');

// Backend (Main Process)
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

const userDataPath = app.getPath('userData');
const filePath = path.join(userDataPath, 'settings.json');
await fs.writeFile(filePath, JSON.stringify(settings), 'utf-8');
```

### 컴포넌트 설계

**원칙:**

- 작고 재사용 가능한 컴포넌트 구성
- shadcn/ui 컴포넌트 활용 (`components/ui/`)
- 비즈니스 로직과 UI 분리
- Client Component(`'use client'`)와 Server Component 명확히 구분

**패턴:**

```typescript
// ✅ Good - 작고 재사용 가능
function MessageItem({ message }: { message: Message }) {
  return <div>{message.content}</div>;
}

// ✅ Good - 비즈니스 로직 분리
function MessageList() {
  const messages = useMessages(); // Custom hook
  return messages.map((msg) => <MessageItem key={msg.id} message={msg} />);
}

// ❌ Bad - 너무 큰 컴포넌트
function ChatView() {
  // 수백 줄의 로직과 UI...
}
```

## 보안 및 커밋

### 필수 검증

**보안 체크리스트:**

- [ ] API 키, 토큰, 비밀번호 하드코딩 금지
- [ ] 사용자 경로, 개인정보 포함 시 커밋 전 경고
- [ ] XSS, SQL Injection, Command Injection 방지
- [ ] Path Traversal 공격 방지 (파일 경로 검증)
- [ ] IPC 채널에 대한 입력 검증

**보안 패턴:**

```typescript
// ✅ Good - Path Traversal 방지
function sanitizePath(userPath: string, baseDir: string): string {
  const safePath = userPath.replace(/\.\./g, '');
  const fullPath = path.resolve(baseDir, safePath);
  if (!fullPath.startsWith(baseDir)) {
    throw new Error('Invalid path');
  }
  return fullPath;
}

// ✅ Good - IPC 입력 검증
ipcMain.handle('file:read', async (event, { filePath }) => {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, error: 'Invalid file path' };
  }
  // ...
});
```

### 커밋 규칙

**형식:**

- **한국어** 커밋 메시지 작성
- Semantic Commit 형식: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- 관련 파일끼리 그룹화하여 분할 커밋

**예시:**

```bash
feat: RAG 문서 검색 기능 추가
fix: IPC 통신 시 메모리 누수 수정
chore: 의존성 업데이트 (electron 31.0.0)
docs: README에 설치 가이드 추가
refactor: chat-store 슬라이스 패턴으로 리팩토링
test: MessageList 컴포넌트 테스트 추가
```

## 주요 디렉토리

```
app/                    # Next.js App Router (Frontend)
  ├── [mode]/           # 모드별 페이지 (chat, editor, browser, presentation)
  ├── layout.tsx        # 루트 레이아웃
  └── providers.tsx     # Context Providers

components/             # React 컴포넌트
  ├── ui/               # shadcn/ui 재사용 컴포넌트
  ├── chat/             # 채팅 관련 컴포넌트
  └── settings/         # 설정 관련 컴포넌트

electron/               # Electron Main/Preload
  ├── main.ts           # 애플리케이션 진입점
  ├── preload.ts        # Context Bridge (IPC 보안)
  ├── ipc/handlers/     # IPC 핸들러
  │   ├── chat.ts
  │   ├── file.ts
  │   └── mcp.ts
  ├── services/         # Backend 서비스
  │   ├── database.ts
  │   ├── vectordb.ts
  │   └── logger.ts
  └── utils/            # Backend 유틸리티

extensions/             # Extension 시스템
  ├── browser/          # Browser Extension
  ├── editor/           # Editor Extension
  └── presentation/     # Presentation Extension

lib/                    # 공유 라이브러리
  ├── langgraph/        # LangGraph 통합
  │   ├── graphs/       # Agent 그래프 정의
  │   ├── state.ts      # Agent 상태 관리
  │   └── types.ts
  ├── llm/              # LLM 제공자
  │   ├── providers/    # OpenAI, Anthropic, Gemini
  │   ├── client.ts     # LLM 클라이언트
  │   └── streaming-callback.ts
  ├── mcp/              # MCP 통합
  │   ├── client.ts
  │   ├── server-manager.ts
  │   └── transport/    # SSE, Stdio
  ├── vectordb/         # Vector DB
  │   ├── embeddings/   # Embedding 제공자
  │   └── stores/       # Memory, FAISS, Chroma
  ├── store/            # Zustand 상태 관리
  │   ├── chat-store.ts
  │   └── extension-slices.ts
  ├── hooks/            # React Custom Hooks
  ├── utils/            # 유틸리티 함수
  └── i18n/             # 다국어 설정

tests/                  # 테스트
  ├── frontend/         # React 컴포넌트 테스트
  ├── backend/          # Electron Main Process 테스트
  └── lib/              # 공유 라이브러리 테스트

e2e_tests/              # E2E 테스트 (Playwright)

release_notes/          # 릴리스 노트 (한국어)

.claude/                # Claude Code 설정 (Gemini는 무시 가능)
  ├── settings.json
  ├── commands/
  ├── agents/
  └── skills/
```

## Extension 시스템

SEPilot Desktop은 Extension을 통해 기능을 모듈화합니다.

### Extension 구조

각 Extension은 독립적인 디렉토리에 격리됩니다:

```
extensions/my-extension/
├── index.ts              # 메인 진입점
├── manifest.ts           # Extension 메타데이터
├── README.md             # 문서
├── types/                # 타입 정의
├── agents/               # LangGraph Agent
├── tools/                # MCP 또는 builtin tools
├── lib/                  # 비즈니스 로직
├── components/           # React 컴포넌트
├── store/                # Zustand slice
├── ipc/                  # IPC 핸들러
└── locales/              # 다국어 (ko.json, en.json)
```

### Extension Manifest

```typescript
// extensions/my-extension/manifest.ts
export const manifest: ExtensionManifest = {
  id: 'my-extension',
  name: 'My Extension',
  description: 'Extension 설명',
  version: '1.0.0',
  author: 'Your Name',
  icon: 'Puzzle', // lucide-react icon
  mode: 'my-mode', // app/[mode] 경로에 대응
  showInSidebar: true,
  order: 5,
  enabled: true,
};
```

### 기존 Extensions

1. **browser**: 웹 브라우저 (Playwright 기반, AI Agent 자동화)
2. **editor**: 코드 에디터 (Monaco Editor, File Tree, Terminal)
3. **presentation**: 프레젠테이션 생성 (PPT Agent, Templates, HTML/PDF 내보내기)

자세한 내용은 `.claude/skills/extension-development/SKILL.md` 참고.

## AI Agent 개발

### LangGraph Agent 패턴

SEPilot은 LangGraph를 사용하여 Agent를 구현합니다.

**기본 구조:**

```typescript
export class MyAgent {
  async *stream(
    initialState: AgentState,
    toolApprovalCallback?: (toolCalls: ToolCall[]) => Promise<boolean>
  ): AsyncGenerator<any, void, unknown> {
    let state = { ...initialState };
    let iterations = 0;

    while (iterations < this.maxIterations) {
      // 1. Generate response
      const generateResult = await this.generateNode(state);
      state = { ...state, ...generateResult };

      yield { type: 'message', message: state.messages[state.messages.length - 1] };

      // 2. Check if should use tools
      if (this.shouldUseTool(state) === 'end') break;

      // 3. Tool approval (if needed)
      if (toolApprovalCallback) {
        const approved = await toolApprovalCallback(lastMessage.tool_calls);
        if (!approved) break;
      }

      // 4. Execute tools
      const toolsResult = await this.toolsNode(state);
      state = { ...state, ...toolsResult };

      yield { type: 'tool_results', toolResults: toolsResult.toolResults };

      iterations++;
    }
  }
}
```

**Agent 그래프 예시:**

- `deep-thinking`: 깊은 사고가 필요한 복잡한 문제 (CoT)
- `sequential-thinking`: 순차적 추론 (Step-by-step)
- `tree-of-thought`: 트리 기반 탐색 (Best path selection)
- `coding-agent`: 코딩 작업 (Planning, Execution, Verification)

자세한 내용은 `.claude/skills/langgraph-agent/SKILL.md` 참고.

### MCP (Model Context Protocol)

MCP는 LLM이 외부 도구와 컨텍스트를 사용할 수 있게 하는 표준 프로토콜입니다.

**MCP Server 연결:**

```typescript
// lib/mcp/server-manager.ts
import { MCPServerManager } from '@/lib/mcp/server-manager';

const manager = new MCPServerManager();

// SSE Transport
await manager.connectServer({
  id: 'github-server',
  name: 'GitHub MCP',
  transport: {
    type: 'sse',
    url: 'http://localhost:3100/sse',
  },
});

// Stdio Transport
await manager.connectServer({
  id: 'filesystem-server',
  name: 'Filesystem MCP',
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/directory'],
  },
});

// 도구 목록 가져오기
const tools = await manager.listTools('github-server');

// 도구 실행
const result = await manager.callTool('github-server', 'search_repositories', {
  query: 'typescript',
});
```

자세한 내용은 `.claude/skills/mcp-integration/SKILL.md` 참고.

### RAG (Retrieval-Augmented Generation)

RAG는 벡터 검색을 통해 관련 문서를 찾아 LLM에 컨텍스트로 제공합니다.

**RAG 워크플로우:**

```typescript
// 1. Embedding 초기화
import { initializeEmbedding, getEmbeddingProvider } from '@/lib/vectordb/embeddings/client';

initializeEmbedding({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'text-embedding-3-small',
});

// 2. 문서 임베딩 및 저장
const embedder = getEmbeddingProvider();
const embedding = await embedder.embed('문서 내용');
await vectorDBService.addDocument({
  id: 'doc-1',
  content: '문서 내용',
  embedding,
  metadata: { title: '제목', path: '/path/to/doc' },
});

// 3. 검색
const queryEmbedding = await embedder.embed('검색 쿼리');
const results = await vectorDBService.searchByVector(queryEmbedding, 5);

// 4. LLM에 컨텍스트 제공
const context = results.map((r) => r.content).join('\n\n');
const prompt = `다음 문서를 참고하여 답변하세요:\n\n${context}\n\n질문: ${query}`;
```

자세한 내용은 `.claude/skills/rag-vector-search/SKILL.md` 참고.

## 상태 관리 (Zustand)

SEPilot은 Zustand를 사용하여 전역 상태를 관리합니다.

### Slice 패턴

```typescript
// lib/store/slices/conversation-slice.ts
export interface ConversationSlice {
  conversations: Map<string, Conversation>;
  currentConversationId: string | null;

  addConversation: (conversation: Conversation) => void;
  setCurrentConversation: (id: string) => void;
}

export const createConversationSlice: StateCreator<ConversationSlice> = (set) => ({
  conversations: new Map(),
  currentConversationId: null,

  addConversation: (conversation) =>
    set((state) => {
      const newConversations = new Map(state.conversations);
      newConversations.set(conversation.id, conversation);
      return { conversations: newConversations };
    }),

  setCurrentConversation: (id) => set({ currentConversationId: id }),
});
```

### Store 통합

```typescript
// lib/store/chat-store.ts
import { create } from 'zustand';
import { createConversationSlice, ConversationSlice } from './slices/conversation-slice';
import { createMessageSlice, MessageSlice } from './slices/message-slice';

type ChatStore = ConversationSlice & MessageSlice;

export const useChatStore = create<ChatStore>()((...a) => ({
  ...createConversationSlice(...a),
  ...createMessageSlice(...a),
}));
```

자세한 내용은 `.claude/skills/state-management/SKILL.md` 참고.

## 테스트

### 테스트 구조

```
tests/
├── frontend/           # React 컴포넌트 및 hooks
│   ├── components/
│   └── hooks/
├── backend/            # Electron main process
│   └── ipc/
└── lib/                # 공유 라이브러리
    ├── utils/
    └── store/

e2e_tests/              # Playwright E2E 테스트
```

### 테스트 실행

```bash
# Frontend 테스트
pnpm run test:frontend

# Backend 테스트
pnpm run test:backend

# E2E 테스트
pnpm run test:e2e

# 커버리지
pnpm run test:coverage
```

### 테스트 패턴

**React 컴포넌트:**

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('should call onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click</Button>);

    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

**IPC Handler:**

```typescript
import { ipcMain } from 'electron';
import { setupChatHandlers } from '@/electron/ipc/handlers/chat';

describe('Chat IPC Handlers', () => {
  it('should handle chat:send', async () => {
    setupChatHandlers();
    const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
      ([event]) => event === 'chat:send'
    )?.[1];

    const result = await handler({}, { conversationId: 'conv-1', message: 'Hello' });
    expect(result.success).toBe(true);
  });
});
```

자세한 내용은 `.claude/skills/testing-patterns/SKILL.md` 참고.

## 성능 최적화

### React 최적화

**React.memo:**

```typescript
export const MessageItem = memo(({ message }: { message: Message }) => {
  return <div>{message.content}</div>;
});
```

**useMemo:**

```typescript
const sortedMessages = useMemo(() => {
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}, [messages]);
```

**useCallback:**

```typescript
const handleSend = useCallback(() => {
  window.electron.invoke('chat:send', { conversationId, message });
}, [conversationId, message]);
```

### IPC 최적화

**배치 처리:**

```typescript
// ❌ Bad - 개별 호출
for (const message of messages) {
  await window.electron.invoke('message:save', message);
}

// ✅ Good - 배치 처리
await window.electron.invoke('messages:save-batch', messages);
```

**Debounce:**

```typescript
import { debounce } from 'lodash';

const debouncedSearch = debounce((query: string) => {
  window.electron.invoke('search', query);
}, 300);
```

자세한 내용은 `.claude/skills/performance-optimization/SKILL.md` 참고.

## 에러 처리

### Error Boundary

```typescript
import { Component, ReactNode } from 'react';

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error('React Error Boundary:', { error, errorInfo });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div>
          <h2>문제가 발생했습니다</h2>
          <button onClick={() => window.location.reload()}>새로고침</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### IPC 에러 처리

```typescript
ipcMain.handle('chat:send', async (event, data) => {
  try {
    const result = await sendMessage(data);
    return { success: true, data: result };
  } catch (error: any) {
    logger.error('chat:send error:', error);
    return {
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR',
    };
  }
});
```

자세한 내용은 `.claude/skills/error-handling/SKILL.md` 참고.

## TypeScript Strict Mode

SEPilot은 TypeScript strict mode를 사용합니다.

### 타입 안전성

```typescript
// ✅ Good - 명확한 타입
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: number;
  tool_calls?: ToolCall[];
}

// ❌ Bad - any 사용
interface Message {
  id: string;
  data: any;
}
```

### Null 체크

```typescript
// ✅ Good - Optional chaining
const title = conversation?.title ?? 'Untitled';

// ✅ Good - Type guard
if (message.tool_calls && message.tool_calls.length > 0) {
  // tool_calls is ToolCall[]
}

// ❌ Bad - Non-null assertion (!)
const title = conversation!.title;
```

자세한 내용은 `.claude/skills/typescript-strict/SKILL.md` 참고.

## 파일 작업

### 안전한 파일 경로

```typescript
import * as path from 'path';
import { app } from 'electron';

// Path Traversal 방지
function sanitizePath(userPath: string, baseDir: string): string {
  const safePath = userPath.replace(/\.\./g, '');
  const fullPath = path.resolve(baseDir, safePath);
  if (!fullPath.startsWith(baseDir)) {
    throw new Error('Invalid path');
  }
  return fullPath;
}

// 사용
const userDataPath = app.getPath('userData');
const safePath = sanitizePath(userInput, userDataPath);
const content = await fs.readFile(safePath, 'utf-8');
```

### 문서 파싱

**PDF:**

```typescript
import pdfParse from 'pdf-parse';

const dataBuffer = await fs.readFile(filePath);
const data = await pdfParse(dataBuffer);
console.log(data.text);
```

**Word (.docx):**

```typescript
import mammoth from 'mammoth';

const result = await mammoth.extractRawText({ path: filePath });
console.log(result.value);
```

**Excel (.xlsx):**

```typescript
import * as XLSX from 'xlsx';

const workbook = XLSX.readFile(filePath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(worksheet);
```

자세한 내용은 `.claude/skills/file-operations/SKILL.md` 참고.

## 다국어 지원 (i18n)

SEPilot은 next-intl을 사용하여 한국어와 영어를 지원합니다.

### 메시지 정의

```json
// lib/i18n/messages/ko.json
{
  "chat": {
    "newChat": "새 대화",
    "sendMessage": "메시지 전송",
    "placeholder": "메시지를 입력하세요..."
  }
}
```

### 컴포넌트에서 사용

```typescript
'use client';

import { useTranslations } from 'next-intl';

export function ChatInput() {
  const t = useTranslations('chat');

  return (
    <div>
      <input placeholder={t('placeholder')} />
      <button>{t('sendMessage')}</button>
    </div>
  );
}
```

## 빌드 및 배포

### 개발

```bash
# 개발 서버 실행
pnpm dev

# 타입 체크
pnpm type-check

# 린트
pnpm lint

# 테스트
pnpm test
```

### 프로덕션 빌드

```bash
# 전체 빌드
pnpm run build

# 플랫폼별 빌드
pnpm run build:mac     # macOS
pnpm run build:win     # Windows
pnpm run build:linux   # Linux
```

### 패키징

```bash
# DMG, EXE, AppImage 생성
pnpm run package
```

## 개발 팁 (Gemini용)

### 파일 읽기 우선

```python
# ✅ Good
1. 파일 내용을 먼저 읽음
2. 기존 패턴 파악
3. 수정 또는 추가

# ❌ Bad
1. 파일을 읽지 않고 수정
2. 기존 코드와 충돌
```

### 환경 구분

```typescript
// Browser 환경 (Frontend)
if (typeof window !== 'undefined') {
  // localStorage, window.electron 사용 가능
}

// Node.js 환경 (Backend)
if (typeof window === 'undefined') {
  // fs, path, electron 모듈 사용 가능
}
```

### 의존성 확인

```bash
# package.json 확인
cat package.json | grep "dependencies"

# 설치된 패키지 확인
pnpm list
```

### 로그 활용

```typescript
import { logger } from '@/lib/utils/logger';

logger.info('Operation started', { userId: '123' });
logger.error('Operation failed', error);
```

### Git 작업

```bash
# 항상 pull 먼저
git pull

# 변경사항 확인
git status
git diff

# 커밋
git add .
git commit -m "feat: 새 기능 추가"
git push
```

## 문서 참고

### Skills (프로젝트 전문 지식)

`.claude/skills/` 디렉토리에 12개의 상세 가이드:

1. **electron-ipc**: IPC 통신 패턴
2. **typescript-strict**: TypeScript strict mode
3. **react-shadcn**: React + shadcn/ui 패턴
4. **testing-patterns**: Jest, React Testing Library, Playwright
5. **error-handling**: 에러 처리 및 로깅
6. **performance-optimization**: 성능 최적화
7. **state-management**: Zustand 상태 관리
8. **file-operations**: 파일 시스템 작업
9. **extension-development**: Extension 개발 가이드
10. **langgraph-agent**: LangGraph Agent 패턴
11. **mcp-integration**: MCP 통합
12. **rag-vector-search**: RAG 구현

### 기타 문서

- `CLAUDE.md`: Claude를 위한 컨텍스트 (유사한 내용)
- `AGENT.md`: AI Agent 개발 종합 가이드 (작성 예정)
- `README.md`: 프로젝트 소개 및 설치 가이드
- `release_notes/`: 버전별 릴리스 노트 (한국어)
- `extensions/*/README.md`: Extension별 문서

## 주의사항

### 절대 하지 말 것

1. ❌ API 키, 토큰 하드코딩
2. ❌ 사용자 경로, 개인정보 커밋
3. ❌ `any` 타입 남발
4. ❌ 파일 읽지 않고 수정
5. ❌ IPC 에러 처리 생략
6. ❌ Path Traversal 취약점
7. ❌ 영어 커밋 메시지

### 항상 할 것

1. ✅ 파일 수정 전 읽기
2. ✅ TypeScript strict mode 준수
3. ✅ IPC 에러 처리 (`{ success, error, data }`)
4. ✅ 한국어 커밋 메시지
5. ✅ 보안 체크 (XSS, Injection, Path Traversal)
6. ✅ 테스트 작성 (중요한 기능)
7. ✅ Release notes 업데이트

## 요약

**SEPilot Desktop**은 Electron + Next.js 기반의 전문 LLM 데스크톱 애플리케이션입니다.

**핵심 기술:**

- Frontend: Next.js, React, TypeScript, Tailwind, shadcn/ui
- Backend: Electron, Node.js, better-sqlite3
- AI: LangGraph, MCP, RAG, OpenAI/Anthropic/Gemini
- State: Zustand (Slice 패턴)
- Test: Jest, React Testing Library, Playwright

**개발 원칙:**

- TypeScript strict mode 준수
- IPC 보안 및 에러 처리
- Extension 시스템으로 모듈화
- 한국어 커밋 메시지
- Skills 문서 참고

**유용한 명령어:**

```bash
pnpm dev              # 개발 서버
pnpm lint             # 린트
pnpm type-check       # 타입 체크
pnpm test             # 테스트
pnpm build            # 프로덕션 빌드
```

더 자세한 내용은 `.claude/skills/` 디렉토리의 12개 가이드 문서를 참고하세요!
