import { ipcMain } from 'electron';
import { spawn } from 'child_process';
import { z } from 'zod';
import { MCPServerManager } from '../../../lib/mcp/server-manager';
import { StdioMCPClient } from '../../../lib/mcp/transport/stdio';
import { SSEMCPClient } from '../../../lib/mcp/transport/sse';
import { MCPServerConfig } from '../../../lib/mcp/types';
import { ToolRegistry } from '../../../lib/mcp/tools/registry';
import { databaseService } from '../../services/database';
import { AppConfig } from '../../../types';
import { MCPClient } from '../../../lib/mcp/client';

/**
 * Load MCP configs from database
 */
function loadMCPConfigs(): MCPServerConfig[] {
  try {
    const configStr = databaseService.getSetting('app_config');
    if (!configStr) {
      return [];
    }

    const config = JSON.parse(configStr) as AppConfig;
    return config.mcp || [];
  } catch (error) {
    console.error('[MCP] Failed to load configs from database:', error);
    return [];
  }
}

/**
 * Save MCP configs to database
 */
function saveMCPConfigs(configs: MCPServerConfig[]): void {
  try {
    const configStr = databaseService.getSetting('app_config');
    const config: AppConfig = configStr ? JSON.parse(configStr) : { llm: {} as any, mcp: [] };

    config.mcp = configs;

    databaseService.updateSetting('app_config', JSON.stringify(config));
    console.log('[MCP] Configs saved to database');
  } catch (error) {
    console.error('[MCP] Failed to save configs to database:', error);
  }
}

// Server configs 저장 (Main Process에서만 유지, DB와 동기화)
const serverConfigs = new Map<string, MCPServerConfig>();

/**
 * Zod schemas for runtime validation
 */
const ToolArgsSchema = z.record(z.string(), z.unknown());

/**
 * Sanitize tool arguments to prevent prototype pollution
 */
