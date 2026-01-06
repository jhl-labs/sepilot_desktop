---
name: Extension Development
description: >
  SEPilot Desktop의 Extension 시스템 개발 가이드. Extension 구조, Manifest 정의,
  Agent 통합, Store slice, Components, IPC 핸들러 패턴을 다룹니다.
  Browser, Editor, Presentation extension 사례 기반.
---

# Extension Development Skill

## Extension 시스템 개요

SEPilot Desktop은 플러그인 아키텍처를 통해 기능을 모듈화합니다:

- **독립적**: 각 extension은 별도의 디렉토리에 격리됨
- **모드 기반**: Extension이 활성화하는 앱 모드 정의
- **타입 안전**: TypeScript로 완전한 타입 체크
- **자동 로딩**: Extension registry가 자동으로 검색 및 로드

## Extension 구조

```
extensions/
└── my-extension/
    ├── index.ts              # 메인 진입점 (모든 export 통합)
    ├── manifest.ts           # Extension 메타데이터 정의
    ├── README.md             # 문서
    ├── types/
    │   └── index.ts          # 타입 정의
    ├── agents/
    │   └── my-agent.ts       # LangGraph Agent 구현
    ├── tools/
    │   └── my-tools.ts       # Tool 정의 (MCP 또는 builtin)
    ├── lib/
    │   └── index.ts          # 비즈니스 로직
    ├── components/
    │   ├── index.ts          # 컴포넌트 export
    │   ├── MyStudio.tsx      # 메인 워크스페이스
    │   └── MySettings.tsx    # 설정 UI
    ├── store/
    │   └── index.ts          # Zustand slice
    ├── ipc/
    │   └── handlers.ts       # IPC 핸들러 (Main Process)
    └── locales/
        ├── en.json           # 영어
        └── ko.json           # 한국어
```

## Manifest 정의

### 필수 Manifest

```typescript
// extensions/my-extension/manifest.ts
import type { ExtensionManifest } from '@/lib/extensions/types';

export const manifest: ExtensionManifest = {
  // 고유 ID (URL safe, lowercase)
  id: 'my-extension',

  // 표시 이름
  name: 'My Extension',

  // 설명
  description: 'Extension 설명...',

  // Semantic Versioning
  version: '1.0.0',

  // 작성자
  author: 'Your Name',

  // lucide-react 아이콘 이름
  icon: 'Puzzle',

  // 활성화할 앱 모드 (app/[mode] 경로에 대응)
  mode: 'my-mode',

  // 사이드바 표시 여부
  showInSidebar: true,

  // 모드 드롭다운 표시 순서 (낮을수록 위)
  order: 5,

  // 기본 활성화 여부
  enabled: true,

  // 의존하는 다른 extension
  dependencies: [],
};

export default manifest;
```

### ExtensionManifest 타입

```typescript
export interface ExtensionManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  icon: string; // lucide-react icon name
  mode: string;
  showInSidebar: boolean;
  order?: number;
  enabled?: boolean;
  dependencies?: string[];
  betaFlag?: string; // Beta 기능 플래그 (예: 'enablePresentationMode')
  settingsSchema?: Record<string, unknown>;
  ipcChannels?: {
    handlers: string[];
  };
  settingsTab?: {
    id: string;
    label: string;
    description: string;
    icon: string;
  };
}
```

### Settings Schema 예시

```typescript
export const manifest: ExtensionManifest = {
  // ... other fields
  settingsSchema: {
    fontSize: {
      type: 'number',
      default: 14,
      description: 'Editor font size',
    },
    wordWrap: {
      type: 'boolean',
      default: false,
      description: 'Word wrap',
    },
    theme: {
      type: 'string',
      enum: ['light', 'dark', 'auto'],
      default: 'auto',
      description: 'Editor theme',
    },
  },
  settingsTab: {
    id: 'my-extension',
    label: 'settings.myExtension.title', // i18n key
    description: 'settings.myExtension.description',
    icon: 'Settings',
  },
};
```

## Extension Definition

### ExtensionDefinition 인터페이스

