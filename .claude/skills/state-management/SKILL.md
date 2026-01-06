---
name: State Management with Zustand
description: >
  Zustand를 사용한 전역 상태 관리 패턴. SEPilot Desktop의 chat-store,
  extension-slices 등 실제 구현 기반. Store 설계, Slice 패턴, Persistence,
  Middleware 사용법을 다룹니다.
---

# State Management with Zustand Skill

## Zustand 소개

SEPilot Desktop은 Zustand를 전역 상태 관리에 사용합니다:

- **경량**: Redux보다 훨씬 작고 간단
- **직관적**: Hooks 기반 API
- **TypeScript**: 완벽한 타입 지원
- **유연**: Middleware 확장 가능

## 프로젝트 Store 구조

```
lib/store/
├── chat-store.ts          # 채팅 상태 관리 (메인 스토어)
└── extension-slices.ts    # Extension 상태 관리
```

## 기본 Store 패턴

### Simple Store

```typescript
// lib/store/simple-store.ts
import { create } from 'zustand';

interface CounterState {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
  reset: () => set({ count: 0 }),
}));

// 컴포넌트에서 사용
function Counter() {
  const count = useCounterStore((state) => state.count);
  const increment = useCounterStore((state) => state.increment);

  return (
    <div>
      <span>{count}</span>
      <button onClick={increment}>+</button>
    </div>
  );
}
```

### Slice Pattern (권장)

큰 store를 여러 slice로 분리:

```typescript
// lib/store/slices/conversation-slice.ts
import { StateCreator } from 'zustand';

export interface ConversationSlice {
  conversations: Map<string, Conversation>;
  currentConversationId: string | null;

  // Actions
  addConversation: (conversation: Conversation) => void;
  removeConversation: (id: string) => void;
  setCurrentConversation: (id: string) => void;
}

export const createConversationSlice: StateCreator<
  ConversationSlice & MessageSlice, // Combined type
  [],
  [],
  ConversationSlice
> = (set, get) => ({
  conversations: new Map(),
  currentConversationId: null,

  addConversation: (conversation) =>
    set((state) => {
      const newConversations = new Map(state.conversations);
      newConversations.set(conversation.id, conversation);
      return { conversations: newConversations };
    }),

  removeConversation: (id) =>
    set((state) => {
      const newConversations = new Map(state.conversations);
      newConversations.delete(id);
      return { conversations: newConversations };
    }),

  setCurrentConversation: (id) => set({ currentConversationId: id }),
});
```

```typescript
// lib/store/slices/message-slice.ts
export interface MessageSlice {
  messages: Map<string, Message[]>;

  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
}

export const createMessageSlice: StateCreator<
  ConversationSlice & MessageSlice,
  [],
  [],
  MessageSlice
> = (set) => ({
  messages: new Map(),

  addMessage: (conversationId, message) =>
    set((state) => {
      const newMessages = new Map(state.messages);
      const conversationMessages = newMessages.get(conversationId) || [];
      newMessages.set(conversationId, [...conversationMessages, message]);
      return { messages: newMessages };
    }),

  updateMessage: (conversationId, messageId, updates) =>
    set((state) => {
      const newMessages = new Map(state.messages);
      const conversationMessages = newMessages.get(conversationId) || [];
      const updatedMessages = conversationMessages.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      );
      newMessages.set(conversationId, updatedMessages);
      return { messages: newMessages };
    }),
});
```

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

## SEPilot의 실제 ChatStore

실제 `lib/store/chat-store.ts` 구조:

```typescript
import { create } from 'zustand';

interface ChatState {
  // Conversations
  conversations: Map<string, Conversation>;
  currentConversationId: string | null;

  // Messages
  messages: Map<string, Message[]>;
  streamingMessage: string | null;

  // UI State
  isSidebarOpen: boolean;
  isStreaming: boolean;

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  deleteConversation: (id: string) => void;

  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;

  setStreamingMessage: (content: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setStreaming: (streaming: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  conversations: new Map(),
  currentConversationId: null,
  messages: new Map(),
  streamingMessage: null,
  isSidebarOpen: true,
  isStreaming: false,

  // Implementations...
}));
```

## Selectors (성능 최적화)

### Derived State

```typescript
// Selector로 파생 상태 생성
const useCurrentConversation = () =>
  useChatStore((state) => {
    if (!state.currentConversationId) return null;
    return state.conversations.get(state.currentConversationId);
  });

const useCurrentMessages = () =>
  useChatStore((state) => {
    if (!state.currentConversationId) return [];
    return state.messages.get(state.currentConversationId) || [];
  });

// 사용
function ChatView() {
  const conversation = useCurrentConversation();
  const messages = useCurrentMessages();

  if (!conversation) return <div>No conversation selected</div>;

  return (
    <div>
      <h2>{conversation.title}</h2>
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
    </div>
  );
}
```

### Shallow Equality

여러 상태를 구독할 때:

