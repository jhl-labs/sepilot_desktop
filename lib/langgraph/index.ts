/**
 * LangGraph 통합 - 메인 엔트리 포인트
 *
 * 주의: 이 파일은 Electron Main Process에서만 사용됩니다.
 * 브라우저 환경에서는 dynamic import로만 로드해야 합니다.
 */

// 타입만 export (브라우저에서도 안전)
export * from './types';
// State 타입은 client-types에서 정의됨 (state.ts는 런타임 코드 포함)

// 그래프 생성 함수들은 dynamic import 필요
import type { Message } from '@/types';
import type { GraphType, GraphOptions, StreamEvent, ThinkingMode, GraphConfig, ToolApprovalCallback } from './types';

/**
 * 그래프 팩토리 - LangGraph StateGraph를 사용한 그래프 관리
 *
 * 주의: 이 클래스는 Electron 환경에서만 사용해야 합니다.
 */
export class GraphFactory {
  // 싱글톤 패턴으로 그래프 인스턴스 재사용 (Lazy initialization)
  private static _chatGraph: any = null;
  private static _ragGraph: any = null;
  private static _agentGraph: any = null;
  private static _sequentialGraph: any = null;
  private static _treeOfThoughtGraph: any = null;
  private static _deepThinkingGraph: any = null;
  private static _codingAgentGraph: any = null;
  private static _browserAgentGraph: any = null;
  private static _editorAgentGraph: any = null;

  // Lazy getters with dynamic imports
  private static async getChatGraph() {
    if (!this._chatGraph) {
      const { createChatGraph } = await import('./graphs/chat');
      this._chatGraph = createChatGraph();
    }
    return this._chatGraph;
  }

  private static async getRAGGraph() {
    if (!this._ragGraph) {
      const { createRAGGraph } = await import('./graphs/rag');
      this._ragGraph = createRAGGraph();
    }
    return this._ragGraph;
  }

  private static async getAgentGraph() {
    if (!this._agentGraph) {
      const { createAgentGraph } = await import('./graphs/agent');
      this._agentGraph = createAgentGraph();
    }
    return this._agentGraph;
  }

  private static async getSequentialGraph() {
    if (!this._sequentialGraph) {
      const { createSequentialThinkingGraph } = await import('./graphs/sequential-thinking');
      this._sequentialGraph = createSequentialThinkingGraph();
    }
    return this._sequentialGraph;
  }

  private static async getTreeOfThoughtGraph() {
    if (!this._treeOfThoughtGraph) {
      const { createTreeOfThoughtGraph } = await import('./graphs/tree-of-thought');
      this._treeOfThoughtGraph = createTreeOfThoughtGraph();
    }
    return this._treeOfThoughtGraph;
  }

  private static async getDeepThinkingGraph() {
    if (!this._deepThinkingGraph) {
      const { createDeepThinkingGraph } = await import('./graphs/deep-thinking');
      this._deepThinkingGraph = createDeepThinkingGraph();
    }
    return this._deepThinkingGraph;
  }

  private static async getCodingAgentGraph() {
    if (!this._codingAgentGraph) {
      const { createCodingAgentGraph } = await import('./graphs/coding-agent');
      this._codingAgentGraph = createCodingAgentGraph();
    }
    return this._codingAgentGraph;
  }

  private static async getBrowserAgentGraph() {
    if (!this._browserAgentGraph) {
      const { createBrowserAgentGraph } = await import('./graphs/browser-agent');
      this._browserAgentGraph = createBrowserAgentGraph();
    }
    return this._browserAgentGraph;
  }

  private static async getEditorAgentGraph() {
    if (!this._editorAgentGraph) {
      const { createEditorAgentGraph } = await import('./graphs/editor-agent');
      this._editorAgentGraph = createEditorAgentGraph();
    }
    return this._editorAgentGraph;
  }

