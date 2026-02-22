/**
 * Namespaced Tool Registry
 *
 * Extension별로 Tool을 네임스페이스로 격리하여 관리합니다.
 * 예: {extensionId}:{toolName}
 */

import type { ToolRegistry, Tool } from '@sepilot/extension-sdk';

export class NamespacedToolRegistry implements ToolRegistry {
  private tools = new Map<string, Tool>();

  constructor(private namespace: string) {}

  /**
   * Tool 등록 (자동으로 네임스페이스 추가)
   */
  register(tool: Tool): void {
    // 네임스페이스 추가
    const namespacedName = this.getNamespacedName(tool.name);

    if (this.tools.has(namespacedName)) {
      console.warn(`Tool already registered: ${namespacedName}`);
      return;
    }

    this.tools.set(namespacedName, {
      ...tool,
      name: namespacedName,
    });

    console.debug(`[ToolRegistry] Registered tool: ${namespacedName}`);
  }

  /**
   * Tool 조회
   * Extension은 네임스페이스 없이 조회 가능
   */
  get(toolName: string): Tool | undefined {
    // 네임스페이스가 없으면 추가
    const namespacedName = toolName.includes(':') ? toolName : this.getNamespacedName(toolName);

    return this.tools.get(namespacedName);
  }

  /**
   * Tool 실행
   */
  async execute(toolName: string, args: any): Promise<any> {
    const tool = this.get(toolName);

    if (!tool) {
      throw new Error(`Tool not found: ${toolName} in namespace ${this.namespace}`);
    }

    try {
      return await tool.execute(args);
    } catch (error) {
      console.error(`[ToolRegistry] Error executing tool ${tool.name}:`, error);
      throw error;
    }
  }

  /**
   * OpenAI 형식으로 변환
   */
  toOpenAIFormat(toolNames?: string[]): any[] {
    let tools: (Tool | undefined)[];

    if (toolNames) {
      // 특정 Tool만 선택
      tools = toolNames.map((name) => this.get(name));
    } else {
      // 모든 Tool
      tools = Array.from(this.tools.values());
    }

    return tools
      .filter((tool): tool is Tool => tool !== undefined)
      .map((tool) => ({
        type: 'function',
        function: {
          name: tool.name, // 네임스페이스 포함
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
  }

  /**
   * 등록된 모든 Tool 조회
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 네임스페이스가 포함된 Tool 이름 생성
   */
  private getNamespacedName(toolName: string): string {
    if (toolName.includes(':')) {
      return toolName;
    }
    return `${this.namespace}:${toolName}`;
  }

  /**
   * Tool Registry 정리
   */
  dispose(): void {
    this.tools.clear();
  }
}
