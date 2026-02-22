/**
 * BaseGraph - 모든 LangGraph 그래프의 추상 기본 클래스
 *
 * 공통 기능:
 * - Skills 주입
 * - 스트리밍 청크 전송
 * - 언어 설정 관리
 * - LLM 호출
 * - 메시지 추출
 *
 * 템플릿 메서드 패턴:
 * - compile(): 그래프 컴파일 (최종)
 * - invoke(): 동기 실행 (최종)
 * - stream(): 스트리밍 실행 (최종)
 *
 * 확장 포인트:
 * - createStateAnnotation(): State 구조 정의 (추상)
 * - buildNodes(): 노드 추가 (추상)
 * - buildEdges(): 엣지 추가 (추상)
 */

import { StateGraph } from '@langchain/langgraph';
import type { Message } from '@/types';
import type { SupportedLanguage } from '@/lib/i18n';
import { skillsInjector } from '../skills-injector';
import { emitStreamingChunk } from '@/lib/domains/llm/streaming-callback';
import { getUserLanguage, getLanguageInstruction } from '../utils/language-utils';
import { LLMService } from '@/lib/domains/llm/service';
import { logger } from '@/lib/utils/logger';
import type { LLMOptions } from '@/lib/domains/llm/base';

/**
 * BaseState 인터페이스
 * 모든 State는 최소한 이 구조를 포함해야 함
 */
export interface BaseState {
  messages: Message[];
  conversationId: string;
  context?: string;
  [key: string]: any; // 추가 필드 허용
}

/**
 * 그래프 실행 옵션
 */
export interface GraphExecutionOptions {
  maxIterations?: number;
  [key: string]: any; // 추가 옵션 허용
}

/**
 * BaseGraph 추상 클래스
 *
 * @template TState - State 타입 (BaseState 확장)
 */
export abstract class BaseGraph<TState extends BaseState> {
  private isSkillSystemMessage(message: Message): boolean {
    return (
      message.role === 'system' &&
      typeof message.id === 'string' &&
      message.id.startsWith('system-skill-')
    );
  }

  private hasInjectedSkillMessages(messages: Message[]): boolean {
    return messages.some((message) => this.isSkillSystemMessage(message));
  }

  /**
   * 추상 메서드: State Annotation 생성
   * 각 그래프는 자신의 State 구조를 정의해야 함
   */
  protected abstract createStateAnnotation(): any;

  /**
   * 추상 메서드: 노드 추가
   * 각 그래프는 자신의 노드들을 workflow에 추가해야 함
   *
   * @param workflow - StateGraph 인스턴스
   * @returns 노드가 추가된 workflow
   */
  protected abstract buildNodes(workflow: StateGraph<any>): any;

  /**
   * 추상 메서드: 엣지 추가
   * 각 그래프는 자신의 엣지들을 workflow에 추가해야 함
   *
   * @param workflow - StateGraph 인스턴스
   * @returns 엣지가 추가된 workflow
   */
  protected abstract buildEdges(workflow: any): any;

  // =============================================================================
  // 공통 유틸리티 메서드
  // =============================================================================

  /**
   * 마지막 사용자 메시지 추출
   *
   * @param state - 현재 State
   * @returns 마지막 사용자 메시지 또는 undefined
   */
  protected getLastUserMessage(state: TState): Message | undefined {
    return state.messages
      .slice()
      .reverse()
      .find((m) => m.role === 'user');
  }

  /**
   * Skills 주입
   *
   * @param state - 현재 State
   * @returns 주입된 Skill 메시지 배열
   */
  protected async injectSkills(state: TState): Promise<Message[]> {
    try {
      if (this.hasInjectedSkillMessages(state.messages || [])) {
        logger.debug('[BaseGraph] Skills already injected for current state, skipping');
        return [];
      }

      const lastUserMessage = this.getLastUserMessage(state);
      if (!lastUserMessage || !lastUserMessage.content) {
        return [];
      }

      const injectionResult = await skillsInjector.injectSkills(
        lastUserMessage.content,
        state.conversationId
      );

      if (injectionResult.injectedSkills.length > 0) {
        const skillMessages = skillsInjector.getMessagesFromResult(injectionResult);
        // 활성화 메시지는 graph-factory.ts에서 이미 출력하므로 여기서는 생략

        logger.info('[BaseGraph] Skills injected:', {
          count: injectionResult.injectedSkills.length,
          skillIds: injectionResult.injectedSkills,
          tokens: injectionResult.totalTokens,
        });

        return skillMessages;
      }
    } catch (error) {
      logger.error('[BaseGraph] Skills injection error:', error);
      // Skills 주입 실패는 치명적이지 않으므로 계속 진행
    }

    return [];
  }

