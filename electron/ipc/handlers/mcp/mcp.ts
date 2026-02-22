import { ipcMain } from 'electron';
import { spawn } from 'child_process';
import { z } from 'zod';
import { MCPServerManager } from '@/lib/domains/mcp/server-manager';
import { StdioMCPClient } from '@/lib/domains/mcp/transport/stdio';
import { SSEMCPClient } from '@/lib/domains/mcp/transport/sse';
import { MCPServerConfig } from '@/lib/domains/mcp/types';
import { ToolRegistry } from '@/lib/domains/mcp/tools/registry';
import { databaseService } from '../../../services/database';
import { AppConfig } from '@/types';
import { MCPClient } from '@/lib/domains/mcp/client';

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
const serverStatusErrors = new Map<string, string>();

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

function normalizeServerConfig(config: MCPServerConfig): MCPServerConfig {
  return {
    ...config,
    name: config.name.trim(),
    command: config.command?.trim(),
    url: config.url?.trim(),
    args: Array.isArray(config.args) ? config.args : [],
    enabled: config.enabled !== false,
  };
}

function buildToolConflictError(serverName: string, conflicts: string[]): string {
  const conflictList = conflicts.join(', ');
  return `Cannot enable '${serverName}' due to conflicting tool names: ${conflictList}. Remove/disable the conflicting server first.`;
}

function getToolConflicts(serverName: string, tools: Array<{ name: string }>): string[] {
  const incomingNames = new Set(tools.map((tool) => tool.name));
  const existingNames = new Set(
    ToolRegistry.getAllTools({ includeDisabled: true })
      .filter((tool) => tool.serverName !== serverName)
      .map((tool) => tool.name)
  );
  return Array.from(incomingNames).filter((name) => existingNames.has(name));
}

async function createClientFromConfig(config: MCPServerConfig): Promise<MCPClient> {
  if (config.transport === 'sse') {
    if (!config.url) {
      throw new Error('SSE transport requires "url" field');
    }

    const client = new SSEMCPClient(config);
    await client.connect();
    return client;
  }

  if (!config.command) {
    throw new Error('stdio transport requires "command" field');
  }

  const stdioClient = new StdioMCPClient(config);
  await stdioClient.connectInMainProcess(spawn);
  return stdioClient;
}

/**
 * Initialize MCP servers from database on app startup
 */
