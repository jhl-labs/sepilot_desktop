import type { MCPServerConfig } from '@/types';

type IPCHandler = (...args: any[]) => Promise<any>;

interface MockTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  serverName: string;
  enabled?: boolean;
}

interface MockMCPClient {
  connectInMainProcess: jest.Mock<Promise<void>, [unknown]>;
  connect: jest.Mock<Promise<void>, []>;
  initialize: jest.Mock<Promise<void>, []>;
  listTools: jest.Mock<Promise<MockTool[]>, []>;
  disconnect: jest.Mock<Promise<void>, []>;
}

interface TestContext {
  handlers: Map<string, IPCHandler>;
  databaseService: {
    getSetting: jest.Mock<string | null, [string]>;
    updateSetting: jest.Mock<void, [string, string]>;
  };
  serverManager: {
    addServerInMainProcess: jest.Mock<Promise<void>, [MockMCPClient]>;
    removeServerInMainProcess: jest.Mock<Promise<void>, [string]>;
    getServerInMainProcess: jest.Mock<unknown, [string]>;
  };
  toolRegistry: {
    getAllTools: jest.Mock<MockTool[], [options?: { includeDisabled?: boolean }]>;
    registerTools: jest.Mock<void, [MockTool[]]>;
    removeToolsByServer: jest.Mock<void, [string]>;
    getToolsByServer: jest.Mock<MockTool[], [string, options?: { includeDisabled?: boolean }]>;
    setToolEnabled: jest.Mock<void, [string, boolean]>;
  };
  queueStdioClient: (client: MockMCPClient) => void;
}

function createTool(name: string, serverName: string): MockTool {
  return {
    name,
    description: `${name} description`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
    serverName,
  };
}

function createMockClient(tools: MockTool[] = []): MockMCPClient {
  return {
    connectInMainProcess: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(undefined),
    listTools: jest.fn().mockResolvedValue(tools),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
}

function getHandler(handlers: Map<string, IPCHandler>, channel: string): IPCHandler {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`IPC handler not registered: ${channel}`);
  }
  return handler;
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function setupTestContext(initialConfigs: MCPServerConfig[] = []): Promise<TestContext> {
  jest.resetModules();

  const handlers = new Map<string, IPCHandler>();
  const queuedStdioClients: MockMCPClient[] = [];

  let appConfig: { llm: Record<string, unknown>; mcp: MCPServerConfig[] } = {
    llm: {},
    mcp: initialConfigs,
  };

  const databaseService = {
    getSetting: jest.fn((key: string) => {
      if (key === 'app_config') {
        return JSON.stringify(appConfig);
      }
      return null;
    }),
    updateSetting: jest.fn((key: string, value: string) => {
      if (key === 'app_config') {
        appConfig = JSON.parse(value) as { llm: Record<string, unknown>; mcp: MCPServerConfig[] };
      }
    }),
  };

  const serverManager = {
    addServerInMainProcess: jest.fn().mockResolvedValue(undefined),
    removeServerInMainProcess: jest.fn().mockResolvedValue(undefined),
    getServerInMainProcess: jest.fn().mockReturnValue(undefined),
  };

  const toolRegistry = {
    getAllTools: jest.fn().mockReturnValue([]),
    registerTools: jest.fn(),
    removeToolsByServer: jest.fn(),
    getToolsByServer: jest.fn().mockReturnValue([]),
    setToolEnabled: jest.fn(),
  };

  const stdioCtor = jest.fn().mockImplementation(() => {
    return queuedStdioClients.shift() ?? createMockClient();
  });

  const sseCtor = jest.fn().mockImplementation(() => createMockClient());

  jest.doMock('electron', () => ({
    ipcMain: {
      handle: jest.fn((channel: string, handler: IPCHandler) => {
        handlers.set(channel, handler);
      }),
    },
  }));
  jest.doMock('child_process', () => ({
    spawn: jest.fn(),
  }));
  jest.doMock('@/lib/domains/mcp/server-manager', () => ({
    MCPServerManager: serverManager,
  }));
  jest.doMock('@/lib/domains/mcp/tools/registry', () => ({
    ToolRegistry: toolRegistry,
  }));
  jest.doMock('@/lib/domains/mcp/transport/stdio', () => ({
    StdioMCPClient: stdioCtor,
  }));
  jest.doMock('@/lib/domains/mcp/transport/sse', () => ({
    SSEMCPClient: sseCtor,
  }));
  jest.doMock('@/electron/services/database', () => ({
    databaseService,
  }));

  const { setupMCPHandlers } =
    require('@/electron/ipc/handlers/mcp/mcp') as typeof import('@/electron/ipc/handlers/mcp/mcp');

  setupMCPHandlers();
  await flushPromises();

  return {
    handlers,
    databaseService,
    serverManager,
    toolRegistry,
    queueStdioClient: (client: MockMCPClient) => {
      queuedStdioClients.push(client);
    },
  };
}

describe('MCP IPC handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects mcp-add-server on tool name conflict and disconnects client', async () => {
    const context = await setupTestContext();
    const addServer = getHandler(context.handlers, 'mcp-add-server');
    const listServers = getHandler(context.handlers, 'mcp-list-servers');

    const newServerName = 'new-server';
    const duplicateToolName = 'duplicate_tool';
    const client = createMockClient([createTool(duplicateToolName, newServerName)]);

    context.queueStdioClient(client);
    context.toolRegistry.getAllTools.mockReturnValue([
      createTool(duplicateToolName, 'existing-server'),
    ]);

    const result = await addServer(null, {
      name: ` ${newServerName} `,
      transport: 'stdio',
      command: ' npx ',
      args: ['-y', '@modelcontextprotocol/server-example'],
      enabled: true,
    } satisfies MCPServerConfig);

    expect(result.success).toBe(false);
    expect(result.error).toContain(`Cannot enable '${newServerName}'`);
    expect(result.error).toContain(duplicateToolName);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(context.serverManager.addServerInMainProcess).not.toHaveBeenCalled();
    expect(context.toolRegistry.registerTools).not.toHaveBeenCalled();

    const listResult = await listServers(null);
    expect(listResult.success).toBe(true);
    expect(listResult.data).toEqual([]);
  });

  it('rolls back mcp-toggle-server enable flow when tool registration fails', async () => {
    const serverName = 'rollback-server';
    const context = await setupTestContext([
      {
        name: serverName,
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-example'],
        enabled: false,
      },
    ]);

    const toggleServer = getHandler(context.handlers, 'mcp-toggle-server');
    const getServerStatus = getHandler(context.handlers, 'mcp-get-server-status');

    const client = createMockClient([createTool('read_file', serverName)]);
    context.queueStdioClient(client);
    context.toolRegistry.registerTools.mockImplementation(() => {
      throw new Error('register exploded');
    });

    const toggleResult = await toggleServer(null, serverName);

    expect(toggleResult.success).toBe(false);
    expect(toggleResult.error).toBe('register exploded');
    expect(context.serverManager.addServerInMainProcess).toHaveBeenCalledTimes(1);
    expect(context.serverManager.removeServerInMainProcess).toHaveBeenCalledWith(serverName);
    expect(context.toolRegistry.removeToolsByServer).toHaveBeenCalledWith(serverName);
    expect(context.databaseService.updateSetting).not.toHaveBeenCalled();

    const statusResult = await getServerStatus(null, serverName);
    expect(statusResult.success).toBe(true);
    expect(statusResult.data.status).toBe('error');
    expect(statusResult.data.errorMessage).toBe('register exploded');
  });
});
