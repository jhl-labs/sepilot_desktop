# SEPilot Desktop E2E 테스트 가이드

## 개요

이 문서는 SEPilot Desktop의 End-to-End (E2E) 테스트 인프라에 대한 완전한 가이드입니다.
**Electron 애플리케이션**의 특수성을 고려하여 설계되었으며, Playwright를 사용하여 실제 사용자 시나리오를 자동화된 UI 테스트로 검증합니다.

## 🎯 E2E 테스트의 목적

### 기존 테스트와의 차이점

| 테스트 유형           | 범위                  | 도구                      | 환경                 |
| --------------------- | --------------------- | ------------------------- | -------------------- |
| **Unit Tests**        | 개별 함수/컴포넌트    | Jest + Testing Library    | jsdom (모의 DOM)     |
| **Integration Tests** | 여러 모듈 간 상호작용 | Jest                      | Node.js              |
| **E2E Tests**         | **전체 앱 동작**      | **Playwright + Electron** | **실제 Electron 앱** |

### E2E 테스트가 검증하는 것

1. **실제 Electron 프로세스**: Main Process + Renderer Process 통합
2. **IPC 통신**: Frontend ↔ Backend 실제 통신
3. **파일 시스템**: 실제 사용자 데이터 저장/로드
4. **네이티브 기능**: Electron API (dialog, shell, clipboard 등)
5. **전체 사용자 플로우**: 앱 시작부터 종료까지

## 🏗️ Electron 애플리케이션 아키텍처 이해

### Electron의 특수성

```
┌─────────────────────────────────────────┐
│         Electron Application            │
├─────────────────────────────────────────┤
│  Main Process (Node.js)                 │
│  - electron/main.ts                     │
│  - IPC Handlers                         │
│  - File System Access                   │
│  - Native APIs                          │
├─────────────────────────────────────────┤
│           ↕ IPC Communication           │
├─────────────────────────────────────────┤
│  Renderer Process (Chromium)            │
│  - Next.js App (React)                  │
│  - window.electron.invoke()             │
│  - UI Components                        │
└─────────────────────────────────────────┘
```

### E2E 테스트에서 고려해야 할 사항

#### 1. **프로세스 분리**

- Main Process와 Renderer Process는 별도 프로세스
- 테스트는 Renderer Process의 UI만 접근 가능
- IPC를 통해서만 Backend 기능 호출

#### 2. **비동기 특성**

- IPC 호출: `window.electron.invoke()` → Promise 반환
- AI 응답: 스트리밍 방식, 가변적인 응답 시간
- 파일 I/O: 비동기 작업
- 네트워크 요청: 외부 API 호출

#### 3. **상태 격리**

- 각 테스트는 독립적인 사용자 데이터 디렉토리 사용
- `app.getPath('userData')` 경로 분리 필요
- 테스트 간 데이터 오염 방지

#### 4. **빌드 방식**

- Development vs Production 빌드
- E2E 테스트는 프로덕션 빌드 사용 권장
- 빌드 후 실행 파일 경로 확인 필요

## 🛠️ 기술 스택

### Playwright for Electron

**선정 이유:**

- ✅ **공식 Electron 지원**: `electron.launch()` API 제공
- ✅ **멀티 플랫폼**: Linux, macOS, Windows
- ✅ **강력한 선택자**: CSS, XPath, Text, Role 기반
- ✅ **자동 대기**: 요소가 ready 상태가 될 때까지 자동 대기
- ✅ **스크린샷/비디오**: 실패 시 디버깅 용이
- ✅ **네트워크 인터셉트**: API 호출 모킹 가능
- ✅ **TypeScript 네이티브**: 타입 안전성

**대안과 비교:**

| 프레임워크     | Electron 지원 | 상태                 | 비고               |
| -------------- | ------------- | -------------------- | ------------------ |
| **Playwright** | ✅ 공식 지원  | 활발히 유지보수      | **추천**           |
| Spectron       | ✅ 전용       | ❌ Deprecated (2021) | 사용 불가          |
| WebdriverIO    | ⚠️ 제한적     | 유지보수 중          | 설정 복잡          |
| Puppeteer      | ⚠️ 실험적     | 유지보수 중          | Electron 지원 약함 |

### 핵심 의존성

```json
{
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "electron": "^39.2.4"
  }
}
```

## 📁 디렉토리 구조

