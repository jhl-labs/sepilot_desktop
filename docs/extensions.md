# SEPilot Desktop - Extension Development Guide

SEPilot Desktop의 Extension System을 사용하여 새로운 기능을 플러그인 형태로 추가하는 방법을 설명합니다.

## 목차

- [개요](#개요)
- [Extension 아키텍처](#extension-아키텍처)
- [빠른 시작](#빠른-시작)
- [Extension 구조](#extension-구조)
- [Manifest 정의](#manifest-정의)
- [컴포넌트 구현](#컴포넌트-구현)
- [Store 통합](#store-통합)
- [타입 정의](#타입-정의)
- [라이프사이클](#라이프사이클)
- [Extension Context API](#extension-context-api)
- [배포](#배포)
- [예제](#예제)
- [FAQ](#faq)

---

## 개요

SEPilot Extension System은 VSCode extension과 유사한 플러그인 아키텍처를 제공합니다:

- **독립적인 모듈**: 각 extension은 `extensions/` 폴더에 독립된 디렉토리로 존재
- **자동 로딩**: 앱 시작 시 자동으로 검색되고 로드됨
- **동적 활성화**: 런타임에 extension을 활성화/비활성화 가능
- **메타데이터 기반**: manifest.ts를 통해 extension 정보를 선언
- **의존성 관리**: 다른 extension에 대한 의존성을 명시 가능

---

## Extension 아키텍처

```
┌─────────────────────────────────────────────┐
│          SEPilot Desktop App                │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │   Extension Registry & Loader        │  │
│  └──────────────────────────────────────┘  │
│              │                              │
│  ┌───────────┴──────────────┬──────────┐   │
│  │                          │          │   │
│  ▼                          ▼          ▼   │
│  Extension A             Extension B   ...  │
│  ├── manifest.ts         ├── manifest.ts    │
│  ├── components/         ├── components/    │
│  ├── lib/                ├── lib/           │
│  ├── store/              ├── store/         │
│  └── types/              └── types/         │
│                                             │
└─────────────────────────────────────────────┘
```

### 주요 컴포넌트

1. **Extension Registry** (`lib/extensions/registry.ts`)
   - Extension을 등록하고 관리하는 중앙 레지스트리
   - 의존성 검사, 활성화/비활성화 관리

2. **Extension Loader** (`lib/extensions/loader.ts`)
   - `extensions/` 폴더에서 extension을 자동으로 로드
   - 앱 시작 시 초기화

3. **Extension Hooks** (`lib/extensions/use-extensions.ts`)
   - React 컴포넌트에서 extension을 사용하기 위한 훅

---

## 빠른 시작

### 1. Extension 디렉토리 생성

```bash
extensions/
└── my-extension/
    ├── definition.ts         # Extension 정의 (필수)
    ├── index.ts              # 메인 진입점
    ├── manifest.ts           # Extension 메타데이터
    ├── README.md             # 문서
    ├── components/
    │   ├── index.ts          # 컴포넌트 export
    │   ├── MainComponent.tsx # 메인 화면
    │   └── SidebarComponent.tsx # 사이드바 화면
    ├── lib/
    │   └── index.ts          # 라이브러리 함수
    ├── store/
    │   └── index.ts          # Store slice
    └── types/
        └── index.ts          # 타입 정의
```

### 2. Manifest 정의

`extensions/my-extension/manifest.ts`:

```typescript
import type { ExtensionManifest } from '@/lib/extensions/types';

export const manifest: ExtensionManifest = {
  id: 'my-extension',
  name: 'My Extension',
  description: 'Extension 설명',
  version: '1.0.0',
  author: 'Your Name',
  icon: 'Puzzle', // lucide-react 아이콘 이름
  mode: 'my-mode', // 이 extension이 활성화할 앱 모드
  showInSidebar: true,
  dependencies: [], // 의존하는 다른 extension ID
  enabled: true, // 기본 활성화 여부
};
```

### 3. 메인 진입점 설정

`extensions/my-extension/index.ts`:

```typescript
// Manifest
export { manifest } from './manifest';

// Types
export * from './types';

// Components
export * from './components';

// Library
export * from './lib';

// Store (optional)
export { createMyExtensionSlice } from './store';
```

### 4. definition.ts 생성

`extensions/my-extension/definition.ts`:

```typescript
import type { ExtensionDefinition } from '@/lib/extensions/types';
import { manifest } from './manifest';
import { MainComponent, SidebarComponent } from './components';
import { createMyExtensionSlice } from './store';

export const myExtension: ExtensionDefinition = {
  manifest,
  MainComponent,
  SidebarComponent,
  createStoreSlice: createMyExtensionSlice,
};
```

### 5. Extension 중앙 레지스트리에 등록

`extensions/index.ts`에 추가:

```typescript
import { myExtension } from './my-extension/definition';

export const builtinExtensions: ExtensionDefinition[] = [
  editorExtension,
  browserExtension,
  presentationExtension,
  myExtension, // 추가
];
```

**끝!** Extension이 자동으로 로드됩니다.

---

## Extension 구조

### 디렉토리 구조 상세

```
extensions/my-extension/
├── definition.ts         # Extension 정의 (필수)
├── index.ts              # 메인 진입점 (모든 export 통합)
├── manifest.ts           # Extension 메타데이터
├── README.md             # Extension 문서
│
├── components/           # React 컴포넌트
│   ├── index.ts          # export 통합
│   ├── MainComponent.tsx # 메인 화면 (전체 영역)
│   ├── SidebarComponent.tsx # 사이드바 화면
│   └── ...               # 기타 UI 컴포넌트
│
├── lib/                  # 비즈니스 로직
│   ├── index.ts          # export 통합
│   ├── agent.ts          # LangGraph agent (optional)
│   ├── tools.ts          # LLM tools (optional)
│   └── utils.ts          # 유틸리티 함수
│
├── store/                # Zustand store slice
│   └── index.ts          # Store slice 정의
│
└── types/                # TypeScript 타입
    └── index.ts          # 타입 정의
```

### 필수 파일

- `definition.ts` - Extension 정의 (필수)
- `manifest.ts` - Extension 메타데이터 (필수)
- `index.ts` - 메인 진입점 (필수)

### 선택 파일

- `components/` - React 컴포넌트 (UI가 있는 경우)
- `lib/` - 비즈니스 로직 (백엔드 기능이 있는 경우)
- `store/` - Store slice (상태 관리가 필요한 경우)
- `types/` - 타입 정의 (권장)
- `README.md` - 문서 (권장)

---

## Manifest 정의

Manifest는 extension의 메타데이터를 정의하는 파일입니다.

### ExtensionManifest 인터페이스

```typescript
export interface ExtensionManifest {
  /** 확장 기능 고유 식별자 (예: 'presentation', 'diagram') */
  id: string;

  /** 표시 이름 */
  name: string;

  /** 설명 */
  description: string;

  /** 버전 (semver) */
  version: string;

  /** 작성자 */
  author: string;

  /** 아이콘 (lucide-react 아이콘 이름) */
  icon: string;

  /** 이 extension이 활성화할 앱 모드 */
  mode: string;

  /** 사이드바에 표시할지 여부 */
  showInSidebar: boolean;

  /** 의존하는 다른 extension ID 목록 */
  dependencies?: string[];

  /** 설정 스키마 (옵션) */
  settingsSchema?: Record<string, unknown>;

  /** extension이 활성화되어 있는지 여부 */
  enabled?: boolean;
}
```

### 예시

```typescript
import type { ExtensionManifest } from '@/lib/extensions/types';

export const manifest: ExtensionManifest = {
  id: 'diagram-editor',
  name: 'Diagram Editor',
  description: 'AI 기반 다이어그램 편집 도구. Mermaid, PlantUML, Graphviz 지원.',
  version: '1.0.0',
  author: 'SEPilot Team',
  icon: 'GitGraph', // lucide-react 아이콘
  mode: 'diagram',
  showInSidebar: true,
  dependencies: [], // 다른 extension 필요 시 ['presentation', ...]
  enabled: true,
  settingsSchema: {
    defaultFormat: {
      type: 'string',
      enum: ['mermaid', 'plantuml', 'graphviz'],
      default: 'mermaid',
      description: '기본 다이어그램 포맷',
    },
    autoSave: {
      type: 'boolean',
      default: true,
      description: '자동 저장 활성화',
    },
  },
};
```

### 주요 필드 설명

#### `id` (필수)

- Extension의 고유 식별자
- kebab-case 권장 (예: `my-extension`, `diagram-editor`)
- 다른 extension과 중복되면 안 됨

#### `mode` (필수)

- Extension이 활성화할 앱 모드
- `app/page.tsx`에서 `appMode`와 매칭됨
- 예: `'presentation'`, `'diagram'`, `'mindmap'`

#### `showInSidebar` (필수)

- `true`: 사이드바에 extension 항목 표시
- `false`: 메인 화면에서만 사용

#### `dependencies` (선택)

- 이 extension이 의존하는 다른 extension ID 목록
- 의존성이 있는 extension이 먼저 로드되고 활성화됨
- 순환 의존성은 허용되지 않음

#### `settingsSchema` (선택)

- Extension별 설정 스키마
- 향후 Settings UI에서 자동으로 폼 생성 가능

---

## 컴포넌트 구현

### MainComponent

메인 화면 전체를 차지하는 컴포넌트입니다.

`components/MainComponent.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useChatStore } from '@/lib/store/chat-store';

export function MainComponent() {
  // Store 사용
  const { myExtensionState, setMyExtensionState } = useChatStore();

  return (
    <div className="flex h-full flex-col">
      <header className="border-b p-4">
        <h1 className="text-xl font-bold">My Extension</h1>
      </header>
      <main className="flex-1 overflow-auto p-4">
        {/* 메인 콘텐츠 */}
      </main>
    </div>
  );
}
```

### SidebarComponent

사이드바에 표시되는 컴포넌트입니다.

`components/SidebarComponent.tsx`:

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';

export function SidebarComponent() {
  const { setAppMode } = useChatStore();

  const handleOpen = () => {
    setAppMode('my-mode'); // manifest.mode와 일치해야 함
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      <h2 className="text-sm font-semibold">My Extension</h2>
      <Button onClick={handleOpen}>Open</Button>
    </div>
  );
}
```

### components/index.ts

```typescript
export { MainComponent } from './MainComponent';
export { SidebarComponent } from './SidebarComponent';
```

---

## Store 통합

Extension은 Zustand store slice를 정의하여 전역 상태를 관리할 수 있습니다.

### Store Slice 정의

`store/index.ts`:

```typescript
import type { MyExtensionState, MyExtensionActions } from '../types';

export const initialMyExtensionState: MyExtensionState = {
  // 초기 상태
  items: [],
  isLoading: false,
};

export function createMyExtensionSlice(set: any, get: any): MyExtensionState & MyExtensionActions {
  return {
    // Initial state
    ...initialMyExtensionState,

    // Actions
    addItem: (item) => {
      set((state: any) => ({
        items: [...state.items, item],
      }));
    },

    setLoading: (isLoading) => {
      set({ isLoading });
    },

    clearItems: () => {
      set({ items: [], isLoading: false });
    },
  };
}
```

### 타입 정의

`types/index.ts`:

```typescript
export interface MyExtensionState {
  items: string[];
  isLoading: boolean;
}

export interface MyExtensionActions {
  addItem: (item: string) => void;
  setLoading: (isLoading: boolean) => void;
  clearItems: () => void;
}
```

### Chat Store 통합

**현재는 `chat-store.ts`에 수동으로 통합해야 합니다.**

1. **타입 import 추가**:

`lib/store/chat-store.ts`:

```typescript
import type {
  MyExtensionStoreState,
  MyExtensionStoreActions,
} from '@/extensions/my-extension/types';
import { createMyExtensionSlice } from '@/extensions/my-extension/store';
```

2. **ChatStore 인터페이스가 Extension types를 extend하도록 수정**:

```typescript
interface ChatStore extends MyExtensionStoreState, MyExtensionStoreActions {
  // ... 기존 필드들 ...
  // Note: MyExtension 관련 필드와 액션은 위의 extends로 자동 포함됩니다
}
```

3. **초기 상태에 주석 추가** (초기값은 createMyExtensionSlice가 제공):

```typescript
export const useChatStore = create<ChatStore>()((set, get) => ({
  // ... 기존 초기 상태 ...
  // My Extension: Provided by createMyExtensionSlice
  // ... 기존 코드 계속 ...
}));
```

4. **Store 액션 부분에 slice 통합**:

```typescript
export const useChatStore = create<ChatStore>()((set, get) => ({
  // ... 기존 초기 상태 및 액션들 ...

  // My Extension: Extension slice integrated
  ...createMyExtensionSlice(set as any, get as any),

  // ... 다른 액션들 계속 ...
}));
```

**전체 예제**는 `lib/store/chat-store.ts`에서 presentation extension 통합을 참고하세요.

---

## 타입 정의

Extension의 모든 타입을 `types/index.ts`에 정의합니다.

```typescript
// State 타입
export interface MyExtensionState {
  items: Item[];
  selectedId: string | null;
  isLoading: boolean;
}

// Action 타입
export interface MyExtensionActions {
  addItem: (item: Item) => void;
  selectItem: (id: string) => void;
  setLoading: (isLoading: boolean) => void;
}

// Data 타입
export interface Item {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}

// Agent 타입 (LangGraph 사용 시)
export interface MyAgentState {
  messages: Message[];
  step: 'init' | 'processing' | 'complete';
  result?: any;
}
```

---

## 라이프사이클

Extension은 다음과 같은 라이프사이클 훅을 제공합니다:

### activate(context?: ExtensionContext)

Extension이 활성화될 때 호출되는 함수입니다.

```typescript
// index.ts
export async function activate(context?: ExtensionContext) {
  console.log('My Extension activated');

  // ExtensionContext 사용 (향후 구현 예정)
  if (context) {
    const mode = context.getAppMode();
    context.logger.info('Activated in mode:', mode);

    // Extension 간 통신
    context.on('app:mode-changed', (newMode) => {
      console.log('Mode changed to:', newMode);
    });
  }

  // 초기화 작업
  await initializeDatabase();
  await loadSettings();
}
```

### deactivate(context?: ExtensionContext)

Extension이 비활성화될 때 호출되는 함수입니다.

```typescript
// index.ts
export async function deactivate(context?: ExtensionContext) {
  console.log('My Extension deactivated');

  // 정리 작업
  await saveState();
  await closeConnections();
}
```

### definition.ts에서 등록

```typescript
// definition.ts
import { activate, deactivate } from './index';

export const myExtension: ExtensionDefinition = {
  manifest,
  MainComponent,
  SidebarComponent,
  createStoreSlice: createMyExtensionSlice,
  activate,
  deactivate,
};
```

---

## Extension Context API

Extension Context API는 Extension이 앱 상태와 안전하게 상호작용할 수 있는 API를 제공합니다.

### ExtensionContext 인터페이스

```typescript
export interface ExtensionContext {
  /** Extension ID */
  readonly extensionId: string;

  // 앱 상태 조회 (읽기 전용)
  getAppMode: () => string;
  getActiveSessionId: () => string | null;
  getSession: (sessionId: string) => any | null;

  // Extension 전용 스토리지
  setState: <T>(key: string, value: T) => void;
  getState: <T>(key: string) => T | undefined;
  removeState: (key: string) => void;

  // 이벤트 시스템 (Extension 간 통신)
  on: <T>(event: ExtensionEventType, handler: (data: T) => void) => () => void;
  emit: <T>(event: ExtensionEventType, data: T) => void;

  // Extension 전용 로거
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
    debug: (message: string, meta?: Record<string, unknown>) => void;
  };
}
```

### 사용 예제

```typescript
// Extension activate 함수에서
export async function activate(context?: ExtensionContext) {
  if (!context) {
    console.log('ExtensionContext not available yet');
    return;
  }

  // 앱 모드 조회
  const currentMode = context.getAppMode();
  context.logger.info('Current app mode:', currentMode);

  // Extension 전용 상태 저장
  context.setState('lastOpened', Date.now());
  const lastOpened = context.getState<number>('lastOpened');

  // Extension 간 이벤트 통신
  const unsubscribe = context.on('app:mode-changed', (newMode: string) => {
    context.logger.info('Mode changed to:', newMode);
  });

  // 다른 Extension에게 이벤트 발행
  context.emit('my-extension:initialized', { version: '1.0.0' });
}
```

### Extension 이벤트 타입

```typescript
export type ExtensionEventType =
  // 앱 상태 변경 이벤트
  | 'app:mode-changed'
  | 'app:session-created'
  | 'app:session-deleted'
  | 'app:session-switched'
  // Extension 생명주기 이벤트
  | 'extension:activated'
  | 'extension:deactivated'
  // 사용자 정의 이벤트 (extension-id:event-name 형식)
  | `${string}:${string}`;
```

**Note**: ExtensionContext API는 향후 구현 예정입니다. 현재는 타입 정의만 존재합니다.

---

## 배포

### 1. Built-in Extension (권장)

프로젝트에 직접 포함되는 extension:

1. `extensions/my-extension/` 폴더 생성
2. Extension 코드 작성
3. `lib/extensions/loader.ts`에 등록
4. 앱 빌드 및 배포

### 2. 3rd-party Extension (향후 지원 예정)

별도의 npm 패키지로 배포:

1. Extension을 독립 npm 패키지로 작성
2. `package.json`에 `sepilot-extension` 키워드 추가
3. npm에 배포
4. 사용자가 Settings에서 설치

---

## 예제

### Example 1: Simple Extension (UI만 있는 경우)

```
extensions/hello-world/
├── index.ts
├── manifest.ts
└── components/
    ├── index.ts
    └── HelloWorld.tsx
```

`manifest.ts`:

```typescript
import type { ExtensionManifest } from '@/lib/extensions/types';

export const manifest: ExtensionManifest = {
  id: 'hello-world',
  name: 'Hello World',
  description: 'Simple hello world extension',
  version: '1.0.0',
  author: 'You',
  icon: 'Smile',
  mode: 'hello',
  showInSidebar: false,
};
```

`components/HelloWorld.tsx`:

```typescript
export function HelloWorld() {
  return <div className="flex h-full items-center justify-center">
    <h1 className="text-2xl font-bold">Hello World!</h1>
  </div>;
}
```

`components/index.ts`:

```typescript
export { HelloWorld as MainComponent } from './HelloWorld';
```

`index.ts`:

```typescript
export { manifest } from './manifest';
export * from './components';
```

### Example 2: Agent Extension (LangGraph 사용)

`lib/extensions/presentation`을 참고하세요. 이 extension은:

- LangGraph agent를 사용하여 PPT 생성
- Step-by-step workflow
- Image generation 통합
- HTML/PDF/PPTX export
- Zustand store 통합

---

## FAQ

### Q1. Extension을 동적으로 로드할 수 있나요?

현재는 빌드 시점에 정적으로 로드됩니다. 런타임 동적 로딩은 향후 지원 예정입니다.

### Q2. Extension 간 통신은 어떻게 하나요?

Store를 통해 상태를 공유하거나, Custom Event를 사용하세요.

```typescript
// Extension A에서 이벤트 발행
window.dispatchEvent(
  new CustomEvent('my-extension:event', {
    detail: { data: 'hello' },
  })
);

// Extension B에서 이벤트 구독
useEffect(() => {
  const handler = (e: CustomEvent) => {
    console.log(e.detail.data);
  };
  window.addEventListener('my-extension:event', handler);
  return () => window.removeEventListener('my-extension:event', handler);
}, []);
```

### Q3. Extension에서 IPC를 사용할 수 있나요?

네. `window.electronAPI`를 통해 Electron IPC를 사용할 수 있습니다.

```typescript
// IPC 호출
const result = await window.electronAPI.invoke('my-channel', data);

// IPC 이벤트 구독
window.electronAPI.on('my-event', (data) => {
  console.log(data);
});
```

### Q4. Extension에서 LLM을 사용할 수 있나요?

네. `@/lib/llm/service`를 import하여 사용하세요.

```typescript
import { callLLM } from '@/lib/llm/service';

const response = await callLLM({
  messages,
  onToken: (chunk) => console.log(chunk),
});
```

### Q5. Extension에서 MCP Tool을 사용할 수 있나요?

네. LangGraph agent를 통해 MCP Tool을 사용할 수 있습니다.

`lib/extensions/presentation/lib/ppt-agent.ts`를 참고하세요.

### Q6. Extension을 비활성화하려면?

Manifest에서 `enabled: false`로 설정하거나, Extension Registry를 통해 런타임에 비활성화할 수 있습니다.

```typescript
import { extensionRegistry } from '@/lib/extensions/registry';

await extensionRegistry.deactivate('my-extension');
```

### Q7. 의존성 순서는 어떻게 관리되나요?

Extension Registry가 자동으로 의존성 순서를 해결합니다. 의존성이 있는 extension은 먼저 활성화됩니다.

### Q8. Extension이 로드되지 않으면 어떻게 디버깅하나요?

1. 브라우저 개발자 도구 콘솔에서 `[ExtensionLoader]` 로그 확인
2. Manifest가 올바른지 확인
3. `lib/extensions/loader.ts`에 등록되었는지 확인
4. TypeScript 컴파일 에러가 없는지 확인

---

## 참고 자료

- **Example Extension**: `extensions/presentation/` - 완전한 기능을 갖춘 예제
- **Extension Registry**: `lib/extensions/registry.ts` - Registry 구현
- **Extension Loader**: `lib/extensions/loader.ts` - Loader 구현
- **Extension Types**: `lib/extensions/types.ts` - 타입 정의

---

## 요약: Extension 추가 시 수정할 파일

새로운 extension을 추가할 때 **수정이 필요한 파일은 단 2개**입니다:

### ✅ 수동 수정 필요 (2개)

1. **`extensions/index.ts`** - Extension 중앙 레지스트리에 등록

   ```typescript
   import { myExtension } from './my-extension/definition';

   export const builtinExtensions: ExtensionDefinition[] = [
     editorExtension,
     browserExtension,
     presentationExtension,
     myExtension, // 추가
   ];
   ```

2. **`lib/store/extension-slices.ts`** - Store slice 통합 (Store가 있는 경우)

   ```typescript
   import { createMyExtensionSlice } from '@/extensions/my-extension/store';

   export const extensionStoreSlices = {
     createPresentationSlice,
     createTerminalSlice,
     createMyExtensionSlice, // 추가
   };

   export type ExtensionStoreState = ReturnType<typeof createPresentationSlice> &
     ReturnType<typeof createTerminalSlice> &
     ReturnType<typeof createMyExtensionSlice>; // 추가
   ```

### ✅ 자동으로 처리됨 (수정 불필요)

- `app/page.tsx` - Extension registry를 통해 동적 렌더링
- `components/layout/Sidebar.tsx` - Extension registry를 통해 동적 사이드바 렌더링
- `components/layout/MainLayout.tsx` - 모든 모드에 대해 동적 사이드바 너비 관리

### 📦 Extension 자체 파일 (독립적)

- `extensions/my-extension/` - 모든 extension 코드는 독립적으로 관리

---

## 라이선스

SEPilot Desktop 프로젝트 라이선스를 따릅니다.
