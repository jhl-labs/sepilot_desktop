/**
 * Terminal Agent
 *
 * AI 기반 Terminal Agent. 자연어 명령어를 shell 명령어로 변환하고,
 * 컨텍스트를 이해하여 다음 작업을 제안합니다.
 */

import { LLMService } from '@/lib/llm/service';
import { emitStreamingChunk, isAborted } from '@/lib/llm/streaming-callback';
import type { Message } from '@/types';
import type { TerminalAgentState, TerminalBlock } from '../types';
import { runCommandTool, executeRunCommand } from '../tools/run_command';
import { getHistoryTool, executeGetHistory } from '../tools/get_history';
import { searchCommandsTool, executeSearchCommands } from '../tools/search_commands';
import { explainErrorTool, executeExplainError } from '../tools/explain_error';
import { logger } from '@/lib/utils/logger';

const MAX_ITERATIONS = 10;
const TOOL_RESULT_HISTORY_LIMIT = 8;

/**
 * Terminal Agent Graph
 */
export class TerminalAgentGraph {
  private maxIterations: number;
  private toolCallHistory: Map<string, number>;

  constructor(maxIterations: number = MAX_ITERATIONS) {
    this.maxIterations = maxIterations;
    this.toolCallHistory = new Map();
  }

  /**
   * Agent 실행 (스트리밍)
   */
  async *stream(initialState: TerminalAgentState): AsyncGenerator<any> {
    let state = { ...initialState };
    let iterations = 0;

    logger.info('[TerminalAgent] Starting agent, conversationId:', state.conversationId);

    // 무한 루프 방지
    this.toolCallHistory.clear();

    while (iterations < this.maxIterations) {
      // Abort 체크
      if (isAborted(state.conversationId)) {
        logger.info('[TerminalAgent] Agent aborted by user');
        yield {
          type: 'agent_stopped',
          reason: 'user_abort',
        };
        break;
      }

      iterations++;

      // 1. Generate Node - LLM 호출
      logger.info('[TerminalAgent] Iteration', iterations, '- Calling LLM');
      const generateResult = await this.generateNode(state);

      // 메시지 추가
      state.messages = [...state.messages, ...generateResult.messages];

      yield {
        type: 'message',
        message: generateResult.messages[0],
      };

      // 2. Should Use Tool? - Tool 호출 필요 여부 판단
      const lastMessage = state.messages[state.messages.length - 1];

      if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
        // Tool 호출이 없으면 종료
        logger.info('[TerminalAgent] No tool calls, ending');
        break;
      }

      // 3. Execute Tools
      logger.info('[TerminalAgent] Executing', lastMessage.tool_calls.length, 'tool(s)');

      const toolResults = await this.executeTools(lastMessage.tool_calls as any[], state);

      // Tool 결과 메시지 추가
      const toolResultMessage: Message = {
        id: `tool-result-${Date.now()}`,
        role: 'tool',
        content: JSON.stringify(toolResults, null, 2),
        created_at: Date.now(),
      };

      state.messages.push(toolResultMessage);
      state.toolResults = [...(state.toolResults || []), ...toolResults];

      yield {
        type: 'tool_results',
        results: toolResults,
      };

      // 무한 루프 감지
      const toolCalls = lastMessage.tool_calls as any[];
      const lastToolName = toolCalls[0]?.function?.name || toolCalls[0]?.name;
      if (lastToolName) {
        const count = (this.toolCallHistory.get(lastToolName) || 0) + 1;
        this.toolCallHistory.set(lastToolName, count);

        if (count > 3) {
          logger.warn('[TerminalAgent] Detected infinite loop, stopping');
          yield {
            type: 'agent_stopped',
            reason: 'infinite_loop',
          };
          break;
        }
      }
    }

    if (iterations >= this.maxIterations) {
      logger.warn('[TerminalAgent] Max iterations reached');
      yield {
        type: 'agent_stopped',
        reason: 'max_iterations',
      };
    }