```
e2e_tests/
├── README.md                    # 이 파일
├── playwright.config.ts         # Playwright 설정
│
├── fixtures/                    # 테스트용 데이터
│   ├── sample-config.json       # 설정 파일 샘플
│   ├── sample-chat.json         # 채팅 세션 샘플
│   ├── sample-mcp-servers.json  # MCP 서버 설정 샘플
│   └── sample-documents/        # RAG 테스트용 문서
│
├── helpers/                     # 테스트 유틸리티
│   ├── app-launcher.ts          # Electron 앱 시작/종료
│   ├── page-objects/            # Page Object Pattern
│   │   ├── chat-page.ts         # 채팅 페이지
│   │   ├── settings-page.ts     # 설정 페이지
│   │   ├── browser-page.ts      # 브라우저 페이지
│   │   └── base-page.ts         # 공통 기능
│   ├── test-data.ts             # 테스트 데이터 팩토리
│   └── assertions.ts            # 커스텀 assertion
│
├── specs/                       # 테스트 시나리오
│   ├── 01-app-launch.spec.ts    # 앱 실행 기본 테스트
│   ├── 02-chat-session.spec.ts  # 채팅 세션 테스트
│   ├── 03-settings.spec.ts      # 설정 관리 테스트
│   ├── 04-file-system.spec.ts   # 파일 시스템 테스트
│   ├── 05-mcp-integration.spec.ts # MCP 통합 테스트
│   ├── 06-browser-agent.spec.ts # 브라우저 에이전트 테스트
│   └── 07-rag-workflow.spec.ts  # RAG 워크플로우 테스트
│
├── screenshots/                 # 실패 시 스크린샷
├── videos/                      # 테스트 실행 비디오
└── test-results/                # Playwright 리포트
```

## 🔧 설정 상세

### playwright.config.ts 주요 설정

```typescript
import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './specs',

  // Electron 앱 빌드가 느리므로 타임아웃 증가
  timeout: 60000, // 60초

  // 각 테스트는 격리된 환경에서 실행
  fullyParallel: false, // Electron 앱 동시 실행 제한

  // 실패 시 재시도
  retries: process.env.CI ? 2 : 0,

  // 워커 수 (Electron 앱 리소스 고려)
  workers: process.env.CI ? 1 : 2,

  // 리포터
  reporter: [
    ['html', { outputFolder: 'test-results' }],
    ['list'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  use: {
    // 스크린샷: 실패 시에만
    screenshot: 'only-on-failure',

    // 비디오: 실패 시 첫 번째 재시도에서
    video: 'retain-on-failure',

    // 추적: 실패 시에만
    trace: 'retain-on-failure',
  },
});
```

### Electron 앱 시작 설정

```typescript
// helpers/app-launcher.ts
import { _electron as electron } from 'playwright';
import path from 'path';

export async function launchElectronApp(options = {}) {
  const app = await electron.launch({
    // 프로덕션 빌드 실행
    args: [path.join(__dirname, '../../dist/electron/electron/main.js')],

    // 테스트용 사용자 데이터 디렉토리
    env: {
      ...process.env,
      // 각 테스트마다 독립적인 데이터 디렉토리
      ELECTRON_USER_DATA_PATH: path.join(__dirname, '../.test-user-data'),
    },
  });

  return app;
}
```

## 📝 테스트 시나리오 상세

### 1. 앱 실행 테스트 (01-app-launch.spec.ts)

**목적**: Electron 앱이 정상적으로 시작되고 초기화되는지 검증

**시나리오:**

```typescript
test('Electron 앱이 정상적으로 시작된다', async () => {
  // 1. Electron 앱 시작
  const app = await launchElectronApp();

  // 2. 메인 윈도우 획득
  const window = await app.firstWindow();

  // 3. 윈도우 타이틀 확인
  const title = await window.title();
  expect(title).toBe('SEPilot Desktop');

  // 4. 앱 정상 종료
  await app.close();
});
```

**검증 항목:**

- ✅ Electron 프로세스 시작
- ✅ BrowserWindow 생성
- ✅ Next.js 앱 로딩
- ✅ 초기 화면 렌더링
- ✅ 기본 설정 로드

### 2. 채팅 세션 테스트 (02-chat-session.spec.ts)

**목적**: 핵심 기능인 AI 채팅이 정상 작동하는지 검증

**시나리오:**

