'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ToolRegistry = void 0;
/**
 * Tool Registry
 *
 * MCP 도구를 중앙에서 관리
 */
class ToolRegistryClass {
  constructor() {
    this.tools = new Map();
  }
  /**
   * 도구 등록
   */
  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }
  /**
   * 여러 도구 등록
   */
  registerTools(tools) {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }
  /**
   * 도구 가져오기
   */
  getTool(name) {
    return this.tools.get(name);
  }
  /**
   * 모든 도구 가져오기
   */
  getAllTools() {
    return Array.from(this.tools.values());
  }
  /**
   * 서버별 도구 가져오기
   */
  getToolsByServer(serverName) {
    return Array.from(this.tools.values()).filter((tool) => tool.serverName === serverName);
  }
  /**
   * 도구 삭제
   */
  removeTool(name) {
    this.tools.delete(name);
  }
  /**
   * 서버의 모든 도구 삭제
   */
  removeToolsByServer(serverName) {
    for (const [name, tool] of this.tools.entries()) {
      if (tool.serverName === serverName) {
        this.tools.delete(name);
      }
    }
  }
  /**
   * 모든 도구 삭제
   */
  clear() {
    this.tools.clear();
  }
  /**
   * 도구 존재 여부 확인
   */
  hasTool(name) {
    return this.tools.has(name);
  }
  /**
   * 도구 개수
   */
  count() {
    return this.tools.size;
  }
}
exports.ToolRegistry = new ToolRegistryClass();
//# sourceMappingURL=registry.js.map
