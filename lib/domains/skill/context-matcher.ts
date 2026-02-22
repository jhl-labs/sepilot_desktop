/**
 * Context Matcher
 *
 * 사용자 메시지와 스킬 manifest를 비교하여 관련성을 감지
 * - contextPatterns 매칭 (가중치 0.5)
 * - 태그 매칭 (가중치 0.3)
 * - 이름/설명 매칭 (가중치 0.2)
 * - @skill-name 형식 수동 선택 지원
 */

import type { SkillManifest, ContextMatchResult } from '../../../types/skill';

/**
 * Context Matcher 클래스
 */
export class ContextMatcher {
  // 가중치 설정
  private readonly WEIGHT_CONTEXT_PATTERNS = 0.5;
  private readonly WEIGHT_TAGS = 0.3;
  private readonly WEIGHT_NAME_DESCRIPTION = 0.2;

  // 최소 점수 임계값 (0.0 ~ 1.0)
  private readonly MIN_RELEVANCE_SCORE = 0.3;

  /**
   * 사용자 메시지와 스킬 매니페스트들을 비교하여 관련성 점수 계산
   *
   * @param userMessage 사용자 메시지
   * @param manifests 스킬 매니페스트 목록
   * @returns 관련성 점수가 높은 순으로 정렬된 매칭 결과
   */
  match(userMessage: string, manifests: SkillManifest[]): ContextMatchResult[] {
    const normalizedMessage = this.normalizeText(userMessage);

    // 수동 선택된 스킬 파싱 (@skill-name)
    const manualSkillIds = this.parseManualSkillSelection(normalizedMessage);

    const results: ContextMatchResult[] = [];

    for (const manifest of manifests) {
      // 수동 선택된 스킬은 무조건 1.0 점수
      if (
        manualSkillIds.includes(manifest.id) ||
        manualSkillIds.includes(manifest.name.toLowerCase())
      ) {
        results.push({
          skillId: manifest.id,
          score: 1.0,
          matchedPatterns: ['@mention'],
          matchedTags: [],
        });
        continue;
      }

      // 자동 매칭
      const matchResult = this.calculateRelevanceScore(normalizedMessage, manifest);
      if (matchResult.score >= this.MIN_RELEVANCE_SCORE) {
        results.push(matchResult);
      }
    }

    // 점수 높은 순으로 정렬
    results.sort((a, b) => b.score - a.score);

    console.log(
      `[ContextMatcher] Matched ${results.length} skills for message: "${userMessage.substring(0, 50)}..."`
    );
    if (results.length > 0) {
      console.log(
        `[ContextMatcher] Top match: ${results[0].skillId} (score: ${results[0].score.toFixed(2)})`
      );
    }

    return results;
  }

  /**
   * 개별 스킬과의 관련성 점수 계산
   *
   * @param normalizedMessage 정규화된 사용자 메시지
   * @param manifest 스킬 매니페스트
   * @returns 관련성 점수 및 매칭 정보
   */
  private calculateRelevanceScore(
    normalizedMessage: string,
    manifest: SkillManifest
  ): ContextMatchResult {
    let totalScore = 0;
    const matchedPatterns: string[] = [];
    const matchedTags: string[] = [];

    // 1. contextPatterns 매칭 (가중치 0.5)
    if (manifest.contextPatterns && manifest.contextPatterns.length > 0) {
      let patternScore = 0;
      for (const pattern of manifest.contextPatterns) {
        const normalizedPattern = this.normalizeText(pattern);
        if (normalizedMessage.includes(normalizedPattern)) {
          patternScore = 1.0; // 하나라도 매칭되면 1.0
          matchedPatterns.push(pattern);
        }
      }
      totalScore += patternScore * this.WEIGHT_CONTEXT_PATTERNS;
    }

    // 2. 태그 매칭 (가중치 0.3)
    if (manifest.tags && manifest.tags.length > 0) {
      let tagScore = 0;
      let matchedTagCount = 0;
      for (const tag of manifest.tags) {
        const normalizedTag = this.normalizeText(tag);
        if (normalizedMessage.includes(normalizedTag)) {
          matchedTagCount++;
          matchedTags.push(tag);
        }
      }
      if (manifest.tags.length > 0) {
        tagScore = matchedTagCount / manifest.tags.length; // 매칭 비율
      }
      totalScore += tagScore * this.WEIGHT_TAGS;
    }

    // 3. 이름/설명 매칭 (가중치 0.2)
    const normalizedName = this.normalizeText(manifest.name);
    const normalizedDescription = this.normalizeText(manifest.description);

    let nameDescScore = 0;
    if (normalizedMessage.includes(normalizedName)) {
      nameDescScore = 1.0;
    } else if (this.fuzzyMatch(normalizedMessage, normalizedDescription)) {
      nameDescScore = 0.5; // 설명 매칭은 절반 점수
    }
    totalScore += nameDescScore * this.WEIGHT_NAME_DESCRIPTION;

    return {
      skillId: manifest.id,
      score: Math.min(totalScore, 1.0), // 최대 1.0
      matchedPatterns: matchedPatterns.length > 0 ? matchedPatterns : undefined,
      matchedTags: matchedTags.length > 0 ? matchedTags : undefined,
    };
  }

  /**
   * 수동 스킬 선택 파싱 (@skill-name)
   *
   * @param message 사용자 메시지
   * @returns 선택된 스킬 ID/이름 목록
   */
  parseManualSkillSelection(message: string): string[] {
    const normalizedMessage = this.normalizeText(message);
    // 스킬 ID는 dot(.)를 포함할 수 있으므로 @local.react-reviewer 형태를 지원
    const mentionPattern = /@([a-z0-9._-]+)/g;
    const matches = normalizedMessage.matchAll(mentionPattern);

    const skillIds: string[] = [];
    for (const match of matches) {
      skillIds.push(match[1]);
    }

    if (skillIds.length > 0) {
      console.log(`[ContextMatcher] Manual skill selection detected: ${skillIds.join(', ')}`);
    }

    return skillIds;
  }

  /**
   * 텍스트 정규화
   *
   * @param text 원본 텍스트
   * @returns 정규화된 텍스트 (소문자, 공백 정리)
   */
  private normalizeText(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' '); // 연속 공백을 하나로
  }

  /**
   * Fuzzy 매칭 (키워드 기반)
   *
   * @param message 사용자 메시지
   * @param target 대상 텍스트
   * @returns 매칭 여부
   */
  private fuzzyMatch(message: string, target: string): boolean {
    // 대상 텍스트를 단어로 분할
    const targetWords = target.split(' ').filter((word) => word.length > 3); // 3글자 이상만

    // 메시지에 대상 단어 중 하나라도 포함되면 매칭
    for (const word of targetWords) {
      if (message.includes(word)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 특정 스킬의 관련성 점수만 계산
   *
   * @param userMessage 사용자 메시지
   * @param manifest 스킬 매니페스트
   * @returns 관련성 점수
   */
  getSkillRelevance(userMessage: string, manifest: SkillManifest): number {
    const normalizedMessage = this.normalizeText(userMessage);
    const result = this.calculateRelevanceScore(normalizedMessage, manifest);
    return result.score;
  }

  /**
   * 최소 점수 임계값 변경
   *
   * @param threshold 새 임계값 (0.0 ~ 1.0)
   */
  setMinRelevanceScore(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Threshold must be between 0.0 and 1.0');
    }
    console.log(`[ContextMatcher] Min relevance score updated: ${threshold}`);
  }
}

// Singleton instance export
export const contextMatcher = new ContextMatcher();