```typescript
test('새 채팅 세션을 생성하고 메시지를 전송한다', async () => {
  const app = await launchElectronApp();
  const window = await app.firstWindow();
  const chatPage = new ChatPage(window);

  // 1. 새 채팅 세션 생성
  await chatPage.createNewSession();

  // 2. 메시지 입력
  await chatPage.typeMessage('Hello, AI!');

  // 3. 메시지 전송
  await chatPage.sendMessage();

  // 4. AI 응답 대기 (최대 30초)
  await chatPage.waitForResponse({ timeout: 30000 });

  // 5. 응답이 화면에 표시되는지 확인
  const response = await chatPage.getLastResponse();
  expect(response).toBeTruthy();

  await app.close();
});
```

**Electron 특수 고려사항:**

- IPC 통신: `window.electron.invoke('send-message', ...)`
- 스트리밍 응답: `event.sender.send('message-chunk', ...)`
- 비동기 대기: 응답 시간이 가변적

### 3. 설정 관리 테스트 (03-settings.spec.ts)

**목적**: 설정 변경이 파일 시스템에 올바르게 저장되는지 검증

**시나리오:**

```typescript
test('LLM 설정을 변경하고 저장한다', async () => {
  const app = await launchElectronApp();
  const window = await app.firstWindow();
  const settingsPage = new SettingsPage(window);

  // 1. 설정 다이얼로그 열기
  await settingsPage.open();

  // 2. LLM 제공자 변경
  await settingsPage.selectLLMProvider('OpenAI');

  // 3. API 키 입력 (테스트용 더미 키)
  await settingsPage.setAPIKey('sk-test-1234567890');

  // 4. 설정 저장
  await settingsPage.save();

  // 5. 앱 재시작 후 설정 유지 확인
  await app.close();

  const app2 = await launchElectronApp();
  const window2 = await app2.firstWindow();
  const settingsPage2 = new SettingsPage(window2);

  await settingsPage2.open();
  const savedProvider = await settingsPage2.getLLMProvider();
  expect(savedProvider).toBe('OpenAI');

  await app2.close();
});
```

**Electron 특수 고려사항:**

- 파일 시스템: `app.getPath('userData')/config.json`
- 암호화: API 키는 암호화되어 저장
- 영구성: 앱 재시작 후에도 유지

### 4. 파일 시스템 테스트 (04-file-system.spec.ts)

**목적**: Electron의 네이티브 파일 시스템 기능 검증

**시나리오:**

```typescript
test('파일 탐색기에서 파일을 선택하고 읽는다', async () => {
  const app = await launchElectronApp();
  const window = await app.firstWindow();

  // 1. 파일 탐색기 열기
  await window.click('[data-testid="open-file-explorer"]');

  // 2. 테스트 파일 선택 (fixtures 폴더)
  // Note: Electron dialog는 직접 제어 불가
  // → IPC를 통해 프로그래매틱하게 파일 경로 전달
  await app.evaluate(
    async ({ dialog }, testFilePath) => {
      // Main Process에서 dialog.showOpenDialog 모킹
    },
    path.join(__dirname, '../fixtures/sample.txt')
  );

  // 3. 파일 내용 표시 확인
  const content = await window.textContent('[data-testid="file-content"]');
  expect(content).toContain('Expected content');

  await app.close();
});
```

**Electron 특수 고려사항:**