  private async prepareStateWithSkills(initialState: TState): Promise<TState> {
    if (this.hasInjectedSkillMessages(initialState.messages || [])) {
      return initialState;
    }

    const skillMessages = await this.injectSkills(initialState);
    if (skillMessages.length === 0) {
      return initialState;
    }

    return {
      ...initialState,
      messages: [...(initialState.messages || []), ...skillMessages],
    };
  }

  /**
   * 스트리밍 청크 전송
   *
   * @param chunk - 전송할 청크
   * @param conversationId - 대화 ID (선택)
   */
  protected emitChunk(chunk: string, conversationId?: string): void {
    emitStreamingChunk(chunk, conversationId);
  }

  /**
   * 사용자 언어 설정 가져오기
   *
   * @param context - 컨텍스트 이름 (로그용)
   * @returns 언어 코드
   */
  protected async getUserLanguage(context = 'BaseGraph'): Promise<SupportedLanguage> {
    return getUserLanguage(context);
  }

  /**
   * 언어 지시문 가져오기
   *
   * @param language - 언어 코드
   * @returns 언어 지시문 문자열
   */
  protected getLanguageInstruction(language: SupportedLanguage): string {
    return getLanguageInstruction(language);
  }

  /**
   * LLM 스트리밍 호출
   *
   * @param messages - 메시지 배열
   * @param options - LLM 옵션
   * @returns 스트리밍 청크 생성기
   */
  protected async *streamLLM(messages: Message[], options?: LLMOptions): AsyncGenerator<string> {
    for await (const chunk of LLMService.streamChat(messages, options)) {
      yield chunk;
    }
  }

  // =============================================================================
  // 템플릿 메서드 (최종 - 오버라이드 불가)
  // =============================================================================

  /**
   * 그래프 컴파일
   *
   * @returns 컴파일된 그래프
   */
  public compile(): any {
    const stateAnnotation = this.createStateAnnotation();
    let workflow = new StateGraph(stateAnnotation);

    // 노드 추가
    workflow = this.buildNodes(workflow);

    // 엣지 추가
    workflow = this.buildEdges(workflow);

    return workflow.compile();
  }

  /**
   * 그래프 실행 (동기)
   *
   * @param initialState - 초기 State
   * @param options - 실행 옵션
   * @returns 최종 State
   */
  public async invoke(initialState: TState, options?: GraphExecutionOptions): Promise<TState> {
    const graph = this.compile();
    const stateWithSkills = await this.prepareStateWithSkills(initialState);
    const result = await graph.invoke(stateWithSkills, options);
    return result as TState;
  }

  /**
   * 그래프 실행 (스트리밍)
   *
   * LangGraph v1.0+에서는 stream 메서드가 다르게 작동합니다.
   * streamMode: 'updates'를 사용하여 각 노드 완료 시 실시간 이벤트를 발행합니다.
   * 추가로 실시간 스트리밍은 emitChunk를 통해 처리됩니다.
   *
   * @param initialState - 초기 State
   * @param options - 실행 옵션
   * @returns 이벤트 스트림
   */
  public async *stream(initialState: TState, options?: GraphExecutionOptions): AsyncGenerator<any> {
    const graph = this.compile();
    const stateWithSkills = await this.prepareStateWithSkills(initialState);

    try {
      // LangGraph v1.0+에서 stream을 사용하여 노드 완료 이벤트 실시간 발행
      const stream = await graph.stream(stateWithSkills, {
        recursionLimit: options?.maxIterations || 100,
        streamMode: 'updates', // 각 노드 완료 시 즉시 이벤트 발행
      });

      // 각 노드 완료 이벤트를 순회하며 yield
      for await (const event of stream) {
        const nodeName = Object.keys(event)[0];
        const nodeData = event[nodeName];

        if (!nodeName || !nodeData) {
          continue;
        }

        // 노드 완료 이벤트 발행
        yield {
          type: 'node',
          node: nodeName,
          data: nodeData,
        };

        logger.debug(`[BaseGraph] Node completed: ${nodeName}`, {
          hasMessages: !!nodeData.messages,
          messageCount: nodeData.messages?.length,
        });
      }

      yield { type: 'complete' };
    } catch (error: any) {
      logger.error('[BaseGraph] Stream execution error:', error);
      yield {
        type: 'error',
        error: error.message || String(error),
      };
      throw error;
    }
  }
}
