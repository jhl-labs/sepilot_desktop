# @sepilot/extension-sdk

SEPilot Desktop Extension 개발을 위한 핵심 SDK입니다.

## 설치

```bash
pnpm add @sepilot/extension-sdk
```

## 주요 기능

### 1. UI 컴포넌트

shadcn/ui 기반의 완전한 UI 컴포넌트 라이브러리:

```typescript
import { Button, Card, Input, Dialog } from '@sepilot/extension-sdk/ui';

function MyExtension() {
  return (
    <Card>
      <Button>Click me</Button>
    </Card>
  );
}
```

### 2. 타입 정의

Extension 개발에 필요한 모든 타입:

```typescript
import type {
  ExtensionManifest,
  ExtensionDefinition,
  ExtensionRuntimeContext,
} from '@sepilot/extension-sdk/types';

export const manifest: ExtensionManifest = {
  id: 'my-extension',
  name: 'My Extension',
  description: 'My awesome extension',
  version: '1.0.0',
  author: 'Your Name',
  icon: 'Sparkles',
  mode: 'my-mode',
  showInSidebar: true,
};
```

### 3. IPC 통신

Electron IPC를 위한 타입 안전한 브리지:

```typescript
import { createIPCBridge } from '@sepilot/extension-sdk/ipc';

const ipc = createIPCBridge();

// IPC 호출
const result = await ipc.invoke('my-channel', { data: 'hello' });

// IPC 이벤트 구독
const unsubscribe = ipc.on('my-event', (data) => {
  console.log('Received:', data);
});
```

### 4. Runtime Context

Store slice 생성 시 주입되는 런타임 컨텍스트:

```typescript
import type { ExtensionRuntimeContext, StoreSliceCreator } from '@sepilot/extension-sdk';

export const createMySlice: StoreSliceCreator = (set, get, context) => ({
  // context.ipc - IPC 통신
  // context.logger - 로거
  // context.platform - 플랫폼 유틸리티
  // context.llm - LLM Provider (옵션)

  myAction: async () => {
    const result = await context.ipc.invoke('my-handler', { foo: 'bar' });
    context.logger.info('Action completed', { result });
  },
});
```

### 5. 유틸리티

플랫폼 감지, 로깅, ID 생성 등:

```typescript
import {
  logger,
  createLogger,
  isElectron,
  platform,
  generateId,
  cn,
} from '@sepilot/extension-sdk/utils';

// 로깅
logger.info('Hello from extension');

// Extension 전용 로거
const myLogger = createLogger('my-extension');
myLogger.debug('Debug message');

// 플랫폼 감지
if (platform.isElectron()) {
  console.log('Running in Electron');
}

// ID 생성
const id = generateId('my-prefix');

// Tailwind 클래스 병합
const className = cn('bg-red-500', 'text-white');
```

## Extension 구조 예시

```typescript
// manifest.ts
import type { ExtensionManifest } from '@sepilot/extension-sdk';

export const manifest: ExtensionManifest = {
  id: 'my-extension',
  name: 'My Extension',
  description: 'My awesome extension',
  version: '1.0.0',
  author: 'Your Name',
  icon: 'Sparkles',
  mode: 'my-mode',
  showInSidebar: true,
};

// store.ts
import type { StoreSliceCreator } from '@sepilot/extension-sdk';

export const createMySlice: StoreSliceCreator = (set, get, context) => ({
  data: null,
  loading: false,

  fetchData: async () => {
    set({ loading: true });
    const result = await context.ipc.invoke('my-extension:fetch-data');
    if (result.success) {
      set({ data: result.data, loading: false });
    }
  },
});

// components/MainPanel.tsx
import { Button, Card } from '@sepilot/extension-sdk/ui';

export function MainPanel() {
  return (
    <Card>
      <h1>My Extension</h1>
      <Button>Click me</Button>
    </Card>
  );
}

// index.ts
import type { ExtensionDefinition } from '@sepilot/extension-sdk';
import { manifest } from './manifest';
import { createMySlice } from './store';
import { MainPanel } from './components/MainPanel';

export default {
  manifest,
  createStoreSlice: createMySlice,
  MainComponent: MainPanel,
} as ExtensionDefinition;
```

## API 문서

### ExtensionRuntimeContext

Store slice에 주입되는 런타임 컨텍스트:

```typescript
interface ExtensionRuntimeContext {
  // IPC 통신
  ipc: IPCBridge;

  // 로거
  logger: Logger;

  // 플랫폼 유틸리티
  platform: {
    isElectron: () => boolean;
    isMac: () => boolean;
    isWindows: () => boolean;
    isLinux: () => boolean;
  };

  // LLM Provider (옵션)
  llm?: LLMProvider;

  // Agent Factory (옵션)
  agent?: AgentFactory;
}
```

### IPCBridge

```typescript
interface IPCBridge {
  // IPC 호출
  invoke<T>(
    channel: string,
    data?: any
  ): Promise<{
    success: boolean;
    data?: T;
    error?: string;
  }>;

  // 이벤트 구독
  on(channel: string, handler: (data: any) => void): () => void;

  // 이벤트 발행
  send(channel: string, data?: any): void;
}
```

## 라이선스

MIT
