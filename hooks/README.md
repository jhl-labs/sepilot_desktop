# hooks/ - React Custom Hooks

> 전역에서 재사용 가능한 React Custom Hooks 모음

## 📋 목차

- [개요](#개요)
- [폴더 구조](#폴더-구조)
- [주요 훅](#주요-훅)
- [훅 작성 가이드](#훅-작성-가이드)
- [훅 네이밍 규칙](#훅-네이밍-규칙)
- [새 훅 추가 가이드](#새-훅-추가-가이드)
- [주의사항](#주의사항)
- [관련 문서](#관련-문서)

---

## 개요

`hooks/` 디렉토리는 **전역에서 재사용 가능한 React Custom Hooks**를 관리합니다. 비즈니스 로직을 컴포넌트에서 분리하여 재사용성과 테스트 용이성을 높입니다.

### 핵심 특징

- **로직 재사용**: 여러 컴포넌트에서 공유되는 로직
- **관심사 분리**: UI와 비즈니스 로직 분리
- **타입 안전성**: TypeScript 기반 타입 추론
- **테스트 용이**: 단위 테스트 가능

---

## 폴더 구조

```
hooks/
├── use-keyboard-shortcuts.ts     # 키보드 단축키 훅
├── use-message-subscription.ts   # 메시지 구독 훅 (IPC 이벤트)
├── use-notification.ts           # 알림 훅
├── use-terminal-hotkeys.ts       # 터미널 단축키 훅
├── use-terminal.ts               # 터미널 훅
└── useLangGraphStream.ts         # LangGraph 스트리밍 훅
```

---

## 주요 훅

### use-keyboard-shortcuts.ts

**역할**: 전역 키보드 단축키 등록 및 관리

```typescript
// hooks/use-keyboard-shortcuts.ts
import { useEffect } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  handler: (event: KeyboardEvent) => void;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        if (
          event.key === shortcut.key &&
          event.ctrlKey === (shortcut.ctrl ?? false) &&
          event.shiftKey === (shortcut.shift ?? false) &&
          event.altKey === (shortcut.alt ?? false) &&
          event.metaKey === (shortcut.meta ?? false)
        ) {
          event.preventDefault();
          shortcut.handler(event);
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
```

**사용 예시**:

```typescript
// components/MainLayout.tsx
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';

export function MainLayout() {
  useKeyboardShortcuts([
    {
      key: 'n',
      ctrl: true,
      handler: () => {
        console.log('Ctrl+N pressed - New conversation');
      },
    },
    {
      key: 's',
      ctrl: true,
      handler: () => {
        console.log('Ctrl+S pressed - Save');
      },
    },
  ]);

  return <div>{/* ... */}</div>;
}
```

### use-message-subscription.ts

**역할**: IPC 이벤트 구독 및 메시지 수신

```typescript
// hooks/use-message-subscription.ts
import { useEffect, useState } from 'react';

export function useMessageSubscription<T>(channel: string) {
  const [messages, setMessages] = useState<T[]>([]);

  useEffect(() => {
    const handler = (data: T) => {
      setMessages((prev) => [...prev, data]);
    };

    window.electronAPI.on(channel, handler);

    return () => {
      window.electronAPI.off(channel, handler);
    };
  }, [channel]);

  return messages;
}
```

**사용 예시**:

```typescript
// components/chat/ChatArea.tsx
import { useMessageSubscription } from '@/hooks/use-message-subscription';

export function ChatArea() {
  const chunks = useMessageSubscription<StreamChunk>('llm:stream-chunk');

  return (
    <div>
      {chunks.map((chunk, index) => (
        <div key={index}>{chunk.content}</div>
      ))}
    </div>
  );
}
```

### use-notification.ts

**역할**: 토스트 알림 표시

```typescript
// hooks/use-notification.ts
import { toast } from 'sonner';

export function useNotification() {
  const success = (message: string) => {
    toast.success(message);
  };

  const error = (message: string) => {
    toast.error(message);
  };

  const info = (message: string) => {
    toast.info(message);
  };

  const warning = (message: string) => {
    toast.warning(message);
  };

  return { success, error, info, warning };
}
```

**사용 예시**:

```typescript
// components/settings/LLMSettings.tsx
import { useNotification } from '@/hooks/use-notification';

export function LLMSettings() {
  const { success, error } = useNotification();

  const handleSave = async () => {
    try {
      await window.electronAPI.config.save({ llm: config });
      success('설정이 저장되었습니다.');
    } catch (err) {
      error('설정 저장에 실패했습니다.');
    }
  };

  return <button onClick={handleSave}>저장</button>;
}
```

### use-terminal.ts

**역할**: 터미널 세션 관리

```typescript
// hooks/use-terminal.ts
import { useState, useCallback } from 'react';

export interface TerminalSession {
  id: string;
  cwd: string;
  shell: string;
}

export function useTerminal() {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);

  const createSession = useCallback(async (cwd: string) => {
    const session = await window.electronAPI.terminal.createSession({ cwd });
    setSessions((prev) => [...prev, session]);
    return session;
  }, []);

  const executeCommand = useCallback(async (sessionId: string, command: string) => {
    await window.electronAPI.terminal.executeCommand({ sessionId, command });
  }, []);

  const closeSession = useCallback(async (sessionId: string) => {
    await window.electronAPI.terminal.closeSession({ sessionId });
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }, []);

  return { sessions, createSession, executeCommand, closeSession };
}
```

**사용 예시**:

```typescript
// components/terminal/TerminalPanel.tsx
import { useTerminal } from '@/hooks/use-terminal';

export function TerminalPanel() {
  const { sessions, createSession, executeCommand } = useTerminal();

  const handleNewSession = async () => {
    const session = await createSession('/home/user/project');
    console.log('New session:', session);
  };

  return (
    <div>
      <button onClick={handleNewSession}>New Terminal</button>
      {sessions.map((session) => (
        <div key={session.id}>{session.cwd}</div>
      ))}
    </div>
  );
}
```

### useLangGraphStream.ts

**역할**: LangGraph 스트리밍 이벤트 구독 및 상태 관리

```typescript
// hooks/useLangGraphStream.ts
import { useState, useEffect, useCallback } from 'react';
import type { StreamEvent } from '@/types/langgraph';

export function useLangGraphStream(conversationId: string) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleStreamEvent = (event: StreamEvent) => {
      if (event.conversationId === conversationId) {
        setEvents((prev) => [...prev, event]);

        if (event.type === 'done' || event.type === 'error') {
          setIsStreaming(false);
        }

        if (event.type === 'error') {
          setError(event.data as string);
        }
      }
    };

    window.electronAPI.on('langgraph:stream-event', handleStreamEvent);

    return () => {
      window.electronAPI.off('langgraph:stream-event', handleStreamEvent);
    };
  }, [conversationId]);

  const startStream = useCallback(
    async (config: GraphConfig, messages: Message[]) => {
      setIsStreaming(true);
      setError(null);
      setEvents([]);
      await window.electronAPI.langgraph.stream(config, messages, conversationId);
    },
    [conversationId]
  );

  const abort = useCallback(async () => {
    await window.electronAPI.langgraph.abort(conversationId);
    setIsStreaming(false);
  }, [conversationId]);

  return { events, isStreaming, error, startStream, abort };
}
```

**사용 예시**:

```typescript
// components/chat/AgentChat.tsx
import { useLangGraphStream } from '@/hooks/useLangGraphStream';

export function AgentChat({ conversationId }: { conversationId: string }) {
  const { events, isStreaming, startStream, abort } = useLangGraphStream(conversationId);

  const handleSend = async (messages: Message[]) => {
    await startStream({ graphType: 'agent', llmConfig: { ... } }, messages);
  };

  return (
    <div>
      {events.map((event, index) => (
        <div key={index}>{JSON.stringify(event)}</div>
      ))}
      {isStreaming && <button onClick={abort}>중단</button>}
    </div>
  );
}
```

---

## 훅 작성 가이드

### 1. 훅 기본 구조

```typescript
// hooks/use-example.ts
import { useState, useEffect, useCallback } from 'react';

export interface UseExampleOptions {
  enabled?: boolean;
  interval?: number;
}

export function useExample(options: UseExampleOptions = {}) {
  const { enabled = true, interval = 1000 } = options;

  // 상태
  const [data, setData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // 부수 효과
  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => {
      setData(new Date().toISOString());
    }, interval);

    return () => clearInterval(timer);
  }, [enabled, interval]);

  // 콜백
  const refetch = useCallback(() => {
    setData(new Date().toISOString());
  }, []);

  // 반환
  return { data, loading, error, refetch };
}
```

### 2. 타입 정의

```typescript
// hooks/use-api.ts
export interface UseApiOptions<T> {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useApi<T>(options: UseApiOptions<T>): UseApiResult<T> {
  // ...
}
```

### 3. 의존성 관리

```typescript
// ✅ 올바른 의존성 배열
useEffect(() => {
  fetchData(url);
}, [url]); // url이 변경될 때만 실행

// ❌ 잘못된 의존성 배열 (누락)
useEffect(() => {
  fetchData(url);
}, []); // url이 변경되어도 실행 안 됨

// ✅ useCallback으로 의존성 안정화
const fetchData = useCallback(async () => {
  const result = await fetch(url);
  setData(result);
}, [url]);

useEffect(() => {
  fetchData();
}, [fetchData]); // fetchData가 안정적
```

### 4. 클린업 함수

```typescript
// ✅ 클린업 함수 반환
useEffect(() => {
  const handleMessage = (data: unknown) => {
    console.log(data);
  };

  window.electronAPI.on('message', handleMessage);

  // 클린업
  return () => {
    window.electronAPI.off('message', handleMessage);
  };
}, []);
```

---

## 훅 네이밍 규칙

### 1. 파일명

```bash
# ✅ kebab-case
hooks/use-keyboard-shortcuts.ts
hooks/use-message-subscription.ts
hooks/use-notification.ts

# ❌ camelCase (혼용 주의)
hooks/useLangGraphStream.ts  # 기존 파일 (허용)
```

### 2. 훅 함수명

```typescript
// ✅ use로 시작하는 camelCase
export function useKeyboardShortcuts() {}
export function useMessageSubscription() {}
export function useNotification() {}

// ❌ use로 시작하지 않음
export function keyboardShortcuts() {} // 훅이 아님
```

### 3. 반환값 네이밍

```typescript
// ✅ 명확한 네이밍
export function useData() {
  return { data, loading, error, refetch };
}

// ✅ 배열 구조 분해 (useState 패턴)
export function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = () => setValue((v) => !v);
  return [value, toggle] as const;
}
```

---

## 새 훅 추가 가이드

### 1. 훅 파일 생성

```bash
# 예시: 새 훅 추가
touch hooks/use-local-storage.ts
```

### 2. 훅 구현

```typescript
// hooks/use-local-storage.ts
import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  // 초기값 로드
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error('Error loading from localStorage:', error);
      return initialValue;
    }
  });

  // 값 변경 시 localStorage 업데이트
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [key, value]);

  return [value, setValue] as const;
}
```

### 3. 타입 정의 (필요 시)

```typescript
// hooks/use-local-storage.ts
export type UseLocalStorageResult<T> = [T, (value: T | ((prev: T) => T)) => void];

export function useLocalStorage<T>(key: string, initialValue: T): UseLocalStorageResult<T> {
  // ...
}
```

### 4. 사용

```typescript
// components/Settings.tsx
import { useLocalStorage } from '@/hooks/use-local-storage';

export function Settings() {
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light');

  return (
    <div>
      <p>Current theme: {theme}</p>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>Toggle Theme</button>
    </div>
  );
}
```

---

## 주의사항

### ❌ 하지 말아야 할 것

1. **훅 내부에서 조건부 호출 금지**

   ```typescript
   // ❌ 조건부 훅 호출
   export function MyComponent({ enabled }: { enabled: boolean }) {
     if (enabled) {
       const data = useData(); // 에러!
     }
   }

   // ✅ 훅 내부에서 조건 처리
   export function useData(enabled: boolean) {
     const [data, setData] = useState(null);

     useEffect(() => {
       if (!enabled) return;
       fetchData().then(setData);
     }, [enabled]);

     return data;
   }
   ```

2. **일반 함수에서 훅 호출 금지**

   ```typescript
   // ❌ 일반 함수에서 훅 호출
   function fetchData() {
     const [data, setData] = useState(null); // 에러!
     return data;
   }

   // ✅ 훅 함수에서만 호출
   export function useData() {
     const [data, setData] = useState(null);
     return data;
   }
   ```

3. **의존성 배열 생략 금지**

   ```typescript
   // ❌ 의존성 배열 생략
   useEffect(() => {
     fetchData(url);
   }); // 매 렌더링마다 실행!

   // ✅ 의존성 배열 명시
   useEffect(() => {
     fetchData(url);
   }, [url]);
   ```

4. **훅 내부에서 다른 훅 조건부 호출 금지**
   ```typescript
   // ❌ 조건부 훅 호출
   export function useConditional(enabled: boolean) {
     if (enabled) {
       const data = useState(null); // 에러!
     }
   }
   // ✅ 항상 호출, 조건은 내부에서
   export function useConditional(enabled: boolean) {
     const [data, setData] = useState(null);
     useEffect(() => {
       if (enabled) {
         fetchData().then(setData);
       }
     }, [enabled]);
   }
   ```

### ✅ 반드시 해야 할 것

1. **타입 안전성 보장**

   ```typescript
   // ✅ 제네릭 타입 사용
   export function useData<T>(url: string): UseDataResult<T> {
     const [data, setData] = useState<T | null>(null);
     // ...
   }
   ```

2. **클린업 함수 제공**

   ```typescript
   // ✅ 클린업 함수 반환
   useEffect(() => {
     const subscription = subscribe();
     return () => subscription.unsubscribe();
   }, []);
   ```

3. **의존성 배열 정확히 명시**

   ```typescript
   // ✅ ESLint exhaustive-deps 규칙 준수
   useEffect(() => {
     doSomething(prop1, prop2);
   }, [prop1, prop2]); // 모든 의존성 명시
   ```

4. **에러 처리**
   ```typescript
   // ✅ try-catch로 에러 처리
   useEffect(() => {
     const fetchData = async () => {
       try {
         const result = await fetch(url);
         setData(result);
       } catch (error) {
         setError(error);
       }
     };
     fetchData();
   }, [url]);
   ```

---

## 관련 문서

- [components/README.md](../components/README.md) - UI 컴포넌트 개발 가이드
- [lib/README.md](../lib/README.md) - 비즈니스 로직 라이브러리 가이드
- [docs/development/new-component-guide.md](../docs/development/new-component-guide.md) - 컴포넌트 추가 가이드
- [React Hooks 공식 문서](https://react.dev/reference/react)
- [CLAUDE.md](../CLAUDE.md) - 프로젝트 전체 가이드

---

## 요약

`hooks/` 디렉토리 핵심 원칙:

1. **use로 시작**: 훅 함수명은 항상 `use`로 시작
2. **재사용성**: 여러 컴포넌트에서 공유 가능한 로직
3. **타입 안전성**: TypeScript 제네릭 활용
4. **클린업**: 부수 효과 정리 필수
5. **의존성 관리**: exhaustive-deps 규칙 준수

새 훅 추가 시 이 가이드를 참고하여 일관성을 유지하세요.