- Native Dialog: `dialog.showOpenDialog()` 직접 제어 불가
- IPC 통합 테스트: Main Process ↔ Renderer Process
- 파일 경로: 플랫폼별 경로 차이 (Windows: `C:\`, Unix: `/`)

### 5. MCP 통합 테스트 (05-mcp-integration.spec.ts)

**목적**: MCP 서버와의 통합 검증

**시나리오:**

```typescript
test('MCP 서버를 추가하고 도구를 호출한다', async () => {
  const app = await launchElectronApp();
  const window = await app.firstWindow();

  // 1. MCP 설정 열기
  await window.click('[data-testid="mcp-settings"]');

  // 2. 새 MCP 서버 추가 (테스트용 로컬 서버)
  await window.fill('[name="server-name"]', 'Test Server');
  await window.fill('[name="server-command"]', 'node');
  await window.fill('[name="server-args"]', 'test-mcp-server.js');
  await window.click('[data-testid="add-server"]');

  // 3. 서버 연결 대기
  await window.waitForSelector('[data-testid="server-connected"]');

  // 4. 채팅에서 MCP 도구 호출
  await window.click('[data-testid="new-chat"]');
  await window.fill('[data-testid="chat-input"]', 'Use test-tool with param1');
  await window.click('[data-testid="send-message"]');

  // 5. 도구 실행 결과 확인
  await window.waitForSelector('[data-testid="tool-result"]');

  await app.close();
});
```

**Electron 특수 고려사항:**

- 자식 프로세스: MCP 서버는 별도 Node.js 프로세스
- stdio 통신: stdin/stdout을 통한 JSON-RPC
- 프로세스 관리: 앱 종료 시 MCP 서버도 종료

### 6. 브라우저 에이전트 테스트 (06-browser-agent.spec.ts)

**목적**: 내장 브라우저 기능 검증

**시나리오:**

```typescript
test('브라우저 에이전트가 웹 페이지를 탐색한다', async () => {
  const app = await launchElectronApp();
  const window = await app.firstWindow();

  // 1. 브라우저 탭 열기
  await window.click('[data-testid="open-browser"]');

  // 2. URL 입력
  await window.fill('[data-testid="url-input"]', 'https://example.com');
  await window.press('[data-testid="url-input"]', 'Enter');

  // 3. 페이지 로딩 대기
  await window.waitForSelector('[data-testid="page-loaded"]');

  // 4. 스냅샷 저장
  await window.click('[data-testid="save-snapshot"]');

  // 5. 스냅샷 목록에 추가 확인
  const snapshots = await window.locator('[data-testid="snapshot-item"]').count();
  expect(snapshots).toBeGreaterThan(0);

  await app.close();
});
```

**Electron 특수 고려사항:**

- BrowserView vs WebView: 어떤 구현 사용하는지 확인
- 샌드박스: 보안을 위한 격리된 컨텍스트
- 스크린샷: `webContents.capturePage()`

### 7. RAG 워크플로우 테스트 (07-rag-workflow.spec.ts)

**목적**: 문서 임베딩 및 검색 기능 검증

**시나리오:**

```typescript
test('문서를 임베딩하고 RAG 검색을 수행한다', async () => {
  const app = await launchElectronApp();
  const window = await app.firstWindow();

  // 1. RAG 설정 열기
  await window.click('[data-testid="rag-settings"]');

  // 2. 문서 추가 (fixtures 폴더의 테스트 문서)
  // Note: Electron dialog 모킹 필요

  // 3. 임베딩 시작
  await window.click('[data-testid="start-embedding"]');

  // 4. 임베딩 완료 대기 (진행 바 모니터링)
  await window.waitForSelector('[data-testid="embedding-complete"]', {
    timeout: 60000,
  });

  // 5. 채팅에서 RAG 활성화
  await window.click('[data-testid="enable-rag"]');

  // 6. 문서 내용 관련 질문
  await window.fill('[data-testid="chat-input"]', 'What does the document say about X?');
  await window.click('[data-testid="send-message"]');

  // 7. 응답에 문서 컨텍스트 포함 확인
  await window.waitForSelector('[data-testid="rag-context-used"]');

  await app.close();
});
```

**Electron 특수 고려사항:**

- 벡터 DB: SQLite 파일로 저장 (`userData/vectordb.sqlite`)
- 임베딩 API: OpenAI API 호출 (네트워크 I/O)
- 대용량 파일: 메모리 사용량 고려

## 🎭 Page Object Pattern 구현

### 왜 Page Object Pattern인가?

**문제점 (Without POP):**

```typescript
// 중복된 선택자, 유지보수 어려움
test('test 1', async () => {
  await window.click('button[data-testid="new-chat"]');
  await window.fill('textarea[data-testid="chat-input"]', 'Hello');
  // ...
});

test('test 2', async () => {
  await window.click('button[data-testid="new-chat"]'); // 중복!
  // ...
});
```

**해결 (With POP):**

```typescript
// helpers/page-objects/chat-page.ts
export class ChatPage {
  constructor(private window: Page) {}

  async createNewSession() {
    await this.window.click('[data-testid="new-chat"]');
  }

  async typeMessage(text: string) {
    await this.window.fill('[data-testid="chat-input"]', text);
  }
}

// 사용
test('test 1', async () => {
  const chatPage = new ChatPage(window);
  await chatPage.createNewSession();
  await chatPage.typeMessage('Hello');
});
```

### Page Object 예시: ChatPage

```typescript
// helpers/page-objects/chat-page.ts
import { Page } from '@playwright/test';

export class ChatPage {
  // 선택자를 클래스 상단에 정의
  private readonly selectors = {
    newChatButton: '[data-testid="new-chat"]',
    chatInput: '[data-testid="chat-input"]',
    sendButton: '[data-testid="send-message"]',
    messageList: '[data-testid="message-list"]',
    lastMessage: '[data-testid="message-bubble"]:last-child',
    aiResponse: '[data-testid="ai-response"]',
  };

  constructor(private window: Page) {}

  async createNewSession() {
    await this.window.click(this.selectors.newChatButton);
    await this.window.waitForSelector(this.selectors.chatInput);
  }

  async typeMessage(text: string) {
    await this.window.fill(this.selectors.chatInput, text);
  }

  async sendMessage() {
    await this.window.click(this.selectors.sendButton);
  }

  async waitForResponse(options = { timeout: 30000 }) {
    await this.window.waitForSelector(this.selectors.aiResponse, options);
  }

  async getLastResponse(): Promise<string> {
    const element = await this.window.locator(this.selectors.lastMessage);
    return element.textContent() || '';
  }

  async getMessageCount(): Promise<number> {
    const messages = await this.window.locator('[data-testid="message-bubble"]');
    return messages.count();
  }
}
```

## 🐛 디버깅 가이드

### Playwright Inspector 사용

```bash
# 디버그 모드로 테스트 실행
pnpm test:e2e:debug

# 특정 테스트만 디버그
pnpm test:e2e:debug specs/02-chat-session.spec.ts
```

**기능:**

- 단계별 실행 (Step Over, Step Into)
- 브레이크포인트 설정
- DOM 탐색기
- 네트워크 요청 모니터링

### 스크린샷 활용

```typescript
// 특정 시점에 스크린샷 저장
await window.screenshot({
  path: 'screenshots/before-click.png',
  fullPage: true,
});

// 요소만 스크린샷
await window.locator('[data-testid="chat-area"]').screenshot({
  path: 'screenshots/chat-area.png',
});
```

### 비디오 녹화

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    // 모든 테스트 녹화 (디버깅 시)
    video: 'on',
    // 또는 실패 시만
    video: 'retain-on-failure',
  },
});
```

### Trace Viewer

```bash
# Trace 활성화 (playwright.config.ts에서 설정)
# 테스트 실패 시 자동으로 trace 저장됨

# Trace 뷰어 열기
npx playwright show-trace test-results/trace.zip
```

**Trace Viewer 기능:**

- 타임라인: 각 액션의 시간
- 스크린샷: 각 단계별 화면
- DOM 스냅샷: 특정 시점의 DOM
- 네트워크: API 호출 내역
- 콘솔: 로그 메시지

### Electron 특수 디버깅

#### Main Process 디버깅

```typescript
// Electron 앱 시작 시 디버거 활성화
const app = await electron.launch({
  args: [
    '--inspect=5858', // Chrome DevTools Protocol
    path.join(__dirname, '../../dist/electron/electron/main.js'),
  ],
});

// Chrome에서 chrome://inspect 접속하여 디버깅
```

#### IPC 통신 로깅

```typescript
// helpers/app-launcher.ts
const app = await electron.launch({
  env: {
    ...process.env,
    DEBUG: 'electron-ipc:*', // IPC 로깅 활성화
  },
});
```

## 🔒 보안 고려사항

### API 키 관리

**❌ 절대 하지 말 것:**

```typescript
// 하드코딩 금지!
await settingsPage.setAPIKey('sk-real-api-key-1234567890');
```

**✅ 올바른 방법:**

```typescript
// 환경 변수 사용
const testAPIKey = process.env.TEST_OPENAI_API_KEY || 'sk-test-dummy-key';
await settingsPage.setAPIKey(testAPIKey);
```

### 테스트 데이터 격리

```typescript
// 각 테스트마다 고유한 사용자 데이터 디렉토리
export async function launchElectronApp() {
  const testId = Date.now();
  const userDataPath = path.join(__dirname, `../.test-user-data-${testId}`);

  const app = await electron.launch({
    env: {
      ELECTRON_USER_DATA_PATH: userDataPath,
    },
  });

  // 테스트 종료 후 정리
  test.afterEach(async () => {
    await fs.rm(userDataPath, { recursive: true, force: true });
  });

  return app;
}
```

### 네트워크 모킹

```typescript
// 외부 API 호출 방지 (비용, 속도, 안정성)
test('AI 응답을 모킹한다', async ({ page }) => {
  // OpenAI API 모킹
  await page.route('https://api.openai.com/v1/chat/completions', (route) => {
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        choices: [{ message: { content: 'Mocked response' } }],
      }),
    });
  });

  // 테스트 진행...
});
```

## ⚡ 성능 최적화

### 병렬 실행 제한

```typescript
// playwright.config.ts
export default defineConfig({
  // Electron 앱은 리소스를 많이 사용
  // 동시 실행 수 제한
  workers: process.env.CI ? 1 : 2,

  // 또는 순차 실행
  fullyParallel: false,
});
```

### 테스트 분류

```typescript
// 빠른 테스트 (smoke tests)
test.describe('Smoke Tests @smoke', () => {
  test('앱이 시작된다', async () => {
    // ...
  });
});

// 느린 테스트 (full tests)
test.describe('Full Tests @slow', () => {
  test('전체 워크플로우', async () => {
    // ...
  });
});
```

```bash
# Smoke 테스트만 실행 (빠른 피드백)
pnpm test:e2e --grep @smoke

# 전체 테스트 실행 (CI에서)
pnpm test:e2e
```

### 빌드 캐싱

```bash
# 빌드를 매번 하지 않고 캐싱
pnpm run build:app # 한 번만 실행
pnpm test:e2e      # 빌드된 앱 재사용
```

## 🚀 CI/CD 통합

### GitHub Actions 워크플로우

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  e2e:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: pnpm install

      - name: Build Electron app
        run: pnpm run build:app

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: pnpm test:e2e
        env:
          # 테스트용 API 키 (GitHub Secrets)
          TEST_OPENAI_API_KEY: ${{ secrets.TEST_OPENAI_API_KEY }}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ matrix.os }}
          path: test-results/

      - name: Upload screenshots
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: screenshots-${{ matrix.os }}
          path: e2e_tests/screenshots/
