/// <reference lib="dom" />
/// <reference types="../../types/electron" />
// Note: This file is used in both renderer (browser) and electron contexts

import { MCPClient } from './client';
import { MCPServerConfig, MCPTool, ToolCallResult } from './types';

import { logger } from '@/lib/utils/logger';
/**
 * Simple Mutex implementation for async operations
 */
class Mutex {
  private locked = false;
  private waitQueue: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    while (this.locked) {
      await new Promise<void>((resolve) => this.waitQueue.push(resolve));
    }
    this.locked = true;
    return () => this.release();
  }

  private release(): void {
    this.locked = false;
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }
}

/**
 * MCP Server Manager
 *
 * 여러 MCP 서버를 관리하는 싱글톤 클래스
 */
class MCPServerManagerClass {
  private servers: Map<string, MCPClient> = new Map();
  private allTools: MCPTool[] = [];
  private mutex = new Mutex();

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
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.mcp.callTool(serverName, toolName, args);
      if (result.success) {
        return result.data as ToolCallResult;
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
    const release = await this.mutex.acquire();
    try {
      // 클라이언트는 이미 연결되고 초기화된 상태여야 함
      this.servers.set(client.getName(), client);
      this.updateAllTools();

      logger.info('MCP Server added', {
        name: client.getName(),
        toolCount: client.getTools().length,
      });
    } finally {
      release();
    }
  }

  /**
   * Main Process용 - 서버 제거
   */
  async removeServerInMainProcess(name: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const client = this.servers.get(name);
      if (client) {
        await client.disconnect();
        this.servers.delete(name);
        this.updateAllTools();
        logger.info('MCP Server removed', { name });
      }
    } finally {
      release();
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

  /**
   * Main Process용 - 서버 설정 목록 가져오기
   */
  listServersInMainProcess(): MCPServerConfig[] {
    return Array.from(this.servers.values()).map((client) => ({
      name: client.getName(),
      transport: 'stdio' as const, // Default transport type
      command: '', // Client에는 command 정보가 없음
      args: [],
      env: {},
    }));
  }

  /**
   * Main Process용 - 특정 서버의 도구 목록 가져오기
   */
  getServerTools(serverName: string): MCPTool[] {
    const client = this.servers.get(serverName);
    if (!client) {
      return [];
    }
    return client.getTools();
  }

  /**
   * Main Process용 - 도구 호출
   */
  async callToolInMainProcess(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    const client = this.servers.get(serverName);
    if (!client) {
      throw new Error(`Server '${serverName}' not found`);
    }
    return await client.callTool(toolName, args);
  }
}

export const MCPServerManager = new MCPServerManagerClass();
