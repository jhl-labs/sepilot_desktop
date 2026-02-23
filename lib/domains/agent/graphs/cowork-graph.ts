/**
 * CoworkGraph - Supervisor-Worker 패턴 다중 에이전트 오케스트레이션 그래프
 *
 * 노드:
 * - supervisor: 요청 분류 (단순 → direct_response, 복합 → task_planner)
 * - direct_response: 단순 요청 직접 처리
 * - task_planner: LLM으로 CoworkPlan 생성
 * - task_dispatcher: 다음 실행 가능 태스크 선택
 * - agent_executor: 태스크를 적절한 서브그래프에 위임
 * - task_collector: 태스크 결과 수집
 * - synthesizer: 최종 보고서 생성
 *
 * 흐름:
 * START → supervisor → [direct_response → END | task_planner]
 * task_planner → task_dispatcher → agent_executor → task_collector → task_dispatcher (loop)
 * task_dispatcher → synthesizer → END (모든 태스크 완료 시)
 */

import { logger } from '@/lib/utils/logger';
import type { CoworkState } from '../state';
import type {
  CoworkPlan,
  CoworkTask,
  CoworkTaskStatus,
  StreamEvent,
  GraphConfig,
  GraphOptions,
} from '../types';
import {
  COWORK_SUPERVISOR_PROMPT,
  COWORK_TASK_PLANNER_PROMPT,
  COWORK_SYNTHESIZER_PROMPT,
} from '../prompts/cowork-system';

import { emitStreamingChunk } from '@/lib/domains/llm/streaming-callback';
import {
  saveSessionMeta,
  savePlan as persistPlan,
  saveTaskResult,
  checkResumableSession,
  cleanupSession,
} from '../utils/cowork-persistence';
// 태스크 타입별 토큰 예산
const TASK_TOKEN_BUDGETS: Record<string, number> = {
  coding: 50000,
  research: 40000,
  review: 20000,
  test: 20000,
  document: 20000,
  general: 20000,
};

/**
 * CoworkGraph 스트림 러너
 *
 * LangGraph StateGraph를 직접 사용하지 않고,
 * StreamEvent를 직접 yield하는 방식으로 구현합니다.
 * 이는 기존 CodingAgentStreamRunner 패턴과 유사합니다.
 */
