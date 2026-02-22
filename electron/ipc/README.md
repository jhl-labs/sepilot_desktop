# electron/ipc/ - IPC 통신 핸들러

> Electron Main Process와 Renderer Process 간 양방향 통신을 담당하는 IPC 핸들러 시스템

## 📋 목차

- [개요](#개요)
- [폴더 구조](#폴더-구조)
- [Feature별 핸들러](#feature별-핸들러)
- [새 IPC 핸들러 추가 가이드](#새-ipc-핸들러-추가-가이드)
- [채널 명명 규칙](#채널-명명-규칙)
- [보안 및 에러 처리](#보안-및-에러-처리)
- [스트리밍 패턴](#스트리밍-패턴)
- [테스트 방법](#테스트-방법)
- [예제 코드](#예제-코드)
- [관련 문서](#관련-문서)

---

## 개요

IPC(Inter-Process Communication) 시스템은 SEPilot Desktop의 Frontend(Renderer)와 Backend(Main Process) 간 통신을 담당합니다.

**핵심 원칙:**

- **Feature별 그룹화**: 관련 핸들러를 feature 폴더로 조직화
- **명확한 책임 분리**: 각 핸들러는 단일 도메인만 담당
- **보안 중심 설계**: 입력 검증, 권한 확인, 에러 처리 필수
- **스트리밍 지원**: 실시간 데이터 전송 (LLM, LangGraph)

**주요 역할:**

- Renderer → Main: `ipcMain.handle()` - 요청/응답 패턴
- Main → Renderer: `webContents.send()` - 이벤트 전송 (스트리밍)
- 비즈니스 로직 위임: `lib/domains/` 호출, 핸들러는 중개자 역할

---

## 폴더 구조

```
electron/ipc/
├── index.ts                      # 모든 핸들러 등록 총괄
├── handlers/                     # Feature별 핸들러 (13개 그룹)
│   ├── llm/                      # LLM 관련
│   │   ├── index.ts
│   │   └── llm.ts
│   ├── chat/                     # Chat 관련
│   │   ├── index.ts
│   │   ├── chat.ts
│   │   ├── message-subscription.ts
│   │   └── persona.ts
│   ├── mcp/                      # MCP 관련
│   │   ├── index.ts
│   │   └── mcp.ts
│   ├── agent/                    # Agent 관련
│   │   ├── index.ts
│   │   ├── langgraph.ts
│   │   ├── architect-handlers.ts
│   │   └── editor-extension.ts
│   ├── data/                     # Data 관련
│   │   ├── index.ts
│   │   ├── vectordb.ts
│   │   ├── embeddings.ts
│   │   └── activity.ts
│   ├── file/                     # File 관련
│   │   ├── index.ts
│   │   └── file.ts
│   ├── browser/                  # Browser 관련
│   │   ├── index.ts
│   │   ├── browser-view.ts
│   │   └── browser-control.ts
│   ├── terminal/                 # Terminal 관련
│   │   ├── index.ts
│   │   └── terminal.ts
│   ├── extension/                # Extension 관련
│   │   ├── index.ts
│   │   ├── extension-handlers.ts
│   │   ├── extension-llm.ts
│   │   ├── extension-mcp.ts
│   │   ├── extension-fs.ts
│   │   ├── extension-vectordb.ts
│   │   ├── extension-skills.ts
│   │   └── extension-diagnostics.ts
│   ├── integration/              # 외부 통합
│   │   ├── index.ts
│   │   ├── github.ts
│   │   ├── github-sync.ts
│   │   ├── team-docs.ts
│   │   └── comfyui.ts
│   ├── system/                   # 시스템 관련
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── auth.ts
│   │   ├── update.ts
│   │   ├── notification.ts
│   │   ├── error-reporting.ts
│   │   ├── scheduler.ts
│   │   └── webhook.ts
│   ├── skill/                    # Skill 관련
│   │   ├── index.ts
│   │   └── skills.ts
│   └── quick-input/              # Quick Input
│       ├── index.ts
│       └── quick-input.ts
└── utils/                        # IPC 유틸리티
```

---

## Feature별 핸들러

### 🤖 llm/ - LLM 통신

**역할:** LLM API 호출 및 스트리밍 처리

**주요 채널:**

- `llm-stream-chat` - LLM 스트리밍 채팅 (실시간 토큰)
- `llm-chat` - 일반 채팅 (비스트리밍)
- `llm-init` - LLM 클라이언트 초기화
- `llm-validate` - 설정 검증
- `llm-get-models` - 사용 가능한 모델 목록

**스트리밍 이벤트:**

- `llm-stream-chunk` - 토큰 청크
- `llm-stream-done` - 완료
- `llm-stream-error` - 에러

---

### 🧠 agent/ - LangGraph Agent

**역할:** LangGraph 기반 AI 에이전트 실행

**주요 채널:**

- `langgraph-stream` - Agent 스트리밍 실행
- `langgraph-abort` - Agent 중단
- `langgraph-tool-approval-response` - Tool 승인 응답
- `architect:*` - Architect Extension IPC
- `editor-extension:*` - Editor Extension IPC

**스트리밍 이벤트:**

- `langgraph-stream-event` - Agent 이벤트 (chunk, node, tool_approval_request)
- `langgraph-stream-done` - 완료
- `langgraph-stream-error` - 에러

---

### 🔌 mcp/ - Model Context Protocol

**역할:** MCP 서버 관리 및 도구 호출

**주요 채널:**

- `mcp-add-server` - MCP 서버 추가
- `mcp-remove-server` - MCP 서버 제거
- `mcp-call-tool` - MCP 도구 호출
- `mcp-get-all-tools` - 모든 도구 목록
- `mcp-get-server-status` - 서버 상태 조회

---

### 💬 chat/ - 채팅 관리

**역할:** 대화 저장/로드, 메시지 구독, 페르소나

**주요 채널:**

- `chat-save` - 대화 저장
- `chat-load` - 대화 로드
- `chat-delete` - 대화 삭제
- `chat-list` - 대화 목록
- `message-subscribe` - 메시지 구독
- `persona-*` - 페르소나 CRUD

---

### 📊 data/ - 데이터 관리

**역할:** VectorDB, Embeddings, 활동 로그

**주요 채널:**

- `vectordb-search` - 벡터 검색
- `vectordb-insert` - 문서 삽입
- `vectordb-index-documents` - 문서 인덱싱
- `embeddings-generate` - 임베딩 생성
- `activity-log` - 활동 로그 저장

---

### 📁 file/ - 파일 시스템

**역할:** 파일 읽기/쓰기, 디렉토리 탐색

**주요 채널:**

- `file:read` - 파일 읽기
- `fs:read-file` - 파일 읽기 (alias)
- `fs:write-file` - 파일 쓰기
- `fs:search-files` - 파일 검색
- `fs:list-directory` - 디렉토리 목록

---

### 🌐 browser/ - Browser View

**역할:** BrowserView 탭 관리 및 제어

**주요 채널:**

- `browser-view:load-url` - URL 로드
- `browser-view:execute-script` - 스크립트 실행
- `browser-view:create-tab` - 탭 생성
- `browser-view:close-tab` - 탭 닫기
- `browser-control:screenshot` - 스크린샷

---

### 💻 terminal/ - 터미널

**역할:** PTY 터미널 세션 관리

**주요 채널:**

- `terminal:create-session` - 세션 생성
- `terminal:execute-command` - 명령어 실행
- `terminal:resize` - 터미널 크기 조정
- `terminal:kill` - 세션 종료

---

### 🧩 extension/ - Extension 시스템

**역할:** Extension 관리 및 Extension 전용 API

**주요 채널:**

- `extension:discover` - Extension 검색
- `extension:install` - Extension 설치
- `extension:install-from-file` - 파일에서 설치
- `extension:uninstall` - Extension 제거
- `extension:llm:*` - Extension LLM API
- `extension:mcp:*` - Extension MCP API
- `extension:fs:*` - Extension 파일 API
- `extension:vectordb:*` - Extension VectorDB API
- `extension:skills:*` - Extension Skill API

---

### 🔗 integration/ - 외부 통합

**역할:** GitHub, ComfyUI, Team Docs 통합

**주요 채널:**

- `github:*` - GitHub API 호출
- `github-sync:*` - GitHub 동기화
- `team-docs:*` - Team Docs 관리
- `comfyui:*` - ComfyUI 워크플로우

---

### ⚙️ system/ - 시스템 관리

**역할:** 설정, 인증, 업데이트, 알림, 에러 보고, 스케줄러, Webhook

**주요 채널:**

- `config:*` - 설정 CRUD
- `auth:*` - GitHub OAuth 인증
- `update:*` - 앱 업데이트
- `notification:*` - 알림 관리
- `error-reporting:*` - 에러 보고
- `scheduler:*` - 작업 스케줄링
- `webhook:*` - Webhook 이벤트

---

### 🎯 skill/ - 스킬 관리

**역할:** 프로젝트별 전문 지식 관리

**주요 채널:**

- `skills:load` - 스킬 로드
- `skills:save` - 스킬 저장
- `skills:delete` - 스킬 삭제
- `skills:list` - 스킬 목록

---

### ⚡ quick-input/ - Quick Input

**역할:** 빠른 입력 윈도우 관리

**주요 채널:**

- `quick-input:show` - Quick Input 표시
- `quick-input:hide` - Quick Input 숨김
- `quick-input:submit` - 입력 제출

---

## 새 IPC 핸들러 추가 가이드

### 1. Feature 결정

새 핸들러를 추가하기 전 적절한 feature 폴더를 결정:

- **기존 feature 확장**: 기존 폴더에 파일 추가 (예: `llm/new-handler.ts`)
- **새 feature 생성**: 새 폴더 생성 (예: `analytics/`)

### 2. 핸들러 파일 생성

**예시: `handlers/llm/model-info.ts`**

```typescript
import { ipcMain } from 'electron';
import { logger } from '../../../services/logger';
import { LLMClient } from '@/lib/domains/llm/client';

/**
 * LLM 모델 정보 핸들러
 */
export function setupModelInfoHandlers() {
  // 모델 목록 조회
  ipcMain.handle('llm-get-models', async () => {
    try {
      logger.info('llm-get-models: 모델 목록 조회 시작');

      const client = LLMClient.getInstance();
      const models = await client.getAvailableModels();

      logger.info(`llm-get-models: 모델 ${models.length}개 조회 완료`);
      return { success: true, models };
    } catch (error) {
      logger.error('llm-get-models 에러:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 에러',
      };
    }
  });
}
```

### 3. index.ts에 Export 추가

**`handlers/llm/index.ts`**

```typescript
export { setupLLMHandlers } from './llm';
export { setupModelInfoHandlers } from './model-info';
```

### 4. electron/ipc/index.ts에 등록

```typescript
// LLM handlers
import {
  setupLLMHandlers,
  setupModelInfoHandlers, // 추가
} from './handlers/llm';

export function setupIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  registerShortcuts: () => Promise<void>
) {
  // ...

  // LLM
  setupLLMHandlers();
  setupModelInfoHandlers(); // 추가

  // ...
}
```

### 5. Preload에 API 노출

**`electron/preload.ts`**

```typescript
const electronAPI = {
  llm: {
    streamChat: (messages: Message[], options: LLMOptions) =>
      ipcRenderer.invoke('llm-stream-chat', messages, options),

    getModels: () => ipcRenderer.invoke('llm-get-models'), // 추가
  },
};
```

### 6. Frontend에서 사용

```typescript
// components/settings/LLMSettings.tsx
const models = await window.electronAPI.llm.getModels();
console.log('사용 가능한 모델:', models);
```

### 7. 체크리스트

새 IPC 핸들러 추가 시 확인:

- [ ] 핸들러 파일 생성 (handlers/{feature}/{handler}.ts)
- [ ] index.ts에 export 추가
- [ ] electron/ipc/index.ts에 등록
- [ ] preload.ts에 API 노출
- [ ] TypeScript 타입 정의 (types/electron.d.ts)
- [ ] 에러 처리 및 로깅
- [ ] 입력 검증 (보안)
- [ ] 테스트 작성
- [ ] 문서 업데이트

---

## 채널 명명 규칙

### 1. 채널명 형식

```
{feature}-{action}
{feature}:{action}
```

**예시:**

- `llm-stream-chat` (kebab-case)
- `file:read` (colon 구분)
- `extension:llm:chat` (중첩 구분)

### 2. Feature 접두사

| Feature   | 접두사             | 예시                     |
| --------- | ------------------ | ------------------------ |
| LLM       | `llm-`             | llm-stream-chat          |
| Chat      | `chat-`            | chat-save                |
| MCP       | `mcp-`             | mcp-call-tool            |
| File      | `file:` 또는 `fs:` | file:read, fs:write-file |
| Browser   | `browser-view:`    | browser-view:load-url    |
| Terminal  | `terminal:`        | terminal:execute-command |
| Extension | `extension:`       | extension:install        |
| Agent     | `langgraph-`       | langgraph-stream         |

### 3. Action 동사

**CRUD 패턴:**

- `create` - 생성
- `read` - 조회
- `update` - 수정
- `delete` - 삭제
- `list` - 목록

**기타 액션:**

- `stream` - 스트리밍
- `execute` - 실행
- `validate` - 검증
- `init` - 초기화
- `abort` - 중단

### 4. 스트리밍 이벤트 명명

```
{feature}-stream-{event-type}
```

**예시:**

- `llm-stream-chunk` - 데이터 청크
- `llm-stream-done` - 완료
- `llm-stream-error` - 에러

---

## 보안 및 에러 처리

### 1. 입력 검증

**필수 검증 항목:**

- 타입 검증 (TypeScript + 런타임)
- 범위 검증 (숫자, 문자열 길이)
- Path Traversal 방지 (파일 경로)
- SQL Injection 방지 (DB 쿼리)
- Command Injection 방지 (exec 명령어)

**예시:**

```typescript
ipcMain.handle('file:read', async (event, filePath: string) => {
  // 1. 타입 검증
  if (typeof filePath !== 'string') {
    throw new Error('filePath는 문자열이어야 합니다');
  }

  // 2. Path Traversal 방지
  const normalizedPath = path.normalize(filePath);
  if (normalizedPath.includes('..')) {
    throw new Error('상위 디렉토리 접근 금지');
  }

  // 3. 허용된 경로 확인
  const userDataPath = app.getPath('userData');
  if (!normalizedPath.startsWith(userDataPath)) {
    throw new Error('허용되지 않은 경로');
  }

  // 4. 파일 읽기
  return fs.readFile(normalizedPath, 'utf-8');
});
```

### 2. 에러 처리 패턴

**표준 응답 형식:**

```typescript
interface IPCResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

**핸들러 구조:**

```typescript
ipcMain.handle('feature-action', async (event, ...args) => {
  try {
    logger.info('feature-action: 시작', args);

    // 입력 검증
    validateInput(args);

    // 비즈니스 로직 (lib/domains/ 호출)
    const result = await domainService.execute(args);

    logger.info('feature-action: 성공', result);
    return { success: true, data: result };
  } catch (error) {
    logger.error('feature-action 에러:', error);

    // 사용자 친화적 에러 메시지
    const message = error instanceof Error ? error.message : '알 수 없는 에러가 발생했습니다';

    return { success: false, error: message };
  }
});
```

### 3. 로깅

**로깅 레벨:**

- `logger.info()` - 정상 작동
- `logger.warn()` - 경고 (복구 가능)
- `logger.error()` - 에러 (복구 필요)

**로깅 내용:**

- 채널명
- 입력 파라미터 (민감 정보 제외)
- 실행 시간
- 결과 요약

---

## 스트리밍 패턴

### 1. 스트리밍 채널 설계

**요청 채널:** `{feature}-stream`
**이벤트 채널:** `{feature}-stream-{event}`

**예시: LLM 스트리밍**

```typescript
// Main Process 핸들러
ipcMain.handle('llm-stream-chat', async (event, messages, options) => {
  try {
    const client = LLMClient.getInstance();
    const conversationId = options.conversationId;

    // 스트리밍 시작
    for await (const chunk of client.stream(messages, options)) {
      // 실시간 토큰 전송
      event.sender.send('llm-stream-chunk', {
        conversationId,
        chunk,
      });
    }

    // 완료 이벤트
    event.sender.send('llm-stream-done', { conversationId });
  } catch (error) {
    // 에러 이벤트
    event.sender.send('llm-stream-error', {
      conversationId,
      error: error.message,
    });
  }
});
```

### 2. Frontend 리스너

```typescript
// Frontend 컴포넌트
useEffect(() => {
  const handleChunk = (data: { conversationId: string; chunk: string }) => {
    if (data.conversationId === currentConversationId) {
      setContent((prev) => prev + data.chunk);
    }
  };

  const handleDone = (data: { conversationId: string }) => {
    if (data.conversationId === currentConversationId) {
      setIsStreaming(false);
    }
  };

  const handleError = (data: { conversationId: string; error: string }) => {
    if (data.conversationId === currentConversationId) {
      toast.error(data.error);
      setIsStreaming(false);
    }
  };

  window.electronAPI.on('llm-stream-chunk', handleChunk);
  window.electronAPI.on('llm-stream-done', handleDone);
  window.electronAPI.on('llm-stream-error', handleError);

  return () => {
    window.electronAPI.off('llm-stream-chunk', handleChunk);
    window.electronAPI.off('llm-stream-done', handleDone);
    window.electronAPI.off('llm-stream-error', handleError);
  };
}, [currentConversationId]);
```

### 3. 스트리밍 격리

**conversationId 기반 격리:**

다중 동시 스트림을 지원하려면 각 스트림에 고유 ID를 부여:

```typescript
// Frontend: 스트림 시작
const conversationId = uuidv4();
await window.electronAPI.llm.streamChat(messages, { conversationId });

// Main: conversationId별로 이벤트 전송
event.sender.send('llm-stream-chunk', { conversationId, chunk });

// Frontend: conversationId 필터링
if (data.conversationId === currentConversationId) {
  // 현재 대화에만 적용
}
```

### 4. 스트리밍 중단

```typescript
// Main Process
ipcMain.handle('llm-abort', async (event, conversationId: string) => {
  const client = LLMClient.getInstance();
  client.abort(conversationId);
});

// Frontend
const handleAbort = () => {
  window.electronAPI.llm.abort(conversationId);
};
```

---

## 테스트 방법

### 1. 단위 테스트

**핸들러 테스트 예시:**

```typescript
// tests/electron/ipc/handlers/llm.test.ts
import { ipcMain } from 'electron';
import { setupLLMHandlers } from '@/electron/ipc/handlers/llm';

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
}));

describe('LLM IPC Handlers', () => {
  beforeEach(() => {
    setupLLMHandlers();
  });

  it('should register llm-stream-chat handler', () => {
    expect(ipcMain.handle).toHaveBeenCalledWith('llm-stream-chat', expect.any(Function));
  });

  it('should handle llm-stream-chat request', async () => {
    const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
      (call) => call[0] === 'llm-stream-chat'
    )[1];

    const mockEvent = { sender: { send: jest.fn() } };
    const messages = [{ role: 'user', content: 'Hello' }];

    await handler(mockEvent, messages, {});

    expect(mockEvent.sender.send).toHaveBeenCalledWith('llm-stream-done', expect.any(Object));
  });
});
```

### 2. 통합 테스트

**E2E 테스트 (Playwright):**

```typescript
// tests/e2e/ipc/llm.spec.ts
import { test, expect } from '@playwright/test';

test('LLM 스트리밍 채팅', async ({ page }) => {
  // 새 대화 생성
  await page.click('button[data-testid="new-chat"]');

  // 메시지 입력
  await page.fill('textarea[data-testid="chat-input"]', 'Hello');
  await page.click('button[data-testid="send"]');

  // 스트리밍 응답 대기
  await page.waitForSelector('[data-testid="message-bubble"]:has-text("Hello")');

  // LLM 응답 확인
  const response = await page.textContent('[data-testid="message-bubble"]:last-child');
  expect(response).toBeTruthy();
});
```

### 3. 수동 테스트

**개발자 도구 콘솔:**

```javascript
// Frontend 콘솔에서 IPC 테스트
await window.electronAPI.llm.streamChat([{ role: 'user', content: 'Test message' }], {
  conversationId: 'test-123',
});

// 이벤트 리스너
window.electronAPI.on('llm-stream-chunk', console.log);
window.electronAPI.on('llm-stream-done', console.log);
```

### 4. 테스트 체크리스트

- [ ] 정상 케이스 (성공)
- [ ] 에러 케이스 (실패)
- [ ] 입력 검증 (잘못된 타입, 범위)
- [ ] 권한 확인 (허용되지 않은 경로)
- [ ] 동시성 (여러 요청)
- [ ] 스트리밍 (중단, 에러)

---

## 예제 코드

### 예제 1: 간단한 요청/응답 핸들러

```typescript
// handlers/skill/skills.ts
import { ipcMain } from 'electron';
import { logger } from '../../../services/logger';
import { SkillManager } from '@/lib/domains/skill/manager';

export function registerSkillsHandlers() {
  // 스킬 목록 조회
  ipcMain.handle('skills:list', async () => {
    try {
      logger.info('skills:list 시작');

      const manager = new SkillManager();
      const skills = await manager.listSkills();

      logger.info(`skills:list 완료: ${skills.length}개`);
      return { success: true, skills };
    } catch (error) {
      logger.error('skills:list 에러:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '스킬 목록 조회 실패',
      };
    }
  });

  // 스킬 저장
  ipcMain.handle('skills:save', async (event, skill) => {
    try {
      logger.info('skills:save 시작:', skill.id);

      const manager = new SkillManager();
      await manager.saveSkill(skill);

      logger.info('skills:save 완료:', skill.id);
      return { success: true };
    } catch (error) {
      logger.error('skills:save 에러:', error);
      return { success: false, error: error.message };
    }
  });
}
```

### 예제 2: 스트리밍 핸들러 (LangGraph Agent)

```typescript
// handlers/agent/langgraph.ts
import { ipcMain } from 'electron';
import { GraphFactory } from '@/lib/domains/agent/factory/GraphFactory';

export function setupLangGraphHandlers() {
  // Agent 스트리밍 실행
  ipcMain.handle('langgraph-stream', async (event, graphConfig, messages, options) => {
    const conversationId = options.conversationId;

    try {
      logger.info(`langgraph-stream 시작: ${conversationId}`);

      // Tool 승인 콜백
      const toolApprovalCallback = async (toolCalls) => {
        return new Promise((resolve) => {
          event.sender.send('langgraph-stream-event', {
            conversationId,
            type: 'tool_approval_request',
            toolCalls,
          });

          // 승인 응답 대기 (ipcMain.once)
          ipcMain.once(`langgraph-tool-approval-${conversationId}`, (_, approved) => {
            resolve(approved);
          });
        });
      };

      // 그래프 스트리밍
      const stream = await GraphFactory.streamWithConfig(graphConfig, messages, {
        ...options,
        toolApprovalCallback,
      });

      for await (const streamEvent of stream) {
        // 이벤트 전송
        event.sender.send('langgraph-stream-event', {
          conversationId,
          ...streamEvent,
        });
      }

      event.sender.send('langgraph-stream-done', { conversationId });
    } catch (error) {
      logger.error('langgraph-stream 에러:', error);
      event.sender.send('langgraph-stream-error', {
        conversationId,
        error: error.message,
      });
    }
  });

  // Agent 중단
  ipcMain.handle('langgraph-abort', async (event, conversationId) => {
    logger.info(`langgraph-abort: ${conversationId}`);
    // AbortController 로직
  });
}
```

### 예제 3: Extension 전용 핸들러

```typescript
// handlers/extension/extension-llm.ts
import { ipcMain } from 'electron';
import { LLMClient } from '@/lib/domains/llm/client';
import { extensionRegistry } from '@/lib/extensions/registry';

export function registerExtensionLLMHandlers() {
  // Extension 권한 확인
  const checkExtensionPermission = (extensionId: string, permission: string) => {
    const extension = extensionRegistry.get(extensionId);
    if (!extension) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    const permissions = extension.manifest.permissions || [];
    if (!permissions.includes(permission)) {
      throw new Error(`Permission denied: ${permission}`);
    }
  };

  // Extension LLM 채팅
  ipcMain.handle('extension:llm:chat', async (event, extensionId, messages, options) => {
    try {
      // 권한 확인
      checkExtensionPermission(extensionId, 'llm:chat');

      logger.info(`extension:llm:chat: ${extensionId}`);

      const client = LLMClient.getInstance();
      const response = await client.chat(messages, options);

      return { success: true, response };
    } catch (error) {
      logger.error('extension:llm:chat 에러:', error);
      return { success: false, error: error.message };
    }
  });
}
```

---

## 관련 문서

### 아키텍처

- [docs/architecture/folder-structure.md](../../docs/architecture/folder-structure.md) - 전체 폴더 구조
- [docs/architecture/dependency-rules.md](../../docs/architecture/dependency-rules.md) - 의존성 규칙

### 개발 가이드

- [lib/README.md](../../lib/README.md) - 비즈니스 로직 라이브러리
- [CLAUDE.md](../../CLAUDE.md) - 프로젝트 전체 가이드

### Extension 개발

- [lib/extension-sdk/README.md](../../lib/extension-sdk/README.md) - Extension SDK
- Extension IPC 패턴 - Extension 전용 IPC 사용법

---

## 변경 이력

- **2025-02-10**: Phase 2 리팩토링 완료 (Feature별 그룹화)
- **2025-01-17**: 초기 IPC 시스템 구축
