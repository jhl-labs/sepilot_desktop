# Create AI Agent Prompt

LangGraph 기반 AI Agent 생성을 위한 프롬프트

## 사용 방법

1. Cursor Chat 열기 (Ctrl/Cmd + L)
2. `AGENT.md` 문서 참고
3. 아래 프롬프트를 수정하여 사용

## 프롬프트

```
SEPilot Desktop 프로젝트의 AI Agent를 생성해주세요:

**Agent 이름**: [Agent 이름]

**설명**: [Agent가 수행할 작업]

**요구사항**:
- LangGraph 기반 스트리밍 패턴
- AgentState 타입 정의
- Tool 정의 및 실행 로직
- Human-in-the-Loop (필요시 사용자 승인)
- 최대 반복 횟수 제한
- 스트리밍으로 실시간 피드백
- 에러 처리 및 로깅

**Agent State 필드**:
- [필드 1]: [타입 및 설명]
- [필드 2]: [타입 및 설명]

**사용할 Tools**:
- [Tool 1]: [설명]
- [Tool 2]: [설명]

**Agent 그래프 패턴**:
- [ ] Deep Thinking (CoT)
- [ ] Sequential Thinking
- [ ] Tree of Thought
- [x] Basic Loop (Generate → Tools → Repeat)
- [ ] Coding Agent (Planning → Execution → Verification)

다음 파일을 생성해주세요:
1. Agent 클래스: `lib/langgraph/agents/[agent-name].ts`
2. Agent State: `lib/langgraph/state/[agent-name]-state.ts`
3. Tools: `lib/langgraph/tools/[agent-name]-tools.ts`
4. 테스트: `tests/lib/langgraph/agents/[agent-name].test.ts`
```

## 예시

### Input

```
SEPilot Desktop 프로젝트의 AI Agent를 생성해주세요:

**Agent 이름**: CodeAnalyzerAgent

**설명**: 코드베이스를 분석하고 개선 사항을 제안하는 Agent

**Agent State 필드**:
- analysisResults: { issues: Issue[], suggestions: Suggestion[] }
- scannedFiles: string[]
- currentFile: string | null

**사용할 Tools**:
- file_read: 파일 내용 읽기
- grep_search: 코드 패턴 검색
- ast_parse: AST 파싱 (TypeScript/JavaScript)

**Agent 그래프 패턴**:
- [x] Sequential Thinking (1. Scan → 2. Analyze → 3. Suggest)

파일 위치: `lib/langgraph/agents/code-analyzer-agent.ts`
```

### Expected Structure

```typescript
// lib/langgraph/agents/code-analyzer-agent.ts
import { AgentState } from '@/lib/langgraph/state';
import { getLLMClient } from '@/lib/llm/client';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';
import { logger } from '@/lib/utils/logger';

export interface CodeAnalyzerAgentState extends AgentState {
  analysisResults?: {
    issues: Issue[];
    suggestions: Suggestion[];
  };
  scannedFiles?: string[];
  currentFile?: string | null;
}

export class CodeAnalyzerAgent {
  private maxIterations = 50;

  async *stream(initialState: CodeAnalyzerAgentState): AsyncGenerator<any, void, unknown> {
    let state = { ...initialState };

    // Phase 1: Scan
    emitStreamingChunk('\n🔍 **코드베이스 스캔 중...**\n', state.conversationId);
    const scanResult = await this.scanCodebase(state);
    state = { ...state, ...scanResult };

    // Phase 2: Analyze
    emitStreamingChunk('\n📊 **코드 분석 중...**\n', state.conversationId);
    const analysisResult = await this.analyzeCode(state);
    state = { ...state, ...analysisResult };

    // Phase 3: Suggest
    emitStreamingChunk('\n💡 **개선 사항 제안 중...**\n', state.conversationId);
    const suggestionsResult = await this.generateSuggestions(state);
    state = { ...state, ...suggestionsResult };

    yield { type: 'final_result', state };
  }

  // ... implementation
}
```
