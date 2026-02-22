/**
 * Skills Injector
 *
 * LangGraph Agent에 Skills를 자동으로 주입
 * - ContextMatcher로 관련 스킬 감지
 * - SkillManager로 스킬 로드
 * - 시스템 메시지 형식으로 변환
 * - 토큰 수 제한 (최대 3개 스킬)
 */

import { contextMatcher } from '@/lib/domains/skill/context-matcher';
import { skillManager } from '@/lib/domains/skill/manager';
import type { Message } from '@/types';
import type { SkillPackage, SkillContextInjectionResult } from '@/types/skill';

/**
 * Skills Injector 클래스
 */
export class SkillsInjector {
  // 최대 동시 활성화 스킬 수
  private readonly MAX_CONCURRENT_SKILLS = 3;

  // 스킬당 최대 토큰 수 (대형 스킬도 수용할 수 있도록 상향)
  private readonly MAX_TOKENS_PER_SKILL = 12000;

  // 전체 스킬 최대 토큰 수
  private readonly MAX_TOTAL_TOKENS = 24000;

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
      injectedSkillNames: [],
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

      const manualRequestedSet = new Set(
        (manualSkillIds ?? []).map((id) => id.trim().toLowerCase()).filter((id) => id.length > 0)
      );
      const manualFallbackMatches = enabledSkills
        .filter(
          (skill) =>
            manualRequestedSet.has(skill.id.toLowerCase()) ||
            manualRequestedSet.has(skill.manifest.name.toLowerCase())
        )
        .map((skill) => ({
          skillId: skill.id,
          score: 1,
          matchedPatterns: ['manual-selection'],
          matchedTags: [],
        }));

      const mergedMatches = [...matchResults];
      for (const manualMatch of manualFallbackMatches) {
        if (!mergedMatches.some((match) => match.skillId === manualMatch.skillId)) {
          mergedMatches.push(manualMatch);
        }
      }

      if (mergedMatches.length === 0) {
        console.log('[SkillsInjector] No relevant skills found');
        return result;
      }

      console.log(`[SkillsInjector] Found ${mergedMatches.length} relevant skills`);

      // 3. 수동 선택 스킬 우선 처리
      const normalizedManualIds = new Set(
        (manualSkillIds ?? []).map((id) => id.trim().toLowerCase()).filter((id) => id.length > 0)
      );

      const manualMatches = mergedMatches.filter((match) =>
        normalizedManualIds.has(match.skillId.toLowerCase())
      );
      const automaticMatches = mergedMatches.filter(
        (match) => !normalizedManualIds.has(match.skillId.toLowerCase())
      );

      // 4. 상위 N개 스킬 선택 (수동 선택 우선, 이후 점수순)
      const topMatches = [...manualMatches, ...automaticMatches].slice(
        0,
        this.MAX_CONCURRENT_SKILLS
      );

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
          let systemPrompt = this.formatSkillPrompt(loadedSkill.package);

          // 토큰 수 추정
          let tokens = this.estimateTokens(systemPrompt);

          // 토큰 제한 체크
          if (result.totalTokens + tokens > this.MAX_TOTAL_TOKENS) {
            console.warn(
              `[SkillsInjector] Token limit exceeded, skipping skill: ${match.skillId} (${tokens} tokens)`
            );
            result.skippedSkills?.push(match.skillId);
            continue;
          }

          if (tokens > this.MAX_TOKENS_PER_SKILL) {
            // 토큰 초과 시 자동 트리밍 시도
            const trimmedPrompt = this.trimSkillPrompt(systemPrompt, this.MAX_TOKENS_PER_SKILL);
            const trimmedTokens = this.estimateTokens(trimmedPrompt);

            if (trimmedTokens > this.MAX_TOKENS_PER_SKILL) {
              console.warn(
                `[SkillsInjector] Skill too large even after trimming, skipping: ${match.skillId} (${trimmedTokens} tokens)`
              );
              result.skippedSkills?.push(match.skillId);
              continue;
            }

            // 트리밍된 버전 사용
            console.log(
              `[SkillsInjector] Skill trimmed: ${match.skillId} (${tokens} → ${trimmedTokens} tokens)`
            );
            systemPrompt = trimmedPrompt;
            tokens = trimmedTokens;
          }

          // 주입 성공
          result.injectedSkills.push(match.skillId);
          result.injectedSkillNames.push(loadedSkill.package.manifest?.name || match.skillId);
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
   * 한국어/영어 혼합 텍스트에 대한 개선된 휴리스틱:
   * - 영어: ~4 chars per token
   * - 한국어: ~1.5 chars per token (CJK 문자는 보통 2-3 토큰)
   * - 코드/마크다운: ~3.5 chars per token
   *
   * @param text 텍스트
   * @returns 추정 토큰 수
   */
  private estimateTokens(text: string): number {
    // CJK 문자 수 (한국어, 중국어, 일본어)
    const cjkChars = (text.match(/[\u3000-\u9fff\uac00-\ud7af\uf900-\ufaff]/g) || []).length;
    const nonCjkChars = text.length - cjkChars;

    // CJK: ~1.5 chars per token, non-CJK: ~4 chars per token
    const estimatedTokens = Math.ceil(cjkChars / 1.5 + nonCjkChars / 4);

    return estimatedTokens;
  }