  /**
   * GraphConfig에 따라 적절한 그래프 선택
   */
  static async getGraphByConfig(config: GraphConfig) {
    // Thinking Mode에 따른 기본 그래프 선택
    let baseGraph;
    let baseState;

    switch (config.thinkingMode) {
      case 'instant':
        // Instant: RAG와 Tools 토글에 따라 선택
        if (config.enableRAG && config.enableTools) {
          // RAG + Tools: Agent 그래프 사용 (툴도 사용 가능하고 RAG도 포함)
          baseGraph = await this.getAgentGraph();
          baseState = 'agent';
        } else if (config.enableRAG) {
          // RAG만: RAG 그래프
          baseGraph = await this.getRAGGraph();
          baseState = 'rag';
        } else if (config.enableTools) {
          // Tools만: Agent 그래프
          baseGraph = await this.getAgentGraph();
          baseState = 'agent';
        } else {
          // 둘 다 없음: 기본 Chat 그래프
          baseGraph = await this.getChatGraph();
          baseState = 'chat';
        }
        break;

      case 'sequential':
        baseGraph = await this.getSequentialGraph();
        baseState = 'chat';
        break;

      case 'tree-of-thought':
        baseGraph = await this.getTreeOfThoughtGraph();
        baseState = 'tree-of-thought';
        break;

      case 'deep':
        baseGraph = await this.getDeepThinkingGraph();
        baseState = 'deep';
        break;

      case 'coding':
        baseGraph = await this.getCodingAgentGraph();
        baseState = 'coding-agent';
        break;

      case 'browser-agent':
        baseGraph = await this.getBrowserAgentGraph();
        baseState = 'browser-agent';
        break;

      default:
        baseGraph = await this.getChatGraph();
        baseState = 'chat';
    }

    return { graph: baseGraph, stateType: baseState };
  }

  /**
   * GraphType에 따라 적절한 그래프 반환 (하위 호환성)
   * @deprecated Use getGraphByConfig instead
   */
  static async getGraph(type: GraphType) {
    switch (type) {
      case 'chat':
        return await this.getChatGraph();
      case 'rag':
        return await this.getRAGGraph();
      case 'agent':
        return await this.getAgentGraph();
      default:
        throw new Error(`Unknown graph type: ${type}`);
    }
  }

  /**
   * 그래프 타입에 따라 초기 상태 생성
   * @param type 그래프 타입
   * @param messages 메시지 목록
   * @param conversationId 대화 ID (동시 대화 시 스트리밍 격리용)
   */
  static async createInitialState(
    type: GraphType | ThinkingMode | string,
    messages: Message[] = [],
    conversationId: string = ''
  ) {
    const { createInitialChatState, createInitialRAGState, createInitialAgentState, createInitialCodingAgentState } = await import(
      './state'
    );

    switch (type) {
      case 'chat':
      case 'instant':
      case 'sequential':
        return createInitialChatState(messages, conversationId);
      case 'rag':
        return createInitialRAGState(messages, conversationId);
      case 'agent':
        return createInitialAgentState(messages, conversationId);
      case 'tree-of-thought':
        return createInitialChatState(messages, conversationId); // Tree of Thought는 자체 상태 사용
      case 'deep':
        return createInitialChatState(messages, conversationId); // Deep Thinking은 자체 상태 사용
      case 'coding':
      case 'coding-agent':
        return createInitialCodingAgentState(messages, conversationId);
      case 'browser-agent':
        return createInitialAgentState(messages, conversationId);
      default:
        return createInitialChatState(messages, conversationId);
    }
  }

  /**
   * 그래프 실행 (스트리밍 없이) - 새로운 GraphConfig 기반
   */
  static async invokeWithConfig(
    config: GraphConfig,
    messages: Message[],
    _options?: GraphOptions
  ): Promise<Message[]> {
    const { graph, stateType } = await this.getGraphByConfig(config);
    const initialState = await this.createInitialState(stateType, messages);

    const result = await graph.invoke(initialState, {
      recursionLimit: 100, // Deep thinking 등을 위해 증가
    });

    return result.messages;
  }

  /**
   * 그래프 실행 (스트리밍) - 새로운 GraphConfig 기반
   *
   * LangGraph의 stream 메서드를 사용하여 실시간 업데이트 제공
   */
  static async *streamWithConfig(
    config: GraphConfig,
    messages: Message[],
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const conversationId = options?.conversationId || '';

    // Browser Agent의 경우 BrowserAgentGraph 인스턴스를 직접 사용 (Human-in-the-loop 지원)
    if (config.thinkingMode === 'browser-agent') {
      yield* this.streamBrowserAgentGraph(config, messages, options);
      return;
    }

    // Coding Agent의 경우 CodingAgentGraph 인스턴스를 직접 사용 (Human-in-the-loop 지원)
    if (config.thinkingMode === 'coding') {
      yield* this.streamCodingAgentGraph(config, messages, options);
      return;
    }

    // Agent 그래프의 경우 AgentGraph 인스턴스를 직접 사용 (Human-in-the-loop 지원)
    if (config.enableTools) {
      yield* this.streamAgentGraph(config, messages, options);
      return;
    }

    const { graph, stateType } = await this.getGraphByConfig(config);
    const initialState = await this.createInitialState(stateType, messages, conversationId);

    try {
      console.log('[GraphFactory] Starting stream with config:', config);
      console.log('[GraphFactory] Using state type:', stateType);

      const stream = await graph.stream(initialState, {
        recursionLimit: 100,
      });

      for await (const event of stream) {
        const entries = Object.entries(event);

        if (entries.length > 0) {
          const [nodeName, stateUpdate] = entries[0];

          yield {
            type: 'node',
            node: nodeName,
            data: stateUpdate,
          };
        }
      }

      yield {
        type: 'end',
      };
    } catch (error: any) {
      console.error('[GraphFactory] Stream error:', error);

      yield {
        type: 'error',
        error: error.message || 'Graph execution failed',
      };
    }
  }

