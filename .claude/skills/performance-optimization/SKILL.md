---
name: Performance Optimization
description: >
  React 및 Electron 성능 최적화 패턴. 렌더링 최적화, 메모리 관리,
  번들 크기 최적화, 리소스 로딩 최적화를 다룹니다. SEPilot Desktop의
  실제 사용 사례 기반으로 성능 문제 식별 및 해결 방법을 제공합니다.
---

# Performance Optimization Skill

## React 성능 최적화

### React.memo (컴포넌트 메모이제이션)

```typescript
import { memo } from 'react';

interface MessageItemProps {
  message: Message;
  onEdit: (id: string) => void;
}

// ❌ Bad - 부모가 리렌더되면 항상 리렌더
export function MessageItem({ message, onEdit }: MessageItemProps) {
  return <div>{message.content}</div>;
}

// ✅ Good - props가 같으면 리렌더 스킵
export const MessageItem = memo(({ message, onEdit }: MessageItemProps) => {
  return <div>{message.content}</div>;
});

// Custom comparison
export const MessageItem = memo(
  ({ message, onEdit }: MessageItemProps) => {
    return <div>{message.content}</div>;
  },
  (prevProps, nextProps) => {
    // true를 반환하면 리렌더 스킵
    return prevProps.message.id === nextProps.message.id &&
           prevProps.message.content === nextProps.message.content;
  }
);
```

### useMemo (값 메모이제이션)

```typescript
import { useMemo } from 'react';

function ChatMessages({ messages }: { messages: Message[] }) {
  // ❌ Bad - 매 렌더마다 재계산
  const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);
  const filteredMessages = sortedMessages.filter((m) => !m.deleted);

  // ✅ Good - messages가 변경될 때만 재계산
  const processedMessages = useMemo(() => {
    return messages
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((m) => !m.deleted);
  }, [messages]);

  return (
    <div>
      {processedMessages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
    </div>
  );
}
```

### useCallback (함수 메모이제이션)

```typescript
import { useCallback, useState } from 'react';

function ChatInput({ conversationId }: { conversationId: string }) {
  const [message, setMessage] = useState('');

  // ❌ Bad - 매 렌더마다 새 함수 생성
  const handleSend = () => {
    window.electron.invoke('chat:send', { conversationId, message });
  };

  // ✅ Good - conversationId나 message가 변경될 때만 새 함수 생성
  const handleSend = useCallback(() => {
    window.electron.invoke('chat:send', { conversationId, message });
  }, [conversationId, message]);

  return (
    <div>
      <input value={message} onChange={(e) => setMessage(e.target.value)} />
      <SendButton onClick={handleSend} /> {/* memo된 컴포넌트 */}
    </div>
  );
}
```

### Virtual Scrolling (긴 리스트)

```typescript
import { FixedSizeList } from 'react-window';

function MessageList({ messages }: { messages: Message[] }) {
  // ❌ Bad - 1000개 메시지 모두 렌더링
  return (
    <div>
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
    </div>
  );

  // ✅ Good - 화면에 보이는 것만 렌더링
  return (
    <FixedSizeList
      height={600}
      itemCount={messages.length}
      itemSize={80}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <MessageItem message={messages[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

### Code Splitting (동적 import)

```typescript
import dynamic from 'next/dynamic';

// ❌ Bad - 모든 컴포넌트 한 번에 로드
import HeavyEditor from './HeavyEditor';
import HeavyChart from './HeavyChart';

// ✅ Good - 필요할 때만 로드
const HeavyEditor = dynamic(() => import('./HeavyEditor'), {
  loading: () => <div>에디터 로딩 중...</div>,
  ssr: false, // Electron에서는 SSR 불필요
});

const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <div>차트 로딩 중...</div>,
});

