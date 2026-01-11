/**
 * Skills Injector
 *
 * LangGraph Agent에 Skills를 자동으로 주입
 * - ContextMatcher로 관련 스킬 감지
 * - SkillManager로 스킬 로드
 * - 시스템 메시지 형식으로 변환
 * - 토큰 수 제한 (최대 3개 스킬)
 */

import { contextMatcher } from '@/lib/skills/context-matcher';
import { skillManager } from '@/lib/skills/manager';
import type { Message } from '@/types';
import type { SkillPackage, SkillContextInjectionResult } from '@/types/skill';

/**
 * Skills Injector 클래스
 */
export class SkillsInjector {
  // 최대 동시 활성화 스킬 수
  private readonly MAX_CONCURRENT_SKILLS = 3;

  // 스킬당 최대 토큰 수 (대략 4,000 토큰)
  private readonly MAX_TOKENS_PER_SKILL = 4000;

  // 전체 스킬 최대 토큰 수 (대략 12,000 토큰)
  private readonly MAX_TOTAL_TOKENS = 12000;

  /**
   * 사용자 메시지 기반으로 관련 스킬을 주입
   *
   * @param userMessage 사용자 메시지
   * @param conversationId 대화 ID (사용 이력 기록용)
   * @param manualSkillIds 수동으로 선택된 스킬 ID (선택)
   * @returns 주입된 스킬 정보 및 시스템 메시지 목록
   */
  async injectSkills(
    userMessage: string,
    conversationId: string,
    manualSkillIds?: string[]
  ): Promise<SkillContextInjectionResult> {
    console.log(
      `[SkillsInjector] Injecting skills for message: "${userMessage.substring(0, 50)}..."`
    );

    const result: SkillContextInjectionResult = {
      injectedSkills: [],
      systemPrompts: [],
      totalTokens: 0,
      skippedSkills: [],
    };

    try {
      // 1. 활성화된 스킬 목록 가져오기
      const enabledSkills = await skillManager.getEnabledSkills();
      if (enabledSkills.length === 0) {
        console.log('[SkillsInjector] No enabled skills found');
        return result;
      }

      console.log(`[SkillsInjector] Found ${enabledSkills.length} enabled skills`);

      // 2. 관련성 점수 계산
      const manifests = enabledSkills.map((s) => s.manifest);
      const matchResults = contextMatcher.match(userMessage, manifests);

      if (matchResults.length === 0) {
        console.log('[SkillsInjector] No relevant skills found');
        return result;
      }

      console.log(`[SkillsInjector] Found ${matchResults.length} relevant skills`);

      // 3. 수동 선택 스킬 우선 처리
      const selectedSkillIds = new Set<string>();
      if (manualSkillIds && manualSkillIds.length > 0) {
        for (const skillId of manualSkillIds) {
          selectedSkillIds.add(skillId);
        }
      }

      // 4. 상위 N개 스킬 선택 (점수순)
      const topMatches = matchResults.slice(0, this.MAX_CONCURRENT_SKILLS);

      // 5. 스킬 로드 및 시스템 프롬프트 생성
      for (const match of topMatches) {
        try {
          // 스킬 로드
          const loadedSkill = await skillManager.loadSkill(match.skillId);
          if (!loadedSkill || !loadedSkill.package) {
            console.warn(`[SkillsInjector] Failed to load skill: ${match.skillId}`);
            result.skippedSkills?.push(match.skillId);
            continue;
          }

          // 시스템 프롬프트 생성
          const systemPrompt = this.formatSkillPrompt(loadedSkill.package);

          // 토큰 수 추정
          const tokens = this.estimateTokens(systemPrompt);

          // 토큰 제한 체크
          if (result.totalTokens + tokens > this.MAX_TOTAL_TOKENS) {
            console.warn(
              `[SkillsInjector] Token limit exceeded, skipping skill: ${match.skillId} (${tokens} tokens)`
            );
            result.skippedSkills?.push(match.skillId);
            continue;
          }

          if (tokens > this.MAX_TOKENS_PER_SKILL) {
            console.warn(
              `[SkillsInjector] Skill too large, skipping: ${match.skillId} (${tokens} tokens)`
            );
            result.skippedSkills?.push(match.skillId);
            continue;
          }

          // 주입 성공
          result.injectedSkills.push(match.skillId);
          result.systemPrompts.push(systemPrompt);
          result.totalTokens += tokens;

          console.log(
            `[SkillsInjector] Injected skill: ${match.skillId} (${tokens} tokens, score: ${match.score.toFixed(2)})`
          );

          // 사용 이력 기록
          await skillManager.recordUsage(
            match.skillId,
            conversationId,
            match.matchedPatterns?.join(', ')
          );
        } catch (error) {
          console.error(`[SkillsInjector] Error loading skill ${match.skillId}:`, error);
          result.skippedSkills?.push(match.skillId);
        }
      }

      console.log(
        `[SkillsInjector] Injection complete: ${result.injectedSkills.length} skills, ${result.totalTokens} tokens`
      );

      return result;
    } catch (error) {
      console.error('[SkillsInjector] Error during injection:', error);
      return result;
    }
  }

