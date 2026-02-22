/**
 * SequentialThinkingGraph - 순차적 사고 그래프
 *
 * ThinkingGraph를 상속하여 5단계 순차 사고 프로세스 제공
 *
 * 단계:
 * 0. Research: 정보 수집
 * 1. Analyze: 문제 분석
 * 2. Plan: 계획 수립
 * 3. Execute: 계획 실행
 * 4. Synthesize: 최종 답변 생성
 *
 * 흐름:
 * START → research → analyze → plan → execute → synthesize → END
 */

import { StateGraph, END } from '@langchain/langgraph';
import { ChatStateAnnotation, type ChatState } from '../state';
import { ThinkingGraph } from '../base/thinking-graph';
import { formatSequentialThinking } from '../utils/graph-utils';
import { logger } from '@/lib/utils/logger';

/**
 * SequentialThinkingGraph 클래스
 */
export class SequentialThinkingGraph extends ThinkingGraph<ChatState> {
  /**
   * State Annotation 생성
   */
  protected createStateAnnotation(): typeof ChatStateAnnotation {
    return ChatStateAnnotation;
  }

  /**
   * 노드 추가
   */
  protected buildNodes(workflow: StateGraph<any>): any {
    return workflow
      .addNode('research', this.createResearchNode('Sequential'))
      .addNode('analyze', this.analyzeNode.bind(this))
      .addNode('plan', this.planNode.bind(this))
      .addNode('execute', this.executeNode.bind(this))
      .addNode('synthesize', this.synthesizeNode.bind(this));
  }

  /**
   * 엣지 추가
   */
  protected buildEdges(workflow: any): any {
    return workflow
      .addEdge('__start__', 'research')
      .addEdge('research', 'analyze')
      .addEdge('analyze', 'plan')
      .addEdge('plan', 'execute')
      .addEdge('execute', 'synthesize')
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
      analyze: { title: '문제 분석', emoji: '🔍', stepNumber: 1, total: 5 },
      plan: { title: '계획 수립', emoji: '📋', stepNumber: 2, total: 5 },
      execute: { title: '계획 실행', emoji: '⚙️', stepNumber: 3, total: 5 },
      synthesize: { title: '최종 답변', emoji: '✨', stepNumber: 4, total: 5 },
    };