```typescript
import { shallow } from 'zustand/shallow';

function MyComponent() {
  // ❌ Bad - 모든 상태 변경에 리렌더
  const state = useChatStore();

  // ✅ Good - count나 increment 변경에만 리렌더
  const { count, increment } = useChatStore(
    (state) => ({ count: state.count, increment: state.increment }),
    shallow
  );

  return <button onClick={increment}>{count}</button>;
}
```

## Persistence (localStorage)

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface Settings {
  theme: 'light' | 'dark';
  language: 'ko' | 'en';
  fontSize: number;

  setTheme: (theme: 'light' | 'dark') => void;
  setLanguage: (language: 'ko' | 'en') => void;
  setFontSize: (size: number) => void;
}

export const useSettingsStore = create<Settings>()(
  persist(
    (set) => ({
      theme: 'light',
      language: 'ko',
      fontSize: 14,

      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setFontSize: (fontSize) => set({ fontSize }),
    }),
    {
      name: 'settings-storage', // localStorage key
      storage: createJSONStorage(() => localStorage),
    }
  )
);
```

## Middleware

### Immer (불변성 관리)

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface TodoState {
  todos: Todo[];
  addTodo: (todo: Todo) => void;
  toggleTodo: (id: string) => void;
}

export const useTodoStore = create<TodoState>()(
  immer((set) => ({
    todos: [],

    addTodo: (todo) =>
      set((state) => {
        state.todos.push(todo); // Immer allows mutation syntax
      }),

    toggleTodo: (id) =>
      set((state) => {
        const todo = state.todos.find((t) => t.id === id);
        if (todo) {
          todo.completed = !todo.completed;
        }
      }),
  }))
);
```

### DevTools

```typescript
import { devtools } from 'zustand/middleware';

export const useChatStore = create<ChatState>()(
  devtools(
    (set) => ({
      // ... state
    }),
    {
      name: 'ChatStore',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);
```

### Combined Middleware

```typescript
export const useChatStore = create<ChatState>()(
  devtools(
    persist(
      immer((set) => ({
        // ... state
      })),
      {
        name: 'chat-storage',
      }
    ),
    {
      name: 'ChatStore',
    }
  )
);
```

## Async Actions

```typescript
interface DataState {
  data: Data | null;
  loading: boolean;
  error: Error | null;

  fetchData: (id: string) => Promise<void>;
}

export const useDataStore = create<DataState>((set) => ({
  data: null,
  loading: false,
  error: null,

  fetchData: async (id) => {
    set({ loading: true, error: null });

    try {
      const data = await window.electron.invoke('data:fetch', { id });
      set({ data, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error : new Error('Unknown error'),
        loading: false,
      });
    }
  },
}));
```

## Testing

```typescript
// tests/lib/store/chat-store.test.ts
import { useChatStore } from '@/lib/store/chat-store';
import { act, renderHook } from '@testing-library/react';

describe('ChatStore', () => {
  beforeEach(() => {
    // Reset store
    useChatStore.setState({
      conversations: new Map(),
      currentConversationId: null,
    });
  });

  it('should add conversation', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.addConversation({
        id: 'conv-1',
        title: 'Test',
        createdAt: Date.now(),
      });
    });

    expect(result.current.conversations.size).toBe(1);
    expect(result.current.conversations.get('conv-1')).toBeDefined();
  });

  it('should delete conversation', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.addConversation({
        id: 'conv-1',
        title: 'Test',
        createdAt: Date.now(),
      });
      result.current.deleteConversation('conv-1');
    });

    expect(result.current.conversations.size).toBe(0);
  });
});
```

## Best Practices

### 1. Store 분리

```typescript
// ✅ Good - 관심사별 분리
useChatStore(); // 채팅 상태
useSettingsStore(); // 설정
useExtensionStore(); // Extension 상태

// ❌ Bad - 모든 상태를 하나의 store에
useGlobalStore(); // 너무 큼
```

### 2. Actions는 Store 안에

```typescript
// ✅ Good
const increment = useChatStore((state) => state.increment);

// ❌ Bad - 외부에서 직접 set 호출
useChatStore.setState({ count: 1 });
```

### 3. 선택적 구독

```typescript
// ✅ Good - 필요한 것만 구독
const count = useChatStore((state) => state.count);

// ❌ Bad - 전체 store 구독
const store = useChatStore();
```

### 4. Map 사용 시 주의

```typescript
// ✅ Good - 새 Map 생성
addConversation: (conversation) =>
  set((state) => {
    const newConversations = new Map(state.conversations);
    newConversations.set(conversation.id, conversation);
    return { conversations: newConversations };
  });

// ❌ Bad - 기존 Map 변경 (React가 변경 감지 못함)
addConversation: (conversation) =>
  set((state) => {
    state.conversations.set(conversation.id, conversation);
    return { conversations: state.conversations };
  });
```

## 실제 예제

기존 구현 참고:

- `lib/store/chat-store.ts` - 메인 채팅 스토어
- `lib/store/extension-slices.ts` - Extension 상태 관리
- 실제 사용: `components/chat/` 컴포넌트들