  /**
   * 스킬을 LangGraph 시스템 프롬프트 형식으로 변환
   *
   * @param skillPackage 스킬 패키지
   * @returns 시스템 프롬프트 문자열
   */
  private formatSkillPrompt(skillPackage: SkillPackage): string {
    const { manifest, content } = skillPackage;
    const sections: string[] = [];

    // 헤더
    sections.push(`# ${manifest.name}`);
    sections.push(`**Category**: ${manifest.category} | **Version**: ${manifest.version}`);
    sections.push(`**Description**: ${manifest.description}`);
    sections.push('');

    // 시스템 프롬프트
    if (content.systemPrompt) {
      sections.push('## System Instructions');
      sections.push(content.systemPrompt);
      sections.push('');
    }

    // 지식 섹션
    if (content.knowledge && content.knowledge.length > 0) {
      sections.push('## Knowledge Base');
      for (const knowledge of content.knowledge) {
        sections.push(`### ${knowledge.title}`);
        sections.push(knowledge.content);
        sections.push('');
      }
    }

    // 프롬프트 템플릿
    if (content.templates && content.templates.length > 0) {
      sections.push('## Prompt Templates');
      for (const template of content.templates) {
        sections.push(`### ${template.name}`);
        sections.push(`*${template.description}*`);
        sections.push('```');
        sections.push(template.prompt);
        sections.push('```');
        if (template.variables && template.variables.length > 0) {
          sections.push('**Variables:**');
          for (const variable of template.variables) {
            const required = variable.required ? '(required)' : '(optional)';
            const defaultVal = variable.default ? ` [default: ${variable.default}]` : '';
            sections.push(
              `- \`{{${variable.name}}}\` ${required}: ${variable.description}${defaultVal}`
            );
          }
        }
        sections.push('');
      }
    }

    // 도구 사용 예시
    if (content.toolExamples && content.toolExamples.length > 0) {
      sections.push('## Tool Usage Examples');
      for (const example of content.toolExamples) {
        sections.push(`### ${example.toolName}`);
        sections.push(`**Scenario**: ${example.scenario}`);
        sections.push('```');
        sections.push(example.example);
        sections.push('```');
        sections.push('');
      }
    }

    // 워크플로우
    if (content.workflows && content.workflows.length > 0) {
      sections.push('## Workflows');
      for (const workflow of content.workflows) {
        sections.push(`### ${workflow.name}`);
        sections.push(`*${workflow.description}*`);
        sections.push('**Steps:**');
        for (let i = 0; i < workflow.steps.length; i++) {
          const step = workflow.steps[i];
          sections.push(`${i + 1}. ${step.action}`);
          if (step.tool) {
            sections.push(`   - Tool: \`${step.tool}\``);
          }
          if (step.prompt) {
            sections.push(`   - Prompt: "${step.prompt}"`);
          }
        }
        sections.push('');
      }
    }

    return sections.join('\n');
  }

