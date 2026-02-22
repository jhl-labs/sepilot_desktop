/**
 * 그래프 공통 유틸리티 함수
 *
 * - Research 노드 생성 (re-export)
 * - 단계별 진행 상황 표시
 * - 사고 과정 포맷팅
 */

import { emitStreamingChunk } from '@/lib/domains/llm/streaming-callback';
import { logger } from '@/lib/utils/logger';

// Research 노드는 기존 구현 재사용
export { createResearchNode } from './research-node';

/**
 * 단계 진행 상황 표시
 *
 * Thinking 그래프에서 각 단계 시작 시 사용
 *
 * @param step - 현재 단계 번호 (1부터 시작)
 * @param total - 전체 단계 수
 * @param title - 단계 제목
 * @param emoji - 단계 이모지
 * @param conversationId - 대화 ID
 * @param showLoading - 로딩 메시지 표시 여부 (기본: true)
 *
 * @example
 * ```typescript
 * emitStepProgress(1, 5, '문제 분석', '🔍', state.conversationId);
 * // 출력:
 * // ## 🔍 1단계: 문제 분석
 * //
 * // **단계 진행 중:** 문제 분석을 시작합니다...
 * ```
 */
export function emitStepProgress(
  step: number,
  total: number,
  title: string,
  emoji: string,
  conversationId: string,
  showLoading = true
): void {
  // 단계 헤더
  const header =
    step === 0
      ? `\n\n## ${emoji} 0단계: ${title}\n\n`
      : `\n\n---\n\n## ${emoji} ${step}단계: ${title}\n\n`;

  emitStreamingChunk(header, conversationId);

  // 로딩 메시지 (선택적)
  if (showLoading) {
    emitStreamingChunk(`**단계 진행 중:** ${title}을(를) 시작합니다...\n\n`, conversationId);
  }

  logger.info(`[GraphUtils] Step ${step}/${total}: ${title}`);
}

/**
 * 사고 과정 섹션 포맷팅
 *
 * Thinking 그래프의 최종 답변 생성 시 사용
 *
 * @param sections - 섹션 이름과 제목의 매핑
 * @param content - 포맷팅할 컨텐츠
 * @returns 포맷팅된 컨텐츠
 *
 * @example
 * ```typescript
 * const sections = [
 *   { from: '# Analysis', to: '## 🔍 1단계: 문제 분석' },
 *   { from: '# Plan', to: '## 📋 2단계: 계획 수립' },
 *   { from: '# Execution', to: '## ⚙️ 3단계: 계획 실행' }
 * ];
 * const formatted = formatThinkingProcess(sections, state.context);
 * ```
 */
export function formatThinkingProcess(
  sections: Array<{ from: string; to: string }>,
  content: string
): string {
  let result = content;

  for (const section of sections) {
    // 정규식 사용하여 전역 교체
    const regex = new RegExp(escapeRegExp(section.from), 'g');
    result = result.replace(regex, section.to);
  }

  return result;
}

/**
 * 정규식 특수 문자 이스케이프
 *
 * @param string - 이스케이프할 문자열
 * @returns 이스케이프된 문자열
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sequential Thinking용 섹션 포맷팅
 *
 * @param context - 포맷팅할 컨텍스트
 * @returns 포맷팅된 컨텍스트
 */
export function formatSequentialThinking(context: string): string {
  return formatThinkingProcess(
    [
      { from: '# Analysis', to: '## 🔍 1단계: 문제 분석' },
      { from: '# Plan', to: '## 📋 2단계: 계획 수립' },
      { from: '# Execution', to: '## ⚙️ 3단계: 계획 실행' },
    ],
    context
  );
}

/**
 * Deep Thinking용 섹션 포맷팅
 *
 * @param context - 포맷팅할 컨텍스트
 * @returns 포맷팅된 컨텍스트
 */
export function formatDeepThinking(context: string): string {
  return formatThinkingProcess(
    [
      { from: '# InitialAnalysis', to: '## 🔬 1단계: 초기 분석' },
      { from: '# Perspective', to: '### 관점' },
      { from: '# DeepAnalysis', to: '## 🧠 3단계: 심층 분석' },
      { from: '# Integration', to: '## 🔗 4단계: 통합 및 검증' },
    ],
    context
  );
}

/**
 * Tree of Thought용 섹션 포맷팅
 *
 * @param context - 포맷팅할 컨텍스트
 * @returns 포맷팅된 컨텍스트
 */
export function formatTreeOfThought(context: string): string {
  return formatThinkingProcess(
    [
      { from: '# Decompose', to: '## 🌳 1단계: 문제 분해' },
      { from: '# Branch', to: '### 가지' },
      { from: '# Evaluation', to: '## ⚖️ 3단계: 평가' },
      { from: '# Synthesis', to: '## ✨ 4단계: 종합' },
    ],
    context
  );
}
