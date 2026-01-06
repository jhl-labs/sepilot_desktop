---
name: LangGraph Agent Integration
description: >
  Expert knowledge of LangGraph agent patterns for SEPilot Desktop.
  Use when implementing AI agents, graph-based workflows, or complex
  multi-step reasoning. Ensures proper integration with existing LangGraph
  infrastructure and streaming patterns.
---

# LangGraph Agent Integration Skill

## Architecture Overview

SEPilot Desktop uses LangGraph for complex AI agent workflows:

- **Location**: `lib/langgraph/` contains agent implementations
- **Graphs**: Deep thinking, sequential reasoning, tree-of-thought
- **Streaming**: Real-time node execution updates via IPC
- **State Management**: Persistent conversation threads

## Available Agent Types

### Deep Thinking Graph

복잡한 문제 해결을 위한 다단계 추론:

```typescript
import { DeepThinkingGraph } from '@/lib/langgraph/deep-thinking';

const graph = new DeepThinkingGraph({
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0.7,
});

const result = await graph.execute({
  prompt: '복잡한 문제를 분석해주세요',
  conversationId: 'conv-123',
});
```

### Sequential Graph

순차적 작업 실행:

```typescript
import { SequentialGraph } from '@/lib/langgraph/sequential';

const graph = new SequentialGraph({
  steps: [
    { name: 'analyze', prompt: '먼저 분석' },
    { name: 'plan', prompt: '그 다음 계획' },
    { name: 'execute', prompt: '마지막 실행' },
  ],
});
```

### Tree of Thought Graph

다양한 접근 방식 탐색:

```typescript
import { TreeOfThoughtGraph } from '@/lib/langgraph/tree-of-thought';

const graph = new TreeOfThoughtGraph({
  branches: 3, // 3가지 다른 접근 방식 시도
  depth: 2, // 각 접근 방식을 2단계 깊이로 탐색
});
```

## IPC Integration Pattern

### Backend Handler

```typescript
// electron/ipc/handlers/langgraph.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DeepThinkingGraph } from '@/lib/langgraph/deep-thinking';

export function setupLangGraphHandlers() {
  ipcMain.handle(
    'langgraph:execute',
    async (
      event: IpcMainInvokeEvent,
      request: {
        graphType: 'deep-thinking' | 'sequential' | 'tree-of-thought';
        prompt: string;
        conversationId: string;
        config?: GraphConfig;
      }
    ) => {
      const graph = createGraph(request.graphType, request.config);

      // Stream node executions
      graph.on('node:start', (node) => {
        event.sender.send('langgraph:node:start', {
          conversationId: request.conversationId,
          node: node.name,
        });
      });

      graph.on('node:complete', (node, output) => {
        event.sender.send('langgraph:node:complete', {
          conversationId: request.conversationId,
          node: node.name,
          output,
        });
      });

      graph.on('chunk', (chunk) => {
        event.sender.send('langgraph:chunk', {
          conversationId: request.conversationId,
          chunk,
        });
      });

      try {
        const result = await graph.execute({
          prompt: request.prompt,
          conversationId: request.conversationId,
        });

        return { success: true, result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );
}
```

### Frontend Usage

```typescript
// components/AgentChat.tsx
import { useEffect, useState } from 'react';

export function AgentChat() {
  const [streaming, setStreaming] = useState(false);
  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    // Listen to streaming events
    const handleNodeStart = (data: { node: string }) => {
      setCurrentNode(data.node);
    };

    const handleNodeComplete = (data: { node: string; output: string }) => {
      setMessages((prev) => [...prev, `[${data.node}] ${data.output}`]);
    };

    const handleChunk = (data: { chunk: string }) => {
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] += data.chunk;
        return newMessages;
      });
    };

    window.electron.on('langgraph:node:start', handleNodeStart);
    window.electron.on('langgraph:node:complete', handleNodeComplete);
    window.electron.on('langgraph:chunk', handleChunk);

    return () => {
      window.electron.off('langgraph:node:start', handleNodeStart);
      window.electron.off('langgraph:node:complete', handleNodeComplete);
      window.electron.off('langgraph:chunk', handleChunk);
    };
  }, []);

  const executeAgent = async (prompt: string): Promise<void> => {
    setStreaming(true);
    try {
      const result = await window.electron.invoke('langgraph:execute', {
        graphType: 'deep-thinking',
        prompt,
        conversationId: 'conv-123',
      });

      if (!result.success) {
        console.error('Agent execution failed:', result.error);
      }
    } finally {
      setStreaming(false);
      setCurrentNode(null);
    }
  };

  return (
    <div>
      {streaming && currentNode && <div>현재 실행 중: {currentNode}</div>}
      <div>
        {messages.map((msg, i) => (
          <div key={i}>{msg}</div>
        ))}
      </div>
    </div>
  );
}
```