```

### 헤드리스 모드

```typescript
// Linux CI에서는 헤드리스 모드 필요
const app = await electron.launch({
  args: [
    ...(process.env.CI ? ['--no-sandbox', '--disable-gpu'] : []),
    path.join(__dirname, '../../dist/electron/electron/main.js'),
  ],
});
```

## 📊 테스트 커버리지

### E2E 테스트 vs Unit 테스트 커버리지

- **Unit Tests**: 코드 라인 커버리지 (Jest)
- **E2E Tests**: 기능 커버리지 (사용자 시나리오)

### 우선순위별 테스트 시나리오

| 우선순위      | 시나리오                | 이유                            |
| ------------- | ----------------------- | ------------------------------- |
| P0 (Critical) | 앱 시작, 채팅 기본 기능 | 핵심 기능, 실패 시 앱 사용 불가 |
| P1 (High)     | 설정 저장, 파일 시스템  | 자주 사용, 데이터 손실 위험     |
| P2 (Medium)   | MCP 통합, RAG           | 고급 기능, 일부 사용자만 사용   |
| P3 (Low)      | UI 애니메이션, 테마     | 보조 기능, UX 개선              |

## 🧪 테스트 작성 가이드라인

### DO's ✅

1. **명확한 테스트 이름**

   ```typescript
   // ❌ Bad
   test('test 1', async () => {});

   // ✅ Good
   test('새 채팅 세션 생성 후 메시지 전송이 성공한다', async () => {});
   ```

2. **Arrange-Act-Assert 패턴**

   ```typescript
   test('설정 변경이 저장된다', async () => {
     // Arrange: 준비
     const app = await launchElectronApp();
     const settingsPage = new SettingsPage(window);

     // Act: 실행
     await settingsPage.changeTheme('dark');
     await settingsPage.save();

     // Assert: 검증
     const theme = await settingsPage.getTheme();
     expect(theme).toBe('dark');
   });
   ```

3. **적절한 대기**

   ```typescript
   // ❌ Bad: 고정 시간 대기
   await window.waitForTimeout(5000);

   // ✅ Good: 조건 기반 대기
   await window.waitForSelector('[data-testid="loaded"]');
   ```

4. **의미 있는 선택자**

   ```typescript
   // ❌ Bad: 변경되기 쉬운 선택자
   await window.click('button.bg-blue-500');

   // ✅ Good: 안정적인 테스트 ID
   await window.click('[data-testid="submit-button"]');
   ```

### DON'Ts ❌

1. **테스트 간 의존성 금지**

   ```typescript
   // ❌ Bad
   test('test 1: create chat', async () => {
     // 채팅 생성
   });
   test('test 2: use chat from test 1', async () => {
     // test 1에 의존
   });

   // ✅ Good: 각 테스트는 독립적
   test('test 1: create and use chat', async () => {
     // 모든 것을 self-contained로
   });
   ```

2. **과도한 모킹 피하기**

   ```typescript
   // ❌ Bad: 모든 것을 모킹하면 E2E가 아님
   // E2E는 실제 통합을 테스트해야 함

   // ✅ Good: 외부 API만 모킹
   // 내부 IPC 통신은 실제로 테스트
   ```

3. **너무 세부적인 테스트 피하기**

   ```typescript
   // ❌ Bad: Unit 테스트처럼 작성
   test('버튼 클릭 시 state가 변경된다', async () => {});

   // ✅ Good: 사용자 시나리오 테스트
   test('사용자가 설정을 변경하고 앱을 재시작해도 유지된다', async () => {});
   ```

## 🔍 트러블슈팅

### 자주 발생하는 문제

#### 1. Timeout 에러

```
Error: page.waitForSelector: Timeout 30000ms exceeded.
```

**원인:**

- Electron 앱이 느리게 시작됨
- 네트워크 요청이 지연됨
- 선택자가 잘못됨

**해결:**

```typescript
// 타임아웃 증가
await window.waitForSelector('[data-testid="element"]', {
  timeout: 60000,
});