function sanitizeToolArgs(args: unknown): Record<string, unknown> {
  if (typeof args !== 'object' || args === null) {
    throw new Error('Tool arguments must be a non-null object');
  }

  // Validate with Zod
  const validated = ToolArgsSchema.parse(args);

  // Remove dangerous properties
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(validated)) {
    // Block prototype pollution attempts
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      console.warn('[Security] Blocked dangerous property in tool args:', key);
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Initialize MCP servers from database on app startup
 */
async function initializeMCPServers(): Promise<void> {
  console.log('[MCP] Initializing MCP servers from database...');

  const configs = loadMCPConfigs();
  console.log(`[MCP] Found ${configs.length} server configs`);

  for (const config of configs) {
    // 비활성화된 서버는 건너뜀
    if (config.enabled === false) {
      console.log(`[MCP] Skipping disabled server: ${config.name}`);
      serverConfigs.set(config.name, config);
      continue;
    }

    try {
      console.log(`[MCP] Starting server: ${config.name}`);

      let client: MCPClient;

      // Transport type에 따라 클라이언트 생성
      if (config.transport === 'sse') {
        // Validate SSE config
        if (!config.url) {
          console.error(`[MCP] Invalid SSE config for ${config.name}: missing url`);
          continue;
        }

        client = new SSEMCPClient(config);
        await client.connect();
      } else {
        // stdio transport (default)
        // Validate stdio config
        if (!config.command || !config.args || config.args.length === 0) {
          console.error(`[MCP] Invalid stdio config for ${config.name}: missing command or args`);
          continue;
        }

        const stdioClient = new StdioMCPClient(config);
        await stdioClient.connectInMainProcess(spawn);
        client = stdioClient;
      }

      // 초기화
      await client.initialize();

      // 도구 목록 가져오기
      const tools = await client.listTools();

      // Server Manager에 추가
      await MCPServerManager.addServerInMainProcess(client);

      // Tool Registry에 도구 등록
      ToolRegistry.registerTools(tools);

      // Config 저장
      serverConfigs.set(config.name, config);

      console.log(
        `[MCP] Server initialized: ${config.name} (${tools.length} tools, transport: ${config.transport})`
      );
    } catch (error: any) {
      console.error(`[MCP] Failed to initialize server ${config.name}:`, error);
      // 실패해도 계속 진행 (다른 서버들은 시작)
    }
  }

  console.log('[MCP] MCP servers initialization completed');
}

/**
 * MCP IPC 핸들러
 */
export function setupMCPHandlers() {
  // 앱 시작 시 DB에서 MCP 서버 로드 및 초기화
  initializeMCPServers().catch((error) => {
    console.error('[MCP] Failed to initialize MCP servers:', error);
  });
  /**
   * MCP 서버 추가
   */
  ipcMain.handle('mcp-add-server', async (_event, config: MCPServerConfig) => {
    console.log('[MCP] Adding server:', {
      name: config.name,
      transport: config.transport,
      command: config.command,
      argsCount: config.args?.length || 0,
    });

    try {
      let client: MCPClient;

      // Validate config and create client based on transport type
      if (config.transport === 'sse') {
        if (!config.url) {
          throw new Error('SSE transport requires "url" field');
        }

        console.log('[MCP] Creating SSE client...');
        client = new SSEMCPClient(config);
        await client.connect();
      } else {
        // stdio transport (default)
        if (!config.command) {
          throw new Error('stdio transport requires "command" field');
        }
        if (!config.args || config.args.length === 0) {
          throw new Error('stdio transport requires "args" field');
        }

        console.log('[MCP] Creating stdio client...');
        const stdioClient = new StdioMCPClient(config);
        console.log('[MCP] Connecting to process...');
        await stdioClient.connectInMainProcess(spawn);
        console.log('[MCP] Process connected successfully');
        client = stdioClient;
      }

      // 초기화
      console.log('[MCP] Initializing client...');
      await client.initialize();
      console.log('[MCP] Client initialized successfully');

      // 도구 목록 가져오기
      console.log('[MCP] Fetching tools list...');
      const tools = await client.listTools();
      console.log(`[MCP] Fetched ${tools.length} tools`);

      // Server Manager에 추가
      console.log('[MCP] Adding to server manager...');
      await MCPServerManager.addServerInMainProcess(client);

      // Tool Registry에 도구 등록
      console.log('[MCP] Registering tools...');
      ToolRegistry.registerTools(tools);

      // Config 저장 (메모리 + DB)
      serverConfigs.set(config.name, config);
      saveMCPConfigs(Array.from(serverConfigs.values()));

      console.log(
        `[MCP] Server added successfully: ${config.name} (${tools.length} tools, transport: ${config.transport})`
      );

      return {
        success: true,
        data: tools,
      };
    } catch (error: any) {
      console.error('[MCP] Failed to add MCP server:', {
        name: config.name,
        error: error.message,
        stack: error.stack,
      });
      return {
        success: false,
        error: error.message || 'Failed to add MCP server',
      };
    }
  });

  /**
   * MCP 서버 제거
   */
  ipcMain.handle('mcp-remove-server', async (_event, name: string) => {
    try {
      await MCPServerManager.removeServerInMainProcess(name);

      // Tool Registry에서 도구 제거
      ToolRegistry.removeToolsByServer(name);

      // Config 제거 (메모리 + DB)
      serverConfigs.delete(name);
      saveMCPConfigs(Array.from(serverConfigs.values()));

      console.log(`[MCP] Server removed: ${name}`);

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[MCP] Failed to remove MCP server:', error);
      return {
        success: false,
        error: error.message || 'Failed to remove MCP server',
      };
    }
  });

  /**
   * MCP 서버 목록 가져오기
   */
  ipcMain.handle('mcp-list-servers', async () => {
    try {
      const configs = Array.from(serverConfigs.values());

      return {
        success: true,
        data: configs,
      };
    } catch (error: any) {
      console.error('[MCP] Failed to list MCP servers:', error);
      return {
        success: false,
        error: error.message || 'Failed to list MCP servers',
      };
    }
  });

  /**
   * 모든 도구 가져오기
   */
  ipcMain.handle('mcp-get-all-tools', async () => {
    try {
      const tools = ToolRegistry.getAllTools();

      return {
        success: true,
        data: tools,
      };
    } catch (error: any) {
      console.error('Failed to get all tools:', error);
      return {
        success: false,
        error: error.message || 'Failed to get all tools',
      };
    }
  });

  /**
   * 도구 호출
   */
  ipcMain.handle(
    'mcp-call-tool',
    async (_event, serverName: string, toolName: string, args: unknown) => {
      try {
        const server = MCPServerManager.getServerInMainProcess(serverName);

        if (!server) {
          throw new Error(`MCP Server '${serverName}' not found`);
        }

        // Security: Validate and sanitize tool arguments
        const sanitizedArgs = sanitizeToolArgs(args);

        const result = await server.callTool(toolName, sanitizedArgs);

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        console.error('[MCP] Failed to call tool:', error);
        return {
          success: false,
          error: error.message || 'Failed to call tool',
        };
      }
    }
  );

  /**
   * MCP 서버 토글 (활성화/비활성화)
   */
  ipcMain.handle('mcp-toggle-server', async (_event, name: string) => {
    try {
      const config = serverConfigs.get(name);
      if (!config) {
        throw new Error(`Server config not found: ${name}`);
      }

      // enabled 상태 토글
      const newConfig = { ...config, enabled: !config.enabled };
      serverConfigs.set(name, newConfig);
      saveMCPConfigs(Array.from(serverConfigs.values()));

      if (newConfig.enabled) {
        let client: MCPClient;

        // Transport type에 따라 클라이언트 생성
        if (newConfig.transport === 'sse') {
          if (!newConfig.url) {
            throw new Error('Invalid SSE config: missing url');
          }

          client = new SSEMCPClient(newConfig);
          await client.connect();
        } else {
          // stdio transport (default)
          if (!newConfig.command || !newConfig.args || newConfig.args.length === 0) {
            throw new Error('Invalid stdio config: missing command or args');
          }

          const stdioClient = new StdioMCPClient(newConfig);
          await stdioClient.connectInMainProcess(spawn);
          client = stdioClient;
        }

        // 활성화: 서버 재시작
        await client.initialize();
        const tools = await client.listTools();
        await MCPServerManager.addServerInMainProcess(client);
        ToolRegistry.registerTools(tools);
        console.log(`[MCP] Server enabled: ${name} (transport: ${newConfig.transport})`);
      } else {
        // 비활성화: 서버 중지
        await MCPServerManager.removeServerInMainProcess(name);
        ToolRegistry.removeToolsByServer(name);
        console.log(`[MCP] Server disabled: ${name}`);
      }

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[MCP] Failed to toggle server:', error);
      return {
        success: false,
        error: error.message || 'Failed to toggle server',
      };
    }
  });

  /**
   * MCP 서버 상태 가져오기
   */
  ipcMain.handle('mcp-get-server-status', async (_event, name: string) => {
    try {
      const config = serverConfigs.get(name);
      if (!config) {
        return {
          success: true,
          data: {
            status: 'disconnected' as const,
            toolCount: 0,
            tools: [],
          },
        };
      }

      // 비활성화된 서버
      if (config.enabled === false) {
        return {
          success: true,
          data: {
            status: 'disconnected' as const,
            toolCount: 0,
            tools: [],
          },
        };
      }

      // Server Manager에서 서버 가져오기
      const server = MCPServerManager.getServerInMainProcess(name);

      if (!server) {
        return {
          success: true,
          data: {
            status: 'disconnected' as const,
            toolCount: 0,
            tools: [],
          },
        };
      }

      // 도구 목록 가져오기
      const tools = ToolRegistry.getToolsByServer(name);

      return {
        success: true,
        data: {
          status: 'connected' as const,
          toolCount: tools.length,
          tools: tools.map((t) => t.name),
        },
      };
    } catch (error: any) {
      console.error('[MCP] Failed to get server status:', error);
      return {
        success: true,
        data: {
          status: 'error' as const,
          toolCount: 0,
          tools: [],
          errorMessage: error.message,
        },
      };
    }
  });

  /**
   * 프롬프트 목록 가져오기
   */
  ipcMain.handle('mcp-list-prompts', async (_event, serverName: string) => {
    try {
      const server = MCPServerManager.getServerInMainProcess(serverName);

      if (!server) {
        throw new Error(`MCP Server '${serverName}' not found`);
      }

      const prompts = await server.listPrompts();

      return {
        success: true,
        data: prompts,
      };
    } catch (error: any) {
      console.error('[MCP] Failed to list prompts:', error);
      return {
        success: false,
        error: error.message || 'Failed to list prompts',
      };
    }
  });

  /**
   * 프롬프트 가져오기
   */
  ipcMain.handle(
    'mcp-get-prompt',
    async (_event, serverName: string, promptName: string, args?: Record<string, string>) => {
      try {
        const server = MCPServerManager.getServerInMainProcess(serverName);

        if (!server) {
          throw new Error(`MCP Server '${serverName}' not found`);
        }

        const prompt = await server.getPrompt(promptName, args);

        return {
          success: true,
          data: prompt,
        };
      } catch (error: any) {
        console.error('[MCP] Failed to get prompt:', error);
        return {
          success: false,
          error: error.message || 'Failed to get prompt',
        };
      }
    }
  );

  console.log('[MCP] IPC handlers registered');
}
