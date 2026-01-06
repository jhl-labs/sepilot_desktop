# Logging & Monitoring Skill

SEPilot Desktop의 로깅, 디버깅, 모니터링 패턴 가이드

## Logger 유틸리티

### 기본 Logger (lib/utils/logger.ts)

```typescript
const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  /**
   * Debug level - 개발 환경에서만 출력
   */
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Info level - 모든 환경에서 출력
   */
  info: (...args: unknown[]) => {
    console.log('[INFO]', ...args);
  },

  /**
   * Warning level - 모든 환경에서 출력
   */
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args);
  },

  /**
   * Error level - 모든 환경에서 출력
   */
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },
};
```

**특징:**

- ESLint의 `no-console` 규칙을 우회하여 중앙화된 로깅
- 개발 환경에서만 `debug` 로그 출력
- TypeScript strict mode 준수 (`unknown[]` 타입)

### 사용 예시

```typescript
import { logger } from '@/lib/utils/logger';

// 개발 환경에서만 출력
logger.debug('Debugging info:', { userId: 123, data: {...} });

// 모든 환경에서 출력
logger.info('Server started on port 3000');
logger.warn('API rate limit approaching:', { remaining: 5 });
logger.error('Failed to connect to database:', error);
```

## Frontend 로깅

### React 컴포넌트에서 로깅

```typescript
'use client';

import { logger } from '@/lib/utils/logger';
import { useEffect } from 'react';

export function MyComponent() {
  useEffect(() => {
    logger.debug('Component mounted');

    return () => {
      logger.debug('Component unmounted');
    };
  }, []);

  const handleClick = () => {
    try {
      logger.info('Button clicked');
      // 작업 수행
    } catch (error) {
      logger.error('Button click failed:', error);
    }
  };

  return <button onClick={handleClick}>Click me</button>;
}
```

### IPC 호출 로깅

```typescript
import { logger } from '@/lib/utils/logger';

async function fetchData() {
  try {
    logger.debug('IPC: Calling conversation:list');

    const result = await window.electron.invoke('conversation:list');

    if (!result.success) {
      logger.error('IPC: conversation:list failed:', result.error);
      return null;
    }

    logger.info('IPC: conversation:list succeeded, count:', result.data.length);
    return result.data;
  } catch (error) {
    logger.error('IPC: conversation:list threw exception:', error);
    return null;
  }
}
```

## Backend 로깅

### Electron Main Process 로깅

```typescript
import { logger } from '@/lib/utils/logger';
import { ipcMain } from 'electron';

// IPC 핸들러 로깅
ipcMain.handle('conversation:create', async (event, args) => {
  logger.info('[IPC] conversation:create called with:', args);

  try {
    const result = await createConversation(args);
    logger.info('[IPC] conversation:create success:', result.id);
    return { success: true, data: result };
  } catch (error) {
    logger.error('[IPC] conversation:create failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});
```

### File System 작업 로깅

```typescript
import { logger } from '@/lib/utils/logger';
import fs from 'fs/promises';
import path from 'path';

async function saveFile(filePath: string, content: string) {
  try {
    logger.debug('Saving file:', filePath);

    // Path Traversal 방지
    const safePath = path.resolve(filePath);
    logger.debug('Resolved path:', safePath);

    await fs.writeFile(safePath, content, 'utf-8');
    logger.info('File saved successfully:', filePath);

    return { success: true };
  } catch (error) {
    logger.error('File save failed:', filePath, error);
    return { success: false, error: error.message };
  }
}
```

## Agent 로깅

### LangGraph Agent 로깅

```typescript
import { logger } from '@/lib/utils/logger';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';

export class MyAgent {
  async *stream(initialState: AgentState) {
    logger.info('[Agent] Starting stream, conversationId:', initialState.conversationId);

    let iterations = 0;
    while (iterations < this.maxIterations) {
      logger.debug('[Agent] Iteration:', iterations);

      // Generate
      const generateResult = await this.generateNode(state);
      logger.debug('[Agent] Generated message length:', generateResult.messages.length);

      // Tool execution
      if (this.shouldUseTool(state) === 'continue') {
        logger.info('[Agent] Executing tools, count:', toolCalls.length);
        const toolsResult = await this.toolsNode(state);
        logger.debug('[Agent] Tool results:', toolsResult.toolResults);
      }

      iterations++;
    }

    logger.info('[Agent] Stream completed, total iterations:', iterations);
  }
}
```

