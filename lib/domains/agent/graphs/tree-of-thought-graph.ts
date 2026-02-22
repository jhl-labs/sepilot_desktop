/**
 * TreeOfThoughtGraph - 생각의 나무 그래프
 *
 * ThinkingGraph를 상속하여 5단계 다중 경로 탐색 프로세스 제공
 *
 * 단계:
 * 0. Research: 정보 수집
 * 1. Decompose: 문제 분해
 * 2. Generate Branches: 다중 경로 생성 (3개 접근 방식)
 * 3. Evaluate: 각 경로 평가
 * 4. Synthesize: 최종 답변 통합
 *
 * 흐름:
 * START → research → decompose → generateBranches → evaluate → synthesize → END
 */

import { StateGraph, END, Annotation } from '@langchain/langgraph';
import type { Message } from '@/types';
import { ThinkingGraph } from '../base/thinking-graph';
import { logger } from '@/lib/utils/logger';

/**
 * TreeOfThoughtState Annotation
 */
export const TreeOfThoughtStateAnnotation = Annotation.Root({
  messages: Annotation<Message[]>({
    reducer: (existing: Message[], updates: Message[]) => [...existing, ...updates],
    default: () => [],
  }),
  context: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  branches: Annotation<Array<{ id: string; content: string; score: number }>>({
    reducer: (_existing: any[], updates: any[]) => updates,
    default: () => [],
  }),
  selectedBranch: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  conversationId: Annotation<string>({
    reducer: (_existing: string, update: string) => update || _existing,
    default: () => '',
  }),
});

export type TreeOfThoughtState = typeof TreeOfThoughtStateAnnotation.State;

/**
 * TreeOfThoughtGraph 클래스
 */
export class TreeOfThoughtGraph extends ThinkingGraph<TreeOfThoughtState> {
  /**
   * State Annotation 생성
   */
  protected createStateAnnotation(): typeof TreeOfThoughtStateAnnotation {
    return TreeOfThoughtStateAnnotation;
  }

  /**
   * 노드 추가
   */
  protected buildNodes(workflow: StateGraph<any>): any {
    return workflow
      .addNode('research', this.createResearchNode('ToT'))
      .addNode('decompose', this.decomposeNode.bind(this))
      .addNode('generate_branches', this.generateBranchesNode.bind(this))
      .addNode('evaluate', this.evaluateBranchesNode.bind(this))
      .addNode('synthesize', this.synthesizeNode.bind(this));
  }

  /**
   * 엣지 추가
   */
  protected buildEdges(workflow: any): any {
    return workflow
      .addEdge('__start__', 'research')
      .addEdge('research', 'decompose')
      .addEdge('decompose', 'generate_branches')
      .addEdge('generate_branches', 'evaluate')
      .addEdge('evaluate', 'synthesize')
      .addEdge('synthesize', END);
  }

  /**
   * 단계 설명 가져오기
   */
  protected getStepDescription(stepName: string): {
    title: string;
    emoji: string;
    stepNumber: number;
    total: number;
  } {
    const steps: Record<
      string,
      { title: string; emoji: string; stepNumber: number; total: number }
    > = {
      research: { title: '정보 수집 (Research)', emoji: '🔎', stepNumber: 0, total: 5 },
      decompose: { title: '문제 분해', emoji: '🌳', stepNumber: 1, total: 5 },
      generate_branches: {
        title: '다중 사고 경로 생성',
        emoji: '🌿',
        stepNumber: 2,
        total: 5,
      },
      evaluate: { title: '경로 평가', emoji: '⚖️', stepNumber: 3, total: 5 },
      synthesize: { title: '최종 답변 통합', emoji: '✨', stepNumber: 4, total: 5 },
    };

    return steps[stepName] || { title: stepName, emoji: '📌', stepNumber: 0, total: 5 };
  }

