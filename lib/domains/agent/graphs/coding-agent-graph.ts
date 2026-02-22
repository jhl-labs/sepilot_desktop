/**
 * CodingAgentGraph - 코딩 에이전트 그래프
 *
 * BaseGraph를 상속하여 9단계 계획-실행-검증 프로세스 제공
 *
 * 노드:
 * - triage: 요청 분류 (simple/complex)
 * - direct_response: 간단한 질문 직접 응답
 * - planner: 실행 계획 수립
 * - iteration_guard: 반복 횟수 제어
 * - agent: LLM with tool calling
 * - approval: Human-in-the-loop 도구 승인
 * - tools: 도구 실행
 * - verifier: 실행 결과 검증
 * - reporter: 최종 보고서 생성
 *
 * 흐름:
 * START → triage → [direct_response OR planner]
 * planner → iteration_guard → agent → [approval →] tools → verifier → iteration_guard (loop) → reporter → END
 */

import { StateGraph, END } from '@langchain/langgraph';
import { CodingAgentStateAnnotation, CodingAgentState } from '../state';
import { BaseGraph } from '../base/base-graph';
import { shouldUseTool } from '../nodes/tools';

// Import all node functions and utilities from existing coding-agent.ts
import {
  triageNode,
  directResponseNode,
  planningNode,
  iterationGuardNode,
  agentNode,
  approvalNode,
  enhancedToolsNode,
  verificationNode,
  reporterNode,
  CodingAgentStreamRunner,
  triageNextStep,
  guardDecision,
  approvalNextStep,
  verificationNextStep,
} from './coding-agent';

/**
 * CodingAgentGraph 클래스
 */
export class CodingAgentGraph extends BaseGraph<CodingAgentState> {
  private runner = new CodingAgentStreamRunner();

  /**
   * State Annotation 생성
   */
  protected createStateAnnotation(): typeof CodingAgentStateAnnotation {
    return CodingAgentStateAnnotation;
  }

  /**
   * 노드 추가
   */
  protected buildNodes(workflow: StateGraph<any>): any {
    return workflow
      .addNode('triage', triageNode)
      .addNode('direct_response', directResponseNode)
      .addNode('planner', planningNode)
      .addNode('iteration_guard', iterationGuardNode)
      .addNode('agent', agentNode)
      .addNode('approval', approvalNode)
      .addNode('tools', enhancedToolsNode)
      .addNode('verifier', verificationNode)
      .addNode('reporter', reporterNode);
  }

  /**
   * 엣지 추가
   */
  protected buildEdges(workflow: any): any {
    // Set entry point
    workflow.setEntryPoint('triage');

    // Add conditional and regular edges
    return workflow
      .addConditionalEdges('triage', triageNextStep, {
        direct: 'direct_response',
        graph: 'planner',
      })
      .addEdge('direct_response', END)
      .addEdge('planner', 'iteration_guard')
      .addConditionalEdges('iteration_guard', guardDecision, {
        continue: 'agent',
        stop: 'reporter',
      })
      .addConditionalEdges('agent', shouldUseTool, {
        tools: 'approval',
        end: 'verifier',
      })
      .addConditionalEdges('approval', approvalNextStep, {
        run_tools: 'tools',
        retry: 'iteration_guard',
      })
      .addEdge('tools', 'verifier')
      .addConditionalEdges('verifier', verificationNextStep, {
        continue: 'iteration_guard',
        report: 'reporter',
      })
      .addEdge('reporter', END);
  }

  /**
   * Override stream to delegate to the unified CodingAgentStreamRunner.
   * This keeps Graph path and direct runner path behavior identical.
   */
  public async *stream(initialState: CodingAgentState, options?: any): AsyncGenerator<any> {
    const toolApprovalCallback =
      typeof options === 'function'
        ? options
        : typeof options?.toolApprovalCallback === 'function'
          ? options.toolApprovalCallback
          : undefined;

    const discussInputCallback =
      typeof options?.discussInputCallback === 'function'
        ? options.discussInputCallback
        : undefined;

    for await (const event of this.runner.stream(
      initialState,
      toolApprovalCallback,
      discussInputCallback
    )) {
      yield event;
    }
  }
}

/**
 * 팩토리 함수 (하위 호환성 유지용)
 * @deprecated - CodingAgentGraph 클래스를 직접 사용하세요
 */
export function createCodingAgentGraph() {
  const graph = new CodingAgentGraph();
  return graph.compile();
}
