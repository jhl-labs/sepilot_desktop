# AI Agent 개발 가이드

SEPilot Desktop의 AI Agent 개발 종합 가이드

## 목차

1. [Agent 개요](#agent-개요)
2. [Agent 아키텍처](#agent-아키텍처)
3. [Agent State 설계](#agent-state-설계)
4. [기본 Agent 구조](#기본-agent-구조)
5. [Tool 정의 및 실행](#tool-정의-및-실행)
6. [Human-in-the-Loop](#human-in-the-loop)
7. [Agent 그래프 패턴](#agent-그래프-패턴)
8. [MCP Tool 통합](#mcp-tool-통합)
9. [RAG 통합](#rag-통합)
10. [Agent 디버깅 및 테스트](#agent-디버깅-및-테스트)
11. [Best Practices](#best-practices)

## Agent 개요

SEPilot Desktop의 AI Agent는 LangGraph 기반의 반복적인 워크플로우를 통해 복잡한 작업을 수행합니다.

### Agent의 역할

- **자율적 작업 수행**: 사용자의 요청을 이해하고 단계별로 실행
- **도구 활용**: File System, Terminal, Browser, MCP Tools 등 활용
- **컨텍스트 관리**: RAG, 대화 기록, 파일 내용 등을 기반으로 컨텍스트 유지
- **Human-in-the-Loop**: 중요한 작업(파일 수정, 명령 실행)은 사용자 승인 필요
- **스트리밍**: 실시간 응답을 사용자에게 스트리밍

### Agent 종류

SEPilot Desktop의 주요 Agent:

1. **Chat Agent**: 일반 대화 및 질의응답
2. **Coding Agent**: 코드 작성, 수정, 검증 (Planning, Execution, Verification)
3. **Browser Agent**: 웹 브라우저 자동화 (Playwright 기반)
4. **Editor Agent**: 코드 편집 (Monaco Editor, File Tree, Terminal)
5. **Presentation Agent**: 프레젠테이션 생성 (PPT, HTML, PDF)

## Agent 아키텍처

### 기본 흐름

```
┌─────────────┐
│  User Input │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│  Agent Loop (Iterations)        │
│                                  │
│  1. Generate (LLM 호출)         │
│     ├─ System Prompt             │
│     ├─ Conversation History      │
│     ├─ RAG Documents (optional)  │
│     └─ Available Tools           │
│                                  │
│  2. Decision (도구 사용 판단)    │
│     ├─ Continue (도구 호출)      │
│     └─ End (응답 완료)           │
│                                  │
│  3. Tool Approval (Human-in-Loop)│
│     ├─ Read-only: 자동 승인      │
│     └─ Write: 사용자 승인 필요   │
│                                  │
│  4. Execute Tools                │
│     ├─ Builtin Tools              │
│     ├─ MCP Tools                  │
│     └─ Custom Tools               │
│                                  │
│  5. Update State                 │
│     └─ Tool results → Messages   │
│                                  │
│  ← Loop until End or Max Iterations
│                                  │
└─────────────────────────────────┘
       │
       ▼
┌──────────────┐
│ Final Result │
└──────────────┘
```

### 컴포넌트

1. **AgentState**: Agent의 상태 (messages, context, data)
2. **Generate Node**: LLM을 호출하여 응답 및 도구 호출 생성
3. **Tools Node**: 도구 실행 및 결과 반환
4. **Decision Node**: 다음 동작 결정 (계속 또는 종료)
5. **Streaming**: 실시간 응답을 Frontend로 전송

## Agent State 설계

### AgentState 인터페이스

```typescript
// lib/langgraph/state.ts
export interface AgentState {
  // 필수 필드
  messages: Message[]; // 대화 기록
  conversationId: string; // 대화 ID (스트리밍용)

  // 선택적 필드
  systemPrompt?: string; // 시스템 프롬프트
  maxIterations?: number; // 최대 반복 횟수

  // 도구 관련
  tools?: Tool[]; // 사용 가능한 도구 목록
  toolResults?: ToolResult[]; // 도구 실행 결과

  // RAG 관련
  useRag?: boolean; // RAG 활성화 여부
  ragDocuments?: RagDocument[]; // 검색된 문서

  // 커스텀 데이터
  [key: string]: any; // Extension별 추가 데이터
}
```

### Message 타입

```typescript
// types/index.ts
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: number;

  // Tool 관련
  tool_calls?: ToolCall[];
  tool_call_id?: string; // role이 'tool'일 때
  name?: string; // Tool 이름 (role이 'tool'일 때)

  // 메타데이터
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}
```

### Extension별 State 확장

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

  // Extension 전용 설정
  mySettings?: {
    enableFeatureX: boolean;
    threshold: number;
  };
}
```

## 기본 Agent 구조

### Agent 클래스 템플릿

```typescript
// lib/langgraph/agents/my-agent.ts
import { AgentState } from '@/lib/langgraph/state';
import type { Message, ToolCall } from '@/types';
import { getLLMClient } from '@/lib/llm/client';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';
import { logger } from '@/lib/utils/logger';

export class MyAgent {
  private maxIterations: number;

  constructor(maxIterations = 50) {
    this.maxIterations = maxIterations;
  }

  /**
   * Agent 스트리밍 실행
   */
  async *stream(
    initialState: AgentState,
    toolApprovalCallback?: (toolCalls: ToolCall[]) => Promise<boolean>
  ): AsyncGenerator<any, void, unknown> {
    let state = { ...initialState };

    logger.info('[MyAgent] Starting with state:', {
      messagesCount: state.messages.length,
      conversationId: state.conversationId,
    });

    // 시스템 메시지 추가
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
      logger.info(`[MyAgent] Iteration ${iterations + 1}/${this.maxIterations}`);

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
        logger.info('[MyAgent] No more tools to call, ending');
        break;
      }

      // 3. Tool approval (if needed)
      if (toolApprovalCallback && lastMessage.tool_calls) {
        const approved = await toolApprovalCallback(lastMessage.tool_calls);
        if (!approved) {
          logger.info('[MyAgent] Tool calls not approved by user');
          break;
        }
      }

      // 4. Execute tools
      emitStreamingChunk('\n🛠️ **도구 실행 중...**\n', state.conversationId);

      const toolsResult = await this.toolsNode(state);
      state = {
        ...state,
        messages: [
          ...state.messages,
          ...toolsResult.toolResults.map((result) => ({
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

    if (iterations >= this.maxIterations) {
      logger.warn('[MyAgent] Max iterations reached');
      const maxIterMsg: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ 최대 반복 횟수(${this.maxIterations})에 도달했습니다. 작업이 완료되지 않았을 수 있습니다.`,
        created_at: Date.now(),
      };
      yield {
        type: 'message',
        message: maxIterMsg,
      };
    }
  }

  /**
   * Generate node - LLM 호출
   */
  private async generateNode(state: AgentState): Promise<Partial<AgentState>> {
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
      logger.error('[MyAgent] Generate error:', error);
      throw error;
    }
  }

  /**
   * Tools node - 도구 실행
   */
  private async toolsNode(state: AgentState): Promise<{ toolResults: any[] }> {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage.tool_calls) {
      return { toolResults: [] };
    }

    const toolResults = [];

    for (const toolCall of lastMessage.tool_calls) {
      try {
        logger.info(`[MyAgent] Executing tool: ${toolCall.name}`);
        const result = await this.executeTool(toolCall.name, toolCall.arguments, state);

        toolResults.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: JSON.stringify(result),
        });
      } catch (error: any) {
        logger.error(`[MyAgent] Tool ${toolCall.name} failed:`, error);
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
   * Execute tool - 도구 실행 로직
   */
  private async executeTool(name: string, args: any, state: AgentState): Promise<any> {
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
  private shouldUseTool(state: AgentState): 'continue' | 'end' {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage.role === 'assistant' && lastMessage.tool_calls) {
      return 'continue';
    }
    return 'end';
  }

  /**
   * Build system prompt
   */
  private async buildSystemPrompt(state: AgentState): Promise<string> {
    const parts = [
      'You are My Agent, an AI assistant that helps users with tasks.',
      '',
      '# Available Tools:',
      '- my_tool_1: Tool 1 description',
      '- my_tool_2: Tool 2 description',
      '',
      '# Guidelines:',
      '- Be helpful and proactive',
      '- Use tools when appropriate',
      '- Explain your actions clearly',
      '- Always respond in Korean (한국어로 응답)',
    ];

    return parts.join('\n');
  }
}
```

### Agent 사용 (Frontend)

```typescript
// components/chat/ChatView.tsx
'use client';

import { useState } from 'react';
import { MyAgent } from '@/lib/langgraph/agents/my-agent';
import type { AgentState } from '@/lib/langgraph/state';
import type { Message, ToolCall } from '@/types';

export function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      created_at: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);

    const initialState: AgentState = {
      messages: [...messages, userMessage],
      conversationId: 'conv-123',
    };

    const agent = new MyAgent();

    try {
      for await (const event of agent.stream(initialState, handleToolApproval)) {
        if (event.type === 'message') {
          setMessages((prev) => [...prev, event.message]);
        } else if (event.type === 'tool_results') {
          // Tool results는 이미 messages에 포함됨
        }
      }
    } catch (error) {
      console.error('Agent error:', error);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleToolApproval = async (toolCalls: ToolCall[]): Promise<boolean> => {
    // 사용자에게 도구 승인 요청
    const approved = await showToolApprovalDialog(toolCalls);
    return approved;
  };

  return (
    <div>
      {/* Chat UI */}
    </div>
  );
}
```

## Tool 정의 및 실행

### Tool 인터페이스

```typescript
// types/index.ts
export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
  items?: ToolParameter; // for array type
  properties?: Record<string, ToolParameter>; // for object type
}
```

### Builtin Tools 예시

```typescript
// lib/langgraph/tools/file-tools.ts
export const fileReadTool: Tool = {
  name: 'file_read',
  description: 'Read the contents of a file',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read',
      },
    },
    required: ['path'],
  },
};

export const fileWriteTool: Tool = {
  name: 'file_write',
  description: 'Write content to a file (creates or overwrites)',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
    },
    required: ['path', 'content'],
  },
};

export const fileEditTool: Tool = {
  name: 'file_edit',
  description: 'Edit a file by searching and replacing text',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit',
      },
      old_text: {
        type: 'string',
        description: 'Text to search for (must be exact match)',
      },
      new_text: {
        type: 'string',
        description: 'Text to replace with',
      },
    },
    required: ['path', 'old_text', 'new_text'],
  },
};
```

### Tool 실행 로직

```typescript
// lib/langgraph/tools/execute-tool.ts
import * as fs from 'fs/promises';
import * as path from 'path';

export async function executeBuiltinTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'file_read':
      return await fileRead(args.path);

    case 'file_write':
      return await fileWrite(args.path, args.content);

    case 'file_edit':
      return await fileEdit(args.path, args.old_text, args.new_text);

    default:
      throw new Error(`Unknown builtin tool: ${name}`);
  }
}

async function fileRead(filePath: string): Promise<any> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      success: true,
      content,
      path: filePath,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

async function fileWrite(filePath: string, content: string): Promise<any> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    return {
      success: true,
      path: filePath,
      message: 'File written successfully',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

async function fileEdit(filePath: string, oldText: string, newText: string): Promise<any> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    if (!content.includes(oldText)) {
      return {
        success: false,
        error: 'Text not found in file',
      };
    }

    const newContent = content.replace(oldText, newText);
    await fs.writeFile(filePath, newContent, 'utf-8');

    return {
      success: true,
      path: filePath,
      message: 'File edited successfully',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}
```

## Human-in-the-Loop

### Tool Approval 패턴

```typescript
// components/chat/ToolApprovalDialog.tsx
'use client';

import { useState } from 'react';
import type { ToolCall } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ToolApprovalDialogProps {
  toolCalls: ToolCall[];
  onApprove: () => void;
  onReject: () => void;
}

export function ToolApprovalDialog({ toolCalls, onApprove, onReject }: ToolApprovalDialogProps) {
  // Read-only tools는 자동 승인
  const readOnlyTools = ['file_read', 'grep_search', 'file_list'];

  const needsApproval = toolCalls.some((tc) => !readOnlyTools.includes(tc.name));

  if (!needsApproval) {
    // 자동 승인
    onApprove();
    return null;
  }

  return (
    <Dialog open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>도구 실행 승인 요청</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {toolCalls.map((tc, index) => (
            <div key={index} className="rounded-lg border p-4">
              <div className="font-semibold">{tc.name}</div>
              <pre className="mt-2 text-sm">{JSON.stringify(tc.arguments, null, 2)}</pre>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onReject}>
            거부
          </Button>
          <Button onClick={onApprove}>승인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Read-only vs Write Tools

```typescript
// lib/langgraph/utils/tool-classifier.ts
export function isReadOnlyTool(toolName: string): boolean {
  const readOnlyTools = [
    'file_read',
    'file_list',
    'grep_search',
    'browser_get_page_content',
    'browser_get_interactive_elements',
  ];

  return readOnlyTools.includes(toolName);
}

export function filterToolsNeedingApproval(toolCalls: ToolCall[]): ToolCall[] {
  return toolCalls.filter((tc) => !isReadOnlyTool(tc.name));
}
```

## Agent 그래프 패턴

### 1. Deep Thinking (CoT)

```typescript
// lib/langgraph/graphs/deep-thinking.ts
export class DeepThinkingAgent {
  async *stream(initialState: AgentState): AsyncGenerator<any, void, unknown> {
    let state = { ...initialState };

    // Phase 1: Problem Analysis
    emitStreamingChunk('\n🧠 **문제 분석 중...**\n', state.conversationId);
    const analysisResult = await this.analyzeProblem(state);
    state = { ...state, ...analysisResult };

    // Phase 2: Solution Planning
    emitStreamingChunk('\n📋 **해결 방안 계획 중...**\n', state.conversationId);
    const planResult = await this.planSolution(state);
    state = { ...state, ...planResult };

    // Phase 3: Step-by-Step Execution
    for (let step = 0; step < planResult.steps.length; step++) {
      emitStreamingChunk(
        `\n🔹 **Step ${step + 1}: ${planResult.steps[step]}**\n`,
        state.conversationId
      );

      const stepResult = await this.executeStep(state, step);
      state = { ...state, ...stepResult };
    }

    // Phase 4: Verification
    emitStreamingChunk('\n✅ **결과 검증 중...**\n', state.conversationId);
    const verifyResult = await this.verifySolution(state);
    state = { ...state, ...verifyResult };

    yield { type: 'final_result', state };
  }

  private async analyzeProblem(state: AgentState): Promise<Partial<AgentState>> {
    // LLM 호출하여 문제 분석
    const client = getLLMClient();
    const analysis = await client.chat([
      {
        role: 'system',
        content: 'Analyze the problem deeply and identify key challenges.',
      },
      ...state.messages,
    ]);
    return { analysis };
  }

  // ... other methods
}
```

### 2. Sequential Thinking

```typescript
// lib/langgraph/graphs/sequential-thinking.ts
export class SequentialThinkingAgent {
  async *stream(initialState: AgentState): AsyncGenerator<any, void, unknown> {
    let state = { ...initialState };

    // Linear sequence of steps
    const steps = [
      { name: 'understand', prompt: 'Understand the user request' },
      { name: 'plan', prompt: 'Create a step-by-step plan' },
      { name: 'execute', prompt: 'Execute the plan' },
      { name: 'review', prompt: 'Review the results' },
    ];

    for (const [index, step] of steps.entries()) {
      emitStreamingChunk(`\n**${index + 1}. ${step.name}**\n`, state.conversationId);

      const result = await this.executeSequentialStep(state, step);
      state = { ...state, ...result };

      yield { type: 'step_complete', step: step.name, state };
    }

    yield { type: 'final_result', state };
  }
}
```

### 3. Tree of Thought

```typescript
// lib/langgraph/graphs/tree-of-thought.ts
export class TreeOfThoughtAgent {
  async *stream(initialState: AgentState): AsyncGenerator<any, void, unknown> {
    let state = { ...initialState };

    // Generate multiple solution paths
    const branches = await this.generateBranches(state, 3);

    // Evaluate each branch
    const evaluations = await Promise.all(
      branches.map((branch) => this.evaluateBranch(state, branch))
    );

    // Select best path
    const bestBranch = this.selectBestBranch(evaluations);

    // Execute best path
    for (const step of bestBranch.steps) {
      const result = await this.executeStep(state, step);
      state = { ...state, ...result };

      yield { type: 'step_result', result };
    }

    yield { type: 'final_result', state };
  }
}
```

### 4. Coding Agent (Planning, Execution, Verification)

```typescript
// lib/langgraph/graphs/coding-agent.ts
export class CodingAgent {
  async *stream(initialState: AgentState): AsyncGenerator<any, void, unknown> {
    let state = { ...initialState };

    // Phase 1: Planning
    emitStreamingChunk('\n📋 **계획 수립 중...**\n', state.conversationId);
    const plan = await this.createPlan(state);
    state = { ...state, plan };

    yield { type: 'plan', plan };

    // Phase 2: Execution
    for (let i = 0; i < plan.steps.length; i++) {
      emitStreamingChunk(
        `\n🔧 **Step ${i + 1}/${plan.steps.length}: ${plan.steps[i]}**\n`,
        state.conversationId
      );

      const executionResult = await this.executeCodeStep(state, i);
      state = { ...state, ...executionResult };

      yield { type: 'execution', step: i, result: executionResult };
    }

    // Phase 3: Verification
    emitStreamingChunk('\n🔍 **코드 검증 중...**\n', state.conversationId);
    const verification = await this.verifyCode(state);

    if (!verification.passed) {
      emitStreamingChunk('\n⚠️ **검증 실패, 수정 중...**\n', state.conversationId);
      const fixResult = await this.fixIssues(state, verification.issues);
      state = { ...state, ...fixResult };
    }

    yield { type: 'final_result', state, verification };
  }

  private async createPlan(state: AgentState): Promise<any> {
    const client = getLLMClient();
    const response = await client.chat([
      {
        role: 'system',
        content: 'Create a detailed plan for the coding task. List 3-7 concrete steps.',
      },
      ...state.messages,
    ]);

    const steps = this.parsePlanSteps(response.content);
    return { steps };
  }

  private async verifyCode(state: AgentState): Promise<any> {
    // 1. 타입 체크
    const typeCheck = await this.runTypeCheck(state);

    // 2. 린트
    const lint = await this.runLint(state);

    // 3. 테스트
    const tests = await this.runTests(state);

    return {
      passed: typeCheck.passed && lint.passed && tests.passed,
      issues: [...typeCheck.issues, ...lint.issues, ...tests.issues],
    };
  }
}
```

## MCP Tool 통합

### MCP Server 연결

```typescript
// lib/mcp/server-manager.ts
import { MCPServerManager } from '@/lib/mcp/server-manager';

// Singleton instance
let mcpManager: MCPServerManager | null = null;

export function getMCPManager(): MCPServerManager {
  if (!mcpManager) {
    mcpManager = new MCPServerManager();
  }
  return mcpManager;
}

// Agent에서 사용
export class AgentWithMCP {
  private async connectMCPServers(): Promise<void> {
    const manager = getMCPManager();

    // GitHub MCP
    await manager.connectServer({
      id: 'github',
      name: 'GitHub MCP',
      transport: {
        type: 'sse',
        url: 'http://localhost:3100/sse',
      },
    });

    // Filesystem MCP
    await manager.connectServer({
      id: 'filesystem',
      name: 'Filesystem MCP',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
      },
    });
  }

  private async getTools(): Promise<Tool[]> {
    const manager = getMCPManager();
    const builtinTools = this.getBuiltinTools();

    // MCP 서버에서 도구 가져오기
    const mcpTools: Tool[] = [];
    for (const serverId of manager.getConnectedServers()) {
      const tools = await manager.listTools(serverId);
      mcpTools.push(...tools);
    }

    return [...builtinTools, ...mcpTools];
  }

  private async executeTool(name: string, args: any): Promise<any> {
    const manager = getMCPManager();

    // Builtin tool인지 확인
    if (this.isBuiltinTool(name)) {
      return await this.executeBuiltinTool(name, args);
    }

    // MCP tool 실행
    for (const serverId of manager.getConnectedServers()) {
      const tools = await manager.listTools(serverId);
      if (tools.some((t) => t.name === name)) {
        return await manager.callTool(serverId, name, args);
      }
    }

    throw new Error(`Tool not found: ${name}`);
  }
}
```

## RAG 통합

### RAG 활성화된 Agent

````typescript
// lib/langgraph/agents/rag-agent.ts
export class RAGAgent {
  async *stream(
    initialState: AgentState & { useRag?: boolean }
  ): AsyncGenerator<any, void, unknown> {
    let state = { ...initialState };

    // RAG 활성화 시 문서 검색
    if (state.useRag) {
      logger.info('[RAGAgent] RAG enabled, retrieving documents');
      const ragDocuments = await this.retrieveDocuments(state);
      state = { ...state, ragDocuments };

      yield { type: 'rag_documents', documents: ragDocuments };
    }

    // 시스템 프롬프트에 RAG 문서 포함
    const systemPrompt = await this.buildSystemPrompt(state);
    const systemMessage: Message = {
      id: `system-${Date.now()}`,
      role: 'system',
      content: systemPrompt,
      created_at: Date.now(),
    };

    state = {
      ...state,
      messages: [systemMessage, ...state.messages],
    };

    // 일반 Agent 로직 실행
    yield* super.stream(state);
  }

  private async retrieveDocuments(state: AgentState): Promise<any[]> {
    const { vectorDBService } = await import('../../../electron/services/vectordb');
    const { getEmbeddingProvider } = await import('@/lib/vectordb/embeddings/client');

    // 마지막 사용자 메시지로 검색
    const lastUserMessage = state.messages.filter((m) => m.role === 'user').pop();
    if (!lastUserMessage) {
      return [];
    }

    const embedder = getEmbeddingProvider();
    const queryEmbedding = await embedder.embed(lastUserMessage.content);
    const results = await vectorDBService.searchByVector(queryEmbedding, 5);

    return results;
  }

  private async buildSystemPrompt(state: AgentState & { ragDocuments?: any[] }): Promise<string> {
    const parts = ['You are an AI assistant with access to project documentation.', ''];

    if (state.ragDocuments && state.ragDocuments.length > 0) {
      parts.push('# Relevant Documents:');
      parts.push('');

      state.ragDocuments.forEach((doc, i) => {
        parts.push(`## Document ${i + 1} (Score: ${(doc.score || 0).toFixed(2)})`);
        parts.push('```');
        parts.push(doc.content.substring(0, 2000));
        parts.push('```');
        parts.push('');
      });

      parts.push("Use these documents to answer the user's question accurately.");
    }

    return parts.join('\n');
  }
}
````

## Agent 디버깅 및 테스트

### Agent 로깅

```typescript
// lib/utils/logger.ts
import { logger } from '@/lib/utils/logger';

// Agent 내부에서 로깅
logger.info('[MyAgent] Starting execution', { conversationId, messagesCount });
logger.debug('[MyAgent] Tool call', { toolName, args });
logger.warn('[MyAgent] Max iterations reached');
logger.error('[MyAgent] Execution failed', error);
```

### Agent 테스트

```typescript
// tests/lib/langgraph/agents/my-agent.test.ts
import { MyAgent } from '@/lib/langgraph/agents/my-agent';
import type { AgentState } from '@/lib/langgraph/state';

describe('MyAgent', () => {
  let agent: MyAgent;

  beforeEach(() => {
    agent = new MyAgent(10); // Max 10 iterations for testing
  });

  it('should execute successfully', async () => {
    const initialState: AgentState = {
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          created_at: Date.now(),
        },
      ],
      conversationId: 'test-conv',
    };

    const events = [];
    for await (const event of agent.stream(initialState)) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('message');
  });

  it('should handle tool calls', async () => {
    const initialState: AgentState = {
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Execute my_tool_1',
          created_at: Date.now(),
        },
      ],
      conversationId: 'test-conv',
    };

    const toolApproval = jest.fn().mockResolvedValue(true);

    const events = [];
    for await (const event of agent.stream(initialState, toolApproval)) {
      events.push(event);
    }

    const toolResultEvent = events.find((e) => e.type === 'tool_results');
    expect(toolResultEvent).toBeDefined();
    expect(toolApproval).toHaveBeenCalled();
  });

  it('should stop when tool approval is rejected', async () => {
    const initialState: AgentState = {
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Execute dangerous operation',
          created_at: Date.now(),
        },
      ],
      conversationId: 'test-conv',
    };

    const toolApproval = jest.fn().mockResolvedValue(false);

    const events = [];
    for await (const event of agent.stream(initialState, toolApproval)) {
      events.push(event);
    }

    const toolResultEvent = events.find((e) => e.type === 'tool_results');
    expect(toolResultEvent).toBeUndefined(); // Tool 실행되지 않음
  });
});
```

## Best Practices

### 1. Agent 설계

**✅ Do:**

- 명확한 책임 분리 (각 Agent는 하나의 목적)
- 시스템 프롬프트를 통해 Agent 동작 가이드
- 최대 반복 횟수 설정하여 무한 루프 방지
- 스트리밍으로 실시간 피드백 제공

**❌ Don't:**

- 하나의 Agent에 너무 많은 기능 추가
- 하드코딩된 로직 (LLM이 결정하도록)
- 무한 루프 가능성 무시
- 사용자 피드백 없이 긴 작업 수행

### 2. Tool 설계

**✅ Do:**

- Tool 이름과 설명을 명확하게 작성
- Input schema를 상세하게 정의
- Read-only와 Write tools 구분
- 에러 처리 및 명확한 에러 메시지

**❌ Don't:**

- 모호한 Tool 이름 (예: `do_something`)
- Input schema 생략
- 모든 Tool을 write로 분류
- 에러를 그대로 노출

### 3. Human-in-the-Loop

**✅ Do:**

- Read-only tools는 자동 승인
- Write tools는 사용자 승인 필요
- Tool 실행 전 사용자에게 명확히 설명
- 승인 거부 시 graceful하게 종료

**❌ Don't:**

- 모든 Tool에 승인 요청 (번거로움)
- 위험한 작업을 자동 승인
- 승인 없이 파일 수정/삭제
- 승인 거부 시 에러 발생

### 4. 에러 처리

**✅ Do:**

- Try-catch로 모든 Tool 실행 감싸기
- 에러를 명확한 메시지로 변환
- Tool 실패 시에도 Agent 계속 실행
- 로깅으로 디버깅 정보 수집

**❌ Don't:**

- 에러를 무시하고 계속 진행
- 기술적 에러 메시지 그대로 노출
- Tool 실패 시 Agent 전체 중단
- 로그 없이 에러 처리

### 5. 성능

**✅ Do:**

- Tool 결과를 캐싱 (같은 요청 반복 방지)
- 병렬 Tool 실행 (가능한 경우)
- 큰 데이터는 스트리밍
- 불필요한 Tool 호출 최소화

**❌ Don't:**

- 매번 같은 파일 읽기
- 모든 Tool을 순차 실행
- 큰 파일 전체를 메모리에 로드
- LLM에게 모든 결정 위임

### 6. 보안

**✅ Do:**

- 파일 경로 검증 (Path Traversal 방지)
- 명령어 실행 시 입력 검증
- 민감한 데이터 로그에서 제외
- Tool 권한 최소화 (Principle of Least Privilege)

**❌ Don't:**

- 사용자 입력을 그대로 파일 경로로 사용
- Shell 명령어에 사용자 입력 직접 삽입
- API 키, 토큰을 로그에 출력
- Root 권한으로 Tool 실행

## 참고 자료

### Skills 문서

- `.claude/skills/langgraph-agent/SKILL.md`: LangGraph Agent 패턴
- `.claude/skills/mcp-integration/SKILL.md`: MCP 통합
- `.claude/skills/rag-vector-search/SKILL.md`: RAG 구현
- `.claude/skills/extension-development/SKILL.md`: Extension 개발

### 실제 구현 예시

- `lib/langgraph/graphs/`: Agent 그래프 구현
- `extensions/browser/agents/`: Browser Agent
- `extensions/editor/agents/`: Editor Agent
- `extensions/presentation/lib/ppt-agent.ts`: Presentation Agent

### 외부 문서

- LangGraph: https://langchain-ai.github.io/langgraph/
- MCP: https://modelcontextprotocol.io/
- Anthropic API: https://docs.anthropic.com/

## 요약

SEPilot Desktop의 AI Agent는:

1. **LangGraph 기반**: 반복적인 워크플로우로 복잡한 작업 수행
2. **Tool 활용**: Builtin + MCP Tools로 다양한 작업 실행
3. **Human-in-the-Loop**: 중요한 작업은 사용자 승인 필요
4. **스트리밍**: 실시간 피드백으로 사용자 경험 향상
5. **RAG 통합**: 프로젝트 문서를 기반으로 정확한 답변
6. **Extension 시스템**: 모듈화된 Agent 개발 가능

**핵심 원칙:**

- 명확한 Agent 설계 (하나의 목적, 하나의 Agent)
- 안전한 Tool 실행 (입력 검증, 에러 처리)
- 사용자 중심 (Human-in-the-Loop, 명확한 피드백)
- 성능 최적화 (캐싱, 병렬 실행, 스트리밍)
- 보안 우선 (경로 검증, 권한 최소화)

이 가이드를 참고하여 강력하고 안전한 AI Agent를 개발하세요!
