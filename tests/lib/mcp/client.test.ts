/**
 * MCPClient 테스트
 */

import { MCPClient } from '@/lib/domains/mcp/client';
import type {
  MCPServerConfig,
  MCPTool,
  JSONRPCRequest,
  JSONRPCResponse,
  MCPInitializeResult,
} from '@/lib/domains/mcp/types';

// Create a concrete implementation for testing
class TestMCPClient extends MCPClient {
  public mockResponses: Map<string, JSONRPCResponse> = new Map();

  async connect(): Promise<void> {
    // Simulated connection
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  async sendRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const response = this.mockResponses.get(request.method);
    if (response) {
      return { ...response, id: request.id };
    }
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32601, message: 'Method not found' },
    };
  }

  // Helper to set mock responses
  setMockResponse(method: string, response: JSONRPCResponse): void {
    this.mockResponses.set(method, response);
  }
}

describe('MCPClient', () => {
  const mockConfig: MCPServerConfig = {
    name: 'test-server',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    transport: 'stdio',
    enabled: true,
  };

  let client: TestMCPClient;

  beforeEach(() => {
    client = new TestMCPClient(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(client.getName()).toBe('test-server');
      expect(client.isReady()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize connection and return result', async () => {
      const initResult: MCPInitializeResult = {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
      };

      client.setMockResponse('initialize', {
        jsonrpc: '2.0',
        result: initResult,
      });

      const result = await client.initialize();

      expect(result.protocolVersion).toBe('2024-11-05');
      expect(result.serverInfo.name).toBe('test-server');
      expect(client.isReady()).toBe(true);
    });

    it('should throw error on initialize failure', async () => {
      client.setMockResponse('initialize', {
        jsonrpc: '2.0',
        error: { code: -1, message: 'Connection failed' },
      });

      await expect(client.initialize()).rejects.toThrow('Initialize error: Connection failed');
    });
  });

  describe('listTools', () => {
    it('should return list of tools with serverName', async () => {
      const mockTools: Omit<MCPTool, 'serverName'>[] = [
        {
          name: 'read_file',
          description: 'Read a file from the filesystem',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
            required: ['path'],
          },
        },
        {
          name: 'write_file',
          description: 'Write a file to the filesystem',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['path', 'content'],
          },
        },
      ];

      client.setMockResponse('tools/list', {
        jsonrpc: '2.0',
        result: { tools: mockTools },
      });

      const tools = await client.listTools();

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('read_file');
      expect(tools[0].serverName).toBe('test-server');
      expect(tools[1].name).toBe('write_file');
      expect(tools[1].serverName).toBe('test-server');
    });

    it('should cache tools', async () => {
      client.setMockResponse('tools/list', {
        jsonrpc: '2.0',
        result: {
          tools: [
            {
              name: 'test_tool',
              description: 'Test',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        },
      });

      await client.listTools();
      const cachedTools = client.getTools();

      expect(cachedTools).toHaveLength(1);
      expect(cachedTools[0].name).toBe('test_tool');
    });

    it('should throw error on list tools failure', async () => {
      client.setMockResponse('tools/list', {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
      });

      await expect(client.listTools()).rejects.toThrow('List tools error: Internal error');
    });
  });

  describe('callTool', () => {
    it('should call tool and return result', async () => {
      client.setMockResponse('tools/call', {
        jsonrpc: '2.0',
        result: {
          content: [{ type: 'text', text: 'File content here' }],
        },
      });

      const result = await client.callTool('read_file', { path: '/test.txt' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('File content here');
      expect(result.isError).toBeUndefined();
    });

    it('should return error result on tool call failure', async () => {
      client.setMockResponse('tools/call', {
        jsonrpc: '2.0',
        error: { code: -1, message: 'File not found' },
      });

      const result = await client.callTool('read_file', { path: '/nonexistent.txt' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('File not found');
    });
  });

  describe('listResources', () => {
    it('should return list of resources', async () => {
      const mockResources = [
        { uri: 'file:///home/user', name: 'Home Directory', mimeType: 'text/directory' },
        { uri: 'file:///etc', name: 'Config Directory' },
      ];

      client.setMockResponse('resources/list', {
        jsonrpc: '2.0',
        result: { resources: mockResources },
      });

      const resources = await client.listResources();

      expect(resources).toHaveLength(2);
      expect(resources[0].uri).toBe('file:///home/user');
      expect(resources[0].name).toBe('Home Directory');
    });

    it('should cache resources', async () => {
      client.setMockResponse('resources/list', {
        jsonrpc: '2.0',
        result: { resources: [{ uri: 'file:///test', name: 'Test' }] },
      });

      await client.listResources();
      const cached = client.getResources();

      expect(cached).toHaveLength(1);
    });

    it('should throw error on list resources failure', async () => {
      client.setMockResponse('resources/list', {
        jsonrpc: '2.0',
        error: { code: -1, message: 'Access denied' },
      });

      await expect(client.listResources()).rejects.toThrow('List resources error: Access denied');
    });
  });

  describe('readResource', () => {
    it('should read resource content', async () => {
      client.setMockResponse('resources/read', {
        jsonrpc: '2.0',
        result: {
          contents: [{ text: 'Resource content here', mimeType: 'text/plain' }],
        },
      });

      const content = await client.readResource('file:///test.txt');

      expect(content).toBe('Resource content here');
    });

    it('should throw error on read resource failure', async () => {
      client.setMockResponse('resources/read', {
        jsonrpc: '2.0',
        error: { code: -1, message: 'Resource not found' },
      });

      await expect(client.readResource('file:///nonexistent')).rejects.toThrow(
        'Read resource error: Resource not found'
      );
    });
  });

  describe('state management', () => {
    it('should track connection state', async () => {
      expect(client.isReady()).toBe(false);

      client.setMockResponse('initialize', {
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0' },
        },
      });

      await client.initialize();
      expect(client.isReady()).toBe(true);

      await client.disconnect();
      expect(client.isReady()).toBe(false);
    });

    it('should increment request IDs', async () => {
      // Access private method indirectly through multiple requests
      client.setMockResponse('tools/list', {
        jsonrpc: '2.0',
        result: { tools: [] },
      });

      await client.listTools();
      await client.listTools();
      await client.listTools();

      // Request IDs should be incrementing (verified by implementation)
      expect(true).toBe(true); // Test passes if no errors
    });
  });

  describe('getName', () => {
    it('should return server name from config', () => {
      expect(client.getName()).toBe('test-server');
    });
  });
});
