# types/ - TypeScript 타입 정의

> 프로젝트 전역에서 사용되는 TypeScript 타입 정의 모음

## 📋 목차

- [개요](#개요)
- [폴더 구조](#폴더-구조)
- [주요 타입 파일](#주요-타입-파일)
- [타입 정의 가이드](#타입-정의-가이드)
- [타입 임포트 규칙](#타입-임포트-규칙)
- [새 타입 추가 가이드](#새-타입-추가-가이드)
- [주의사항](#주의사항)
- [관련 문서](#관련-문서)

---

## 개요

`types/` 디렉토리는 **전역 타입 정의**를 관리합니다. 여러 모듈에서 공유되는 타입, 인터페이스, Enum 등이 여기에 위치합니다.

### 핵심 특징

- **중앙화된 타입 관리**: 공통 타입을 한 곳에서 관리
- **타입 안전성**: TypeScript strict mode 지원
- **도메인별 분리**: 도메인별로 타입 파일 분리
- **명확한 네이밍**: 타입 이름만으로 역할 파악 가능

---

## 폴더 구조

```
types/
├── index.ts                      # 타입 통합 export
├── chat.ts                       # 채팅 관련 타입
├── llm.ts                        # LLM 관련 타입
├── langgraph.ts                  # LangGraph 관련 타입
├── mcp.ts                        # MCP 관련 타입
├── extension.ts                  # Extension 관련 타입
├── file.ts                       # 파일 시스템 관련 타입
├── config.ts                     # 설정 관련 타입
├── database.ts                   # 데이터베이스 관련 타입
├── ui.ts                         # UI 관련 타입
├── electron.d.ts                 # Electron IPC API 타입 선언
├── global.d.ts                   # 전역 타입 선언
└── utils.ts                      # 유틸리티 타입
```

---

## 주요 타입 파일

### chat.ts

**채팅 관련 타입 정의**

```typescript
// types/chat.ts
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  conversationId: string;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  model?: string;
  tokenCount?: number;
  images?: string[];
  tools?: ToolCall[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  personaId?: string;
  graphType?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  approved?: boolean;
}
```

### llm.ts

**LLM 관련 타입 정의**

```typescript
// types/llm.ts
export type LLMProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'custom';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
}

export interface LLMResponse {
  content: string;
  role: 'assistant';
  model: string;
  tokenUsage?: TokenUsage;
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StreamChunk {
  conversationId: string;
  content: string;
  delta: string;
  done: boolean;
}
```

### langgraph.ts

**LangGraph 관련 타입 정의**

```typescript
// types/langgraph.ts
import type { BaseMessage } from '@langchain/core/messages';

export type GraphType =
  | 'chat'
  | 'agent'
  | 'coding-agent'
  | 'rag'
  | 'deep-thinking'
  | 'sequential-thinking'
  | 'tree-of-thought'
  | 'deep-web-research';

export interface GraphConfig {
  graphType: GraphType;
  llmConfig: LLMConfig;
  ragConfig?: RAGConfig;
  toolConfig?: ToolConfig;
  thinkingConfig?: ThinkingConfig;
}

export interface GraphState {
  messages: BaseMessage[];
  documents?: Document[];
  tools?: Tool[];
  thinking?: ThinkingStep[];
  metadata?: Record<string, unknown>;
}

export interface ThinkingStep {
  id: string;
  type: 'planning' | 'reasoning' | 'reflection';
  content: string;
  timestamp: number;
}

export interface StreamEvent {
  type: 'streaming' | 'node' | 'tool_approval_request' | 'error' | 'done';
  data: unknown;
  conversationId: string;
}
```

### mcp.ts

**MCP 관련 타입 정의**

```typescript
// types/mcp.ts
export interface MCPServer {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  transport: 'stdio' | 'sse';
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
}

export interface MCPToolCall {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}
```

### extension.ts

**Extension 관련 타입 정의**

```typescript
// types/extension.ts
export interface ExtensionManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  icon: string;
  mode: string;
  showInSidebar: boolean;
  dependencies?: string[];
  settingsSchema?: Record<string, unknown>;
  enabled?: boolean;
  order?: number;
  betaFlag?: string;
  processType?: 'renderer' | 'main' | 'both';
  settingsTab?: {
    id: string;
    label: string;
    description: string;
    icon: string;
  };
  agents?: AgentManifest[];
  permissions?: string[];
}

export interface ExtensionDefinition {
  manifest: ExtensionManifest;
  MainComponent?: React.ComponentType;
  SidebarComponent?: React.ComponentType;
  SettingsComponent?: React.ComponentType;
  createStoreSlice?: StoreSliceCreator;
  setupIpcHandlers?: () => void;
  activate?: (context: ExtensionContext) => void | Promise<void>;
  deactivate?: (context: ExtensionContext) => void | Promise<void>;
}

export interface ExtensionContext {
  extensionId: string;
  extensionPath: string;
  globalState: Map<string, unknown>;
  workspaceState: Map<string, unknown>;
}
```

### electron.d.ts

**Electron IPC API 타입 선언**

```typescript
// types/electron.d.ts
interface ElectronAPI {
  // LLM
  llm: {
    streamChat: (messages: Message[], conversationId: string) => Promise<void>;
    chat: (messages: Message[]) => Promise<LLMResponse>;
    validateConfig: (config: LLMConfig) => Promise<boolean>;
  };

  // LangGraph
  langgraph: {
    stream: (config: GraphConfig, messages: Message[], conversationId: string) => Promise<void>;
    abort: (conversationId: string) => Promise<void>;
    respondToolApproval: (conversationId: string, approved: boolean) => Promise<void>;
  };

  // MCP
  mcp: {
    addServer: (server: MCPServer) => Promise<void>;
    removeServer: (serverId: string) => Promise<void>;
    listServers: () => Promise<MCPServer[]>;
    callTool: (call: MCPToolCall) => Promise<MCPToolResult>;
    getAllTools: () => Promise<MCPTool[]>;
  };

  // Chat
  chat: {
    save: (conversation: Conversation) => Promise<void>;
    load: (conversationId: string) => Promise<Conversation>;
    delete: (conversationId: string) => Promise<void>;
    list: () => Promise<Conversation[]>;
  };

  // Extension
  extension: {
    discover: () => Promise<ExtensionManifest[]>;
    install: (extensionPath: string) => Promise<void>;
    uninstall: (extensionId: string) => Promise<void>;
    enable: (extensionId: string) => Promise<void>;
    disable: (extensionId: string) => Promise<void>;
  };

  // IPC 이벤트 리스너
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  off: (channel: string, callback: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
```

### global.d.ts

**전역 타입 선언**

```typescript
// types/global.d.ts
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      NEXT_PUBLIC_APP_VERSION: string;
      PORTABLE_EXECUTABLE_DIR?: string;
    }
  }
}

export {};
```

### utils.ts

**유틸리티 타입**

```typescript
// types/utils.ts
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Awaitable<T> = T | Promise<T>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type NonEmptyArray<T> = [T, ...T[]];

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
```

---

## 타입 정의 가이드

### 1. Interface vs Type Alias

**Interface 사용 (권장)**:

```typescript
// ✅ 확장 가능한 객체 타입
export interface User {
  id: string;
  name: string;
  email: string;
}

// ✅ 확장
export interface AdminUser extends User {
  permissions: string[];
}
```

**Type Alias 사용**:

```typescript
// ✅ Union/Intersection
export type Status = 'pending' | 'approved' | 'rejected';

// ✅ Utility Types
export type PartialUser = Partial<User>;

// ✅ Mapped Types
export type UserKeys = keyof User;
```

### 2. 네이밍 규칙

**Interface/Type**:

```typescript
// ✅ PascalCase
export interface MessageMetadata {}
export type LLMProvider = 'openai' | 'anthropic';
```

**Enum**:

```typescript
// ✅ PascalCase (Enum), SCREAMING_SNAKE_CASE (값)
export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}
```

**Generic**:

```typescript
// ✅ 단일 대문자 (T, K, V) 또는 의미 있는 이름
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

export type ApiResponse<TData> = {
  data: TData;
  status: number;
};
```

### 3. Optional vs Nullable

```typescript
// ✅ Optional (있을 수도, 없을 수도)
export interface Config {
  apiKey?: string; // string | undefined
}

// ✅ Nullable (명시적으로 null 허용)
export interface User {
  avatarUrl: string | null; // null이 의미가 있음 (아바타 없음)
}
```

### 4. 타입 좁히기 (Type Guard)

```typescript
// types/guards.ts
export function isMessage(value: unknown): value is Message {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'role' in value &&
    'content' in value
  );
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}
```

---

## 타입 임포트 규칙

### 1. 명시적 타입 임포트 (권장)

```typescript
// ✅ type 키워드 사용
import type { Message, Conversation } from '@/types/chat';
import type { LLMConfig } from '@/types/llm';

// 값과 타입 혼용 시
import { isMessage } from '@/types/guards';
import type { Message } from '@/types/chat';
```

### 2. index.ts를 통한 통합 임포트

```typescript
// types/index.ts
export * from './chat';
export * from './llm';
export * from './langgraph';
export * from './mcp';
export * from './extension';

// 사용
import type { Message, LLMConfig, GraphConfig } from '@/types';
```

### 3. 순환 참조 방지

```typescript
// ❌ 순환 참조
// types/chat.ts
import type { User } from './user';

// types/user.ts
import type { Message } from './chat';

// ✅ 해결: 공통 타입을 별도 파일로 분리
// types/common.ts
export interface BaseEntity {
  id: string;
  createdAt: number;
}

// types/chat.ts
import type { BaseEntity } from './common';
export interface Message extends BaseEntity {}

// types/user.ts
import type { BaseEntity } from './common';
export interface User extends BaseEntity {}
```

---

## 새 타입 추가 가이드

### 1. 타입 파일 생성

```bash
# 예시: 새 도메인 타입 추가
touch types/analytics.ts
```

### 2. 타입 정의

```typescript
// types/analytics.ts
export interface AnalyticsEvent {
  id: string;
  name: string;
  timestamp: number;
  properties: Record<string, unknown>;
}

export interface AnalyticsConfig {
  enabled: boolean;
  trackingId: string;
  sampleRate: number;
}

export type AnalyticsEventType = 'page_view' | 'button_click' | 'api_call';
```

### 3. index.ts에 추가

```typescript
// types/index.ts
export * from './analytics'; // 추가
```

### 4. 사용

```typescript
// components/Analytics.tsx
import type { AnalyticsEvent, AnalyticsConfig } from '@/types/analytics';

export function Analytics({ config }: { config: AnalyticsConfig }) {
  const trackEvent = (event: AnalyticsEvent) => {
    // ...
  };

  return <div>{/* ... */}</div>;
}
```

---

## 주의사항

### ❌ 하지 말아야 할 것

1. **any 타입 사용 금지**

   ```typescript
   // ❌ any 사용
   export interface Data {
     value: any;
   }

   // ✅ unknown 또는 구체적인 타입 사용
   export interface Data {
     value: unknown; // 또는 string | number | boolean
   }
   ```

2. **비명시적 타입 export 금지**

   ```typescript
   // ❌ export 없이 정의
   interface Message {
     id: string;
   }

   // ✅ 명시적 export
   export interface Message {
     id: string;
   }
   ```

3. **타입과 값 혼용 금지**

   ```typescript
   // ❌ 타입과 값 동시 정의
   export const MessageRole = {
     USER: 'user',
     ASSISTANT: 'assistant',
   };
   export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

   // ✅ Enum 사용 또는 분리
   export enum MessageRole {
     USER = 'user',
     ASSISTANT = 'assistant',
   }
   ```

4. **index signature 남용 금지**
   ```typescript
   // ❌ 너무 포괄적
   export interface Config {
     [key: string]: unknown;
   }
   // ✅ 명시적 키 정의
   export interface Config {
     apiKey: string;
     model: string;
     temperature?: number;
   }
   ```

### ✅ 반드시 해야 할 것

1. **타입 문서화**

   ```typescript
   /**
    * LLM 채팅 메시지
    *
    * @property id - 메시지 고유 ID (UUID)
    * @property role - 메시지 발신자 역할
    * @property content - 메시지 내용
    * @property timestamp - 메시지 생성 시각 (Unix timestamp)
    */
   export interface Message {
     id: string;
     role: 'user' | 'assistant' | 'system';
     content: string;
     timestamp: number;
   }
   ```

2. **타입 검증 함수 제공**

   ```typescript
   // types/chat.ts
   export interface Message {
     id: string;
     role: 'user' | 'assistant' | 'system';
     content: string;
   }

   export function isMessage(value: unknown): value is Message {
     return (
       typeof value === 'object' &&
       value !== null &&
       'id' in value &&
       'role' in value &&
       'content' in value &&
       typeof (value as Message).id === 'string' &&
       ['user', 'assistant', 'system'].includes((value as Message).role) &&
       typeof (value as Message).content === 'string'
     );
   }
   ```

3. **TypeScript strict mode 준수**
   - `strict: true` 설정 유지
   - `noImplicitAny`, `strictNullChecks` 준수

4. **타입 버전 관리**
   - Breaking Changes 발생 시 마이그레이션 가이드 제공
   - 타입 변경 시 관련 코드 모두 업데이트

---

## 관련 문서

- [docs/architecture/naming-conventions.md](../docs/architecture/naming-conventions.md) - 명명 규칙
- [lib/README.md](../lib/README.md) - 비즈니스 로직 라이브러리 가이드
- [CLAUDE.md](../CLAUDE.md) - 프로젝트 전체 가이드
- [TypeScript 공식 문서](https://www.typescriptlang.org/docs/)

---

## 요약

`types/` 디렉토리 핵심 원칙:

1. **중앙화**: 공통 타입은 한 곳에서 관리
2. **명시성**: `type` 키워드로 타입 임포트
3. **타입 안전성**: `any` 금지, `unknown` 사용
4. **문서화**: JSDoc으로 타입 설명 추가
5. **검증**: Type Guard 함수 제공

새 타입 추가 시 이 가이드를 참고하여 일관성을 유지하세요.