```typescript
export interface ExtensionDefinition {
  manifest: ExtensionManifest;

  // 메인 컴포넌트 (Studio/Workspace)
  MainComponent?: ComponentType;

  // 사이드바 컴포넌트
  SidebarComponent?: ComponentType;

  // 사이드바 헤더 액션 버튼
  HeaderActionsComponent?: ComponentType<any>;

  // Beta Settings 컴포넌트
  SettingsComponent?: ComponentType<{
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
  }>;

  // Settings Dialog 탭 컴포넌트
  SettingsTabComponent?: ComponentType<{
    onSave: () => void;
    isSaving: boolean;
    message: { type: 'success' | 'error'; text: string } | null;
  }>;

  // Store slice 생성
  createStoreSlice?: (set: any, get: any) => any;

  // IPC Handler 등록 (Main Process)
  setupIpcHandlers?: () => void;

  // 세션 초기화
  clearSession?: () => void;

  // Extension 활성화/비활성화
  activate?: () => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}
```

### 메인 진입점 (index.ts)

```typescript
// extensions/my-extension/index.ts
export { manifest } from './manifest';
export * from './types';
export * from './lib';
export * from './components';
export * from './store';

import type { ExtensionDefinition } from '@/lib/extensions/types';
import { manifest } from './manifest';
import { MyStudio } from './components/MyStudio';
import { MySidebar } from './components/MySidebar';
import { createMyExtensionSlice } from './store';
import { setupMyExtensionHandlers } from './ipc/handlers';

export const definition: ExtensionDefinition = {
  manifest,
  MainComponent: MyStudio,
  SidebarComponent: MySidebar,
  createStoreSlice: createMyExtensionSlice,
  setupIpcHandlers: setupMyExtensionHandlers,
};
```

## Agent 통합

### Agent State 정의

```typescript
// extensions/my-extension/types/index.ts
import type { AgentState } from '@/lib/langgraph/state';

export interface MyExtensionAgentState extends AgentState {
  // Extension 전용 상태
  myData?: {
    items: Array<{ id: string; content: string }>;
    currentStep: number;
    completed: boolean;
  };

  // RAG 지원
  useRag?: boolean;
  ragDocuments?: Array<{
    id: string;
    content: string;
    metadata: Record<string, any>;
  }>;
}
```

### Agent 구현 (LangGraph)

