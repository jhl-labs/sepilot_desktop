/**
 * DeepThinkingGraph - 심층 사고 그래프
 *
 * ThinkingGraph를 상속하여 6단계 심층 사고 프로세스 제공
 *
 * 단계:
 * 0. Research: 정보 수집
 * 1. Initial Analysis: 초기 심층 분석
 * 2. Explore Perspectives: 다중 관점 탐색 (4개 관점)
 * 3. Deep Analysis: 각 관점 심화 분석
 * 4. Integration & Verification: 통합 및 검증
 * 5. Final Synthesis: 최종 답변 생성
 *
 * 흐름:
 * START → research → initialAnalysis → explorePerspectives → deepAnalysis → integrateVerify → finalSynthesis → END
 */

import { StateGraph, END, Annotation } from '@langchain/langgraph';
import { ThinkingGraph } from '../base/thinking-graph';
import type { Message } from '@/types';
import { formatDeepThinking } from '../utils/graph-utils';
import { logger } from '@/lib/utils/logger';

/**
 * DeepThinkingState Annotation
 */
export const DeepThinkingStateAnnotation = Annotation.Root({
  messages: Annotation<Message[]>({
    reducer: (existing: Message[], updates: Message[]) => [...existing, ...updates],
    default: () => [],
  }),
  initialAnalysis: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  researchContext: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  perspectives: Annotation<
    Array<{ id: string; name: string; content: string; deepAnalysis: string }>
  >({
    reducer: (_existing: any[], updates: any[]) => updates,
    default: () => [],
  }),
  integration: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  verification: Annotation<string>({
    reducer: (_existing: string, update: string) => update,
    default: () => '',
  }),
  conversationId: Annotation<string>({
    reducer: (_existing: string, update: string) => update || _existing,
    default: () => '',
  }),
});

export type DeepThinkingState = typeof DeepThinkingStateAnnotation.State;

/**
 * DeepThinkingGraph 클래스
 */
export class DeepThinkingGraph extends ThinkingGraph<DeepThinkingState> {
  /**
   * State Annotation 생성
   */
  protected createStateAnnotation(): typeof DeepThinkingStateAnnotation {
    return DeepThinkingStateAnnotation;
  }

  /**
   * 노드 추가
   */
  protected buildNodes(workflow: StateGraph<any>): any {
    return workflow
      .addNode('research', this.researchNodeWrapper.bind(this))
      .addNode('initialAnalysis', this.initialAnalysisNode.bind(this))
      .addNode('explorePerspectives', this.explorePerspectivesNode.bind(this))
      .addNode('deepAnalysis', this.deepAnalysisNode.bind(this))
      .addNode('integrateVerify', this.integrateVerifyNode.bind(this))
      .addNode('finalSynthesis', this.finalSynthesisNode.bind(this));
  }

  /**
   * 엣지 추가
   */
  protected buildEdges(workflow: any): any {
    return workflow
      .addEdge('__start__', 'research')
      .addEdge('research', 'initialAnalysis')
      .addEdge('initialAnalysis', 'explorePerspectives')
      .addEdge('explorePerspectives', 'deepAnalysis')
      .addEdge('deepAnalysis', 'integrateVerify')
      .addEdge('integrateVerify', 'finalSynthesis')
      .addEdge('finalSynthesis', END);
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
      research: { title: '정보 수집 (Research)', emoji: '🔎', stepNumber: 0, total: 6 },
      initialAnalysis: { title: '초기 심층 분석', emoji: '🧠', stepNumber: 1, total: 6 },
      explorePerspectives: { title: '다중 관점 탐색', emoji: '🔬', stepNumber: 2, total: 6 },
      deepAnalysis: { title: '심층 분석', emoji: '🔍', stepNumber: 3, total: 6 },
      integrateVerify: { title: '통합 및 검증', emoji: '🔗', stepNumber: 4, total: 6 },
      finalSynthesis: { title: '최종 종합', emoji: '✨', stepNumber: 5, total: 6 },
    };