function App() {
  const [showEditor, setShowEditor] = useState(false);

  return (
    <div>
      <button onClick={() => setShowEditor(true)}>에디터 열기</button>
      {showEditor && <HeavyEditor />}
    </div>
  );
}
```

## Electron 성능 최적화

### IPC 최적화

```typescript
// ❌ Bad - 개별 메시지마다 IPC 호출
for (const message of messages) {
  await window.electron.invoke('message:save', message);
}

// ✅ Good - 배치로 한 번에 전송
await window.electron.invoke('messages:save-batch', messages);
```

```typescript
// ❌ Bad - 빈번한 IPC 호출
input.addEventListener('input', (e) => {
  window.electron.invoke('search', e.target.value);
});

// ✅ Good - Debounce
import { debounce } from 'lodash';

const debouncedSearch = debounce((query: string) => {
  window.electron.invoke('search', query);
}, 300);

input.addEventListener('input', (e) => {
  debouncedSearch(e.target.value);
});
```

### 메모리 관리

```typescript
// ❌ Bad - 이벤트 리스너 정리 안 함
useEffect(() => {
  window.electron.on('message:received', handleMessage);
  // Cleanup 없음 - 메모리 누수!
}, []);

// ✅ Good - Cleanup
useEffect(() => {
  window.electron.on('message:received', handleMessage);

  return () => {
    window.electron.off('message:received', handleMessage);
  };
}, [handleMessage]);
```

### BrowserWindow 최적화

```typescript
// electron/main.ts
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    // ✅ 성능 최적화
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,

    // 하드웨어 가속
    enableWebSQL: false,
    webgl: true,

    // V8 메모리 제한 (메모리 제약이 있는 경우)
    v8CacheOptions: 'code',
  },

  // ✅ 렌더 최적화
  backgroundColor: '#ffffff', // 깜빡임 방지
  show: false, // ready-to-show 이벤트에서 show
});

mainWindow.once('ready-to-show', () => {
  mainWindow.show();
});
```

## 번들 크기 최적화

### Tree Shaking

```typescript
// ❌ Bad - 전체 라이브러리 import
import _ from 'lodash';
import moment from 'moment';

// ✅ Good - 필요한 함수만 import
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';
import dayjs from 'dayjs'; // moment보다 작음
```

### Bundle Analyzer

```bash
# package.json
{
  "scripts": {
    "analyze": "ANALYZE=true pnpm run build"
  }
}

# next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  // ... config
});
```

### Dynamic Import

```typescript
// ❌ Bad - 무거운 라이브러리를 항상 로드
import * as XLSX from 'xlsx';

export function exportToExcel(data: Data[]) {
  const ws = XLSX.utils.json_to_sheet(data);
  // ...
}

// ✅ Good - 필요할 때만 로드
export async function exportToExcel(data: Data[]) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(data);
  // ...
}
```

## 이미지 최적화

### Next.js Image

```typescript
import Image from 'next/image';

// ❌ Bad - 일반 img 태그
<img src="/large-image.jpg" alt="Large" />

// ✅ Good - Next.js Image (자동 최적화)
<Image
  src="/large-image.jpg"
  alt="Large"
  width={800}
  height={600}
  loading="lazy"
  placeholder="blur"
/>
```

### Lazy Loading

```typescript
// 이미지가 뷰포트에 들어올 때만 로드
<img
  src="/image.jpg"
  loading="lazy"
  alt="Lazy loaded"
/>
```

## 렌더링 최적화

### 불필요한 리렌더 추적

```typescript
// React DevTools Profiler 사용
import { Profiler } from 'react';

function onRenderCallback(
  id: string,
  phase: 'mount' | 'update',
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number
) {
  console.log(`${id} (${phase}) took ${actualDuration}ms`);
}

<Profiler id="MessageList" onRender={onRenderCallback}>
  <MessageList />