  /**
   * Coding Agent 그래프 스트리밍 (Human-in-the-loop 지원)
   * CodingAgentGraph 클래스의 stream 메서드를 직접 사용
   */
  private static async *streamCodingAgentGraph(
    config: GraphConfig,
    messages: Message[],
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const conversationId = options?.conversationId || '';

    try {
      console.log('[GraphFactory] Starting coding agent stream with Human-in-the-loop support');

      const { CodingAgentGraph } = await import('./graphs/coding-agent');
      const { createInitialCodingAgentState } = await import('./state');

      const codingAgentGraph = new CodingAgentGraph();
      const initialState = createInitialCodingAgentState(messages, conversationId);

      // Use the CodingAgentGraph's stream method with tool approval callback
      for await (const event of codingAgentGraph.stream(
        initialState,
        options?.toolApprovalCallback
      )) {
        // Handle tool_approval_request and tool_approval_result events
        if (event.type === 'tool_approval_request') {
          yield {
            type: 'tool_approval_request',
            messageId: event.messageId,
            toolCalls: event.toolCalls,
          };
          continue;
        }

        if (event.type === 'tool_approval_result') {
          yield {
            type: 'tool_approval_result',
            approved: event.approved,
          };
          continue;
        }

        // Handle node events
        if (event.type === 'node') {
          yield {
            type: 'node',
            node: event.node,
            data: event.data,
          };
          continue;
        }

        // Handle error events
        if (event.type === 'error') {
          yield {
            type: 'error',
            error: event.error,
          };
          continue;
        }
      }

      yield {
        type: 'end',
      };
    } catch (error: any) {
      console.error('[GraphFactory] Coding agent stream error:', error);

      yield {
        type: 'error',
        error: error.message || 'Coding agent graph execution failed',
      };
    }
  }

  /**
   * Browser Agent 그래프 스트리밍 (자동 도구 실행)
   * BrowserAgentGraph 클래스의 stream 메서드를 직접 사용
   */
  // Browser Agent 인스턴스 저장 (중단 기능을 위해)
  private static activeBrowserAgentGraphs = new Map<string, any>();

  private static async *streamBrowserAgentGraph(
    config: GraphConfig,
    messages: Message[],
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const conversationId = options?.conversationId || '';

    try {
      console.log('[GraphFactory] Starting browser agent stream (automatic tool execution)');

      const { BrowserAgentGraph } = await import('./graphs/browser-agent');
      const { createInitialAgentState } = await import('./state');

      const browserAgentGraph = new BrowserAgentGraph();
      const initialState = createInitialAgentState(messages, conversationId);

      // Store instance for cancellation
      if (conversationId) {
        this.activeBrowserAgentGraphs.set(conversationId, browserAgentGraph);
      }

      // Use the BrowserAgentGraph's stream method (no tool approval needed)
      for await (const event of browserAgentGraph.stream(
        initialState,
        options?.maxIterations || 30 // Browser tasks often need more iterations
      )) {
        // Handle progress events
        if (event.progress) {
          yield {
            type: 'progress',
            data: event.progress,
          };
          continue;
        }

        // Handle regular node events
        const entries = Object.entries(event);
        if (entries.length > 0) {
          const [nodeName, stateUpdate] = entries[0];

          yield {
            type: 'node',
            node: nodeName,
            data: stateUpdate,
          };
        }
      }

      // Remove from active graphs
      if (conversationId) {
        this.activeBrowserAgentGraphs.delete(conversationId);
      }

      yield {
        type: 'end',
      };
    } catch (error: any) {
      console.error('[GraphFactory] Browser agent stream error:', error);

      yield {
        type: 'error',
        error: error.message || 'Browser agent graph execution failed',
      };
    }
  }

