/**
 * LangGraph 통합 - 메인 엔트리 포인트
 */

export * from './types';
export * from './state';
export * from './graphs/chat';
export * from './graphs/rag';
export * from './graphs/agent';

import { createChatGraph } from './graphs/chat';
import { createRAGGraph } from './graphs/rag';
import { createAgentGraph } from './graphs/agent';
import { GraphType, GraphOptions, StreamEvent } from './types';
import { createInitialChatState, createInitialRAGState, createInitialAgentState } from './state';
import { Message } from '@/types';

/**
 * 그래프 팩토리
 */
export class GraphFactory {
  private static chatGraph = createChatGraph();
  private static ragGraph = createRAGGraph();
  private static agentGraph = createAgentGraph();

  /**
   * 그래프 타입에 따라 적절한 그래프 반환
   */
  static getGraph(type: GraphType) {
    switch (type) {
      case 'chat':
        return this.chatGraph;
      case 'rag':
        return this.ragGraph;
      case 'agent':
        return this.agentGraph;
      default:
        throw new Error(`Unknown graph type: ${type}`);
    }
  }

  /**
   * 그래프 타입에 따라 초기 상태 생성
   */
  static createInitialState(type: GraphType, messages: Message[] = []) {
    switch (type) {
      case 'chat':
        return createInitialChatState(messages);
      case 'rag':
        return createInitialRAGState(messages);
      case 'agent':
        return createInitialAgentState(messages);
      default:
        throw new Error(`Unknown graph type: ${type}`);
    }
  }

  /**
   * 그래프 실행 (스트리밍 없이)
   */
  static async invoke(
    type: GraphType,
    messages: Message[],
    _options?: GraphOptions
  ): Promise<Message[]> {
    const graph = this.getGraph(type);
    const initialState = this.createInitialState(type, messages) as any;

    const result = await graph.invoke(initialState);

    return result.messages;
  }

  /**
   * 그래프 실행 (스트리밍)
   */
  static async *stream(
    type: GraphType,
    messages: Message[],
    _options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const graph = this.getGraph(type);
    const initialState = this.createInitialState(type, messages) as any;

    try {
      for await (const event of graph.stream(initialState)) {
        // 이벤트 형식: { node_name: state_update }
        const [nodeName, stateUpdate] = Object.entries(event)[0];

        yield {
          type: 'node',
          node: nodeName,
          data: stateUpdate,
        };
      }

      yield {
        type: 'end',
      };
    } catch (error: any) {
      yield {
        type: 'error',
        error: error.message || 'Graph execution failed',
      };
    }
  }
}