## Creating Custom Agents

### Define Graph Structure

```typescript
// lib/langgraph/custom-agent.ts
import { StateGraph } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

interface AgentState {
  messages: BaseMessage[];
  currentStep: string;
  result?: string;
}

export class CustomAgent {
  private graph: StateGraph<AgentState>;

  constructor(config: AgentConfig) {
    this.graph = new StateGraph<AgentState>({
      channels: {
        messages: { value: (x, y) => x.concat(y) },
        currentStep: { value: (x, y) => y ?? x },
        result: { value: (x, y) => y ?? x },
      },
    });

    this.buildGraph();
  }

  private buildGraph(): void {
    // Define nodes
    this.graph.addNode('analyze', this.analyzeNode.bind(this));
    this.graph.addNode('execute', this.executeNode.bind(this));
    this.graph.addNode('summarize', this.summarizeNode.bind(this));

    // Define edges
    this.graph.addEdge('analyze', 'execute');
    this.graph.addEdge('execute', 'summarize');

    // Set entry point
    this.graph.setEntryPoint('analyze');
  }

  private async analyzeNode(state: AgentState): Promise<Partial<AgentState>> {
    // Implementation
    return { currentStep: 'analyze' };
  }

  private async executeNode(state: AgentState): Promise<Partial<AgentState>> {
    // Implementation
    return { currentStep: 'execute' };
  }

  private async summarizeNode(state: AgentState): Promise<Partial<AgentState>> {
    // Implementation
    return { currentStep: 'summarize', result: 'final result' };
  }

  async execute(input: { prompt: string }): Promise<AgentState> {
    const compiled = this.graph.compile();
    return await compiled.invoke({
      messages: [{ role: 'user', content: input.prompt }],
      currentStep: 'start',
    });
  }
}
```

## Agent Configuration

```typescript
interface GraphConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[]; // MCP tools to enable
  memory?: {
    type: 'conversation' | 'summary';
    maxMessages?: number;
  };
}

const config: GraphConfig = {
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0.7,
  maxTokens: 4000,
  tools: ['web-search', 'calculator'],
  memory: {
    type: 'conversation',
    maxMessages: 10,
  },
};
```

## State Persistence

```typescript
// Save agent state
await window.electron.invoke('langgraph:save-state', {
  conversationId: 'conv-123',
  state: agentState,
});

// Load agent state
const state = await window.electron.invoke('langgraph:load-state', {
  conversationId: 'conv-123',
});
```

## Error Handling

```typescript
try {
  const result = await graph.execute({ prompt });
} catch (error) {
  if (error instanceof LangGraphError) {
    // Handle LangGraph-specific errors
    console.error('Graph execution failed:', error.node, error.message);
  } else if (error instanceof LLMError) {
    // Handle LLM errors
    console.error('LLM call failed:', error.message);
  } else {
    // Generic error
    console.error('Unknown error:', error);
  }
}
```

## Best Practices

1. **Node Design**: 각 노드는 단일 책임만 가져야 함
2. **State Management**: 상태를 불변 객체로 관리
3. **Error Boundaries**: 각 노드에서 에러 처리
4. **Streaming**: 긴 작업은 반드시 스트리밍으로 처리
5. **Memory**: 메모리 사용량을 고려하여 메시지 제한 설정
6. **Testing**: 각 노드를 독립적으로 테스트

## Integration with MCP

LangGraph agents can use MCP tools:

```typescript
const graph = new DeepThinkingGraph({
  tools: ['mcp:brave-search', 'mcp:filesystem'],
});
```

See `mcp-integration` skill for more details.

## Real-World Example

기존 구현 참고:

- `lib/langgraph/deep-thinking.ts` - 복잡한 추론 그래프
- `electron/ipc/handlers/langgraph.ts` - IPC 통합
- `components/AgentChat.tsx` - 프론트엔드 통합 (예정)