    return steps[stepName] || { title: stepName, emoji: '📌', stepNumber: 0, total: 6 };
  }

  /**
   * Research 노드 래퍼 (DeepThinkingState용)
   */
  private async researchNodeWrapper(state: DeepThinkingState): Promise<Partial<DeepThinkingState>> {
    const baseResearch = this.createResearchNode('Deep');
    const result = await baseResearch(state as any);
    return {
      researchContext: result.context || '',
    };
  }

  /**
   * 1단계: 초기 분석
   */
  private async initialAnalysisNode(state: DeepThinkingState): Promise<Partial<DeepThinkingState>> {
    logger.info('[Deep] Step 1/6: Initial comprehensive analysis...');
    this.emitStepStart('initialAnalysis', state);

    const query = (await this.getLastUserMessage(state))?.content || '';
    const researchContext = state.researchContext;

    if (researchContext) {
      this.emitChunk(`\n📚 **사전 수집된 정보를 참조합니다.**\n\n`, state.conversationId);
    }

    const userLanguage = await this.getUserLanguage('Deep');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    const systemContent = `당신은 포괄적인 초기 분석을 수행하는 고도로 분석적인 AI입니다.

당신의 과제:
1. 핵심 질문을 깊이 이해하기
2. 모든 관련 측면과 차원 파악하기
3. 이 질문이 복잡하거나 미묘한 이유 고려하기
4. 탐색할 가치가 있는 관점 결정하기

철저하고 상세하게 분석하세요. ${languageInstruction}`;

    const prompt = `다음 질문에 대해 포괄적인 초기 분석을 수행하세요:\n\n${query}\n\n${researchContext ? `수집된 정보:\n${researchContext}\n\n` : ''}위 정보를 활용하여 분석하세요.`;

    // Skills 주입
    const skillMessages = await this.injectSkills(state);
    const tempState =
      skillMessages.length > 0
        ? { ...state, messages: [...state.messages, ...skillMessages] }
        : state;

    const analysis = await this.streamLLMWithSystem(tempState, systemContent, prompt);

    logger.info('[Deep] Initial analysis complete');

    return {
      initialAnalysis: analysis,
    };
  }

  /**
   * 2단계: 다중 관점 탐색
   */
  private async explorePerspectivesNode(
    state: DeepThinkingState
  ): Promise<Partial<DeepThinkingState>> {
    logger.info('[Deep] Step 2/6: Exploring multiple perspectives...');
    this.emitStepStart('explorePerspectives', state);

    const query = (await this.getLastUserMessage(state))?.content || '';
    const userLanguage = await this.getUserLanguage('Deep');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    const systemContent = `당신은 다양한 관점을 탐색하는 전략적 사고 AI입니다.

당신의 과제:
1. 이 질문에 접근할 수 있는 4가지 서로 다른 관점 생성하기
2. 각 관점은 고유해야 하며 새로운 통찰을 제공해야 함
3. 각 관점을 명확하게 정의하고 설명하기

다음 형식으로 정확히 4개의 관점을 제공하세요:

### 관점 1: [이름]
[설명]

### 관점 2: [이름]
[설명]

### 관점 3: [이름]
[설명]

### 관점 4: [이름]
[설명]

${languageInstruction}`;

    const prompt = `다음 질문과 초기 분석을 바탕으로 4가지 서로 다른 관점을 제시하세요:\n\n질문: ${query}\n\n초기 분석:\n${state.initialAnalysis}`;

    const perspectivesText = await this.streamLLMWithSystem(state, systemContent, prompt);

    // 관점 파싱
    const perspectives = this.parsePerspectives(perspectivesText);

    logger.info('[Deep] Explored perspectives:', perspectives.length);

    return {
      perspectives,
    };
  }

  /**
   * 3단계: 심층 분석 (각 관점)
   */
  private async deepAnalysisNode(state: DeepThinkingState): Promise<Partial<DeepThinkingState>> {
    logger.info('[Deep] Step 3/6: Deep analysis for each perspective...');
    this.emitStepStart('deepAnalysis', state);

    const query = (await this.getLastUserMessage(state))?.content || '';
    const userLanguage = await this.getUserLanguage('Deep');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    const updatedPerspectives = [];

    for (let i = 0; i < state.perspectives.length; i++) {
      const perspective = state.perspectives[i];

      this.emitChunk(`\n### 🔍 관점 ${i + 1}: ${perspective.name}\n\n`, state.conversationId);

      const systemContent = `당신은 특정 관점에서 깊이 분석하는 전문가입니다.

현재 관점: ${perspective.name}
관점 설명: ${perspective.content}

이 관점에서 질문을 철저히 탐색하세요:
1. 이 관점에서 무엇이 중요한가?
2. 이 관점이 밝히는 통찰은?
3. 이 관점의 장점과 한계는?

${languageInstruction}`;

      const prompt = `다음 질문을 "${perspective.name}" 관점에서 분석하세요:\n\n${query}\n\n초기 분석:\n${state.initialAnalysis}`;

      const deepAnalysis = await this.streamLLMWithSystem(state, systemContent, prompt);

      updatedPerspectives.push({
        ...perspective,
        deepAnalysis,
      });
    }

    logger.info('[Deep] Deep analysis complete for all perspectives');

    return {
      perspectives: updatedPerspectives,
    };
  }

  /**
   * 4단계: 통합 및 검증
   */
  private async integrateVerifyNode(state: DeepThinkingState): Promise<Partial<DeepThinkingState>> {
    logger.info('[Deep] Step 4/6: Integration and verification...');
    this.emitStepStart('integrateVerify', state);

    const query = (await this.getLastUserMessage(state))?.content || '';
    const userLanguage = await this.getUserLanguage('Deep');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    // 통합
    this.emitChunk(`\n#### 🔗 통합\n\n`, state.conversationId);

    const integrationSystem = `당신은 다양한 관점을 통합하는 종합 분석가입니다.

과제:
1. 모든 관점의 통찰을 일관된 이해로 통합하기
2. 관점들 간의 연결과 긴장 파악하기
3. 통합된 그림 형성하기

${languageInstruction}`;

    const allPerspectives = state.perspectives
      .map((p, i) => `\n관점 ${i + 1}: ${p.name}\n${p.deepAnalysis}`)
      .join('\n');

    const integrationPrompt = `다음 모든 관점을 통합된 이해로 종합하세요:\n\n${allPerspectives}\n\n원본 질문: ${query}`;

    const integration = await this.streamLLMWithSystem(state, integrationSystem, integrationPrompt);

    // 검증
    this.emitChunk(`\n\n#### ✅ 검증\n\n`, state.conversationId);

    const verificationSystem = `당신은 엄격한 품질 검증자입니다.

과제:
1. 분석의 완전성 검증하기
2. 논리적 일관성 확인하기
3. 간과된 부분이나 약점 파악하기
4. 필요한 조정 제안하기

${languageInstruction}`;

    const verificationPrompt = `다음 통합 분석을 검증하고 평가하세요:\n\n${integration}\n\n원본 질문: ${query}`;

    const verification = await this.streamLLMWithSystem(
      state,
      verificationSystem,
      verificationPrompt
    );

    logger.info('[Deep] Integration and verification complete');

    return {
      integration,
      verification,
    };
  }

  /**
   * 5단계: 최종 종합
   */
  private async finalSynthesisNode(state: DeepThinkingState): Promise<Partial<DeepThinkingState>> {
    logger.info('[Deep] Step 5/6: Final synthesis...');
    this.emitStepStart('finalSynthesis', state);

    const query = (await this.getLastUserMessage(state))?.content || '';
    const systemContent = this.createSystemMessage();
    const userLanguage = await this.getUserLanguage('Deep');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    const allContent = `
초기 분석:
${state.initialAnalysis}

다중 관점:
${state.perspectives.map((p, i) => `\n관점 ${i + 1}: ${p.name}\n${p.deepAnalysis}`).join('\n')}

통합:
${state.integration}

검증:
${state.verification}
`;

    const prompt = `위의 모든 심층 분석을 바탕으로 원본 질문에 대한 최종 포괄적 답변을 제공하세요.

${allContent}

원본 질문: ${query}

모든 관점과 통찰을 포함하는 명확하고 잘 구조화된 답변을 제공하세요. ${languageInstruction}`;

    let finalAnswer = '';
    for await (const chunk of this.streamLLM(
      [
        {
          id: 'system',
          role: 'system',
          content: systemContent,
          created_at: Date.now(),
        },
        {
          id: 'prompt',
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
    const processContent = `
# InitialAnalysis

${state.initialAnalysis}

${state.perspectives.map((p, i) => `\n# Perspective ${i + 1}: ${p.name}\n\n${p.deepAnalysis}`).join('\n')}

# Integration

${state.integration}

# Verification

${state.verification}
`;

    const formattedProcess = formatDeepThinking(processContent);
    const finalContent = `${formattedProcess}\n\n---\n\n## ✨ 최종 답변\n\n${finalAnswer}`;

    logger.info('[Deep] Final synthesis complete');

    return {
      messages: [this.createFinalMessage(finalContent)],
    };
  }

  /**
   * 관점 텍스트 파싱
   */
  private parsePerspectives(text: string): Array<{
    id: string;
    name: string;
    content: string;
    deepAnalysis: string;
  }> {
    const perspectives: Array<{
      id: string;
      name: string;
      content: string;
      deepAnalysis: string;
    }> = [];
    const regex = /###\s*관점\s*(\d+):\s*(.+?)\n([\s\S]+?)(?=###\s*관점\s*\d+:|$)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const id = `perspective-${match[1]}`;
      const name = match[2].trim();
      const content = match[3].trim();

      perspectives.push({
        id,
        name,
        content,
        deepAnalysis: '',
      });
    }

    // 4개 관점이 파싱되지 않았으면 기본 관점 추가
    if (perspectives.length < 4) {
      const defaultPerspectives = [
        { id: 'perspective-1', name: '이론적 관점', content: '이론적 분석' },
        { id: 'perspective-2', name: '실용적 관점', content: '실용적 분석' },
        { id: 'perspective-3', name: '역사적 관점', content: '역사적 분석' },
        { id: 'perspective-4', name: '미래 지향적 관점', content: '미래 지향적 분석' },
      ];

      while (perspectives.length < 4) {
        perspectives.push({ ...defaultPerspectives[perspectives.length], deepAnalysis: '' });
      }
    }

    return perspectives.slice(0, 4);
  }
}

/**
 * 팩토리 함수 (하위 호환성 유지용)
 * @deprecated - DeepThinkingGraph 클래스를 직접 사용하세요
 */
export function createDeepThinkingGraph() {
  const graph = new DeepThinkingGraph();
  return graph.compile();
}
