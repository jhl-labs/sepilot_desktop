---
name: Testing Patterns
description: >
  SEPilot Desktop의 테스트 패턴 및 모범 사례. Jest, React Testing Library,
  Playwright를 사용한 Unit, Integration, E2E 테스트 작성 시 사용합니다.
  프론트엔드/백엔드 테스트, Mock 패턴, 테스트 커버리지 관리를 전문으로 합니다.
---

# Testing Patterns Skill

## 테스트 구조

SEPilot Desktop은 3계층 테스트 전략을 사용합니다:

```
tests/
├── frontend/           # React 컴포넌트 및 hooks
├── backend/            # Electron main process
├── lib/                # 공유 라이브러리
└── e2e_tests/          # End-to-end (Playwright)
```

## Jest 설정

### 프로젝트 구분

```javascript
// jest.config.js
module.exports = {
  projects: [
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/frontend/**/*.test.{ts,tsx}'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    },
    {
      displayName: 'backend',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/backend/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.backend.ts'],
    },
  ],
};
```

### 실행 명령어

```bash
# 전체 테스트
pnpm run test

# Frontend만
pnpm run test:frontend

# Backend만
pnpm run test:backend

# Watch 모드
pnpm run test:watch:frontend

# 커버리지
pnpm run test:coverage
```

## Frontend 테스트 (React)

### 컴포넌트 테스트

```typescript
// tests/frontend/components/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('should render with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click</Button>);

    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByText('Disabled')).toBeDisabled();
  });
});
```

### Hooks 테스트

```typescript
// tests/frontend/hooks/useChat.test.tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '@/lib/hooks/useChat';

// Mock IPC
const mockInvoke = jest.fn();
window.electron = {
  invoke: mockInvoke,
  on: jest.fn(),
  off: jest.fn(),
};

describe('useChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send message successfully', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useChat('conv-1'));

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    expect(mockInvoke).toHaveBeenCalledWith('chat:send', {
      conversationId: 'conv-1',
      message: 'Hello',
    });
  });

  it('should handle streaming messages', async () => {
    const { result } = renderHook(() => useChat('conv-1'));

    // Simulate streaming event
    const onCallback = window.electron.on.mock.calls.find(
      ([event]) => event === 'chat:stream'
    )?.[1];

    act(() => {
      onCallback?.({ chunk: 'Hello ' });
      onCallback?.({ chunk: 'World' });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).toBe('Hello World');
    });
  });
});
```

### IPC Mock 패턴

```typescript
// tests/__mocks__/electron.ts
export const mockElectron = {
  invoke: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  send: jest.fn(),
};

// tests/setup.ts
global.window.electron = mockElectron;

// 테스트에서 사용
beforeEach(() => {
  mockElectron.invoke.mockReset();
  mockElectron.on.mockReset();
  mockElectron.off.mockReset();
});
```

## Backend 테스트 (Electron)

### IPC Handler 테스트

```typescript
// tests/backend/ipc/chat.test.ts
import { ipcMain } from 'electron';
import { setupChatHandlers } from '@/electron/ipc/handlers/chat';

// Mock ipcMain
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
  },
}));

describe('Chat IPC Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupChatHandlers();
  });

  it('should register chat:send handler', () => {
    expect(ipcMain.handle).toHaveBeenCalledWith('chat:send', expect.any(Function));
  });

  it('should handle chat:send request', async () => {
    const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
      ([event]) => event === 'chat:send'
    )?.[1];

    const mockEvent = { sender: { send: jest.fn() } };
    const result = await handler(mockEvent, {
      conversationId: 'conv-1',
      message: 'Hello',
    });

    expect(result.success).toBe(true);
  });
});
```

### Service 테스트

```typescript
// tests/lib/llm/client.test.ts
import { LLMClient } from '@/lib/llm/client';

describe('LLMClient', () => {
  let client: LLMClient;

  beforeEach(() => {
    client = new LLMClient({
      provider: 'anthropic',
      apiKey: 'test-key',
    });
  });

  it('should generate completion', async () => {
    const result = await client.generateCompletion({
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'claude-3-5-sonnet',
    });

    expect(result).toHaveProperty('content');
    expect(typeof result.content).toBe('string');
  });

  it('should handle errors gracefully', async () => {
    await expect(
      client.generateCompletion({
        messages: [],
        model: 'invalid-model',
      })
    ).rejects.toThrow();
  });
});
```