  /**
   * 토큰 제한을 초과하는 스킬 프롬프트를 트리밍
   *
   * Knowledge Base 섹션의 content를 축약하여 토큰 수를 줄임.
   * System Instructions와 헤더는 유지하면서 Knowledge Base를 점진적으로 축소.
   *
   * @param prompt 원본 프롬프트
   * @param maxTokens 최대 토큰 수
   * @returns 트리밍된 프롬프트
   */
  private trimSkillPrompt(prompt: string, maxTokens: number): string {
    const sections = prompt.split('\n## ');
    if (sections.length <= 1) {
      // 섹션 구분이 없으면 단순 절단
      return this.truncateToTokenLimit(prompt, maxTokens);
    }

    // 헤더 + System Instructions 는 항상 유지
    const header = sections[0];
    const otherSections = sections.slice(1).map((s) => `## ${s}`);

    // 우선순위: System Instructions > Tool Usage Examples > Workflows > Prompt Templates > Knowledge Base
    const priorityOrder = [
      'System Instructions',
      'Tool Usage Examples',
      'Workflows',
      'Prompt Templates',
      'Knowledge Base',
    ];

    const sectionMap = new Map<string, string>();
    for (const section of otherSections) {
      const titleMatch = section.match(/^## (.+?)$/m);
      if (titleMatch) {
        sectionMap.set(titleMatch[1], section);
      }
    }

    // 높은 우선순위부터 추가, 토큰 초과 시 중단
    let result = header;
    let currentTokens = this.estimateTokens(result);

    for (const priority of priorityOrder) {
      const section = sectionMap.get(priority);
      if (!section) {
        continue;
      }

      const sectionTokens = this.estimateTokens(section);
      if (currentTokens + sectionTokens <= maxTokens) {
        result += `\n${section}`;
        currentTokens += sectionTokens;
      } else if (priority === 'Knowledge Base') {
        // Knowledge Base가 큰 경우 서브섹션별로 추가 시도
        const subSections = section.split('\n### ');
        const kbHeader = subSections[0]; // "## Knowledge Base" 라인
        result += `\n${kbHeader}`;
        currentTokens += this.estimateTokens(kbHeader);

        for (let i = 1; i < subSections.length; i++) {
          const subSection = `### ${subSections[i]}`;
          const subTokens = this.estimateTokens(subSection);
          if (currentTokens + subTokens <= maxTokens) {
            result += `\n${subSection}`;
            currentTokens += subTokens;
          } else {
            // 남은 공간만큼만 잘라서 추가
            const remainingTokens = maxTokens - currentTokens - 50; // 여유분 50토큰
            if (remainingTokens > 100) {
              const truncated = this.truncateToTokenLimit(subSection, remainingTokens);
              result += `\n${truncated}\n\n...(truncated)`;
              currentTokens = maxTokens;
            }
            break;
          }
        }
      } else {
        // 다른 섹션이 초과하면 트리밍해서 추가
        const remainingTokens = maxTokens - currentTokens - 50;
        if (remainingTokens > 100) {
          const truncated = this.truncateToTokenLimit(section, remainingTokens);
          result += `\n${truncated}\n\n...(truncated)`;
        }
        break;
      }
    }

    return result;
  }

  /**
   * 토큰 제한에 맞게 텍스트를 절단
   */
  private truncateToTokenLimit(text: string, maxTokens: number): string {
    // 대략적인 문자 수 계산 (한국어 혼합 고려)
    const cjkChars = (text.match(/[\u3000-\u9fff\uac00-\ud7af\uf900-\ufaff]/g) || []).length;
    const ratio = cjkChars / Math.max(text.length, 1);
    const avgCharsPerToken = ratio * 1.5 + (1 - ratio) * 4;
    const maxChars = Math.floor(maxTokens * avgCharsPerToken);

    if (text.length <= maxChars) {
      return text;
    }

    // 줄 단위로 자르기 (단어 중간에서 자르지 않도록)
    const lines = text.split('\n');
    let result = '';
    let currentLength = 0;

    for (const line of lines) {
      if (currentLength + line.length + 1 > maxChars) {
        break;
      }
      result += result ? `\n${line}` : line;
      currentLength += line.length + 1;
    }

    return result || text.substring(0, maxChars);
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

        const skillNameList =
          injectionResult.injectedSkillNames.length > 0
            ? injectionResult.injectedSkillNames.join(', ')
            : injectionResult.injectedSkills.join(', ');
        emitChunk(`\n🎯 **Skill 활성화:** ${skillNameList}\n\n`, conversationId);

        console.log(`${logPrefix} Skills injected:`, {
          count: injectionResult.injectedSkills.length,
          skillIds: injectionResult.injectedSkills,
          tokens: injectionResult.totalTokens,
        });
      }

      // 스킵된 스킬이 있으면 사용자에게 알림
      if (injectionResult.skippedSkills && injectionResult.skippedSkills.length > 0) {
        console.warn(`${logPrefix} Skills skipped:`, injectionResult.skippedSkills);
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
