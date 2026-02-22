# lib/extensions/ - Extension 시스템

> SEPilot Desktop의 Extension 로딩, 레지스트리, 런타임을 담당하는 시스템

## 📋 목차

- [개요](#개요)
- [폴더 구조](#폴더-구조)
- [주요 파일](#주요-파일)
- [Extension 로딩 흐름](#extension-로딩-흐름)
- [Extension 개발 가이드](#extension-개발-가이드)
- [Runtime Context](#runtime-context)
- [보안 및 권한](#보안-및-권한)
- [예제 코드](#예제-코드)
- [관련 문서](#관련-문서)

---

## 개요

extensions 폴더는 SEPilot Desktop의 Extension 시스템을 구현합니다. Extension은 .sepx 파일로 패키징되며, 런타임에 동적으로 로드됩니다.

**핵심 원칙:**

- **동적 로딩**: Extension을 앱 재시작 없이 설치/제거
- **격리된 실행**: 각 Extension은 독립된 런타임 컨텍스트에서 실행
- **권한 기반**: Extension은 manifest의 permissions에 명시된 기능만 사용
- **의존성 관리**: Extension 간 의존성을 자동으로 해결

**지원 기능:**

- .sepx 파일 로드 (ZIP 아카이브)
- Extension 레지스트리 (등록, 검색, 제거)
- Runtime Context (IPC, Logger, Platform, Workspace, UI, Commands, Tools, Agent, LLM, VectorDB)
- 의존성 해결 (Dependency Graph)
- 권한 검증 (Permission Validator)
- Host 모듈 주입 (react, zustand, lucide-react 등)

---

## 폴더 구조

```
lib/extensions/
├── loader.ts                   # Renderer 환경 Extension 로더
├── loader-main.ts              # Main Process Extension 로더
├── loader-runtime.ts           # 런타임 로더 (CJS 번들 실행)
├── registry.ts                 # Extension 레지스트리
├── context-factory.ts          # Extension Runtime Context 생성
├── main-context-factory.ts     # Main Process Context 생성
├── agent-builder.ts            # LangGraph Agent 빌더
├── agent-runtime.ts            # Agent 런타임
├── permission-validator.ts     # 권한 검증
├── dependency-resolver.ts      # 의존성 해결
├── external-loader.ts          # .sepx 파일 로더
├── host-module-registry.ts     # Host 모듈 레지스트리
├── namespaced-tool-registry.ts # 네임스페이스 Tool 레지스트리
├── runtime-loader.ts           # 런타임 로더 (번들 실행)
├── sdk-initializer-main.ts     # Main Process SDK 초기화
├── use-extensions.ts           # React Hook
├── apis/                       # Extension API 구현
│   ├── workspace-api.ts
│   ├── ui-api.ts
│   ├── commands-api.ts
│   ├── llm-api.ts
│   └── vectordb-api.ts
├── types.ts                    # Extension 타입
└── index.ts                    # Export
```

---

## 주요 파일

### loader.ts - Extension Loader (Renderer)

**역할:** Renderer Process에서 Extension을 로드하고 활성화

**주요 함수:**

```typescript
// 모든 Extension 로드 (Main ready 대기)
export async function loadAllExtensions(): Promise<void>;

// Extension 설정 로드
async function loadExtensionsConfig(): Promise<ExtensionStateConfig>;

// Extension 의존성 해결 및 그룹화
function groupByDependencyLevel(extensions: ExtensionDefinition[]): ExtensionDefinition[][];

// Extension 활성화
async function activateExtension(definition: ExtensionDefinition): Promise<void>;
```

**로딩 흐름:**

1. Main Process Extension Ready 대기 (`waitForMainExtensionsReady`)
2. Renderer Extension 목록 조회 (`extension:list-renderer-extensions`)
3. Extension 런타임 로드 (`loadExtensionRuntime`)
4. 의존성 순으로 그룹화 (`groupByDependencyLevel`)
5. 순차적으로 활성화 (`activateExtension`)
6. Store Slice 등록 (`registerExtensionSlice`)

---

### loader-main.ts - Extension Loader (Main Process)

**역할:** Main Process에서 Extension을 로드하고 활성화

**주요 함수:**

```typescript
// 모든 Extension 로드
export async function loadAllExtensions(): Promise<void>;

// Extension 검색 (여러 경로)
async function discoverExtensions(): Promise<string[]>;

// Extension 활성화
async function activateExtension(definition: ExtensionDefinition): Promise<void>;
```

**검색 경로:**

1. `app.getAppPath()/extensions/*.sepx` (일반 빌드)
2. `process.env.PORTABLE_EXECUTABLE_DIR/extensions/*.sepx` (Portable 빌드)
3. `app.getPath('userData')/extensions/*.sepx` (사용자 설치)

---

### registry.ts - Extension Registry

**역할:** 모든 Extension을 중앙 집중식으로 관리

**주요 메서드:**

```typescript
class ExtensionRegistry {
  // Extension 등록
  register(definition: ExtensionDefinition): void;

  // Extension 검색
  get(id: string): ExtensionDefinition | undefined;

  // 모든 Extension 목록
  getAll(): ExtensionDefinition[];

  // Extension 제거
  unregister(id: string): void;

  // 활성화된 Extension만 조회
  getEnabled(): ExtensionDefinition[];

  // 특정 mode의 Extension 조회
  getByMode(mode: string): ExtensionDefinition | undefined;
}
```

**사용 예:**

```typescript
import { extensionRegistry } from '@/lib/extensions/registry';

// Extension 등록
extensionRegistry.register(definition);

// Extension 조회
const browserExt = extensionRegistry.get('browser-agent');

// 활성화된 Extension
const enabledExtensions = extensionRegistry.getEnabled();
```

---

### context-factory.ts - Extension Runtime Context

**역할:** Extension별 격리된 런타임 컨텍스트 생성

**주요 함수:**

```typescript
export function createExtensionContext(
  extensionId: string,
  manifest: ExtensionManifest
): ExtensionRuntimeContext;
```

**Context 구조:**

```typescript
interface ExtensionRuntimeContext {
  ipc: IPCBridge; // IPC 통신
  logger: Logger; // Extension별 로거
  platform: PlatformInfo; // 플랫폼 정보
  workspace: WorkspaceAPI; // 파일 시스템 접근
  ui: UIAPI; // Toast, Dialog
  commands: CommandAPI; // 명령어 등록
  tools: ToolRegistry; // 네임스페이스 Tool 레지스트리
  agent: AgentBuilder; // LangGraph Agent 빌더
  llm: LLMProvider; // 격리된 LLM 클라이언트
  vectorDB: VectorDBAccess; // 권한 기반 VectorDB 접근
}
```

---

### agent-builder.ts - Agent Builder

**역할:** Extension에서 LangGraph Agent를 빌드

**주요 메서드:**

```typescript
class AgentBuilder {
  // Agent 등록
  registerAgent(manifest: AgentManifest): void;

  // Agent 실행
  async run(agentId: string, messages: Message[], options: AgentOptions): Promise<any>;

  // Agent 스트리밍
  async *stream(agentId: string, messages: Message[], options: AgentOptions): AsyncGenerator;
}
```

**사용 예:**

```typescript
// Extension에서 Agent 등록
context.agent.registerAgent({
  id: 'browser-agent',
  name: '브라우저 에이전트',
  description: '웹 페이지 탐색 및 정보 추출',
  graph: browserAgentGraph,
});

// Agent 실행
const stream = context.agent.stream('browser-agent', messages);
for await (const event of stream) {
  console.log(event);
}
```

---

### permission-validator.ts - Permission Validator

**역할:** Extension의 권한을 검증

**주요 함수:**

```typescript
// 권한 확인
export function hasPermission(extensionId: string, permission: string): boolean;

// 권한 요구
export function requirePermission(extensionId: string, permission: string): void; // 권한 없으면 throw

// 파일 경로 권한 확인
export function validateFilePath(extensionId: string, path: string): boolean;
```

**권한 목록:**

- `filesystem:read` - 파일 읽기
- `filesystem:write` - 파일 쓰기
- `llm:chat` - LLM 채팅
- `vectordb:search` - VectorDB 검색
- `vectordb:insert` - VectorDB 삽입
- `mcp:call` - MCP 도구 호출
- `network:http` - HTTP 요청

---

### dependency-resolver.ts - Dependency Resolver

**역할:** Extension 간 의존성을 해결하고 로딩 순서 결정

**주요 함수:**

```typescript
// 의존성 레벨별로 그룹화
export function groupByDependencyLevel(extensions: ExtensionDefinition[]): ExtensionDefinition[][];

// 순환 참조 감지
export function detectCircularDependencies(extensions: ExtensionDefinition[]): string[] | null;
```

**로딩 순서:**

```
Level 0: 의존성 없는 Extension (병렬 로드 가능)
  ├── editor
  ├── terminal
  └── browser-agent

Level 1: Level 0에 의존하는 Extension
  └── architect (browser-agent 의존)

Level 2: Level 1에 의존하는 Extension
  └── ...
```

---

### host-module-registry.ts - Host Module Registry

**역할:** Extension에 Host 모듈을 주입 (react, zustand 등)

**등록된 모듈:**

```typescript
const hostModules = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  zustand: zustand,
  'lucide-react': lucideReact,
  '@/components/ui/button': Button,
  '@/components/ui/dialog': Dialog,
  // ... 30+ 모듈
};
```

**주입 메커니즘:**

```typescript
// Extension 번들 실행 시 globalThis에 주입
globalThis.__SEPILOT_MODULES__ = hostModules;

// Extension에서 사용
const Button = require('@/components/ui/button');
```

---

## Extension 로딩 흐름

### 1. Main Process 로딩

```
앱 시작
  ↓
main.ts
  ↓
registerExtensionHandlers()        # IPC 핸들러 등록 (먼저!)
  ↓
loadAllExtensions()
  ↓
discoverExtensions()                # .sepx 파일 검색
  ├── app.getAppPath()/extensions
  ├── PORTABLE_EXECUTABLE_DIR/extensions
  └── userData/extensions
  ↓
loadExtensionFromSepx()             # .sepx 압축 해제 및 로드
  ↓
extensionRegistry.register()
  ↓
activateExtension()
  ↓
definition.activate(mainContext)
  ↓
webContents.send('extensions:main-ready')  # Renderer에 알림
```

### 2. Renderer Process 로딩

```
React 앱 시작
  ↓
useExtensionsLoader()
  ↓
waitForMainExtensionsReady()        # Main Extension 로딩 대기
  ├── 'extensions:main-ready' 이벤트
  ├── IPC 폴링 (5초 타임아웃)
  └── 타임아웃 경고
  ↓
loadAllExtensions()
  ↓
extension:list-renderer-extensions  # Main에서 Renderer Extension 목록 조회
  ↓
loadExtensionRuntime()              # sepilot-ext:// 프로토콜로 로드
  ├── <script src="sepilot-ext://extension-id/dist/renderer.js">
  └── globalThis.__SEPILOT_MODULES__ 주입
  ↓
groupByDependencyLevel()            # 의존성 순으로 그룹화
  ↓
activateExtension() (순차)
  ↓
registerExtensionSlice()            # Zustand Store 동적 병합
  ↓
Extension 활성화 완료
```

---

## Extension 개발 가이드

### 1. Extension 프로젝트 생성

```bash
mkdir my-extension
cd my-extension
npm init -y
npm install --save-dev @sepilot/extension-sdk typescript tsup
```

### 2. 프로젝트 구조

```
my-extension/
├── src/
│   ├── definition.ts       # Extension Definition
│   ├── manifest.ts         # Manifest
│   ├── main.ts             # Main Process 진입점
│   ├── renderer.tsx        # Renderer 진입점
│   ├── components/         # UI 컴포넌트
│   ├── agents/             # LangGraph Agent
│   ├── tools/              # Tool Registry
│   └── store-slice.ts      # Zustand Store Slice
├── manifest.json
├── package.json
└── tsup.config.ts
```

### 3. Manifest 정의

```typescript
// src/manifest.ts
import type { ExtensionManifest } from '@sepilot/extension-sdk';

export const manifest: ExtensionManifest = {
  id: 'my-extension',
  name: 'My Extension',
  description: 'Extension 설명',
  version: '1.0.0',
  author: '작성자',
  icon: 'package', // lucide-react 아이콘
  mode: 'my-mode',
  showInSidebar: true,
  processType: 'both',
  permissions: ['filesystem:read', 'llm:chat', 'vectordb:search'],
  agents: [
    {
      id: 'my-agent',
      name: 'My Agent',
      description: 'Agent 설명',
    },
  ],
};
```

### 4. Extension Definition

```typescript
// src/definition.ts
import type { ExtensionDefinition } from '@sepilot/extension-sdk';
import { manifest } from './manifest';
import { MyMainComponent } from './components/MyMainComponent';
import { MySidebarComponent } from './components/MySidebarComponent';
import { MySettingsComponent } from './components/MySettingsComponent';
import { createMyStoreSlice } from './store-slice';

export const definition: ExtensionDefinition = {
  manifest,
  MainComponent: MyMainComponent,
  SidebarComponent: MySidebarComponent,
  SettingsComponent: MySettingsComponent,
  createStoreSlice: createMyStoreSlice,

  activate: async (context) => {
    context.logger.info('My Extension activated!');

    // LangGraph Agent 등록
    const { myAgent } = await import('./agents/my-agent');
    context.agent.registerAgent({
      id: 'my-agent',
      name: 'My Agent',
      graph: myAgent,
    });

    // Tool 등록
    context.tools.register({
      name: 'my_tool',
      description: 'My custom tool',
      inputSchema: { type: 'object', properties: {} },
      execute: async (args) => {
        return { result: 'success' };
      },
    });
  },

  deactivate: async (context) => {
    context.logger.info('My Extension deactivated!');
  },
};
```

### 5. 빌드 설정

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    main: 'src/main.ts',
    renderer: 'src/renderer.tsx',
  },
  format: ['cjs'],
  dts: false,
  sourcemap: false,
  clean: true,
  external: [
    'react',
    'react-dom',
    'zustand',
    'lucide-react',
    '@/components/ui/*',
    '@/lib/*',
    // ... Host에서 제공하는 모듈
  ],
  noExternal: [
    // Extension 전용 라이브러리
  ],
});
```

### 6. 빌드 및 패키징

```bash
# 빌드
npm run build

# .sepx 패키지 생성
zip -r my-extension.sepx dist/ manifest.json
```

---

## Runtime Context

### IPC Bridge

```typescript
// IPC 호출
const result = await context.ipc.invoke('extension:llm:chat', extensionId, messages);

// IPC 이벤트 리스너
context.ipc.on('llm-stream-chunk', (data) => {
  console.log('Chunk:', data.chunk);
});

// IPC 이벤트 전송 (Main → Renderer)
context.ipc.send('my-extension:event', { data: '...' });
```

### Logger

```typescript
context.logger.info('Info message');
context.logger.warn('Warning message');
context.logger.error('Error message', { error });
```

### Workspace API

```typescript
// 파일 읽기 (권한 필요: filesystem:read)
const content = await context.workspace.readFile('/path/to/file.txt');

// 파일 쓰기 (권한 필요: filesystem:write)
await context.workspace.writeFile('/path/to/file.txt', 'content');

// 파일 검색
const files = await context.workspace.searchFiles('*.ts');
```

### UI API

```typescript
// Toast 알림
context.ui.toast({
  title: '성공',
  description: '작업이 완료되었습니다',
  variant: 'success',
});

// Dialog 표시
const confirmed = await context.ui.confirm({
  title: '확인',
  description: '정말 삭제하시겠습니까?',
});
```

### LLM API

```typescript
// LLM 채팅 (권한 필요: llm:chat)
const response = await context.llm.chat(messages);

// LLM 스트리밍
for await (const chunk of context.llm.stream(messages)) {
  console.log(chunk);
}
```

---

## 보안 및 권한

### 권한 체크

```typescript
// Extension에서 권한 확인
if (context.permissions.has('filesystem:write')) {
  await context.workspace.writeFile('/path', 'content');
} else {
  context.ui.toast({
    title: '권한 없음',
    description: 'filesystem:write 권한이 필요합니다',
    variant: 'error',
  });
}
```

### 샌드박스

- Extension은 manifest의 `permissions`에 명시된 기능만 사용 가능
- 파일 시스템 접근은 사용자 승인 필요
- IPC 통신은 Extension ID로 격리
- Host 모듈만 import 가능 (외부 네트워크 차단)

---

## 예제 코드

### 예제 1: 간단한 Extension

```typescript
// src/definition.ts
export const definition: ExtensionDefinition = {
  manifest: {
    id: 'hello-extension',
    name: 'Hello Extension',
    version: '1.0.0',
    processType: 'renderer',
  },

  MainComponent: () => {
    const { ui } = useExtensionContext();

    return (
      <div>
        <button onClick={() => ui.toast({ title: 'Hello!' })}>
          인사하기
        </button>
      </div>
    );
  },
};
```

### 예제 2: Store Slice 사용

```typescript
// src/store-slice.ts
export function createMyStoreSlice(set, get) {
  return {
    myExtension: {
      count: 0,
      increment: () => {
        set((state) => ({
          myExtension: {
            ...state.myExtension,
            count: state.myExtension.count + 1,
          },
        }));
      },
    },
  };
}

// src/components/Counter.tsx
import { useChatStore } from '@/lib/store/chat-store';

export function Counter() {
  const myExtension = useChatStore((state) => state.myExtension);

  return (
    <div>
      <p>Count: {myExtension.count}</p>
      <button onClick={myExtension.increment}>증가</button>
    </div>
  );
}
```

### 예제 3: LangGraph Agent

```typescript
// src/agents/my-agent.ts
import { StateGraph } from '@langchain/langgraph';

export const myAgent = new StateGraph({
  channels: {
    messages: { value: (x, y) => x.concat(y) },
  },
})
  .addNode('generate', async (state) => {
    const llm = getLLM();
    const response = await llm.invoke(state.messages);
    return { messages: [response] };
  })
  .addEdge('__start__', 'generate')
  .addEdge('generate', '__end__');
```

---

## 관련 문서

### 라이브러리

- [lib/README.md](../README.md) - lib 폴더 가이드
- [lib/extension-sdk/README.md](../extension-sdk/README.md) - Extension SDK

### 상태 관리

- [lib/store/README.md](../store/README.md) - Zustand Store 및 Extension Slice

### 아키텍처

- [docs/architecture/dependency-rules.md](../../docs/architecture/dependency-rules.md) - 의존성 규칙

### 개발 가이드

- [CLAUDE.md](../../CLAUDE.md) - 프로젝트 전체 가이드
- Extension 개발 스킬 - `.claude/skills/extension-development.md`

---

## 변경 이력

- **2025-02-10**: Built-in Extension 제거, 모든 Extension을 External 방식으로 통합
- **2025-01-17**: 초기 Extension 시스템 구축