    return steps[stepName] || { title: stepName, emoji: '📌', stepNumber: 0, total: 5 };
  }

  /**
   * 1단계: 문제 분석
   */
  private async analyzeNode(state: ChatState): Promise<Partial<ChatState>> {
    logger.info('[Sequential] Step 1: Analyzing problem...');
    this.emitStepStart('analyze', state);

    // 수집된 정보(Research/RAG) 가져오기
    const query = (await this.getLastUserMessage(state))?.content || '';
    const researchContext = state.context;

    if (researchContext) {
      this.emitChunk(`\n📚 **사전 수집된 정보를 참조합니다.**\n\n`, state.conversationId);
    }

    // 사용자 언어 설정
    const userLanguage = await this.getUserLanguage('Sequential');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    const systemContent = `당신은 복잡한 문제를 단계별로 분해하는 사려 깊은 AI 어시스턴트입니다.

당신의 과제는 사용자의 질문을 분석하고 다음을 파악하는 것입니다:
1. 주요 질문 또는 문제
2. 관련된 핵심 개념들
3. 답변에 필요한 정보

명확하고 구조화된 형식으로 분석을 제공하세요. ${languageInstruction}`;

    const prompt = `다음 질문을 분석하고 분해하세요:\n\n${query}\n\n${researchContext ? `수집된 정보:\n${researchContext}\n\n` : ''}위 정보를 활용하여 분석하세요.`;

    // Skills 주입
    const skillMessages = await this.injectSkills(state);
    const tempState =
      skillMessages.length > 0
        ? { ...state, messages: [...state.messages, ...skillMessages] }
        : state;

    const analysis = await this.streamLLMWithSystem(tempState, systemContent, prompt);

    logger.info('[Sequential] Analysis complete:', `${analysis.substring(0, 100)}...`);

    return {
      context: `${researchContext ? `${researchContext}\n\n` : ''}# Analysis\n\n${analysis}`,
    };
  }

  /**
   * 2단계: 단계별 계획 수립
   */
  private async planNode(state: ChatState): Promise<Partial<ChatState>> {
    logger.info('[Sequential] Step 2: Planning solution steps...');
    this.emitStepStart('plan', state);

    const userLanguage = await this.getUserLanguage('Sequential');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    const systemContent = `당신은 전략적 계획 AI입니다. 분석을 바탕으로 질문에 답하기 위한 단계별 계획을 수립하세요.

포괄적인 답변으로 이어질 단계 목록(3-5단계)을 번호를 붙여 작성하세요.
각 단계는 명확하고 실행 가능해야 합니다. ${languageInstruction}`;

    const query = (await this.getLastUserMessage(state))?.content || '';
    const prompt = `다음 분석을 바탕으로 단계별 계획을 수립하세요:\n\n${state.context}\n\n원본 질문: ${query}`;

    const plan = await this.streamLLMWithSystem(state, systemContent, prompt);

    logger.info('[Sequential] Plan complete:', `${plan.substring(0, 100)}...`);

    return {
      context: `${state.context}\n\n# Plan\n\n${plan}`,
    };
  }

  /**
   * 3단계: 단계별 실행
   */
  private async executeNode(state: ChatState): Promise<Partial<ChatState>> {
    logger.info('[Sequential] Step 3: Executing plan...');
    this.emitStepStart('execute', state);

    const userLanguage = await this.getUserLanguage('Sequential');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    const systemContent = `당신은 계획의 각 단계를 신중하게 실행하는 세부 지향적인 AI입니다.

각 단계를 거치면서 상세한 추론과 정보를 제공하세요.
철저하게 여러 각도를 고려하세요. ${languageInstruction}`;

    const query = (await this.getLastUserMessage(state))?.content || '';
    const prompt = `이 계획의 각 단계를 상세히 실행하세요:\n\n${state.context}\n\n원본 질문: ${query}`;

    const execution = await this.streamLLMWithSystem(state, systemContent, prompt);

    logger.info('[Sequential] Execution complete:', `${execution.substring(0, 100)}...`);

    return {
      context: `${state.context}\n\n# Execution\n\n${execution}`,
    };
  }

  /**
   * 4단계: 최종 답변 생성
   */
  private async synthesizeNode(state: ChatState): Promise<Partial<ChatState>> {
    logger.info('[Sequential] Step 4: Synthesizing final answer...');
    this.emitStepStart('synthesize', state);

    const systemContent = this.createSystemMessage();
    const userLanguage = await this.getUserLanguage('Sequential');
    const languageInstruction = this.getLanguageInstruction(userLanguage);

    const query = (await this.getLastUserMessage(state))?.content || '';
    const prompt = `위의 모든 분석, 계획, 실행을 바탕으로 원본 질문에 대한 포괄적인 최종 답변을 제공하세요.

${state.context}

원본 질문: ${query}

위 사고 과정의 모든 통찰을 포함하는 명확하고 잘 구조화된 답변을 제공하세요. ${languageInstruction}`;

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
    const processNodes = formatSequentialThinking(state.context || '');
    const finalContent = `${processNodes}\n\n---\n\n## ✨ 최종 답변\n\n${finalAnswer}`;

    logger.info('[Sequential] Final answer generated:', `${finalAnswer.substring(0, 100)}...`);

    return {
      messages: [this.createFinalMessage(finalContent)],
    };
  }
}

/**
 * 팩토리 함수 (하위 호환성 유지용)
 * @deprecated - SequentialThinkingGraph 클래스를 직접 사용하세요
 */
export function createSequentialThinkingGraph() {
  const graph = new SequentialThinkingGraph();
  return graph.compile();
}
