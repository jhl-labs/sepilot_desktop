# LangGraph 통합 - BaseGraph 상속 구조

SEPilot Desktop의 LangGraph 기반 에이전트 시스템입니다. BaseGraph 추상 클래스를 통해 11개 그래프가 통합된 구조로 관리됩니다.

## 📋 목차

- [개요](#개요)
- [아키텍처](#아키텍처)
- [그래프 목록](#그래프-목록)
- [빠른 시작](#빠른-시작)
- [새 그래프 만들기](#새-그래프-만들기)
- [고급 기능](#고급-기능)

## 개요

**주요 특징:**

- ✅ **BaseGraph 추상 클래스**: 공통 기능 통합 (Skills 주입, 스트리밍, 언어 설정 등)
- ✅ **GraphRegistry**: 싱글톤 패턴으로 그래프 관리
- ✅ **GraphFactory**: 설정 기반 그래프 선택 및 실행
- ✅ **11개 그래프**: Chat, RAG, Agent, Thinking (3종), Coding, DeepWebResearch, Extension (3종)
- ✅ **타입 안전**: TypeScript strict mode 완벽 지원
- ✅ **Human-in-the-loop**: 도구 승인 콜백 지원

**코드 감소 효과:**

- 전체 코드: ~3,500 lines → ~1,450 lines (59% 감소)
- index.ts: 856 lines → 27 lines (97% 감소)
- 공통 로직 재사용: BaseGraph 메서드 11개 그래프에서 활용

## 아키텍처

### 클래스 계층 구조

```
BaseGraph<TState> (추상)
├── ChatGraph
├── RAGGraph
├── AgentGraph
│   ├── CodingAgentGraph
│   ├── BrowserAgentGraph
│   ├── EditorAgentGraph
│   ├── TerminalAgentGraph
│   └── DeepWebResearchGraph
└── ThinkingGraph<TState> (추상)
    ├── SequentialThinkingGraph
    ├── DeepThinkingGraph
    └── TreeOfThoughtGraph
```

### 주요 컴포넌트

**1. BaseGraph** (`lib/langgraph/base/base-graph.ts`)

모든 그래프의 기본 클래스:

```typescript
export abstract class BaseGraph<TState extends BaseState> {
  // 추상 메서드 (하위 클래스에서 구현 필수)
  protected abstract createStateAnnotation(): any;
  protected abstract buildNodes(workflow: StateGraph<any>): any;
  protected abstract buildEdges(workflow: any): any;

  // 공통 메서드
  protected async injectSkills(state: TState): Promise<Message[]>;
  protected emitChunk(chunk: string, conversationId?: string): void;
  protected async getUserLanguage(context?: string): Promise<SupportedLanguage>;
  protected getLanguageInstruction(language: SupportedLanguage): string;
  protected async *streamLLM(messages: Message[], options?: LLMOptions): AsyncGenerator<string>;

  // 템플릿 메서드
  public compile(): CompiledStateGraph;
  public async invoke(initialState: TState, options?: GraphExecutionOptions): Promise<TState>;
  public async *stream(initialState: TState, options?: GraphExecutionOptions): AsyncGenerator<any>;
}
```

**2. GraphRegistry** (`lib/langgraph/factory/graph-registry.ts`)

그래프 등록 및 관리:

```typescript
const registry = GraphRegistry.getInstance();

// 그래프 등록
registry.register('chat', ChatGraph);

// 그래프 조회 (Singleton 캐싱)
const chatGraph = registry.get('chat');

// 등록된 키 목록
const keys = registry.getKeys(); // ['chat', 'rag', 'agent', ...]
```

**3. GraphFactory** (`lib/langgraph/factory/graph-factory.ts`)

설정 기반 그래프 선택 및 실행:

```typescript
// 초기화 (애플리케이션 시작 시 한 번만)
await GraphFactory.initialize();

// 그래프 선택
const { graph, stateType } = await GraphFactory.getGraphByConfig({
  thinkingMode: 'sequential',
  enableRAG: true,
  enableTools: false,
});

// 스트리밍 실행
for await (const event of GraphFactory.streamWithConfig(config, messages, options)) {
  if (event.type === 'node') {
    console.log('Node:', event.node, 'Data:', event.data);
  }
}
```

## 그래프 목록

### 기본 그래프

**1. ChatGraph** (`lib/langgraph/graphs/chat-graph.ts`)

기본 채팅 그래프 (RAG, Tools 없음):

```
START → generate → END
```

**2. RAGGraph** (`lib/langgraph/graphs/rag-graph.ts`)

문서 검색 기반 응답:

```
START → retrieve → rerank → generate → END
```

**3. AgentGraph** (`lib/langgraph/graphs/agent-graph.ts`)

도구 사용 에이전트 (Human-in-the-loop 지원):

```
START → generate → [decision]
          ├─ tools → generate (루프)
          └─ END
```

**특징:**

- Tool approval callback 지원
- 중복 도구 호출 감지
- 도구별 빈도 제한 (5회)
- 최대 50 iterations

### Thinking 그래프

**4. SequentialThinkingGraph** (`lib/langgraph/graphs/sequential-thinking-graph.ts`)

5단계 순차 사고:

```
Research → Analyze → Plan → Execute → Synthesize
```

**5. DeepThinkingGraph** (`lib/langgraph/graphs/deep-thinking-graph.ts`)

6단계 심층 사고 + 4개 관점 분석:

```
Research → Initial Analysis → Explore Perspectives (4개) → Deep Analysis → Integrate & Verify → Final Synthesis
```

**6. TreeOfThoughtGraph** (`lib/langgraph/graphs/tree-of-thought-graph.ts`)

다중 경로 탐색:

```
Research → Decompose → Generate Branches (3개) → Evaluate → Synthesize
```

### 복잡한 그래프

**7. CodingAgentGraph** (`lib/langgraph/graphs/coding-agent-graph.ts`)

코드 생성/수정 에이전트 (9개 노드):

```
triage → [direct_response OR planner → iteration_guard → agent → approval → tools → verifier → iteration_guard → reporter]
```

**특징:**

- FileTracker: 파일 변경 추적
- 위험 명령어 차단 (rm -rf 등)
- 반복 제어 (최대 50회)

**8. DeepWebResearchGraph** (`lib/langgraph/graphs/deep-web-research-graph.ts`)

웹 검색 기반 심층 조사:

```
plan → checkPlan → [search → plan (최대 3회) OR synthesize]
```

**9. BrowserAgentGraph** (`extensions/browser/agents/browser-agent-graph.ts`)

브라우저 자동화:

```
START → generate → [tools → generate (루프) OR END]
```

**10. EditorAgentGraph** (`extensions/editor/agents/editor-agent-graph.ts`)

에디터 자동완성/Code Action:

```
START → generate (RAG + Tools) → [tools → generate (루프) OR END]
```

**특징:**

- RAG 자동 통합
- 3가지 액션: autocomplete, code-action, writing-tool

**11. TerminalAgentGraph** (`extensions/terminal/agents/terminal-agent-graph.ts`)

터미널 명령어 실행:

```
START → generate (Terminal Tools) → [tools → generate (루프) OR END]
```

**특징:**

- 플랫폼별 프롬프트 (Windows PowerShell / Unix/Linux)
- 4개 도구: run_command, get_history, search_commands, explain_error

## 빠른 시작

### 1. GraphFactory 사용 (권장)

```typescript
import { GraphFactory } from '@/lib/langgraph';
import type { GraphConfig } from '@/lib/langgraph';

// 초기화
await GraphFactory.initialize();

// 설정
const config: GraphConfig = {
  thinkingMode: 'sequential',
  enableRAG: true,
  enableTools: false,
  workingDirectory: '/path/to/project',
};

// 메시지
const messages = [
  { id: '1', role: 'user', content: '프로젝트 구조를 분석해줘', created_at: Date.now() },
];

// 스트리밍 실행
for await (const event of GraphFactory.streamWithConfig(config, messages)) {
  if (event.type === 'node') {
    console.log('Node:', event.node);
  } else if (event.type === 'end') {
    console.log('Complete!');
  }
}
```

### 2. 개별 그래프 사용

```typescript
import { ChatGraph, createInitialChatState } from '@/lib/langgraph';

const chatGraph = new ChatGraph();
const initialState = createInitialChatState(messages, conversationId);

// 컴파일
const compiledGraph = chatGraph.compile();

// 실행
const result = await compiledGraph.invoke(initialState);
console.log(result.messages);
```

### 3. Human-in-the-loop (도구 승인)

```typescript
import { GraphFactory } from '@/lib/langgraph';
import type { ToolCall } from '@/types';

const toolApprovalCallback = async (toolCalls: ToolCall[]) => {
  console.log('Tool calls:', toolCalls);

  // 사용자에게 승인 요청
  const approved = await askUserForApproval(toolCalls);
  return approved;
};

for await (const event of GraphFactory.streamWithConfig(config, messages, {
  toolApprovalCallback,
})) {
  if (event.type === 'tool_approval_request') {
    console.log('Waiting for approval...');
  } else if (event.type === 'tool_approval_result') {
    console.log('Approved:', event.approved);
  }
}
```

## 새 그래프 만들기

### 단계 1: 그래프 클래스 생성

```typescript
// lib/langgraph/graphs/my-graph.ts
import { StateGraph, END } from '@langchain/langgraph';
import { BaseGraph } from '@/lib/langgraph/base/base-graph';
import { AgentStateAnnotation } from '@/lib/langgraph/state';
import type { AgentState } from '@/lib/langgraph/types';

export class MyGraph extends BaseGraph<AgentState> {
  /**
   * State Annotation 생성
   */
  protected createStateAnnotation(): typeof AgentStateAnnotation {
    return AgentStateAnnotation;
  }

  /**
   * 노드 추가
   */
  protected buildNodes(workflow: StateGraph<any>): any {
    return workflow.addNode('myNode', this.myNode.bind(this));
  }

  /**
   * 엣지 추가
   */
  protected buildEdges(workflow: any): any {
    return workflow.addEdge('__start__', 'myNode').addEdge('myNode', END);
  }

  /**
   * 커스텀 노드
   */
  private async myNode(state: AgentState): Promise<Partial<AgentState>> {
    // BaseGraph 공통 메서드 활용
    const userLanguage = await this.getUserLanguage('MyGraph');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    // Skills 주입
    const messagesWithSkills = await this.injectSkills(state);

    // LLM 호출 (스트리밍)
    let content = '';
    for await (const chunk of this.streamLLM(messagesWithSkills)) {
      content += chunk;
      this.emitChunk(chunk, state.conversationId);
    }

    return {
      messages: [
        {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content,
          created_at: Date.now(),
        },
      ],
    };
  }
}
```

### 단계 2: GraphRegistry에 등록

```typescript
// lib/langgraph/factory/graph-factory.ts의 initialize() 메서드에 추가
const { MyGraph } = await import('../graphs/my-graph');
this.registry.register('my-graph', MyGraph as any);
```

### 단계 3: GraphFactory에 매핑 추가

```typescript
// getGraphKeyFromConfig() 메서드에 추가
case 'my-thinking-mode':
  return 'my-graph';
```

### 단계 4: State 생성 함수 추가 (필요시)

```typescript
// lib/langgraph/factory/graph-factory.ts의 createInitialState() 메서드에 추가
case 'my-graph':
  return createInitialAgentState(messages, conversationId);
```

## 고급 기능

### 1. ThinkingGraph 상속

다단계 사고 그래프 생성:

```typescript
import { ThinkingGraph } from '@/lib/langgraph/base/thinking-graph';
import { ChatStateAnnotation } from '@/lib/langgraph/state';
import type { ThinkingState } from '@/lib/langgraph/types';

export class MyThinkingGraph extends ThinkingGraph<ThinkingState> {
  protected createStateAnnotation() {
    return ChatStateAnnotation;
  }

  protected getStepDescription(stepName: string) {
    const steps = {
      research: { title: 'Research', emoji: '🔍', stepNumber: 0, total: 3 },
      analyze: { title: 'Analyze', emoji: '🧠', stepNumber: 1, total: 3 },
      synthesize: { title: 'Synthesize', emoji: '💡', stepNumber: 2, total: 3 },
    };
    return steps[stepName as keyof typeof steps];
  }

  protected buildNodes(workflow: StateGraph<any>): any {
    return workflow
      .addNode('research', this.createResearchNode('Research context'))
      .addNode('analyze', this.analyzeNode.bind(this))
      .addNode('synthesize', this.synthesizeNode.bind(this));
  }

  protected buildEdges(workflow: any): any {
    return workflow
      .addEdge('__start__', 'research')
      .addEdge('research', 'analyze')
      .addEdge('analyze', 'synthesize')
      .addEdge('synthesize', END);
  }

  private async analyzeNode(state: ThinkingState): Promise<Partial<ThinkingState>> {
    this.emitStepStart('analyze', state);

    const analysis = await this.streamLLMWithSystem(
      state,
      'Analyze the research findings.',
      'Provide detailed analysis.'
    );

    return {
      context: state.context + `\n\nAnalysis:\n${analysis}`,
    };
  }

  private async synthesizeNode(state: ThinkingState): Promise<Partial<ThinkingState>> {
    this.emitStepStart('synthesize', state);

    const finalAnswer = await this.streamLLMWithSystem(
      state,
      'Synthesize the analysis into a final answer.',
      'Create comprehensive final answer.'
    );

    const formattedAnswer = this.formatFinalAnswer(
      [
        { from: 'Research', to: 'Analysis' },
        { from: 'Analysis', to: 'Synthesis' },
      ],
      finalAnswer
    );

    return {
      messages: [this.createFinalMessage(formattedAnswer)],
    };
  }
}
```

### 2. 커스텀 State Annotation

```typescript
import { Annotation } from '@langchain/langgraph';
import type { Message } from '@/types';

export const MyStateAnnotation = Annotation.Root({
  messages: Annotation<Message[]>({
    reducer: (existing: Message[], updates: Message[]) => [...existing, ...updates],
    default: () => [],
  }),
  customField: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  conversationId: Annotation<string>({
    reducer: (_existing: string, update: string) => update || _existing,
    default: () => '',
  }),
});

export type MyState = typeof MyStateAnnotation.State;
```

### 3. 조건부 엣지

```typescript
protected buildEdges(workflow: any): any {
  return workflow
    .addEdge('__start__', 'myNode')
    .addConditionalEdges('myNode', this.decisionFunction.bind(this), {
      'continue': 'anotherNode',
      'end': END,
    });
}

private decisionFunction(state: AgentState): 'continue' | 'end' {
  // 조건에 따라 다음 노드 결정
  if (state.messages.length > 10) {
    return 'end';
  }
  return 'continue';
}
```

### 4. GraphRegistry 직접 사용

```typescript
import { graphRegistry } from '@/lib/langgraph';

// 통계 조회
const stats = graphRegistry.getStats();
console.log(`Registered: ${stats.registered}, Cached: ${stats.cached}`);

// 캐시 초기화
graphRegistry.clearCache();

// 전체 리셋 (테스트용)
graphRegistry.reset();
```

## 문서 링크

- [API 문서](./docs/API.md) - 상세 API 레퍼런스
- [마이그레이션 가이드](./docs/MIGRATION.md) - 기존 코드 마이그레이션 방법
- [개발 가이드](../../docs/DEVELOPMENT.md) - 프로젝트 개발 가이드

## 라이센스

MIT License - SEPilot Desktop
