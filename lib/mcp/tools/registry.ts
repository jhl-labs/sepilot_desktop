import { MCPTool } from '../types';

/**
 * Tool Registry
 *
 * MCP 도구를 중앙에서 관리
 */
class ToolRegistryClass {
  private tools: Map<string, MCPTool> = new Map();

  /**
   * 도구 등록
   */
  registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 여러 도구 등록
   */
  registerTools(tools: MCPTool[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * 도구 가져오기
   */
  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 모든 도구 가져오기
   */
  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 서버별 도구 가져오기
   */
  getToolsByServer(serverName: string): MCPTool[] {
    return Array.from(this.tools.values()).filter((tool) => tool.serverName === serverName);
  }

  /**
   * 도구 삭제
   */
  removeTool(name: string): void {
    this.tools.delete(name);
  }

  /**
   * 서버의 모든 도구 삭제
   */
  removeToolsByServer(serverName: string): void {
    for (const [name, tool] of Array.from(this.tools.entries())) {
      if (tool.serverName === serverName) {
        this.tools.delete(name);
      }
    }
  }

  /**
   * 모든 도구 삭제
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * 도구 존재 여부 확인
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 도구 개수
   */
  count(): number {
    return this.tools.size;
  }
}

export const ToolRegistry = new ToolRegistryClass();