  /**
   * Agent 그래프 스트리밍 (Human-in-the-loop 지원)
   * AgentGraph 클래스의 stream 메서드를 직접 사용
   */
  private static async *streamAgentGraph(
    config: GraphConfig,
    messages: Message[],
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const conversationId = options?.conversationId || '';

    try {
      console.log('[GraphFactory] Starting agent stream with Human-in-the-loop support');

      const { AgentGraph } = await import('./graphs/agent');
      const { createInitialAgentState } = await import('./state');

      const agentGraph = new AgentGraph();
      const initialState = createInitialAgentState(messages, conversationId);

      // Use the AgentGraph's stream method with tool approval callback
      for await (const event of agentGraph.stream(
        initialState,
        options?.maxIterations || 10,
        options?.toolApprovalCallback
      )) {
        // Handle tool_approval_request and tool_approval_result events
        if (event.type === 'tool_approval_request') {
          yield {
            type: 'tool_approval_request',
            messageId: event.messageId,
            toolCalls: event.toolCalls,
          };
          continue;
        }

        if (event.type === 'tool_approval_result') {
          yield {
            type: 'tool_approval_result',
            approved: event.approved,
          };
          continue;
        }

        // Handle regular node events
        const entries = Object.entries(event);
        if (entries.length > 0) {
          const [nodeName, stateUpdate] = entries[0];

          yield {
            type: 'node',
            node: nodeName,
            data: stateUpdate,
          };
        }
      }

      yield {
        type: 'end',
      };
    } catch (error: any) {
      console.error('[GraphFactory] Agent stream error:', error);

      yield {
        type: 'error',
        error: error.message || 'Agent graph execution failed',
      };
    }
  }

  /**
   * 그래프 실행 (스트리밍 없이) - 하위 호환성
   * @deprecated Use invokeWithConfig instead
   */
  static async invoke(
    type: GraphType,
    messages: Message[],
    _options?: GraphOptions
  ): Promise<Message[]> {
    const graph = await this.getGraph(type);
    const initialState = await this.createInitialState(type, messages);

    const result = await graph.invoke(initialState, {
      recursionLimit: 50,
    });

    return result.messages;
  }

  /**
   * 그래프 실행 (스트리밍) - 하위 호환성
   * @deprecated Use streamWithConfig instead
   *
   * LangGraph의 stream 메서드를 사용하여 실시간 업데이트 제공
   */
  static async *stream(
    type: GraphType,
    messages: Message[],
    _options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const graph = await this.getGraph(type);
    const initialState = await this.createInitialState(type, messages);

    try {
      const stream = await graph.stream(initialState, {
        recursionLimit: 50,
      });

      for await (const event of stream) {
        const entries = Object.entries(event);

        if (entries.length > 0) {
          const [nodeName, stateUpdate] = entries[0];

          yield {
            type: 'node',
            node: nodeName,
            data: stateUpdate,
          };
        }
      }

      yield {
        type: 'end',
      };
    } catch (error: any) {
      console.error('[GraphFactory] Stream error:', error);

      yield {
        type: 'error',
        error: error.message || 'Graph execution failed',
      };
    }
  }

  /**
   * Editor Agent 스트리밍 실행
   */
  static async *streamEditorAgent(
    initialState: any,
    toolApprovalCallback?: ToolApprovalCallback
  ): AsyncGenerator<any> {
    console.log('[GraphFactory] Starting Editor Agent stream');

    try {
      const graph = await this.getEditorAgentGraph();

      for await (const event of graph.stream(initialState, toolApprovalCallback)) {
        yield event;
      }
    } catch (error: any) {
      console.error('[GraphFactory] Editor Agent stream error:', error);

      yield {
        type: 'error',
        error: error.message || 'Editor Agent execution failed',
      };
    }
  }

  /**
   * Browser Agent 중단
   */
  static stopBrowserAgent(conversationId: string): boolean {
    const browserAgentGraph = this.activeBrowserAgentGraphs.get(conversationId);
    if (browserAgentGraph) {
      console.log('[GraphFactory] Stopping Browser Agent for conversation:', conversationId);
      browserAgentGraph.stop();
      this.activeBrowserAgentGraphs.delete(conversationId);
      return true;
    }
    console.warn('[GraphFactory] No active Browser Agent found for conversation:', conversationId);
    return false;
  }
}