async function initializeMCPServers(): Promise<void> {
  console.log('[MCP] Initializing MCP servers from database...');

  const configs = loadMCPConfigs();
  console.log(`[MCP] Found ${configs.length} server configs`);

  for (const rawConfig of configs) {
    const config = normalizeServerConfig(rawConfig);
    if (!config.name) {
      console.error('[MCP] Invalid config: missing server name');
      continue;
    }

    // 설정은 연결 실패 여부와 관계없이 목록에 유지
    serverConfigs.set(config.name, config);
    serverStatusErrors.delete(config.name);

    // 비활성화된 서버는 건너뜀
    if (config.enabled === false) {
      console.log(`[MCP] Skipping disabled server: ${config.name}`);
      continue;
    }

    try {
      console.log(`[MCP] Starting server: ${config.name}`);
      const client = await createClientFromConfig(config);

      // 초기화
      await client.initialize();

      // 도구 목록 가져오기
      const tools = await client.listTools();
      const conflicts = getToolConflicts(config.name, tools);
      if (conflicts.length > 0) {
        await client.disconnect();
        const conflictError = buildToolConflictError(config.name, conflicts);
        serverStatusErrors.set(config.name, conflictError);
        console.error(`[MCP] ${conflictError}`);
        continue;
      }

      // Server Manager에 추가
      await MCPServerManager.addServerInMainProcess(client);

      // Tool Registry에 도구 등록
      const toolsToRegister = tools.map((tool) => ({
        ...tool,
        enabled: !config.disabledTools?.includes(tool.name),
      }));
      ToolRegistry.registerTools(toolsToRegister);
      serverStatusErrors.delete(config.name);

      console.log(
        `[MCP] Server initialized: ${config.name} (${tools.length} tools, transport: ${config.transport})`
      );
    } catch (error: any) {
      console.error(`[MCP] Failed to initialize server ${config.name}:`, error);
      serverStatusErrors.set(config.name, error.message || 'Server initialization failed');
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
    const normalizedConfig = normalizeServerConfig(config);
    console.log('[MCP] Adding server:', {
      name: normalizedConfig.name,
      transport: normalizedConfig.transport,
      command: normalizedConfig.command,
      argsCount: normalizedConfig.args?.length || 0,
    });

    let client: MCPClient | null = null;
    let addedToManager = false;
    try {
      if (!normalizedConfig.name) {
        throw new Error('Server name is required');
      }
      if (serverConfigs.has(normalizedConfig.name)) {
        throw new Error(`Server name '${normalizedConfig.name}' already exists`);
      }
      if (normalizedConfig.transport !== 'stdio' && normalizedConfig.transport !== 'sse') {
        throw new Error(`Unsupported transport: ${normalizedConfig.transport as string}`);
      }

      console.log('[MCP] Creating client...');
      client = await createClientFromConfig(normalizedConfig);

      // 초기화
      console.log('[MCP] Initializing client...');
      await client.initialize();
      console.log('[MCP] Client initialized successfully');

      // 도구 목록 가져오기
      console.log('[MCP] Fetching tools list...');
      const tools = await client.listTools();
      console.log(`[MCP] Fetched ${tools.length} tools`);
      const conflicts = getToolConflicts(normalizedConfig.name, tools);
      if (conflicts.length > 0) {
        throw new Error(buildToolConflictError(normalizedConfig.name, conflicts));
      }

      // Server Manager에 추가
      console.log('[MCP] Adding to server manager...');
      await MCPServerManager.addServerInMainProcess(client);
      addedToManager = true;

      // Tool Registry에 도구 등록
      console.log('[MCP] Registering tools...');
      const toolsToRegister = tools.map((tool) => ({
        ...tool,
        enabled: !normalizedConfig.disabledTools?.includes(tool.name),
      }));
      ToolRegistry.registerTools(toolsToRegister);

      // Config 저장 (메모리 + DB)
      serverConfigs.set(normalizedConfig.name, normalizedConfig);
      serverStatusErrors.delete(normalizedConfig.name);
      saveMCPConfigs(Array.from(serverConfigs.values()));

      console.log(
        `[MCP] Server added successfully: ${normalizedConfig.name} (${tools.length} tools, transport: ${normalizedConfig.transport})`
      );

      return {
        success: true,
        data: tools,
      };
    } catch (error: any) {
      if (client) {
        if (addedToManager) {
          await MCPServerManager.removeServerInMainProcess(normalizedConfig.name).catch(() => {
            // no-op
          });
          ToolRegistry.removeToolsByServer(normalizedConfig.name);
        } else {
          try {
            await client.disconnect();
          } catch {
            // no-op
          }
        }
      }
      console.error('[MCP] Failed to add MCP server:', {
        name: normalizedConfig.name,
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
      serverStatusErrors.delete(name);
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
   * MCP 도구 토글 (활성화/비활성화)
   */
  ipcMain.handle(
    'mcp-toggle-tool',
    async (_event, serverName: string, toolName: string, enabled: boolean) => {
      try {
        const config = serverConfigs.get(serverName);
        if (!config) {
          throw new Error(`Server config not found: ${serverName}`);
        }

        // disabledTools 배열 업데이트
        const disabledTools = new Set(config.disabledTools || []);
        if (enabled) {
          disabledTools.delete(toolName);
        } else {
          disabledTools.add(toolName);
        }

        const newConfig = { ...config, disabledTools: Array.from(disabledTools) };
        serverConfigs.set(serverName, newConfig);
        saveMCPConfigs(Array.from(serverConfigs.values()));

        // ToolRegistry 업데이트
        ToolRegistry.setToolEnabled(toolName, enabled);

        console.log(`[MCP] Tool toggled: ${toolName} -> ${enabled}`);

        return {
          success: true,
        };
      } catch (error: any) {
        console.error('[MCP] Failed to toggle tool:', error);
        return {
          success: false,
          error: error.message || 'Failed to toggle tool',
        };
      }
    }
  );

  /**
   * MCP 도구 비활성 목록 일괄 업데이트 (Select All/None 용)
   */
  ipcMain.handle(
    'mcp-set-disabled-tools',
    async (_event, serverName: string, disabledTools: string[]) => {
      try {
        const config = serverConfigs.get(serverName);
        if (!config) {
          throw new Error(`Server config not found: ${serverName}`);
        }

        // disabledTools 배열 업데이트
        const newConfig = { ...config, disabledTools };
        serverConfigs.set(serverName, newConfig);
        saveMCPConfigs(Array.from(serverConfigs.values()));

        // ToolRegistry 업데이트
        const serverTools = ToolRegistry.getToolsByServer(serverName, { includeDisabled: true });
        for (const tool of serverTools) {
          // disabledTools에 포함되어 있으면 enabled=false
          const isDisabled = disabledTools.includes(tool.name);
          ToolRegistry.setToolEnabled(tool.name, !isDisabled);
        }

        console.log(
          `[MCP] Disabled tools updated for ${serverName}: ${disabledTools.length} tools disabled`
        );

        return {
          success: true,
        };
      } catch (error: any) {
        console.error('[MCP] Failed to set disabled tools:', error);
        return {
          success: false,
          error: error.message || 'Failed to set disabled tools',
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

      const currentlyEnabled = config.enabled !== false;

      if (currentlyEnabled) {
        // 비활성화: 서버 중지
        await MCPServerManager.removeServerInMainProcess(name);
        ToolRegistry.removeToolsByServer(name);
        const disabledConfig = { ...config, enabled: false };
        serverConfigs.set(name, disabledConfig);
        serverStatusErrors.delete(name);
        saveMCPConfigs(Array.from(serverConfigs.values()));
        console.log(`[MCP] Server disabled: ${name}`);
      } else {
        const enabledConfig = { ...config, enabled: true };
        let client: MCPClient | null = null;
        let addedToManager = false;
        try {
          client = await createClientFromConfig(enabledConfig);
          await client.initialize();
          const tools = await client.listTools();
          const conflicts = getToolConflicts(name, tools);
          if (conflicts.length > 0) {
            throw new Error(buildToolConflictError(name, conflicts));
          }

          await MCPServerManager.addServerInMainProcess(client);
          addedToManager = true;
          const toolsToRegister = tools.map((tool) => ({
            ...tool,
            enabled: !enabledConfig.disabledTools?.includes(tool.name),
          }));
          ToolRegistry.registerTools(toolsToRegister);

          serverConfigs.set(name, enabledConfig);
          serverStatusErrors.delete(name);
          saveMCPConfigs(Array.from(serverConfigs.values()));
          console.log(`[MCP] Server enabled: ${name} (transport: ${enabledConfig.transport})`);
        } catch (error: any) {
          if (client) {
            if (addedToManager) {
              await MCPServerManager.removeServerInMainProcess(name).catch(() => {
                // no-op
              });
              ToolRegistry.removeToolsByServer(name);
            } else {
              try {
                await client.disconnect();
              } catch {
                // no-op
              }
            }
          }
          serverStatusErrors.set(name, error.message || 'Failed to enable server');
          throw error;
        }
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
      const statusError = serverStatusErrors.get(name);
      if (!config) {
        return {
          success: true,
          data: {
            status: statusError ? ('error' as const) : ('disconnected' as const),
            toolCount: 0,
            tools: [],
            errorMessage: statusError,
          },
        };
      }

      // 비활성화된 서버
      if (config.enabled === false) {
        return {
          success: true,
          data: {
            status: statusError ? ('error' as const) : ('disconnected' as const),
            toolCount: 0,
            tools: [],
            errorMessage: statusError,
          },
        };
      }

      // Server Manager에서 서버 가져오기
      const server = MCPServerManager.getServerInMainProcess(name);

      if (!server) {
        return {
          success: true,
          data: {
            status: statusError ? ('error' as const) : ('disconnected' as const),
            toolCount: 0,
            tools: [],
            errorMessage: statusError,
          },
        };
      }

      if (statusError) {
        serverStatusErrors.delete(name);
      }

      // 도구 목록 가져오기 (비활성화된 도구 포함)
      const tools = ToolRegistry.getToolsByServer(name, { includeDisabled: true });

      return {
        success: true,
        data: {
          status: 'connected' as const,
          toolCount: tools.length,
          tools: tools.map((t) => ({ name: t.name, enabled: t.enabled !== false })),
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
