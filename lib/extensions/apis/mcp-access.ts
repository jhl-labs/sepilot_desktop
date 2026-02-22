/**
 * MCP Access IPC 프록시 구현
 *
 * Extension이 ExtensionRuntimeContext.mcp API를 통해 MCP 도구에 접근하기 위한 프록시 클래스.
 * IPC를 통해 Main Process의 extension-mcp.ts 핸들러와 통신합니다.
 */

import type { MCPAccess, MCPToolInfo, MCPServerInfo } from '@sepilot/extension-sdk';

export class MCPAccessImpl implements MCPAccess {
  constructor(
    private extensionId: string,
    private permissions: string[]
  ) {}

  /**
   * MCP 도구 실행
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    options?: { serverId?: string }
  ): Promise<unknown> {
    this.checkPermission('mcp:call-tool');

    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('MCP API is only available in Electron environment');
    }

    const result = await window.electronAPI.invoke('extension:mcp:execute', {
      extensionId: this.extensionId,
      toolName,
      args,
      options,
    });

    if (!result.success) {
      throw new Error(result.error || 'MCP tool execution failed');
    }

    return result.data;
  }

  /**
   * MCP 도구 실행 (execute 별칭)
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: { serverId?: string }
  ): Promise<unknown> {
    return this.execute(toolName, args, options);
  }

  /**
   * 사용 가능한 MCP 도구 목록 조회
   */
  async listTools(options?: { serverId?: string }): Promise<MCPToolInfo[]> {
    this.checkPermission('mcp:list-tools');

    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('MCP API is only available in Electron environment');
    }

    const result = await window.electronAPI.invoke('extension:mcp:list', {
      extensionId: this.extensionId,
      options,
    });

    if (!result.success) {
      throw new Error(result.error || 'MCP list tools failed');
    }

    return result.data ?? [];
  }

  /**
   * 연결된 MCP 서버 목록 조회
   */
  async listServers(): Promise<MCPServerInfo[]> {
    this.checkPermission('mcp:list-tools');

    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('MCP API is only available in Electron environment');
    }

    const result = await window.electronAPI.invoke('extension:mcp:servers', {
      extensionId: this.extensionId,
    });

    if (!result.success) {
      throw new Error(result.error || 'MCP list servers failed');
    }

    return result.data ?? [];
  }

  private checkPermission(permission: string): void {
    if (this.permissions.length > 0 && !this.permissions.includes(permission)) {
      throw new Error(`Extension "${this.extensionId}" does not have permission: ${permission}`);
    }
  }
}