  /**
   * 1단계: 문제 분해
   */
  private async decomposeNode(state: TreeOfThoughtState): Promise<Partial<TreeOfThoughtState>> {
    logger.info('[ToT] Step 1: Decomposing problem...');
    this.emitStepStart('decompose', state);

    // 수집된 정보(Research/RAG) 가져오기
    const query = (await this.getLastUserMessage(state))?.content || '';
    const researchContext = state.context;

    if (researchContext) {
      this.emitChunk(`\n📚 **사전 수집된 정보를 참조합니다.**\n\n`, state.conversationId);
    }

    // 사용자 언어 설정
    const userLanguage = await this.getUserLanguage('ToT');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    const systemContent = `당신은 복잡한 문제를 핵심 측면과 고려사항으로 분해하는 분석적 AI입니다.

질문을 분석하고 다음을 파악하세요:
1. 핵심 질문
2. 고려해야 할 주요 측면들
3. 답변에 대한 가능한 접근 방식들

포괄적이면서도 간결하게 작성하세요. ${languageInstruction}`;

    const prompt = `다음 질문을 핵심 측면들로 분해하세요:\n\n${query}\n\n${researchContext ? `수집된 정보:\n${researchContext}\n\n` : ''}위 정보를 활용하여 분해하세요.`;

    const decomposition = await this.streamLLMWithSystem(state, systemContent, prompt);

    logger.info('[ToT] Decomposition complete');

    return {
      context: `${researchContext ? `${researchContext}\n\n` : ''}${decomposition}`,
    };
  }

  /**
   * 2단계: 다중 경로 생성 (3개의 다른 접근 방식)
   */
  private async generateBranchesNode(
    state: TreeOfThoughtState
  ): Promise<Partial<TreeOfThoughtState>> {
    logger.info('[ToT] Step 2: Generating multiple thought branches...');
    this.emitStepStart('generate_branches', state);

    const branches: Array<{ id: string; content: string; score: number }> = [];

    // 사용자 언어 설정 가져오기
    const userLanguage = await this.getUserLanguage('ToT');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    // 3가지 다른 접근 방식으로 답변 생성
    const approaches = [
      { name: '실용적 접근', desc: '실용적이고 실행 가능한 조언에 집중' },
      { name: '이론적 접근', desc: '이론적 이해와 원칙에 집중' },
      { name: '균형적 접근', desc: '장단점을 고려한 균형 잡힌 관점에 집중' },
    ];

    const query = (await this.getLastUserMessage(state))?.content || '';

    for (let i = 0; i < 3; i++) {
      // 각 브랜치 시작 알림
      this.emitChunk(`\n### 🔀 경로 ${i + 1}: ${approaches[i].name}\n\n`, state.conversationId);

      const systemContent = `당신은 질문에 대해 다양한 관점을 제공하는 사려 깊은 AI 어시스턴트입니다.

${approaches[i].desc}

아래 분해를 바탕으로 이 특정 접근 방식에 집중하여 답변을 제공하세요. ${languageInstruction}`;

      const prompt = `분해:\n${state.context}\n\n원본 질문: ${query}\n\n${approaches[i].desc}을 사용하여 답변을 제공하세요`;

      let branchContent = '';
      for await (const chunk of this.streamLLM(
        [
          {
            id: `system-branch-${i}`,
            role: 'system',
            content: systemContent,
            created_at: Date.now(),
          },
          {
            id: `branch-prompt-${i}`,
            role: 'user',
            content: prompt,
            created_at: Date.now(),
          },
        ],
        { tools: [], tool_choice: 'none' }
      )) {
        branchContent += chunk;
        this.emitChunk(chunk, state.conversationId);
      }

      branches.push({
        id: `branch-${i}`,
        content: branchContent,
        score: 0, // Will be evaluated in next step
      });

      logger.info(`[ToT] Branch ${i + 1} generated`);
    }

    return {
      branches,
    };
  }