### Tool 실행 로깅

```typescript
import { logger } from '@/lib/utils/logger';

async function executeTool(toolCall: ToolCall) {
  logger.info('[Tool] Executing:', toolCall.name, 'with args:', toolCall.args);

  try {
    const result = await tools[toolCall.name].execute(toolCall.args);
    logger.info('[Tool] Success:', toolCall.name, 'result length:', result.length);
    return result;
  } catch (error) {
    logger.error('[Tool] Failed:', toolCall.name, error);
    return `Error: ${error.message}`;
  }
}
```

## 환경별 로깅 설정

### 개발 환경 (Development)

```typescript
// .env.local
NODE_ENV = development;
DEBUG = true;
```

**특징:**

- `logger.debug()` 활성화
- 상세한 로그 출력
- 스택 트레이스 전체 출력

### 프로덕션 환경 (Production)

```typescript
// .env.production
NODE_ENV = production;
DEBUG = false;
```

**특징:**

- `logger.debug()` 비활성화
- `info`, `warn`, `error`만 출력
- 민감한 정보 필터링

### 환경 감지

```typescript
const isDev = process.env.NODE_ENV === 'development';
const isDebug = process.env.DEBUG === 'true';

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev || isDebug) {
      console.log('[DEBUG]', ...args);
    }
  },
};
```

## 구조화된 로깅

### 로그 포맷

```typescript
interface LogContext {
  module: string;
  action: string;
  userId?: string;
  conversationId?: string;
  timestamp?: string;
}

function logWithContext(level: string, message: string, context: LogContext) {
  const timestamp = new Date().toISOString();
  const formattedLog = {
    timestamp,
    level,
    message,
    ...context,
  };

  console.log(JSON.stringify(formattedLog));
}

// 사용
logWithContext('INFO', 'User action', {
  module: 'chat',
  action: 'send_message',
  userId: '123',
  conversationId: 'conv-456',
});
```

### 모듈별 Logger

```typescript
// lib/utils/logger.ts
export function createModuleLogger(moduleName: string) {
  return {
    debug: (...args: unknown[]) => logger.debug(`[${moduleName}]`, ...args),
    info: (...args: unknown[]) => logger.info(`[${moduleName}]`, ...args),
    warn: (...args: unknown[]) => logger.warn(`[${moduleName}]`, ...args),
    error: (...args: unknown[]) => logger.error(`[${moduleName}]`, ...args),
  };
}

// 사용
const chatLogger = createModuleLogger('Chat');
chatLogger.info('Message sent'); // [INFO] [Chat] Message sent
```

## 에러 로깅

### 스택 트레이스 포함

```typescript
try {
  await riskyOperation();
} catch (error) {
  if (error instanceof Error) {
    logger.error('Operation failed:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
  } else {
    logger.error('Operation failed with unknown error:', error);
  }
}
```

### Custom Error 클래스

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    logger.error('AppError thrown:', {
      code,
      message,
      statusCode,
      context,
      stack: this.stack,
    });
  }
}

// 사용
throw new AppError('Database connection failed', 'DB_CONNECTION_ERROR', 500, {
  host: 'localhost',
  port: 5432,
});
```

## 파일 로깅 (선택 사항)

### electron-log 통합

```typescript
import log from 'electron-log';
import { app } from 'electron';
import path from 'path';

// 로그 파일 경로 설정
log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'main.log');

// 로그 레벨 설정
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// 사용
log.info('Application started');
log.error('Error occurred:', error);
```

**로그 파일 위치:**

- **macOS**: `~/Library/Application Support/SEPilot Desktop/logs/main.log`
- **Windows**: `%APPDATA%\SEPilot Desktop\logs\main.log`
- **Linux**: `~/.config/SEPilot Desktop/logs/main.log`

## 성능 모니터링

### 실행 시간 측정

```typescript
import { logger } from '@/lib/utils/logger';