```typescript
// extensions/my-extension/agents/my-agent.ts
import { AgentState } from '@/lib/langgraph/state';
import type { Message, ToolCall } from '@/types';
import { getLLMClient } from '@/lib/llm/client';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';
import { logger } from '@/lib/utils/logger';
import type { MyExtensionAgentState } from '../types';

export class MyExtensionAgent {
  private maxIterations: number;

  constructor(maxIterations = 50) {
    this.maxIterations = maxIterations;
  }

  /**
   * Agent 스트리밍 실행
   */
  async *stream(
    initialState: MyExtensionAgentState,
    toolApprovalCallback?: (toolCalls: ToolCall[]) => Promise<boolean>
  ): AsyncGenerator<any, void, unknown> {
    let state = { ...initialState };

    logger.info('[MyExtensionAgent] Starting with state:', {
      useRag: state.useRag,
      dataItems: state.myData?.items?.length,
    });

    // Add system message
    const systemMessage: Message = {
      id: `system-${Date.now()}`,
      role: 'system',
      content: await this.buildSystemPrompt(state),
      created_at: Date.now(),
    };

    state = {
      ...state,
      messages: [systemMessage, ...state.messages],
    };

    let iterations = 0;

    while (iterations < this.maxIterations) {
      logger.info(`[MyExtensionAgent] Iteration ${iterations + 1}/${this.maxIterations}`);

      // 1. Generate response
      const generateResult = await this.generateNode(state);
      state = { ...state, ...generateResult };

      const lastMessage = state.messages[state.messages.length - 1];
      yield {
        type: 'message',
        message: lastMessage,
      };

      // 2. Check if should use tools
      const decision = this.shouldUseTool(state);
      if (decision === 'end') {
        logger.info('[MyExtensionAgent] No more tools to call, ending');
        break;
      }

      // 3. Tool approval (if needed)
      if (toolApprovalCallback && lastMessage.tool_calls) {
        const approved = await toolApprovalCallback(lastMessage.tool_calls);
        if (!approved) {
          logger.info('[MyExtensionAgent] Tool calls not approved');
          break;
        }
      }

      // 4. Execute tools
      const toolsResult = await this.toolsNode(state);
      state = {
        ...state,
        messages: [
          ...state.messages,
          ...toolsResult.toolResults.map((result: any) => ({
            id: `tool-result-${result.toolCallId}`,
            role: 'tool' as const,
            content: result.content,
            name: result.toolName,
            tool_call_id: result.toolCallId,
            created_at: Date.now(),
          })),
        ],
      };

      yield {
        type: 'tool_results',
        toolResults: toolsResult.toolResults,
      };

      iterations++;
    }
  }

  /**
   * Generate node
   */
  private async generateNode(
    state: MyExtensionAgentState
  ): Promise<Partial<MyExtensionAgentState>> {
    const client = getLLMClient();
    const provider = client.getProvider();

    let content = '';
    const toolCalls: ToolCall[] = [];

    try {
      for await (const chunk of provider.streamChat(state.messages, {
        tools: this.getTools(),
        toolChoice: 'auto',
      })) {
        if (typeof chunk === 'string') {
          content += chunk;
          emitStreamingChunk(chunk, state.conversationId);
        } else if (chunk.type === 'tool_use') {
          toolCalls.push({
            id: chunk.id,
            name: chunk.name,
            arguments: chunk.input,
          });
        }
      }

      const message: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        created_at: Date.now(),
      };

      return {
        messages: [...state.messages, message],
      };
    } catch (error: any) {
      logger.error('[MyExtensionAgent] Generate error:', error);
      throw error;
    }
  }

  /**
   * Tools node
   */
  private async toolsNode(state: MyExtensionAgentState): Promise<{ toolResults: any[] }> {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage.tool_calls) {
      return { toolResults: [] };
    }

    const toolResults = [];

    for (const toolCall of lastMessage.tool_calls) {
      try {
        const result = await this.executeTool(toolCall.name, toolCall.arguments, state);
        toolResults.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: JSON.stringify(result),
        });
      } catch (error: any) {
        logger.error(`[MyExtensionAgent] Tool ${toolCall.name} failed:`, error);
        toolResults.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: JSON.stringify({ error: error.message }),
          error: true,
        });
      }
    }

    return { toolResults };
  }

  /**
   * Execute tool
   */
  private async executeTool(name: string, args: any, state: MyExtensionAgentState): Promise<any> {
    switch (name) {
      case 'my_tool_1':
        return await this.myTool1(args);
      case 'my_tool_2':
        return await this.myTool2(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Tool implementations
   */
  private async myTool1(args: any): Promise<any> {
    // Tool logic
    return { success: true, result: 'Tool 1 executed' };
  }

  private async myTool2(args: any): Promise<any> {
    // Tool logic
    return { success: true, result: 'Tool 2 executed' };
  }

  /**
   * Get available tools
   */
  private getTools(): any[] {
    return [
      {
        name: 'my_tool_1',
        description: 'Tool 1 description',
        input_schema: {
          type: 'object',
          properties: {
            param1: { type: 'string', description: 'Parameter 1' },
          },
          required: ['param1'],
        },
      },
      {
        name: 'my_tool_2',
        description: 'Tool 2 description',
        input_schema: {
          type: 'object',
          properties: {
            param2: { type: 'number', description: 'Parameter 2' },
          },
          required: ['param2'],
        },
      },
    ];
  }

  /**
   * Should use tool decision
   */
  private shouldUseTool(state: MyExtensionAgentState): 'continue' | 'end' {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage.role === 'assistant' && lastMessage.tool_calls) {
      return 'continue';
    }
    return 'end';
  }

  /**
   * Build system prompt
   */
  private async buildSystemPrompt(state: MyExtensionAgentState): Promise<string> {
    const parts = [
      'You are My Extension AI Assistant.',
      'You can help users with tasks specific to this extension.',
      '',
      '# Available Tools:',
      '- my_tool_1: Tool 1 description',
      '- my_tool_2: Tool 2 description',
      '',
      '# Guidelines:',
      '- Be helpful and proactive',
      '- Use tools when appropriate',
      '- Explain your actions clearly',
    ];

    if (state.myData) {
      parts.push('');
      parts.push('# Current Data:');
      parts.push(`Items: ${state.myData.items.length}`);
      parts.push(`Step: ${state.myData.currentStep}`);
    }

    return parts.join('\n');
  }
}
```

## Components

### Main Studio Component

