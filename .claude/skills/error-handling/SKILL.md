---
name: Error Handling & Logging
description: >
  SEPilot Desktop의 에러 처리 및 로깅 패턴. 예외 처리, 에러 보고, 로깅,
  사용자 피드백 패턴을 다룹니다. Frontend/Backend 에러 처리, IPC 에러 전파,
  로그 관리를 전문으로 합니다.
---

# Error Handling & Logging Skill

## 에러 처리 철학

SEPilot Desktop의 에러 처리 원칙:

1. **Fail Fast**: 문제를 빨리 발견하고 명확하게 보고
2. **Graceful Degradation**: 에러 발생 시 앱이 계속 동작
3. **사용자 친화적**: 기술적 에러를 사용자가 이해할 수 있게 변환
4. **로깅**: 디버깅을 위한 충분한 컨텍스트 기록

## Logger 시스템

### Logger 구조

```
lib/utils/logger.ts         # 공통 로거
electron/services/logger.ts  # Electron main 로거
```

### Logger 사용

```typescript
import { logger } from '@/lib/utils/logger';

// 레벨별 로깅
logger.info('Application started');
logger.debug('Debug info', { userId: '123' });
logger.warn('Potential issue', { details: 'xyz' });
logger.error('Error occurred', error);

// 구조화된 로그
logger.info('User action', {
  action: 'send-message',
  conversationId: 'conv-123',
  timestamp: Date.now(),
});
```

### Log Levels

```typescript
enum LogLevel {
  ERROR = 0, // 앱 실행에 영향을 주는 에러
  WARN = 1, // 잠재적 문제
  INFO = 2, // 중요한 이벤트
  DEBUG = 3, // 상세한 디버그 정보
}

// 환경별 설정
const LOG_LEVEL = process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.DEBUG;
```

## Frontend 에러 처리

### Error Boundary

```typescript
// components/ErrorBoundary.tsx
import { Component, ReactNode } from 'react';
import { logger } from '@/lib/utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error('React Error Boundary caught error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    // 에러 리포팅 서비스로 전송
    this.reportError(error, errorInfo);
  }

  private reportError(error: Error, errorInfo: React.ErrorInfo): void {
    window.electron?.invoke('error:report', {
      type: 'react-error',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-fallback">
          <h2>문제가 발생했습니다</h2>
          <p>페이지를 새로고침해주세요</p>
          <button onClick={() => window.location.reload()}>
            새로고침
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// 사용
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

### Async 에러 처리

```typescript
// lib/hooks/useAsyncError.ts
import { useState, useCallback } from 'react';
import { logger } from '@/lib/utils/logger';

export function useAsyncError() {
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = useCallback(
    async <T,>(
      asyncFn: () => Promise<T>,
      options?: {
        onError?: (error: Error) => void;
        silent?: boolean;
      }
    ): Promise<T | null> => {
      setLoading(true);
      setError(null);

      try {
        const result = await asyncFn();
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        setError(error);
        logger.error('Async operation failed', error);

        if (options?.onError) {
          options.onError(error);
        }

        if (!options?.silent) {
          // Show error toast
          window.electron?.invoke('notification:show', {
            type: 'error',
            message: error.message,
          });
        }

        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { execute, error, loading };
}

// 사용
function MyComponent() {
  const { execute, error, loading } = useAsyncError();

  const handleSubmit = async () => {
    const result = await execute(
      async () => {
        return await window.electron.invoke('chat:send', { message: 'Hello' });
      },
      {
        onError: (error) => {
          console.error('Failed to send message', error);
        },
      }
    );

    if (result) {
      console.log('Success!', result);
    }
  };

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return <button onClick={handleSubmit} disabled={loading}>전송</button>;
}
```

### IPC 에러 처리

```typescript
// lib/utils/ipc-error-handler.ts
export async function safeInvoke<T>(channel: string, data?: unknown): Promise<T | null> {
  try {
    const result = await window.electron.invoke(channel, data);

    if (result && typeof result === 'object' && 'success' in result) {
      if (result.success) {
        return result.data as T;
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    }

    return result as T;
  } catch (error) {
    logger.error(`IPC call failed: ${channel}`, error);
    throw error;
  }
}

// 사용
const messages = await safeInvoke<Message[]>('chat:get-messages', {
  conversationId: 'conv-123',
});
```

## Backend 에러 처리

### 커스텀 에러 클래스

```typescript
// lib/utils/error-handler.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404, { resource, id });
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

// 사용
throw new ValidationError('Invalid conversation ID', {
  conversationId: id,
  expected: 'uuid',
  received: typeof id,
});
```

### IPC Handler 에러 처리

```typescript
// electron/ipc/handlers/chat.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { AppError, NotFoundError } from '@/lib/utils/error-handler';
import { logger } from '@/electron/services/logger';

export function setupChatHandlers() {
  ipcMain.handle(
    'chat:send',
    async (event: IpcMainInvokeEvent, data: { conversationId: string; message: string }) => {
      try {
        // Validation
        if (!data.conversationId) {
          throw new ValidationError('Conversation ID is required');
        }

        if (!data.message?.trim()) {
          throw new ValidationError('Message cannot be empty');
        }

        // Business logic
        const result = await sendMessage(data);

        return { success: true, data: result };
      } catch (error) {
        logger.error('chat:send handler failed', {
          error: error instanceof Error ? error.message : 'Unknown',
          conversationId: data.conversationId,
        });

        // 에러 타입별 처리
        if (error instanceof AppError) {
          return {
            success: false,
            error: error.message,
            code: error.code,
            details: error.details,
          };
        }

        // 예상치 못한 에러
        return {
          success: false,
          error: '알 수 없는 오류가 발생했습니다',
          code: 'UNKNOWN_ERROR',
        };
      }
    }
  );
}
```

### 전역 에러 핸들러

```typescript
// electron/main.ts
import { app } from 'electron';
import { logger } from './services/logger';

// Unhandled Promise Rejection
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: String(reason),
    promise: String(promise),
  });
});

