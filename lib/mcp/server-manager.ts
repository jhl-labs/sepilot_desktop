/// <reference lib="dom" />
/// <reference types="../../types/electron" />
// Note: This file is used in both renderer (browser) and electron contexts
import { MCPClient } from './client';
import { MCPServerConfig, MCPTool } from './types';

/**
 * MCP Server Manager
 *
 * 여러 MCP 서버를 관리하는 싱글톤 클래스
 */
class MCPServerManagerClass {
  private servers: Map<string, MCPClient> = new Map();
  private allTools: MCPTool[] = [];

  /**
   * 서버 추가 (Renderer에서 호출)
   */
  async addServer(config: MCPServerConfig): Promise<void> {
    // Renderer에서는 IPC를 통해 Main Process에 요청
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.mcp.addServer(config);
      if (!result.success) {
        throw new Error(result.error || 'Failed to add MCP server');
      }
    } else {
      throw new Error('MCP Server Manager only works in Electron environment');
    }
  }

  /**
   * 서버 제거 (Renderer에서 호출)
   */
  async removeServer(name: string): Promise<void> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.mcp.removeServer(name);
      if (!result.success) {
        throw new Error(result.error || 'Failed to remove MCP server');
      }
    }
  }

  /**
   * 서버 목록 가져오기
   */
  async listServers(): Promise<MCPServerConfig[]> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.mcp.listServers();
      if (result.success) {
        return result.data || [];
      }
    }
    return [];
  }

  /**
   * 모든 도구 가져오기
   */
  async getAllTools(): Promise<MCPTool[]> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.mcp.getAllTools();
      if (result.success) {
        return result.data || [];
      }
    }
    return [];
  }

  /**
   * 도구 호출
   */
  async callTool(serverName: string, toolName: string, args: any): Promise<any> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.mcp.callTool(serverName, toolName, args);
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.error || 'Tool call failed');
      }
    }
    throw new Error('MCP not available');
  }

  /**
   * Main Process용 - 서버 추가 (이미 연결된 클라이언트)
   */
  async addServerInMainProcess(client: MCPClient): Promise<void> {
    // 클라이언트는 이미 연결되고 초기화된 상태여야 함
    this.servers.set(client.getName(), client);
    this.updateAllTools();

    console.log(`MCP Server added: ${client.getName()} (${client.getTools().length} tools)`);
  }

  /**
   * Main Process용 - 서버 제거
   */
  async removeServerInMainProcess(name: string): Promise<void> {
    const client = this.servers.get(name);
    if (client) {
      await client.disconnect();
      this.servers.delete(name);
      this.updateAllTools();
      console.log(`MCP Server removed: ${name}`);
    }
  }

  /**
   * Main Process용 - 서버 가져오기
   */
  getServerInMainProcess(name: string): MCPClient | undefined {
    return this.servers.get(name);
  }

  /**
   * Main Process용 - 모든 도구 업데이트
   */
  private updateAllTools(): void {
    this.allTools = [];
    for (const client of this.servers.values()) {
      this.allTools.push(...client.getTools());
    }
  }

  /**
   * Main Process용 - 모든 도구 가져오기
   */
  getAllToolsInMainProcess(): MCPTool[] {
    return this.allTools;
  }

  /**
   * Main Process용 - 모든 서버 목록
   */
  getAllServersInMainProcess(): MCPClient[] {
    return Array.from(this.servers.values());
  }
}

export const MCPServerManager = new MCPServerManagerClass();
