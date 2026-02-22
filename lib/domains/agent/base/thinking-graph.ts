/**
 * ThinkingGraph - 사고 그래프를 위한 추상 중간 클래스
 *
 * BaseGraph를 상속하여 단계별 사고 프로세스를 지원하는 그래프의 공통 기능 제공
 *
 * 공통 기능:
 * - Research 노드 생성 (0단계: 정보 수집)
 * - 단계별 진행 상황 표시
 * - 사고 과정 포맷팅
 * - 최종 답변 생성
 *
 * 사용하는 그래프:
 * - SequentialThinkingGraph (순차적 사고)
 * - DeepThinkingGraph (심층 사고)
 * - TreeOfThoughtGraph (생각의 나무)
 */

import { BaseGraph, type BaseState } from './base-graph';
import type { Message } from '@/types';
import { createResearchNode, emitStepProgress } from '../utils/graph-utils';
import { createBaseSystemMessage } from '../utils/system-message';
import { logger } from '@/lib/utils/logger';

/**
 * ThinkingState 인터페이스
 * Thinking 그래프가 최소한 가져야 할 State 구조
 */
export interface ThinkingState extends BaseState {
  context?: string;
  [key: string]: any;
}

/**
 * ThinkingGraph 추상 클래스
 *
 * @template TState - State 타입 (ThinkingState 확장)
 */
export abstract class ThinkingGraph<TState extends ThinkingState> extends BaseGraph<TState> {
  /**
   * 추상 메서드: 단계 설명 가져오기
   * 각 Thinking 그래프는 자신의 단계 설명을 제공해야 함
   *
   * @param stepName - 단계 이름 (예: 'analyze', 'plan', 'execute')
   * @returns 단계 설명 객체 { title, emoji, total }
   */
  protected abstract getStepDescription(stepName: string): {
    title: string;
    emoji: string;
    stepNumber: number;
    total: number;
  };

  /**
   * Research 노드 생성 (0단계: 정보 수집)
   *
   * @param context - 컨텍스트 이름 (로그용)
   * @returns Research 노드 함수
   */
  protected createResearchNode(context: string) {
    return createResearchNode<TState>(context);
  }

  /**
   * 단계 시작 알림
   *
   * @param stepName - 단계 이름
   * @param state - 현재 State
   */
  protected emitStepStart(stepName: string, state: TState): void {
    const stepDesc = this.getStepDescription(stepName);
    emitStepProgress(
      stepDesc.stepNumber,
      stepDesc.total,
      stepDesc.title,
      stepDesc.emoji,
      state.conversationId,
      true // showLoading
    );
  }

  /**
   * 최종 답변 포맷팅
   *
   * @param sections - 섹션 정보 배열
   * @param answer - 최종 답변 내용
   * @returns 포맷팅된 전체 답변
   */
  protected formatFinalAnswer(
    sections: Array<{ from: string; to: string }>,
    answer: string
  ): string {
    let formattedSections = '';

    // 섹션 포맷팅
    for (const section of sections) {
      formattedSections = formattedSections.replace(
        new RegExp(this.escapeRegExp(section.from), 'g'),
        section.to
      );
    }

    return `${formattedSections}\n\n---\n\n## ✨ 최종 답변\n\n${answer}`;
  }

  /**
   * 정규식 특수 문자 이스케이프
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * LLM 스트리밍 호출 with 시스템 메시지
   *
   * @param state - 현재 State
   * @param systemContent - 시스템 메시지 내용
   * @param userPrompt - 사용자 프롬프트 (optional)
   * @returns 누적된 응답 내용
   */
  protected async streamLLMWithSystem(
    state: TState,
    systemContent: string,
    userPrompt?: string
  ): Promise<string> {
    const messages: Message[] = [
      {
        id: 'system',
        role: 'system',
        content: systemContent,
        created_at: Date.now(),
      },
    ];

    // 기존 메시지 추가
    messages.push(...state.messages);

    // 사용자 프롬프트가 있으면 추가
    if (userPrompt) {
      messages.push({
        id: `prompt-${Date.now()}`,
        role: 'user',
        content: userPrompt,
        created_at: Date.now(),
      });
    }

    let accumulated = '';
    for await (const chunk of this.streamLLM(messages, {
      tools: [],
      tool_choice: 'none',
    })) {
      accumulated += chunk;
      this.emitChunk(chunk, state.conversationId);
    }

    return accumulated;
  }

  /**
   * 시스템 메시지 생성 헬퍼
   *
   * @param additionalContext - 추가 컨텍스트 (optional)
   * @returns 시스템 메시지 내용
   */
  protected createSystemMessage(additionalContext?: string): string {
    return createBaseSystemMessage(additionalContext);
  }

  /**
   * 최종 답변 메시지 생성
   *
   * @param content - 메시지 내용
   * @returns Message 객체
   */
  protected createFinalMessage(content: string): Message {
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content,
      created_at: Date.now(),
    };
  }

  /**
   * 에러 로깅 헬퍼
   *
   * @param context - 컨텍스트 이름
   * @param stepName - 단계 이름
   * @param error - 에러 객체
   */
  protected logError(context: string, stepName: string, error: any): void {
    logger.error(`[${context}] ${stepName} error:`, error);
  }
}
