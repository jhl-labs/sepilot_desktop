import { MCPServerManager } from '../server-manager';
import { ToolRegistry } from './registry';
import { ToolCallResult } from '../types';

/**
 * Tool Executor
 *
 * MCP 도구를 실행하는 유틸리티
 */

/**
 * 도구 실행
 */
export async function executeTool(
  toolName: string,
  args: any
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
    // MCP 서버를 통해 도구 호출
    const result = await MCPServerManager.callTool(tool.serverName, toolName, args);

    return result;
  } catch (error: any) {
    console.error(`Tool execution error [${toolName}]:`, error);

    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool '${toolName}': ${error.message}`,
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
  calls: Array<{ name: string; args: any }>
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