```typescript
// extensions/my-extension/components/MyStudio.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useChatStore } from '@/lib/store/chat-store';

export function MyStudio() {
  const [data, setData] = useState<any>(null);
  const currentConversationId = useChatStore((state) => state.currentConversationId);

  useEffect(() => {
    // Load data when conversation changes
    if (currentConversationId) {
      loadData(currentConversationId);
    }
  }, [currentConversationId]);

  const loadData = async (conversationId: string) => {
    const result = await window.electron.invoke('my-extension:load-data', {
      conversationId,
    });
    if (result.success) {
      setData(result.data);
    }
  };

  const handleAction = async () => {
    const result = await window.electron.invoke('my-extension:perform-action', {
      conversationId: currentConversationId,
      action: 'do-something',
    });
    if (result.success) {
      setData(result.data);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-lg font-semibold">My Extension</h2>
        <Button onClick={handleAction}>Perform Action</Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {data ? (
          <Card className="p-4">
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </Card>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No data yet
          </div>
        )}
      </div>
    </div>
  );
}
```

### Settings Component

```typescript
// extensions/my-extension/components/MySettings.tsx
'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

interface MySettingsProps {
  onSave: () => void;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function MySettings({ onSave, isSaving, message }: MySettingsProps) {
  const [fontSize, setFontSize] = useState(14);
  const [wordWrap, setWordWrap] = useState(false);

  const handleSave = async () => {
    await window.electron.invoke('my-extension:save-settings', {
      fontSize,
      wordWrap,
    });
    onSave();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="fontSize">Font Size</Label>
        <Input
          id="fontSize"
          type="number"
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="wordWrap">Word Wrap</Label>
        <Switch id="wordWrap" checked={wordWrap} onCheckedChange={setWordWrap} />
      </div>

      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save Settings'}
      </Button>

      {message && (
        <div
          className={`rounded-md p-3 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
```

## Store Slice

```typescript
// extensions/my-extension/store/index.ts
import { StateCreator } from 'zustand';

export interface MyExtensionSlice {
  myData: Array<{ id: string; content: string }>;
  currentStep: number;
  completed: boolean;

  // Actions
  setMyData: (data: Array<{ id: string; content: string }>) => void;
  setCurrentStep: (step: number) => void;
  setCompleted: (completed: boolean) => void;
  resetMyExtension: () => void;
}

export const createMyExtensionSlice: StateCreator<MyExtensionSlice, [], [], MyExtensionSlice> = (
  set
) => ({
  myData: [],
  currentStep: 0,
  completed: false,

  setMyData: (data) => set({ myData: data }),
  setCurrentStep: (step) => set({ currentStep: step }),
  setCompleted: (completed) => set({ completed }),
  resetMyExtension: () =>
    set({
      myData: [],
      currentStep: 0,
      completed: false,
    }),
});
```

## IPC 핸들러

```typescript
// extensions/my-extension/ipc/handlers.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { logger } from '@/lib/utils/logger';