// 또는 앱 시작 대기 시간 증가
await app.waitForEvent('window', { timeout: 60000 });
```

#### 2. Element not found

```
Error: locator.click: Element is not visible
```

**원인:**

- 요소가 아직 렌더링되지 않음
- CSS로 숨겨짐 (display: none)
- 다른 요소에 가려짐 (z-index)

**해결:**

```typescript
// 요소가 visible 상태가 될 때까지 대기
await window.waitForSelector('[data-testid="element"]', {
  state: 'visible',
});

// 또는 force 옵션 사용 (주의: 실제 사용자 시나리오와 다를 수 있음)
await window.click('[data-testid="element"]', { force: true });
```

#### 3. IPC 통신 실패

```
Error: Cannot invoke IPC handler: handler not found
```

**원인:**

- Main Process가 완전히 초기화되지 않음
- IPC 핸들러 등록 전에 호출

**해결:**

```typescript
// Main Process 초기화 대기
const app = await electron.launch(...);
await app.context().waitForEvent('page', { timeout: 60000 });

// IPC ready 이벤트 대기
await window.evaluate(() => {
  return new Promise(resolve => {
    window.electron.on('ipc-ready', resolve);
  });
});
```

#### 4. 테스트 데이터 오염

```
Error: Chat already exists
```

**원인:**

- 이전 테스트의 데이터가 남아있음
- 사용자 데이터 디렉토리 공유

**해결:**

```typescript
// 각 테스트마다 고유한 데이터 디렉토리
test.beforeEach(async () => {
  await cleanupTestData();
});

test.afterEach(async () => {
  await cleanupTestData();
});
```

## 📚 참고 자료

### 공식 문서

- [Playwright for Electron](https://playwright.dev/docs/api/class-electron)
- [Electron Testing Guide](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)

### 예제 프로젝트

- [Playwright Electron Examples](https://github.com/microsoft/playwright/tree/main/tests/electron)
- [VS Code E2E Tests](https://github.com/microsoft/vscode/tree/main/test/smoke) (Electron 기반)

### 커뮤니티

- [Playwright Discord](https://discord.com/invite/playwright-807756831384403968)
- [Electron Discord](https://discord.com/invite/electron)

## 📝 다음 단계

1. ✅ **이 문서를 읽었다면**: 환경 설정으로 진행
2. ⚙️ **환경 설정**: `playwright.config.ts` 작성
3. 🔧 **헬퍼 유틸리티**: `helpers/` 폴더 구현
4. 🧪 **첫 번째 테스트**: `01-app-launch.spec.ts` 작성
5. 🚀 **CI/CD 통합**: GitHub Actions 설정

---

**작성일**: 2025-12-02
**버전**: 1.0.0
**담당자**: SEPilot Desktop Team