export class CoworkStreamRunner {
  /**
   * 메인 스트리밍 실행
   */
  async *stream(
    initialState: CoworkState,
    config: GraphConfig,
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const state = { ...initialState };
    const conversationId = state.conversationId;
    let sessionStartedAt = new Date().toISOString();

    try {
      // ===== 1. Supervisor: 요청 분류 =====
      yield {
        type: 'node',
        node: 'supervisor',
        data: {
          iterationCount: 0,
          maxIterations: state.maxIterations,
          statusMessage: '요청을 분석하고 있습니다...',
        },
      };

      const decision = await this.supervisorNode(state);

      if (decision === 'direct') {
        // ===== 단순 요청: CodingAgent로 직접 처리 =====
        yield {
          type: 'node',
          node: 'direct_response',
          data: {
            iterationCount: 0,
            maxIterations: state.maxIterations,
            statusMessage: '직접 응답을 생성합니다...',
          },
        };

        yield* this.directResponseNode(state, config, options);
        return;
      }

      // ===== 2. Task Planner: 작업 계획 수립 =====
      yield {
        type: 'cowork_synthesizing' as StreamEvent['type'],
        data: { teamStatus: 'planning' },
      };

      yield {
        type: 'node',
        node: 'task_planner',
        data: {
          iterationCount: 0,
          maxIterations: state.maxIterations,
          statusMessage: '작업 계획을 수립하고 있습니다...',
        },
      };

      const plan = await this.taskPlannerNode(state);
      if (!plan || plan.tasks.length === 0) {
        // 계획 수립 실패 → 직접 응답으로 fallback
        yield* this.directResponseNode(state, config, options);
        return;
      }

      state.coworkPlan = plan;

      const workingDir = config.workingDirectory;
      sessionStartedAt = new Date().toISOString();

      // 세션 영속성: 이전 세션에서 복원 가능한 태스크 결과 확인 (Plan 저장 전에 수행)
      const resumeCheck = await checkResumableSession(conversationId, workingDir);
      if (resumeCheck.resumable && Object.keys(resumeCheck.taskResults).length > 0) {
        logger.info(
          `[CoworkGraph] Resuming session with ${Object.keys(resumeCheck.taskResults).length} cached task results`
        );
        // 이전 태스크 결과를 state에 복원
        for (const [taskId, result] of Object.entries(resumeCheck.taskResults)) {
          if (!state.taskResults[taskId]) {
            state.taskResults[taskId] = result;
            const matchingTask = plan.tasks.find((t) => t.id === taskId);
            if (matchingTask && matchingTask.status === 'pending') {
              matchingTask.status = 'completed';
              matchingTask.completedAt = new Date().toISOString();
            }
          }
        }
        emitStreamingChunk(
          `♻️ **이전 세션에서 ${Object.keys(resumeCheck.taskResults).length}개 태스크 결과를 복원했습니다.**\n\n`,
          conversationId
        );
      }

      // 세션 영속성: Plan 저장 (복원 후 저장하여 이전 세션 데이터를 덮어쓰지 않음)
      await persistPlan(conversationId, plan, workingDir);
      await saveSessionMeta(
        conversationId,
        {
          conversationId,
          status: 'planning',
          startedAt: sessionStartedAt,
          updatedAt: new Date().toISOString(),
          completedTaskIds: Object.keys(state.taskResults),
          failedTaskIds: [],
          skippedTaskIds: [],
        },
        workingDir
      );

      // Cowork Plan 이벤트 발행
      yield {
        type: 'cowork_plan' as StreamEvent['type'],
        data: plan,
      };

      // Plan 요약을 스트리밍
      emitStreamingChunk(
        `## 🤝 작업 계획\n\n**목표:** ${plan.objective}\n\n${plan.tasks.map((t, i) => `${i + 1}. **${t.title}** (${t.agentType})`).join('\n')}\n\n---\n\n`,
        conversationId
      );

      // 세션 상태 업데이트
      await saveSessionMeta(
        conversationId,
        {
          conversationId,
          status: 'executing',
          startedAt: sessionStartedAt,
          updatedAt: new Date().toISOString(),
          completedTaskIds: Object.keys(state.taskResults),
          failedTaskIds: [],
          skippedTaskIds: [],
        },
        workingDir
      );

      // ===== 3. Task Dispatch & Execute Loop =====
      yield {
        type: 'cowork_synthesizing' as StreamEvent['type'],
        data: { teamStatus: 'executing' },
      };

      let completedTasks = 0;
      const totalTasks = plan.tasks.length;

      for (let i = 0; i < plan.tasks.length; i++) {
        const task = plan.tasks[i];

        // 이미 완료된 태스크 건너뛰기 (세션 복원 시)
        if (task.status === 'completed' && state.taskResults[task.id]) {
          completedTasks++;
          emitStreamingChunk(
            `### 📋 Task ${i + 1}: ${task.title} (♻️ 이전 결과 사용)\n\n`,
            conversationId
          );
          continue;
        }

        // 의존성 확인
        const dependenciesMet = task.dependencies.every((depId) => {
          const depTask = plan.tasks.find((t) => t.id === depId);
          return depTask && (depTask.status === 'completed' || depTask.status === 'failed');
        });

        if (!dependenciesMet) {
          task.status = 'skipped';
          continue;
        }

        // 토큰 예산 확인
        const taskBudget = TASK_TOKEN_BUDGETS[task.type] || 20000;
        if (state.tokensConsumed + taskBudget > state.totalTokenBudget) {
          task.status = 'skipped';
          state.taskResults[task.id] = '토큰 예산 초과로 건너뜀';
          continue;
        }

        // ===== Task Start =====
        task.status = 'in_progress';
        task.startedAt = new Date().toISOString();

        yield {
          type: 'cowork_task_start' as StreamEvent['type'],
          data: { taskId: task.id, title: task.title, agentType: task.agentType },
        };

        yield {
          type: 'node',
          node: 'agent_executor',
          data: {
            iterationCount: completedTasks + 1,
            maxIterations: totalTasks,
            statusMessage: `[${completedTasks + 1}/${totalTasks}] ${task.title}`,
          },
        };

        emitStreamingChunk(`### 📋 Task ${i + 1}: ${task.title}\n\n`, conversationId);

        try {
          // ===== Agent Executor: 서브그래프 실행 =====
          const result = await this.executeTask(task, state, config, options);

          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          state.taskResults[task.id] = result;
          completedTasks++;

          // 세션 영속성: 태스크 결과 저장
          await saveTaskResult(conversationId, task.id, result, workingDir);

          yield {
            type: 'cowork_task_complete' as StreamEvent['type'],
            data: { taskId: task.id, result },
          };

          emitStreamingChunk(`\n✅ 완료\n\n---\n\n`, conversationId);
        } catch (error: any) {
          task.status = 'failed';
          task.error = error.message;
          task.completedAt = new Date().toISOString();
          state.taskResults[task.id] = `오류: ${error.message}`;

          // 세션 영속성: 실패 결과도 저장
          await saveTaskResult(conversationId, task.id, `오류: ${error.message}`, workingDir);

          yield {
            type: 'cowork_task_failed' as StreamEvent['type'],
            data: { taskId: task.id, error: error.message },
          };

          emitStreamingChunk(`\n❌ 실패: ${error.message}\n\n---\n\n`, conversationId);
          // 실패해도 계속 진행
        }
      }

      // ===== 4. Synthesizer: 최종 보고서 생성 =====
      yield {
        type: 'cowork_synthesizing' as StreamEvent['type'],
        data: { teamStatus: 'synthesizing' },
      };

      yield {
        type: 'node',
        node: 'synthesizer',
        data: {
          iterationCount: totalTasks,
          maxIterations: totalTasks,
          statusMessage: '최종 보고서를 작성하고 있습니다...',
        },
      };

      const report = await this.synthesizerNode(state);
      emitStreamingChunk(`\n\n${report}`, conversationId);

      // 세션 영속성: 성공적 완료 후 세션 정리
      await saveSessionMeta(
        conversationId,
        {
          conversationId,
          status: 'completed',
          startedAt: sessionStartedAt,
          updatedAt: new Date().toISOString(),
          completedTaskIds: plan.tasks.filter((t) => t.status === 'completed').map((t) => t.id),
          failedTaskIds: plan.tasks.filter((t) => t.status === 'failed').map((t) => t.id),
          skippedTaskIds: plan.tasks.filter((t) => t.status === 'skipped').map((t) => t.id),
        },
        workingDir
      );
      // 완료 후 .cowork 세션 디렉토리 정리
      await cleanupSession(conversationId, workingDir);

      yield { type: 'end' };
    } catch (error: any) {
      logger.error('[CoworkGraph] Stream error:', error);

      // 세션 영속성: 실패 시 세션 상태 저장 (나중에 재시도 가능)
      if (conversationId) {
        const failWorkingDir = config?.workingDirectory;
        await saveSessionMeta(
          conversationId,
          {
            conversationId,
            status: 'failed',
            startedAt: sessionStartedAt,
            updatedAt: new Date().toISOString(),
            completedTaskIds: Object.keys(state.taskResults || {}),
            failedTaskIds: [],
            skippedTaskIds: [],
          },
          failWorkingDir
        ).catch(() => {
          /* 영속성 저장 실패는 무시 */
        });
      }

      yield {
        type: 'error',
        error: error.message || 'Cowork graph execution failed',
      };
    }
  }