## E2E 테스트 (Playwright)

### 기본 E2E 테스트

```typescript
// e2e_tests/chat.spec.ts
import { test, expect, _electron as electron } from '@playwright/test';

test.describe('Chat功能', () => {
  let app;
  let window;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: ['.'],
    });
    window = await app.firstWindow();
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('should send and receive messages', async () => {
    // Navigate to chat
    await window.click('button:has-text("New Chat")');

    // Type message
    await window.fill('textarea[placeholder="메시지 입력..."]', 'Hello');

    // Send
    await window.click('button[aria-label="전송"]');

    // Wait for response
    await window.waitForSelector('.message.assistant', { timeout: 30000 });

    // Verify
    const messages = await window.locator('.message').count();
    expect(messages).toBeGreaterThan(1);
  });
});
```

### Visual Regression 테스트

```typescript
// e2e_tests/visual/ui.spec.ts
import { test, expect } from '@playwright/test';

test('should match settings dialog screenshot', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Open settings
  await page.click('[aria-label="설정"]');

  // Wait for dialog
  await page.waitForSelector('[role="dialog"]');

  // Take screenshot
  await expect(page.locator('[role="dialog"]')).toHaveScreenshot('settings-dialog.png');
});
```

## Mock 패턴

### API Mock

```typescript
// tests/__mocks__/api.ts
export const mockApiResponse = {
  chat: {
    send: jest.fn().mockResolvedValue({
      success: true,
      message: { role: 'assistant', content: 'Response' },
    }),
  },
};
```

### File System Mock

```typescript
// tests/__mocks__/fs.ts
import { jest } from '@jest/globals';

export const fs = {
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
  },
};
```

### LangGraph Mock

```typescript
// tests/__mocks__/langgraph.ts
export class MockGraph {
  invoke = jest.fn().mockResolvedValue({
    messages: [{ role: 'assistant', content: 'Mock response' }],
  });
}

export const GraphFactory = {
  createGraph: jest.fn(() => new MockGraph()),
};
```

## 테스트 커버리지

### 커버리지 목표

- **전체**: 80% 이상
- **Critical Path**: 90% 이상
- **UI Components**: 70% 이상

### 커버리지 확인

```bash
# 전체 커버리지
pnpm run test:coverage

# HTML 리포트
open coverage/lcov-report/index.html
```

### 커버리지 무시

```typescript
/* istanbul ignore next */
function debugOnly() {
  console.log('Debug info');
}
```

## 테스트 Best Practices

### 1. AAA 패턴

```typescript
test('should do something', () => {
  // Arrange
  const input = 'test';
  const expected = 'result';

  // Act
  const result = doSomething(input);

  // Assert
  expect(result).toBe(expected);
});
```

### 2. 명확한 테스트 이름

```typescript
// ❌ Bad
test('test 1', () => {});

// ✅ Good
test('should return error when input is empty', () => {});
```

### 3. 독립적인 테스트

```typescript
// ❌ Bad - 테스트 간 의존성
let sharedState;
test('test 1', () => {
  sharedState = 'value';
});
test('test 2', () => {
  expect(sharedState).toBe('value'); // test 1에 의존
});

// ✅ Good - 독립적
test('test 1', () => {
  const state = 'value';
  expect(state).toBe('value');
});
test('test 2', () => {
  const state = 'value';
  expect(state).toBe('value');
});
```

### 4. Cleanup

```typescript
describe('MyComponent', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
    jest.clearAllMocks();
  });

  test('should work', () => {
    // Test
  });
});
```

## 디버깅

### VSCode 디버그 설정

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Jest: Current File",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["${fileBasename}", "--runInBand"],
      "console": "integratedTerminal"
    }
  ]
}
```

### 디버그 로그

```typescript
test('should debug', () => {
  const result = doSomething();

  // 디버그 출력
  console.log('Result:', result);
  screen.debug(); // React Testing Library

  expect(result).toBe('expected');
});
```

## 실제 예제

기존 테스트 참고:

- `tests/lib/utils.test.ts` - 유틸리티 함수 테스트
- `tests/lib/config/sync.test.ts` - 설정 동기화 테스트
- `tests/frontend/` - React 컴포넌트 테스트
- `e2e_tests/` - Playwright E2E 테스트