async function performanceWrapper<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const startTime = performance.now();
  logger.debug(`[Perf] ${label} started`);

  try {
    const result = await fn();
    const duration = performance.now() - startTime;
    logger.info(`[Perf] ${label} completed in ${duration.toFixed(2)}ms`);
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[Perf] ${label} failed after ${duration.toFixed(2)}ms`, error);
    throw error;
  }
}

// 사용
const conversations = await performanceWrapper(() => fetchConversations(), 'fetchConversations');
```

### React Profiler

```typescript
'use client';

import { Profiler, ProfilerOnRenderCallback } from 'react';
import { logger } from '@/lib/utils/logger';

const onRenderCallback: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) => {
  logger.debug('[Profiler]', {
    id,
    phase,
    actualDuration: `${actualDuration.toFixed(2)}ms`,
    baseDuration: `${baseDuration.toFixed(2)}ms`,
  });
};

export function ProfiledComponent() {
  return (
    <Profiler id="MyComponent" onRender={onRenderCallback}>
      <MyComponent />
    </Profiler>
  );
}
```

## 디버깅 도구

### Electron DevTools

```typescript
// electron/main.ts
import { app, BrowserWindow } from 'electron';

function createWindow() {
  const mainWindow = new BrowserWindow({
    webPreferences: {
      devTools: true, // DevTools 활성화
    },
  });

  // 개발 환경에서 자동으로 DevTools 열기
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}
```

### IPC 디버깅

```typescript
import { ipcMain } from 'electron';
import { logger } from '@/lib/utils/logger';

// 모든 IPC 채널 로깅
ipcMain.on('*', (event, ...args) => {
  logger.debug('[IPC] Event received:', event, args);
});

// 특정 채널 디버깅
ipcMain.handle('conversation:create', async (event, args) => {
  logger.debug('[IPC] conversation:create', {
    webContentsId: event.sender.id,
    args: JSON.stringify(args, null, 2),
  });

  // 핸들러 로직...
});
```

### 네트워크 요청 로깅

```typescript
import { logger } from '@/lib/utils/logger';

async function fetchWithLogging(url: string, options?: RequestInit) {
  logger.debug('[HTTP] Request:', { url, method: options?.method || 'GET' });

  try {
    const response = await fetch(url, options);
    logger.debug('[HTTP] Response:', {
      url,
      status: response.status,
      statusText: response.statusText,
    });
    return response;
  } catch (error) {
    logger.error('[HTTP] Request failed:', { url, error });
    throw error;
  }
}
```

## 민감한 정보 필터링

### 비밀번호, API 키 필터링

```typescript
function sanitizeLog(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const sensitiveKeys = ['password', 'apiKey', 'token', 'secret'];
  const sanitized = { ...data };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeLog(sanitized[key]);
    }
  }

  return sanitized;
}

// 사용
logger.info('User data:', sanitizeLog(userData));
// 출력: { username: 'john', password: '***REDACTED***' }
```

### 프로덕션 환경에서 자동 필터링

```typescript
export const logger = {
  info: (...args: unknown[]) => {
    const sanitizedArgs = process.env.NODE_ENV === 'production' ? args.map(sanitizeLog) : args;
    console.log('[INFO]', ...sanitizedArgs);
  },
};
```

## 테스트에서 로깅

### Jest에서 Logger Mock

```typescript
// tests/setup.ts
jest.mock('@/lib/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
```

### 로그 검증

```typescript
import { logger } from '@/lib/utils/logger';

test('should log error on failure', async () => {
  await functionThatFails();

  expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed'), expect.any(Error));
});
```

## 체크리스트

- [ ] 모든 로그는 `logger` 유틸리티 사용 (직접 `console.log` 금지)
- [ ] 개발 환경: `logger.debug()` 사용
- [ ] 프로덕션 환경: `logger.info/warn/error()` 사용
- [ ] IPC 호출마다 로깅 (요청, 응답, 에러)
- [ ] Agent 실행 시작/종료 로깅
- [ ] Tool 실행 로깅 (이름, 인자, 결과)
- [ ] 에러 발생 시 스택 트레이스 포함
- [ ] 민감한 정보 (API 키, 비밀번호) 필터링
- [ ] 성능 측정 필요 시 `performance.now()` 사용
- [ ] 테스트에서 `logger` Mock 사용

## 참고

- **프로젝트 Logger**: `lib/utils/logger.ts`
- **Electron Main Logger**: `electron/services/logger.ts`
- **electron-log 문서**: https://github.com/megahertz/electron-log
- **React Profiler**: https://react.dev/reference/react/Profiler