  /**
   * Supervisor 노드: 요청 복잡도 분류
   */
  private async supervisorNode(state: CoworkState): Promise<'direct' | 'plan'> {
    try {
      const { getLLMClient } = await import('@/lib/domains/llm/client');
      const client = getLLMClient();

      const lastUserMessage = state.messages
        .slice()
        .reverse()
        .find((m) => m.role === 'user');

      if (!lastUserMessage) {
        return 'direct';
      }

      // 키워드 기반 강제 plan 라우팅 — 문서 생성, 다단계 작업 등
      const userText =
        typeof lastUserMessage.content === 'string' ? lastUserMessage.content.toLowerCase() : '';
      const FORCE_PLAN_PATTERNS = [
        /pptx|ppt|프레젠테이션|슬라이드|발표\s*자료/,
        /docx|doc|문서\s*생성|보고서\s*작성/,
        /xlsx|엑셀|스프레드시트/,
        /pdf\s*(생성|만들|작성|보고서)|보고서.*pdf/,
        /html\s*(보고서|리포트|대시보드|report)|대시보드\s*생성/,
        /데이터\s*(분석|시각화|차트)|matplotlib|seaborn|plotly|차트\s*생성/,
        /조사.*만들|리서치.*생성|검색.*작성/,
        /전체.*구현|모든.*수정|전면.*개편/,
      ];
      if (FORCE_PLAN_PATTERNS.some((p) => p.test(userText))) {
        logger.info('[CoworkGraph] Supervisor: force plan (keyword match)');
        return 'plan';
      }

      const response = await client.getProvider().chat([
        {
          id: 'supervisor-system',
          role: 'system',
          content: COWORK_SUPERVISOR_PROMPT,
          created_at: Date.now(),
        },
        {
          id: 'supervisor-user',
          role: 'user',
          content: typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '',
          created_at: Date.now(),
        },
      ]);

      const responseText =
        typeof response === 'string' ? response : (response as any)?.content || '';

      // JSON 파싱 시도
      const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.decision === 'plan') {
          logger.info('[CoworkGraph] Supervisor decision: plan -', parsed.reason);
          return 'plan';
        }
      }