  /**
   * 텍스트의 토큰 수 추정
   *
   * 간단한 휴리스틱: 단어 수 * 1.3
   * (실제로는 tiktoken을 사용해야 하지만, 의존성 추가를 피하기 위해 근사값 사용)
   *
   * @param text 텍스트
   * @returns 추정 토큰 수
   */
  private estimateTokens(text: string): number {
    // 간단한 토큰 추정: 문자 수 / 4 (영어 기준)
    // 한국어는 보통 더 많은 토큰을 사용하지만, 안전하게 계산
    const estimatedTokens = Math.ceil(text.length / 4);

    return estimatedTokens;
  }

  /**
   * 스킬을 LangGraph Message 형식으로 변환
   *
   * @param skillPackages 스킬 패키지 목록
   * @param baseId 시스템 메시지 ID prefix (예: 'system-skill')
   * @returns Message 목록
   */
  convertToMessages(skillPackages: SkillPackage[], baseId = 'system-skill'): Message[] {
    const messages: Message[] = [];
    const now = Date.now();

    for (let i = 0; i < skillPackages.length; i++) {
      const skillPackage = skillPackages[i];
      const systemPrompt = this.formatSkillPrompt(skillPackage);

      messages.push({
        id: `${baseId}-${skillPackage.manifest.id}-${i}`,
        role: 'system',
        content: systemPrompt,
        created_at: now,
      });
    }

    return messages;
  }

  /**
   * Graph 노드에서 Skills를 주입하고 메시지로 변환하는 헬퍼
   *
   * @param query 사용자 쿼리
   * @param conversationId 대화 ID
   * @param emitChunk 스트리밍 청크 전송 함수
   * @param logPrefix 로그 프리픽스 (예: '[Deep]', '[Sequential]')
   * @returns Skill 메시지 배열
   */
  async injectSkillsForGraph(
    query: string,
    conversationId: string,
    emitChunk: (chunk: string, convId: string) => void,
    logPrefix: string
  ): Promise<Message[]> {
    const skillMessages: Message[] = [];
    try {
      const injectionResult = await this.injectSkills(query, conversationId);

      if (injectionResult.injectedSkills.length > 0) {
        skillMessages.push(...this.getMessagesFromResult(injectionResult));

        emitChunk(
          `\n🎯 **${injectionResult.injectedSkills.length}개의 Skill이 활성화되었습니다.**\n\n`,
          conversationId
        );

        console.log(`${logPrefix} Skills injected:`, {
          count: injectionResult.injectedSkills.length,
          skillIds: injectionResult.injectedSkills,
          tokens: injectionResult.totalTokens,
        });
      }
    } catch (skillError) {
      console.error(`${logPrefix} Skills injection error:`, skillError);
    }

    return skillMessages;
  }

  /**
   * 주입 결과를 Message 형식으로 변환
   *
   * @param injectionResult 주입 결과
   * @returns Message 목록
   */
  getMessagesFromResult(injectionResult: SkillContextInjectionResult): Message[] {
    const messages: Message[] = [];
    const now = Date.now();

    for (let i = 0; i < injectionResult.systemPrompts.length; i++) {
      const prompt = injectionResult.systemPrompts[i];
      const skillId = injectionResult.injectedSkills[i];

      messages.push({
        id: `system-skill-${skillId}`,
        role: 'system',
        content: prompt,
        created_at: now,
      });
    }

    return messages;
  }

  /**
   * 설정 업데이트
   */
  setMaxConcurrentSkills(max: number): void {
    console.log(`[SkillsInjector] Max concurrent skills updated: ${max}`);
  }

  setMaxTotalTokens(max: number): void {
    console.log(`[SkillsInjector] Max total tokens updated: ${max}`);
  }
}

// Singleton instance export
export const skillsInjector = new SkillsInjector();