// Uncaught Exception
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });

  // Optionally restart app
  app.relaunch();
  app.exit(1);
});

// Electron 에러
app.on('render-process-gone', (event, webContents, details) => {
  logger.error('Render process gone', {
    reason: details.reason,
    exitCode: details.exitCode,
  });
});
```

## 에러 리포팅

### 에러 리포트 수집

```typescript
// electron/services/error-reporting.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

interface ErrorReport {
  timestamp: number;
  type: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export class ErrorReportingService {
  private reportsDir: string;

  constructor() {
    this.reportsDir = path.join(app.getPath('userData'), 'error-reports');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.reportsDir, { recursive: true });
  }

  async saveReport(report: ErrorReport): Promise<void> {
    const filename = `error-${Date.now()}.json`;
    const filepath = path.join(this.reportsDir, filename);

    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
  }

  async getReports(): Promise<ErrorReport[]> {
    const files = await fs.readdir(this.reportsDir);
    const reports: ErrorReport[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(this.reportsDir, file), 'utf-8');
        reports.push(JSON.parse(content));
      }
    }

    return reports.sort((a, b) => b.timestamp - a.timestamp);
  }

  async clearOldReports(daysToKeep: number = 7): Promise<void> {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const files = await fs.readdir(this.reportsDir);

    for (const file of files) {
      const filepath = path.join(this.reportsDir, file);
      const stats = await fs.stat(filepath);

      if (stats.mtimeMs < cutoff) {
        await fs.unlink(filepath);
      }
    }
  }
}
```

## 사용자 피드백

### Toast 알림

```typescript
// components/Toast.tsx
import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

export function Toast({ message, type, duration = 3000 }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  return (
    <div className={`toast toast-${type}`}>
      {message}
    </div>
  );
}

// 사용
function showErrorToast(message: string) {
  window.electron.invoke('notification:show', {
    type: 'error',
    message,
  });
}
```

### 에러 페이지

```typescript
// app/error.tsx (Next.js Error Page)
'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/utils/logger';

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Next.js Error Page', error);
  }, [error]);

  return (
    <div className="error-page">
      <h2>문제가 발생했습니다</h2>
      <p>{error.message}</p>
      <button onClick={reset}>다시 시도</button>
    </div>
  );
}
```

## Best Practices

### 1. 구체적인 에러 메시지

```typescript
// ❌ Bad
throw new Error('Error');

// ✅ Good
throw new ValidationError('Conversation ID must be a valid UUID', {
  conversationId: id,
  expected: 'uuid v4',
  received: typeof id,
});
```

### 2. 에러 컨텍스트 제공

```typescript
// ❌ Bad
logger.error('Failed');

// ✅ Good
logger.error('Failed to send message', {
  conversationId,
  userId,
  messageLength: message.length,
  timestamp: Date.now(),
});
```

### 3. 사용자 친화적 메시지

```typescript
function getUserFriendlyError(error: Error): string {
  if (error instanceof NetworkError) {
    return '네트워크 연결을 확인해주세요';
  }
  if (error instanceof QuotaError) {
    return 'API 사용량이 초과되었습니다';
  }
  return '일시적인 오류가 발생했습니다. 다시 시도해주세요';
}
```

### 4. 에러 복구 시도

```typescript
async function sendMessageWithRetry(message: string, maxRetries: number = 3): Promise<void> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await sendMessage(message);
      return; // Success
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Retry ${i + 1}/${maxRetries}`, error);
      await delay(1000 * (i + 1)); // Exponential backoff
    }
  }

  throw lastError!;
}
```

## 실제 예제

기존 구현 참고:

- `lib/utils/logger.ts` - Logger 구현
- `lib/utils/error-handler.ts` - 에러 핸들러
- `electron/services/error-reporting.ts` - 에러 리포팅
- `components/ErrorBoundary.tsx` - React Error Boundary (예정)