    logger.info('[TerminalAgent] Agent completed');
  }

  /**
   * Generate Node - LLM 호출
   */
  private async generateNode(state: TerminalAgentState): Promise<{ messages: Message[] }> {
    // System prompt 생성
    const systemPrompt = this.createSystemPrompt(state);

    // 메시지 준비
    const messages: Message[] = [
      {
        id: 'system',
        role: 'system',
        content: systemPrompt,
        created_at: Date.now(),
      },
      ...state.messages,
    ];

    // Tools 정의 (OpenAI function format으로 변환)
    const tools = this.getAvailableTools().map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));

    // LLM 호출 (non-streaming)
    const response = await LLMService.chat(messages, {
      tools,
      temperature: 0.3,
      maxTokens: 2000,
      stream: false,
    });

    const assistantMessage: Message = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: response.content,
      tool_calls: response.toolCalls,
      created_at: Date.now(),
    };

    return {
      messages: [assistantMessage],
    };
  }

  /**
   * System Prompt 생성
   */
  private createSystemPrompt(state: TerminalAgentState): string {
    const recentCommands = state.recentBlocks
      ?.slice(-5)
      .map((block) => `  ${block.command} (exit: ${block.exitCode || 0})`)
      .join('\n');

    return `You are an intelligent Terminal Assistant with real access to a Unix/Linux/Windows terminal.

**Context:**
- Current Working Directory: ${state.currentCwd || 'unknown'}
- Shell: ${state.currentShell || 'bash'}
- Platform: ${state.platform || 'linux'}
${recentCommands ? `- Recent Commands:\n${recentCommands}` : ''}

**Your Capabilities:**
1. **Natural Language to Command**: Convert user requests to shell commands
2. **Context-Aware Suggestions**: Use command history and output for better suggestions
3. **Error Analysis**: When commands fail, diagnose and suggest fixes
4. **Multi-Step Tasks**: Break down complex tasks into sequential commands

**Available Tools:**
- run_command: Execute shell commands
- get_history: Retrieve command history
- search_commands: Search similar commands (RAG-based)
- explain_error: Analyze error messages

**Guidelines:**
1. ALWAYS prefer simple, commonly-used commands
2. For destructive operations (rm, mv, etc.), explain the risks first
3. Use command history context to make smarter suggestions
4. When errors occur, analyze stderr and suggest fixes
5. Be concise and clear in your explanations

**Response Format:**
- For natural language input: Provide command suggestions with brief explanations
- For direct commands: Execute and analyze output
- For errors: Diagnose cause and provide 2-3 solutions`;
  }

  /**
   * 사용 가능한 Tools 목록
   */
  private getAvailableTools() {
    return [runCommandTool, getHistoryTool, searchCommandsTool, explainErrorTool];
  }

  /**
   * Tools 실행
   */
  private async executeTools(toolCalls: any[], state: TerminalAgentState): Promise<any[]> {
    const results = [];

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

      logger.info('[TerminalAgent] Executing tool:', toolName, 'with args:', toolArgs);

      let result;

      try {
        switch (toolName) {
          case 'run_command':
            result = await executeRunCommand({
              ...toolArgs,
              cwd: toolArgs.cwd || state.currentCwd,
            });
            break;

          case 'get_history':
            result = await executeGetHistory(toolArgs);
            break;

          case 'search_commands':
            result = await executeSearchCommands(toolArgs);
            break;

          case 'explain_error':
            result = await executeExplainError(toolArgs);
            break;

          default:
            result = {
              success: false,
              error: `Unknown tool: ${toolName}`,
            };
        }
      } catch (error: any) {
        result = {
          success: false,
          error: error.message,
        };
      }

      results.push({
        toolCallId: toolCall.id,
        toolName,
        result: JSON.stringify(result),
      });
    }

    return results;
  }
}

/**
 * Terminal Agent Graph 생성
 */
export function createTerminalAgentGraph(maxIterations: number = MAX_ITERATIONS) {
  return new TerminalAgentGraph(maxIterations);
}