</Profiler>
```

### Why-did-you-render

```typescript
// 개발 환경에서만
if (process.env.NODE_ENV === 'development') {
  const whyDidYouRender = require('@welldone-software/why-did-you-render');
  whyDidYouRender(React, {
    trackAllPureComponents: true,
    trackHooks: true,
    trackExtraHooks: [[require('zustand'), 'useStore']],
  });
}
```

## 데이터 로딩 최적화

### Suspense와 Lazy

```typescript
import { Suspense, lazy } from 'react';

const ChatView = lazy(() => import('./ChatView'));
const SettingsView = lazy(() => import('./SettingsView'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Switch>
        <Route path="/chat" component={ChatView} />
        <Route path="/settings" component={SettingsView} />
      </Switch>
    </Suspense>
  );
}
```

### 점진적 로딩

```typescript
// ❌ Bad - 모든 메시지 한 번에 로드
const messages = await window.electron.invoke('messages:get-all', {
  conversationId,
});

// ✅ Good - 페이지네이션
const messages = await window.electron.invoke('messages:get-page', {
  conversationId,
  page: 1,
  limit: 50,
});
```

## 성능 측정

### Performance API

```typescript
// 작업 시간 측정
performance.mark('operation-start');

await someExpensiveOperation();

performance.mark('operation-end');
performance.measure('operation-duration', 'operation-start', 'operation-end');

const measure = performance.getEntriesByName('operation-duration')[0];
console.log(`Operation took ${measure.duration}ms`);
```

### React DevTools Profiler

1. React DevTools 설치
2. Profiler 탭 열기
3. 🔴 녹화 시작
4. 앱 사용
5. ⏹️ 녹화 중지
6. Flamegraph 분석

## Best Practices

### 1. 조기 최적화 금지

```typescript
// ✅ 먼저 동작하게 만들고
function App() {
  return <ChatView />;
}

// ✅ 성능 문제가 확인되면 최적화
function App() {
  return (
    <Suspense fallback={<Loading />}>
      <ChatView />
    </Suspense>
  );
}
```

### 2. 측정 후 최적화

```typescript
// 1. 프로파일링
console.time('render');
render();
console.timeEnd('render');

// 2. 병목 지점 파악
// 3. 최적화
// 4. 다시 측정하여 개선 확인
```

### 3. 사용자 경험 우선

```typescript
// ✅ 사용자에게 피드백 제공
<button onClick={handleClick} disabled={loading}>
  {loading ? '처리 중...' : '전송'}
</button>

// ✅ 낙관적 업데이트
function deleteMessage(id: string) {
  // UI에서 즉시 제거
  setMessages((prev) => prev.filter((m) => m.id !== id));

  // 백그라운드에서 실제 삭제
  window.electron.invoke('message:delete', { id })
    .catch((error) => {
      // 실패 시 복구
      setMessages(previousMessages);
    });
}
```

## 성능 체크리스트

**React:**

- [ ] 큰 리스트에 가상 스크롤링 사용
- [ ] 무거운 컴포넌트는 React.memo로 최적화
- [ ] 복잡한 계산은 useMemo로 메모이제이션
- [ ] 콜백 함수는 useCallback으로 안정화
- [ ] Code Splitting으로 초기 로딩 시간 단축

**Electron:**

- [ ] IPC 호출 최소화 및 배치 처리
- [ ] 이벤트 리스너 정리 (메모리 누수 방지)
- [ ] 큰 데이터는 스트리밍으로 전송
- [ ] BrowserWindow 하드웨어 가속 활성화

**번들:**

- [ ] Bundle Analyzer로 큰 패키지 식별
- [ ] Tree Shaking 가능하도록 Named Import
- [ ] 무거운 라이브러리는 Dynamic Import
- [ ] 이미지 최적화 (WebP, lazy loading)

**일반:**

- [ ] Performance API로 주요 작업 측정
- [ ] React DevTools로 렌더링 분석
- [ ] 실제 사용 시나리오에서 테스트
- [ ] 저사양 환경에서도 테스트