  /**
   * 3단계: 각 경로 평가
   */
  private async evaluateBranchesNode(
    state: TreeOfThoughtState
  ): Promise<Partial<TreeOfThoughtState>> {
    logger.info('[ToT] Step 3: Evaluating branches...');
    this.emitStepStart('evaluate', state);

    // 사용자 언어 설정 가져오기
    const userLanguage = await this.getUserLanguage('ToT');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    const systemContent = `당신은 답변의 품질을 평가하는 평가 AI입니다.

각 답변을 다음 기준으로 평가하세요:
1. 질문과의 관련성 (0-10)
2. 완전성 (0-10)
3. 명확성과 일관성 (0-10)
4. 통찰의 깊이 (0-10)

각 답변에 대해 총점(0-40)만 제공하세요. 형식: "점수: X". ${languageInstruction}`;

    const evaluatedBranches: Array<{ id: string; content: string; score: number }> = [];
    const query = (await this.getLastUserMessage(state))?.content || '';

    for (let idx = 0; idx < state.branches.length; idx++) {
      const branch = state.branches[idx];

      this.emitChunk(`\n### 📊 경로 ${idx + 1} 평가 중...\n\n`, state.conversationId);

      const prompt = `원본 질문: ${query}\n\n평가할 답변:\n${branch.content}\n\n총점(0-40)을 제공하세요:`;

      let scoreText = '';
      for await (const chunk of this.streamLLM(
        [
          {
            id: 'system-eval',
            role: 'system',
            content: systemContent,
            created_at: Date.now(),
          },
          {
            id: `eval-prompt-${idx}`,
            role: 'user',
            content: prompt,
            created_at: Date.now(),
          },
        ],
        { tools: [], tool_choice: 'none' }
      )) {
        scoreText += chunk;
        this.emitChunk(chunk, state.conversationId);
      }

      // Extract score
      const match = scoreText.match(/(\d+)/);
      const score = match ? parseInt(match[1]) : 20; // Default to middle score if parsing fails

      logger.info(`[ToT] Branch ${idx + 1} score: ${score}`);

      evaluatedBranches.push({
        ...branch,
        score,
      });
    }

    // Sort by score and select best
    const sortedBranches = evaluatedBranches.sort((a, b) => b.score - a.score);
    const selectedBranch = sortedBranches[0].content;

    this.emitChunk(
      `\n\n**🏆 최고 점수 경로 선택됨 (점수: ${sortedBranches[0].score})**\n`,
      state.conversationId
    );

    logger.info('[ToT] Best branch selected');

    return {
      branches: evaluatedBranches,
      selectedBranch,
    };
  }

  /**
   * 4단계: 최종 답변 생성
   */
  private async synthesizeNode(state: TreeOfThoughtState): Promise<Partial<TreeOfThoughtState>> {
    logger.info('[ToT] Step 4: Synthesizing final answer...');
    this.emitStepStart('synthesize', state);

    const systemContent = this.createSystemMessage();

    // 상위 2개 브랜치를 통합
    const topBranches = state.branches
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((b, idx) => `### Approach ${idx + 1} (Score: ${b.score}):\n${b.content}`)
      .join('\n\n');

    // 사용자 언어 설정 가져오기
    const userLanguage = await this.getUserLanguage('ToT');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    const query = (await this.getLastUserMessage(state))?.content || '';
    const prompt = `당신은 이 질문에 답하기 위해 여러 접근 방식을 탐색했습니다.
이제 상위 접근 방식들의 최고의 통찰을 포괄적이고 잘 구조화된 답변으로 종합하세요.

원본 질문: ${query}

탐색된 상위 접근 방식들:
${topBranches}

이러한 접근 방식들의 최고의 측면을 포함하는 최종적이고 포괄적인 답변을 제공하세요. ${languageInstruction}`;

    let finalAnswer = '';
    for await (const chunk of this.streamLLM(
      [
        {
          id: 'system-synth',
          role: 'system',
          content: systemContent,
          created_at: Date.now(),
        },
        {
          id: 'synthesize-prompt',
          role: 'user',
          content: prompt,
          created_at: Date.now(),
        },
      ],
      { tools: [], tool_choice: 'none' }
    )) {
      finalAnswer += chunk;
      this.emitChunk(chunk, state.conversationId);
    }

    // 사고 과정 포맷팅
    const processContent =
      `## 🌳 1단계: 문제 분해\n\n${state.context}\n\n` +
      `## 🌿 2단계: 다중 사고 경로 생성\n\n${state.branches
        .map((b, i) => `### 🔀 경로 ${i + 1}\n${b.content}`)
        .join('\n\n')}\n\n` +
      `## ⚖️ 3단계: 경로 평가\n\n${state.branches
        .map((b, i) => `### 📊 경로 ${i + 1} 점수: ${b.score}`)
        .join('\n')}\n\n**🏆 최고 점수 경로 선택됨 (점수: ${state.branches[0]?.score || 0})**`;

    const finalContent = `${processContent}\n\n---\n\n## ✨ 최종 답변\n\n${finalAnswer}`;

    logger.info('[ToT] Final answer synthesized');

    return {
      messages: [this.createFinalMessage(finalContent)],
    };
  }
}

/**
 * 팩토리 함수 (하위 호환성 유지용)
 * @deprecated - TreeOfThoughtGraph 클래스를 직접 사용하세요
 */
export function createTreeOfThoughtGraph() {
  const graph = new TreeOfThoughtGraph();
  return graph.compile();
}
