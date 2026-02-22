# lib/store/ - Zustand 전역 상태 관리

> SEPilot Desktop의 전역 상태를 관리하는 Zustand Store

## 📋 목차

- [개요](#개요)
- [폴더 구조](#폴더-구조)
- [주요 파일](#주요-파일)
- [사용 방법](#사용-방법)
- [새 상태 추가 가이드](#새-상태-추가-가이드)
- [Extension Store Slice](#extension-store-slice)
- [Persistence (영구 저장)](#persistence-영구-저장)
- [예제 코드](#예제-코드)
- [관련 문서](#관련-문서)

---

## 개요

store 폴더는 Zustand 기반의 전역 상태 관리를 담당합니다. SEPilot Desktop의 모든 UI 상태, 대화, 메시지, 설정이 여기서 관리됩니다.

**핵심 원칙:**

- **중앙 집중식**: 모든 전역 상태를 단일 Store에서 관리
- **Slice 패턴**: 기능별로 상태를 분리하여 유지보수성 향상
- **Persistence**: localStorage와 Electron DB로 상태 영구 저장
- **Extension 통합**: Extension Store Slice를 동적으로 병합

**기술 스택:**

- Zustand 5 (상태 관리)
- Immer (불변성 관리)
- localStorage (Persistence)
- Electron IPC (DB 동기화)

---

## 폴더 구조

```
lib/store/
├── chat-store.ts           # 핵심 전역 상태 (79KB)
├── extension-slices.ts     # Extension Store Slice 동적 병합
├── scheduler-slice.ts      # 스케줄러 상태
└── editor-defaults.ts      # 에디터 기본 설정
```

---

## 주요 파일

### chat-store.ts - ChatStore

**역할:** SEPilot Desktop의 핵심 전역 상태

**상태 구조:**

```typescript
interface ChatStore {
  // 대화 관리
  conversations: Conversation[];
  currentConversationId: string | null;

  // 메시지
  messages: Message[];
  pendingMessage: string;
  isStreaming: boolean;

  // 앱 모드 (chat, editor, browser, terminal 등)
  appMode: AppMode;

  // 그래프 설정
  selectedGraphType: GraphType;
  thinkingMode: ThinkingMode;
  graphConfig: GraphConfig;

  // Extension 상태
  extensionStates: Record<string, any>;

  // UI 상태
  sidebarOpen: boolean;
  settingsOpen: boolean;

  // 작업 디렉토리
  workingDirectory: string | null;

  // 열린 파일 (Editor 모드)
  openFiles: OpenFile[];
  activeFileIndex: number;

  // Tool Approval
  pendingToolApprovals: PendingToolApproval[];

  // 이미지 생성 진행률
  imageGenerationProgress: ImageGenerationProgress | null;

  // 페르소나
  currentPersona: Persona | null;

  // 스케줄러
  scheduledTasks: ScheduledTask[];
  executionRecords: ExecutionRecord[];

  // 액션 (상태 변경 함수들)
  actions: {
    // 대화
    createConversation: () => void;
    deleteConversation: (id: string) => void;
    setCurrentConversation: (id: string) => void;

    // 메시지
    addMessage: (message: Message) => void;
    updateMessage: (id: string, updates: Partial<Message>) => void;
    deleteMessage: (id: string) => void;

    // 스트리밍
    setIsStreaming: (streaming: boolean) => void;
    setPendingMessage: (message: string) => void;

    // 앱 모드
    setAppMode: (mode: AppMode) => void;

    // 그래프 설정
    setGraphType: (type: GraphType) => void;
    setThinkingMode: (mode: ThinkingMode) => void;

    // Extension 상태
    setExtensionState: (extensionId: string, state: any) => void;

    // ... 기타 액션들
  };
}
```

**사용 예:**

```typescript
import { useChatStore } from '@/lib/store/chat-store';

function ChatComponent() {
  const {
    conversations,
    currentConversationId,
    actions: { createConversation, setCurrentConversation },
  } = useChatStore();

  const handleNewChat = () => {
    createConversation();
  };

  const handleSelectChat = (id: string) => {
    setCurrentConversation(id);
  };

  return (
    <div>
      <button onClick={handleNewChat}>새 대화</button>
      {conversations.map(conv => (
        <div key={conv.id} onClick={() => handleSelectChat(conv.id)}>
          {conv.title}
        </div>
      ))}
    </div>
  );
}
```

---

### extension-slices.ts - Extension Store Slices

**역할:** Extension별 Store Slice를 동적으로 병합

**주요 기능:**

```typescript
// Extension Store Slice 타입
type ExtensionStoreSlice<T = any> = (
  set: StoreApi<ChatStore>['setState'],
  get: StoreApi<ChatStore>['getState']
) => T;

// Extension Store State 병합
function mergeExtensionStoreSlices(
  extensionSlices: Record<string, ExtensionStoreSlice>
): ExtensionStoreState;

// 사용 예
const extensionSlices = {
  'browser-agent': browserAgentSlice,
  editor: editorSlice,
};

const mergedState = mergeExtensionStoreSlices(extensionSlices);
```

**Extension Slice 예시:**

```typescript
// resources/extensions/browser/src/store-slice.ts
export function createBrowserAgentSlice(set, get) {
  return {
    browser: {
      currentUrl: '',
      navigationHistory: [],
      logs: [],

      navigate: (url: string) => {
        set((state) => ({
          browser: {
            ...state.browser,
            currentUrl: url,
            navigationHistory: [...state.browser.navigationHistory, url],
          },
        }));
      },

      addLog: (log: BrowserAgentLogEntry) => {
        set((state) => ({
          browser: {
            ...state.browser,
            logs: [...state.browser.logs, log],
          },
        }));
      },
    },
  };
}
```

---

### scheduler-slice.ts - Scheduler Slice

**역할:** 작업 스케줄러 상태 관리

**상태:**

```typescript
interface SchedulerSlice {
  scheduledTasks: ScheduledTask[];
  executionRecords: ExecutionRecord[];

  // 액션
  addScheduledTask: (task: ScheduledTask) => void;
  updateScheduledTask: (id: string, updates: Partial<ScheduledTask>) => void;
  deleteScheduledTask: (id: string) => void;
  addExecutionRecord: (record: ExecutionRecord) => void;
}
```

---

### editor-defaults.ts - Editor Defaults

**역할:** Editor Extension의 기본 설정

**설정:**

```typescript
export const DEFAULT_EDITOR_APPEARANCE: EditorAppearanceConfig = {
  theme: 'vs-dark',
  fontSize: 14,
  fontFamily: "'Fira Code', 'Courier New', monospace",
  lineHeight: 1.5,
  minimap: { enabled: true },
  wordWrap: 'off',
};

export const DEFAULT_EDITOR_LLM_PROMPTS: EditorLLMPromptsConfig = {
  codeReview: '이 코드를 리뷰해주세요...',
  refactor: '이 코드를 리팩토링해주세요...',
  explain: '이 코드를 설명해주세요...',
  addComments: '이 코드에 주석을 추가해주세요...',
};
```

---

## 사용 방법

### 1. 기본 사용 (상태 읽기)

```typescript
import { useChatStore } from '@/lib/store/chat-store';

function MessageList() {
  const messages = useChatStore((state) => state.messages);

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>{msg.content}</div>
      ))}
    </div>
  );
}
```

### 2. 상태 변경 (액션 사용)

```typescript
import { useChatStore } from '@/lib/store/chat-store';

function ChatInput() {
  const { pendingMessage, actions } = useChatStore();

  const handleSubmit = () => {
    if (!pendingMessage.trim()) return;

    actions.addMessage({
      role: 'user',
      content: pendingMessage,
    });

    actions.setPendingMessage('');
    actions.setIsStreaming(true);
  };

  return (
    <div>
      <input
        value={pendingMessage}
        onChange={(e) => actions.setPendingMessage(e.target.value)}
      />
      <button onClick={handleSubmit}>전송</button>
    </div>
  );
}
```

### 3. 선택적 상태 구독 (성능 최적화)

```typescript
// ❌ 나쁜 예: 전체 상태 구독 (불필요한 리렌더링)
function BadComponent() {
  const store = useChatStore();
  return <div>{store.currentConversationId}</div>;
}

// ✅ 좋은 예: 필요한 상태만 선택
function GoodComponent() {
  const conversationId = useChatStore((state) => state.currentConversationId);
  return <div>{conversationId}</div>;
}
```

### 4. 여러 상태 선택

```typescript
import { useChatStore } from '@/lib/store/chat-store';

function ChatHeader() {
  const { conversations, currentConversationId } = useChatStore((state) => ({
    conversations: state.conversations,
    currentConversationId: state.currentConversationId,
  }));

  const currentConversation = conversations.find(
    (c) => c.id === currentConversationId
  );

  return <h1>{currentConversation?.title || '새 대화'}</h1>;
}
```

### 5. 외부에서 상태 접근 (비React 환경)

```typescript
import { useChatStore } from '@/lib/store/chat-store';

// IPC 핸들러에서 사용
ipcMain.handle('get-current-conversation', () => {
  const state = useChatStore.getState();
  return state.conversations.find((c) => c.id === state.currentConversationId);
});

// 액션 호출
useChatStore.getState().actions.addMessage({
  role: 'assistant',
  content: 'Hello!',
});
```

---

## 새 상태 추가 가이드

### 1. 상태 타입 정의

```typescript
// types/index.d.ts
export interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
}
```

### 2. ChatStore에 상태 추가

```typescript
// lib/store/chat-store.ts
interface ChatStore {
  // ... 기존 상태

  // 새 상태 추가
  notificationSettings: NotificationSettings;

  actions: {
    // ... 기존 액션

    // 새 액션 추가
    updateNotificationSettings: (settings: Partial<NotificationSettings>) => void;
  };
}
```

### 3. 초기값 설정

```typescript
const useChatStore = create<ChatStore>((set, get) => ({
  // ... 기존 초기값

  // 새 상태 초기값
  notificationSettings: {
    enabled: true,
    sound: true,
    desktop: true,
  },

  actions: {
    // ... 기존 액션

    // 새 액션 구현
    updateNotificationSettings: (settings) => {
      set((state) => ({
        notificationSettings: {
          ...state.notificationSettings,
          ...settings,
        },
      }));
    },
  },
}));
```

### 4. 컴포넌트에서 사용

```typescript
import { useChatStore } from '@/lib/store/chat-store';

function NotificationSettings() {
  const { notificationSettings, actions } = useChatStore();

  const handleToggle = (key: keyof NotificationSettings) => {
    actions.updateNotificationSettings({
      [key]: !notificationSettings[key],
    });
  };

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={notificationSettings.enabled}
          onChange={() => handleToggle('enabled')}
        />
        알림 활성화
      </label>
    </div>
  );
}
```

---

## Extension Store Slice

### 1. Extension에서 Store Slice 정의

```typescript
// resources/extensions/my-extension/src/store-slice.ts
import type { StoreApi } from 'zustand';
import type { ChatStore } from '@/lib/store/chat-store';

export interface MyExtensionState {
  myData: string;
  myCounter: number;
}

export function createMyExtensionSlice(
  set: StoreApi<ChatStore>['setState'],
  get: StoreApi<ChatStore>['getState']
) {
  return {
    myExtension: {
      myData: '',
      myCounter: 0,

      setMyData: (data: string) => {
        set((state) => ({
          myExtension: {
            ...state.myExtension,
            myData: data,
          },
        }));
      },

      incrementCounter: () => {
        set((state) => ({
          myExtension: {
            ...state.myExtension,
            myCounter: state.myExtension.myCounter + 1,
          },
        }));
      },
    },
  };
}
```

### 2. Extension Definition에 등록

```typescript
// resources/extensions/my-extension/src/definition.ts
import { createMyExtensionSlice } from './store-slice';

export const definition: ExtensionDefinition = {
  manifest: { ... },

  // Store Slice 등록
  createStoreSlice: createMyExtensionSlice,

  // ...
};
```

### 3. 자동 병합

Extension이 활성화되면 자동으로 ChatStore에 병합됩니다:

```typescript
// 자동으로 다음과 같이 사용 가능
import { useChatStore } from '@/lib/store/chat-store';

function MyExtensionComponent() {
  const myExtension = useChatStore((state) => state.myExtension);

  return (
    <div>
      <p>Data: {myExtension.myData}</p>
      <p>Counter: {myExtension.myCounter}</p>
      <button onClick={myExtension.incrementCounter}>증가</button>
    </div>
  );
}
```

---

## Persistence (영구 저장)

### 1. localStorage 저장

**자동 저장 상태:**

- `conversations` - 대화 목록
- `currentConversationId` - 현재 대화 ID
- `appMode` - 앱 모드
- `graphConfig` - 그래프 설정
- `sidebarOpen` - 사이드바 상태
- `workingDirectory` - 작업 디렉토리

**저장 로직:**

```typescript
const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      // ... 상태 및 액션
    }),
    {
      name: 'sepilot-chat-store',
      partialize: (state) => ({
        conversations: state.conversations,
        currentConversationId: state.currentConversationId,
        appMode: state.appMode,
        graphConfig: state.graphConfig,
        sidebarOpen: state.sidebarOpen,
        workingDirectory: state.workingDirectory,
      }),
    }
  )
);
```

### 2. Electron DB 동기화

**대화 저장:**

```typescript
// 새 메시지 추가 시 자동으로 DB에 저장
actions: {
  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));

    // Electron DB에 저장 (비동기)
    if (isElectron()) {
      window.electronAPI.chat.saveMessage(message);
    }
  },
}
```

**대화 로드:**

```typescript
// 앱 시작 시 DB에서 대화 로드
useEffect(() => {
  if (isElectron()) {
    window.electronAPI.chat.loadConversations().then((conversations) => {
      useChatStore.getState().actions.loadConversations(conversations);
    });
  }
}, []);
```

---

## 예제 코드

### 예제 1: 대화 관리

```typescript
import { useChatStore } from '@/lib/store/chat-store';

function ConversationManager() {
  const {
    conversations,
    currentConversationId,
    actions: { createConversation, deleteConversation, setCurrentConversation },
  } = useChatStore();

  const handleNew = () => {
    createConversation();
  };

  const handleDelete = (id: string) => {
    if (confirm('이 대화를 삭제하시겠습니까?')) {
      deleteConversation(id);
    }
  };

  return (
    <div>
      <button onClick={handleNew}>+ 새 대화</button>
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className={conv.id === currentConversationId ? 'active' : ''}
          onClick={() => setCurrentConversation(conv.id)}
        >
          <span>{conv.title}</span>
          <button onClick={() => handleDelete(conv.id)}>삭제</button>
        </div>
      ))}
    </div>
  );
}
```

### 예제 2: 스트리밍 상태 관리

```typescript
import { useChatStore } from '@/lib/store/chat-store';

function ChatArea() {
  const { messages, isStreaming } = useChatStore();

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
      {isStreaming && <div className="loading">AI가 응답 중...</div>}
    </div>
  );
}
```

### 예제 3: 그래프 설정 변경

```typescript
import { useChatStore } from '@/lib/store/chat-store';

function GraphSettings() {
  const { selectedGraphType, thinkingMode, actions } = useChatStore();

  return (
    <div>
      <select
        value={selectedGraphType}
        onChange={(e) => actions.setGraphType(e.target.value as GraphType)}
      >
        <option value="chat">기본 채팅</option>
        <option value="agent">에이전트</option>
        <option value="rag">RAG</option>
        <option value="deep-thinking">깊은 사고</option>
      </select>

      <select
        value={thinkingMode}
        onChange={(e) => actions.setThinkingMode(e.target.value as ThinkingMode)}
      >
        <option value="simple">단순</option>
        <option value="sequential">순차적</option>
        <option value="tree">트리</option>
      </select>
    </div>
  );
}
```

### 예제 4: Extension 상태 사용

```typescript
import { useChatStore } from '@/lib/store/chat-store';

function BrowserExtensionUI() {
  // Extension Slice 자동 병합됨
  const browser = useChatStore((state) => state.browser);

  if (!browser) {
    return <div>Browser Extension이 비활성화되었습니다</div>;
  }

  return (
    <div>
      <p>현재 URL: {browser.currentUrl}</p>
      <button onClick={() => browser.navigate('https://www.google.com')}>
        Google 열기
      </button>

      <h3>탐색 기록</h3>
      {browser.navigationHistory.map((url, i) => (
        <div key={i}>{url}</div>
      ))}
    </div>
  );
}
```

---

## 관련 문서

### 라이브러리

- [lib/README.md](../README.md) - lib 폴더 가이드

### 컴포넌트

- [components/README.md](../../components/README.md) - React 컴포넌트 가이드

### Extension

- [lib/extensions/README.md](../extensions/README.md) - Extension 시스템

### 아키텍처

- [docs/architecture/dependency-rules.md](../../docs/architecture/dependency-rules.md) - 의존성 규칙

### 개발 가이드

- [CLAUDE.md](../../CLAUDE.md) - 프로젝트 전체 가이드

### 외부 리소스

- [Zustand 공식 문서](https://zustand-demo.pmnd.rs/)
- [Immer 공식 문서](https://immerjs.github.io/immer/)

---

## 변경 이력

- **2025-02-10**: Phase 3 리팩토링 완료 (Extension Slice 동적 병합)
- **2025-01-17**: 초기 Zustand Store 구축
