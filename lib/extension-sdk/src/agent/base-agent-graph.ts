/**
 * BaseAgentGraph - Extension Agent의 추상 기본 클래스
 *
 * Host App의 BaseGraph와 동일한 템플릿 메서드 패턴이되,
 * 호스트 내부 모듈을 직접 import하지 않고 DI로 서비스를 받습니다.
 *
 * 템플릿 메서드 패턴:
 * - compile(): 그래프 컴파일 (Host의 AgentRuntime이 실행)
 * - invoke(): 동기 실행
 * - stream(): 스트리밍 실행
 *
 * 확장 포인트:
 * - createStateAnnotation(): State 구조 정의 (추상)
 * - buildNodes(): 노드 추가 (추상)
 * - buildEdges(): 엣지 추가 (추상)
 */

import type { Message } from '../types/message';
import type { LLMOptions, LLMResponse } from '../types/llm';
import type { AgentGraphServices } from './services';
import type { Logger } from '../types/extension';

/**
 * BaseState 인터페이스
 * 모든 Agent State는 최소한 이 구조를 포함해야 함
 */
export interface BaseAgentState {
  messages: Message[];
  conversationId: string;
  context?: string;
  [key: string]: any;
}

/**
 * 그래프 실행 옵션
 */
export interface AgentGraphExecutionOptions {
  maxIterations?: number;
  [key: string]: any;
}

/**
 * BaseAgentGraph 추상 클래스
 *
 * Extension Agent 개발 시 이 클래스를 상속하여 사용합니다.
 * Host App이 setServices()로 실제 서비스 구현체를 주입합니다.
 *
 * @template TState - State 타입 (BaseAgentState 확장)
 */
export abstract class BaseAgentGraph<TState extends BaseAgentState> {
  private _services: AgentGraphServices | null = null;

  /**
   * 서비스 주입 (Host App이 호출)
   */
  public setServices(services: AgentGraphServices): void {
    this._services = services;
  }

  /**
   * 주입된 서비스 접근
   */
  protected get services(): AgentGraphServices {
    if (!this._services) {
      throw new Error(
        '[BaseAgentGraph] Services not initialized. Host App must call setServices() before using the graph.'
      );
    }
    return this._services;
  }

  /**
   * 로거 접근 (편의 메서드)
   */
  protected get logger(): Logger {
    return this.services.logger;
  }

  // =============================================================================
  // 추상 메서드 (Extension에서 구현)
  // =============================================================================

  /**
   * State Annotation 생성
   * 각 그래프는 자신의 State 구조를 정의해야 함
   */
  protected abstract createStateAnnotation(): any;

  /**
   * 노드 추가
   * 각 그래프는 자신의 노드들을 workflow에 추가해야 함
   */
  protected abstract buildNodes(workflow: any): any;

  /**
   * 엣지 추가
   * 각 그래프는 자신의 엣지들을 workflow에 추가해야 함
   */
  protected abstract buildEdges(workflow: any): any;

  // =============================================================================
  // 편의 메서드 (서비스 위임)
  // =============================================================================

  /**
   * 스트리밍 청크 전송
   */
  protected emitChunk(chunk: string, conversationId?: string): void {
    this.services.streaming.emitChunk(chunk, conversationId);
  }

  /**
   * 중단 여부 확인
   */
  protected isAborted(conversationId?: string): boolean {
    return this.services.streaming.isAborted(conversationId);
  }

  /**
   * LLM 스트리밍 호출
   */
  protected async *streamLLM(messages: Message[], options?: LLMOptions): AsyncGenerator<string> {
    for await (const chunk of this.services.llm.streamChat(messages, options)) {
      yield chunk;
    }
  }

  /**
   * LLM 동기 호출
   */
  protected async chatLLM(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    return this.services.llm.chat(messages, options);
  }

  /**
   * 사용자 언어 가져오기
   */
  protected async getUserLanguage(): Promise<string> {
    return this.services.language.getUserLanguage();
  }

  /**
   * 언어 지시문 가져오기
   */
  protected getLanguageInstruction(language: string): string {
    return this.services.language.getLanguageInstruction(language);
  }

  /**
   * 도구 사용 여부 판단
   */
  protected shouldUseTool(state: any): 'tools' | 'end' {
    return this.services.tools.shouldUseTool(state);
  }

  /**
   * Skills 주입
   */
  protected async injectSkills(state: TState): Promise<Message[]> {
    if (!this.services.skills) {
      return [];
    }

    try {
      const lastUserMessage = this.getLastUserMessage(state);
      if (!lastUserMessage?.content) {
        return [];
      }

      return await this.services.skills.injectSkills(lastUserMessage.content, state.conversationId);
    } catch (error) {
      this.logger.error('[BaseAgentGraph] Skills injection error:', { error: String(error) });
      return [];
    }
  }

  /**
   * 마지막 사용자 메시지 추출
   */
  protected getLastUserMessage(state: TState): Message | undefined {
    return state.messages
      .slice()
      .reverse()
      .find((m) => m.role === 'user');
  }

  // =============================================================================
  // 템플릿 메서드 (Host의 AgentRuntime이 호출)
  // =============================================================================

  /**
   * 그래프를 위한 워크플로우 빌드 정보 반환
   * Host App의 AgentRuntime이 이 정보를 사용하여 StateGraph를 생성합니다.
   */
  public getGraphDefinition(): {
    createStateAnnotation: () => any;
    buildNodes: (workflow: any) => any;
    buildEdges: (workflow: any) => any;
  } {
    return {
      createStateAnnotation: () => this.createStateAnnotation(),
      buildNodes: (workflow: any) => this.buildNodes(workflow),
      buildEdges: (workflow: any) => this.buildEdges(workflow),
    };
  }
}