      logger.info('[CoworkGraph] Supervisor decision: direct');
      return 'direct';
    } catch (error) {
      logger.warn('[CoworkGraph] Supervisor failed, fallback to direct:', error);
      return 'direct';
    }
  }

  /**
   * Direct Response: AgentGraph(instant 모드)로 위임
   *
   * Supervisor가 "단순 요청"으로 분류한 것이므로 CodingAgent의 9-phase 파이프라인 대신
   * AgentGraph(instant 모드)를 사용하여 tool calling + Human-in-the-loop을 지원합니다.
   */
  private async *directResponseNode(
    state: CoworkState,
    config: GraphConfig,
    options?: GraphOptions
  ): AsyncGenerator<StreamEvent> {
    const { GraphFactory } = await import('../factory/graph-factory');

    // instant 모드(AgentGraph)로 위임 — CodingAgent와의 결합 제거
    const directConfig: GraphConfig = {
      ...config,
      thinkingMode: 'instant',
      enableTools: true,
    };

    for await (const event of GraphFactory.streamWithConfig(directConfig, state.messages, {
      ...options,
      conversationId: state.conversationId,
    })) {
      yield event;
    }
  }

  /**
   * Task Planner 노드: LLM으로 작업 분해
   */
  private async taskPlannerNode(state: CoworkState): Promise<CoworkPlan | null> {
    try {
      const { getLLMClient } = await import('@/lib/domains/llm/client');
      const client = getLLMClient();

      const lastUserMessage = state.messages
        .slice()
        .reverse()
        .find((m) => m.role === 'user');

      if (!lastUserMessage) {
        return null;
      }

      const response = await client.getProvider().chat([
        {
          id: 'planner-system',
          role: 'system',
          content: COWORK_TASK_PLANNER_PROMPT,
          created_at: Date.now(),
        },
        {
          id: 'planner-user',
          role: 'user',
          content: typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '',
          created_at: Date.now(),
        },
      ]);

      const responseText =
        typeof response === 'string' ? response : (response as any)?.content || '';

      // JSON 블록 추출
      const jsonMatch =
        responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
        responseText.match(/\{[\s\S]*"tasks"[\s\S]*\}/);

      if (!jsonMatch) {
        logger.warn('[CoworkGraph] Task planner failed to generate valid JSON');
        return null;
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      const plan: CoworkPlan = {
        objective: parsed.objective || '',
        tasks: (parsed.tasks || []).map((t: any, idx: number) => ({
          id: t.id || `task-${idx + 1}`,
          title: t.title || `Task ${idx + 1}`,
          description: t.description || '',
          type: t.type || 'general',
          status: 'pending' as CoworkTaskStatus,
          dependencies: t.dependencies || [],
          agentType: this.mapAgentType(t.type || 'general'),
        })),
        createdAt: new Date().toISOString(),
      };

      logger.info(`[CoworkGraph] Plan created: ${plan.tasks.length} tasks`);
      return plan;
    } catch (error) {
      logger.error('[CoworkGraph] Task planner error:', error);
      return null;
    }
  }

  /**
   * 태스크 타입에서 에이전트 그래프 타입 매핑
   */
  private mapAgentType(type: string): string {
    switch (type) {
      case 'coding':
      case 'document':
        // document 타입도 coding-agent를 사용하여 도구 실행(파일 생성 등) 지원
        return 'coding-agent';
      case 'research':
        return 'deep-web-research';
      case 'review':
      case 'test':
        return 'agent';
      default:
        return 'agent';
    }
  }

  /**
   * Agent Executor: 개별 태스크를 서브그래프로 실행
   */
  private async executeTask(
    task: CoworkTask,
    state: CoworkState,
    config: GraphConfig,
    options?: GraphOptions
  ): Promise<string> {
    const { GraphFactory } = await import('../factory/graph-factory');

    // 태스크별 ThinkingMode 매핑
    const thinkingModeMap: Record<string, string> = {
      'coding-agent': 'coding',
      'deep-web-research': 'deep-web-research',
      agent: 'instant',
    };

    const thinkingMode = thinkingModeMap[task.agentType] || 'instant';

    // 의존 태스크 결과 수집 (최대 4000자/태스크)
    const MAX_DEP_RESULT_CHARS = 4000;
    const depContextMessages: Array<{
      id: string;
      role: 'system';
      content: string;
      created_at: number;
    }> = [];

    if (task.dependencies.length > 0 && state.coworkPlan) {
      const depResults: string[] = [];
      for (const depId of task.dependencies) {
        const depTask = state.coworkPlan.tasks.find((t) => t.id === depId);
        const depResult = state.taskResults[depId];
        if (depTask && depResult) {
          const truncated =
            depResult.length > MAX_DEP_RESULT_CHARS
              ? `${depResult.substring(0, MAX_DEP_RESULT_CHARS)}\n... (truncated)`
              : depResult;
          depResults.push(`### ${depTask.title}\n${truncated}`);
        }
      }
      if (depResults.length > 0) {
        depContextMessages.push({
          id: `cowork-dep-${task.id}`,
          role: 'system' as const,
          content: `[이전 작업 결과 - 이 정보를 활용하여 현재 작업을 수행하세요]\n\n${depResults.join('\n\n---\n\n')}`,
          created_at: Date.now(),
        });
        logger.info(
          `[CoworkGraph] Injecting ${depResults.length} dependency results for task "${task.title}"`
        );
      }
    }

    // 태스크 설명을 user 메시지로 구성 (의존 태스크 결과 포함)
    const depContextNote =
      depContextMessages.length > 0
        ? `\n\n[중요] 이전 작업의 결과가 시스템 메시지로 제공되어 있습니다. 이 데이터를 직접 활용하세요. 파일에서 읽으려 하지 마세요.`
        : '';

    const taskMessages = [
      ...state.messages.filter((m) => m.role === 'system'),
      ...depContextMessages,
      {
        id: `cowork-task-${task.id}`,
        role: 'user' as const,
        content: `[Cowork Task: ${task.title}]\n\n${task.description}${depContextNote}`,
        created_at: Date.now(),
      },
    ];

    const taskConfig: GraphConfig = {
      ...config,
      thinkingMode: thinkingMode as any,
      enableTools: thinkingMode === 'coding' || thinkingMode === 'instant',
      enableRAG: thinkingMode === 'deep-web-research' || config.enableRAG,
    };

    let resultContent = '';

    for await (const event of GraphFactory.streamWithConfig(taskConfig, taskMessages, {
      ...options,
      conversationId: state.conversationId,
      maxIterations: 20, // 태스크별 최대 반복
    })) {
      // 1. CodingAgent/DeepWebResearch 형태: { type: 'node', data: { messages: [...] } }
      if (event.type === 'node' && event.data?.messages) {
        const lastMsg = event.data.messages[event.data.messages.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.content) {
          resultContent = lastMsg.content;
        }
      }

      // 2. AgentGraph 형태: { generate: { messages: [...] } } 또는 { tools: { messages: [...] } }
      if (!event.type) {
        const eventObj = event as Record<string, any>;
        const nodeData = eventObj.generate || eventObj.tools || eventObj.retrieve;
        if (nodeData?.messages) {
          const msgs = Array.isArray(nodeData.messages) ? nodeData.messages : [];
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg.content) {
            resultContent = lastMsg.content;
          }
        }
      }

      if (event.type === 'error') {
        throw new Error(event.error || 'Task execution failed');
      }
    }

    return resultContent || '작업이 완료되었으나 결과가 비어있습니다.';
  }

  /**
   * Synthesizer 노드: 최종 보고서 생성
   */
  private async synthesizerNode(state: CoworkState): Promise<string> {
    try {
      const { getLLMClient } = await import('@/lib/domains/llm/client');
      const client = getLLMClient();

      const plan = state.coworkPlan;
      if (!plan) {
        return '작업 계획이 없습니다.';
      }

      const taskSummary = plan.tasks
        .map((task) => {
          const statusEmoji =
            task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏭️';
          const result = state.taskResults[task.id] || '결과 없음';
          return `${statusEmoji} ${task.title} (${task.status})\n결과: ${result.substring(0, 500)}`;
        })
        .join('\n\n');

      const response = await client.getProvider().chat([
        {
          id: 'synthesizer-system',
          role: 'system',
          content: COWORK_SYNTHESIZER_PROMPT,
          created_at: Date.now(),
        },
        {
          id: 'synthesizer-user',
          role: 'user',
          content: `## 목표\n${plan.objective}\n\n## 태스크 결과\n${taskSummary}`,
          created_at: Date.now(),
        },
      ]);

      return typeof response === 'string' ? response : (response as any)?.content || '';
    } catch (error) {
      logger.error('[CoworkGraph] Synthesizer error:', error);

      // 폴백: 간단한 요약
      const plan = state.coworkPlan;
      if (!plan) {
        return '';
      }

      const completed = plan.tasks.filter((t) => t.status === 'completed').length;
      const failed = plan.tasks.filter((t) => t.status === 'failed').length;
      const skipped = plan.tasks.filter((t) => t.status === 'skipped').length;

      return `## 작업 요약\n\n완료: ${completed}, 실패: ${failed}, 건너뜀: ${skipped} / 전체 ${plan.tasks.length}개`;
    }
  }
}

/**
 * createCoworkGraph - 하위 호환성 유지용 팩토리
 */
export function createCoworkGraph() {
  return new CoworkStreamRunner();
}