export function setupMyExtensionHandlers() {
  ipcMain.handle(
    'my-extension:load-data',
    async (event: IpcMainInvokeEvent, data: { conversationId: string }) => {
      try {
        logger.info('[MyExtension] Loading data for conversation:', data.conversationId);

        // Load data logic
        const result = {
          items: [
            { id: '1', content: 'Item 1' },
            { id: '2', content: 'Item 2' },
          ],
          currentStep: 0,
          completed: false,
        };

        return { success: true, data: result };
      } catch (error: any) {
        logger.error('[MyExtension] Load data error:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  ipcMain.handle(
    'my-extension:perform-action',
    async (event: IpcMainInvokeEvent, data: { conversationId: string; action: string }) => {
      try {
        logger.info('[MyExtension] Performing action:', data.action);

        // Action logic
        const result = {
          success: true,
          message: `Action ${data.action} completed`,
        };

        return { success: true, data: result };
      } catch (error: any) {
        logger.error('[MyExtension] Action error:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  ipcMain.handle('my-extension:save-settings', async (event: IpcMainInvokeEvent, settings: any) => {
    try {
      logger.info('[MyExtension] Saving settings:', settings);

      // Save settings logic
      // Use databaseService.setSetting() or file system

      return { success: true };
    } catch (error: any) {
      logger.error('[MyExtension] Save settings error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });
}
```

## 다국어 지원 (Locales)

```json
// extensions/my-extension/locales/ko.json
{
  "myExtension": {
    "title": "나의 확장 기능",
    "description": "확장 기능 설명",
    "actions": {
      "performAction": "작업 수행",
      "loadData": "데이터 로드"
    },
    "messages": {
      "success": "작업이 성공적으로 완료되었습니다",
      "error": "작업 중 오류가 발생했습니다"
    }
  },
  "settings": {
    "myExtension": {
      "title": "나의 확장 기능 설정",
      "description": "확장 기능 설정을 관리합니다",
      "fontSize": "글꼴 크기",
      "wordWrap": "자동 줄바꿈"
    }
  }
}
```

```json
// extensions/my-extension/locales/en.json
{
  "myExtension": {
    "title": "My Extension",
    "description": "Extension description",
    "actions": {
      "performAction": "Perform Action",
      "loadData": "Load Data"
    },
    "messages": {
      "success": "Action completed successfully",
      "error": "An error occurred"
    }
  },
  "settings": {
    "myExtension": {
      "title": "My Extension Settings",
      "description": "Manage extension settings",
      "fontSize": "Font Size",
      "wordWrap": "Word Wrap"
    }
  }
}
```

## Extension 등록

### 자동 등록 (권장)

Extension registry가 `extensions/` 디렉토리를 자동으로 스캔합니다.

```typescript
// Extension이 올바른 구조를 가지고 있으면 자동으로 로드됨
// - manifest.ts 존재
// - index.ts에서 definition export
```

### 수동 등록 (Advanced)

```typescript
// lib/extensions/registry.ts에서 수동 등록
import { registerExtension } from '@/lib/extensions/registry';
import { definition as myExtensionDefinition } from '@/extensions/my-extension';

registerExtension(myExtensionDefinition);
```

## Best Practices

### 1. Extension 격리

```typescript
// ✅ Good - Extension 내부에서 모든 것 관리
extensions/my-extension/
├── agents/
├── components/
├── store/
└── ipc/

// ❌ Bad - 외부 의존성이 많음
// Extension 코드가 lib/, components/ 등에 흩어져 있음
```

### 2. TypeScript Strict Mode

```typescript
// ✅ Good - 타입 안전
export interface MyExtensionAgentState extends AgentState {
  myData?: {
    items: Array<{ id: string; content: string }>;
  };
}

// ❌ Bad - any 남발
export interface MyExtensionAgentState {
  myData?: any;
}
```

### 3. IPC 에러 처리

```typescript
// ✅ Good - 명확한 에러 처리
ipcMain.handle('my-extension:action', async (event, data) => {
  try {
    const result = await performAction(data);
    return { success: true, data: result };
  } catch (error: any) {
    logger.error('[MyExtension] Action error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// ❌ Bad - 에러 무시
ipcMain.handle('my-extension:action', async (event, data) => {
  const result = await performAction(data);
  return result;
});
```

### 4. Store Slice 분리

```typescript
// ✅ Good - Extension slice 분리
export const createMyExtensionSlice: StateCreator<MyExtensionSlice> = (set) => ({
  myData: [],
  setMyData: (data) => set({ myData: data }),
});

// ❌ Bad - Global store에 직접 추가
// chat-store.ts에 extension 상태 직접 추가
```

### 5. Component 명명

```typescript
// ✅ Good - 명확한 이름
export function MyExtensionStudio() {}
export function MyExtensionSidebar() {}
export function MyExtensionSettings() {}

// ❌ Bad - 모호한 이름
export function Studio() {} // 어느 extension의 Studio?
export function Sidebar() {}
```

## 실제 예제

기존 구현 참고:

- `extensions/browser/` - Browser Agent, Vision Fallback, Tools
- `extensions/editor/` - Monaco Editor, File Tree, Terminal
- `extensions/presentation/` - PPT Agent, Templates, Exporters
- `lib/extensions/types.ts` - Extension System 타입 정의
- `lib/extensions/registry.ts` - Extension 등록 및 관리

## 체크리스트

**Extension 생성 시:**

- [ ] manifest.ts 정의 (id, name, description, version, icon, mode)
- [ ] index.ts에서 모든 export 통합
- [ ] README.md 작성
- [ ] types/ 디렉토리에 타입 정의
- [ ] components/ 디렉토리에 UI 컴포넌트
- [ ] store/ 디렉토리에 Zustand slice
- [ ] locales/ 디렉토리에 다국어 파일 (ko.json, en.json)
- [ ] IPC 핸들러 필요 시 ipc/ 디렉토리 생성
- [ ] Agent 필요 시 agents/ 디렉토리 생성
- [ ] Tools 필요 시 tools/ 디렉토리 생성

**테스트:**

- [ ] Extension이 모드 드롭다운에 표시되는지
- [ ] 사이드바 컴포넌트가 올바르게 렌더링되는지
- [ ] IPC 통신이 정상 작동하는지
- [ ] 설정이 저장되고 로드되는지
- [ ] 다국어 전환이 올바르게 동작하는지
- [ ] Agent가 정상적으로 실행되는지
