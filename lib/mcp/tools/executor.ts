import { getErrorMessage } from '@/lib/utils/error-handler';

import { MCPServerManager } from '../server-manager';
import { ToolRegistry } from './registry';
import { ToolCallResult } from '../types';
import { executeBuiltinTool, getBuiltinTools } from './builtin-tools';

import { logger } from '@/lib/utils/logger';
/**
 * Tool Executor
 *
 * MCP 도구를 실행하는 유틸리티
 */

/**
 * Initialize builtin tools (call this once on startup)
 */
export function initializeBuiltinTools(): void {
  const builtinTools = getBuiltinTools();
  for (const tool of builtinTools) {
    if (!ToolRegistry.hasTool(tool.name)) {
      ToolRegistry.registerTool(tool);
    }
  }
  logger.info('[ToolExecutor] Registered builtin tools', { count: builtinTools.length });
}

/**
 * 도구 실행
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<ToolCallResult> {
  // 도구 찾기
  const tool = ToolRegistry.getTool(toolName);

  if (!tool) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Tool '${toolName}' not found`,
        },
      ],
      isError: true,
    };
  }

  try {
    // Check if it's a builtin tool
    if (tool.serverName === 'builtin') {
      logger.info('[ToolExecutor] Executing builtin tool', { toolName });
      const result = await executeBuiltinTool(toolName, args);
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
        isError: false,
      };
    }

    // MCP 서버를 통해 도구 호출
    const result = await MCPServerManager.callTool(tool.serverName, toolName, args);

    return result;
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Tool execution error', { toolName, message, error });

    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool '${toolName}': ${message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * 여러 도구 실행 (병렬)
 */
export async function executeTools(
  calls: Array<{ name: string; args: Record<string, unknown> }>
): Promise<ToolCallResult[]> {
  const promises = calls.map((call) => executeTool(call.name, call.args));
  return await Promise.all(promises);
}

/**
 * 도구 실행 가능 여부 확인
 */
export function canExecuteTool(toolName: string): boolean {
  return ToolRegistry.hasTool(toolName);
}

/**
 * 모든 사용 가능한 도구 이름
 */
export function getAvailableToolNames(): string[] {
  return ToolRegistry.getAllTools().map((tool) => tool.name);
}
