import {
  MCPServerConfig,
  MCPTool,
  MCPResource,
  JSONRPCRequest,
  JSONRPCResponse,
  MCPInitializeResult,
  ToolCallResult,
} from './types';

type RawMCPTool = Omit<MCPTool, 'serverName'>;
interface ToolsListResponse {
  tools: RawMCPTool[];
}

interface ResourcesListResponse {
  resources: MCPResource[];
}

interface ResourceReadResponse {
  contents: Array<{ text: string }>;
}

function isToolsListResponse(value: unknown): value is ToolsListResponse {
  return (
    typeof value === 'object' && value !== null && Array.isArray((value as ToolsListResponse).tools)
  );
}

function isResourcesListResponse(value: unknown): value is ResourcesListResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as ResourcesListResponse).resources)
  );
}

function isResourceReadResponse(value: unknown): value is ResourceReadResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as ResourceReadResponse).contents)
  );
}

function isToolCallResult(value: unknown): value is ToolCallResult {
  return (
    typeof value === 'object' && value !== null && Array.isArray((value as ToolCallResult).content)
  );
}

/**
 * MCP Client 추상 클래스
 */
export abstract class MCPClient {
  protected config: MCPServerConfig;
  protected requestId = 0;
  protected isConnected = false;
  protected tools: MCPTool[] = [];
  protected resources: MCPResource[] = [];

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  /**
   * 서버 이름 가져오기
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * 연결 상태 확인
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * 서버 연결
   */
  abstract connect(): Promise<void>;

  /**
   * 서버 연결 해제
   */
  abstract disconnect(): Promise<void>;

  /**
   * JSON-RPC 요청 전송
   */
  abstract sendRequest(request: JSONRPCRequest): Promise<JSONRPCResponse>;

  /**
   * 서버 초기화
   */
  async initialize(): Promise<MCPInitializeResult> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        clientInfo: {
          name: 'sepilot-desktop',
          version: '0.1.0',
        },
      },
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`Initialize error: ${response.error.message}`);
    }

    this.isConnected = true;
    return response.result as MCPInitializeResult;
  }

  /**
   * 사용 가능한 도구 목록 가져오기
   */
  async listTools(): Promise<MCPTool[]> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'tools/list',
      params: {},
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`List tools error: ${response.error.message}`);
    }

    if (!isToolsListResponse(response.result)) {
      throw new Error('Invalid tools response from MCP server');
    }

    this.tools = response.result.tools.map((tool) => ({
      ...tool,
      serverName: this.config.name,
    }));

    return this.tools;
  }

  /**
   * 도구 호출
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${response.error.message}`,
          },
        ],
        isError: true,
      };
    }

    if (!isToolCallResult(response.result)) {
      throw new Error('Invalid tool call response from MCP server');
    }

    return response.result;
  }

  /**
   * 리소스 목록 가져오기
   */
  async listResources(): Promise<MCPResource[]> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'resources/list',
      params: {},
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`List resources error: ${response.error.message}`);
    }

    if (!isResourcesListResponse(response.result)) {
      throw new Error('Invalid resource list response from MCP server');
    }

    this.resources = response.result.resources;
    return this.resources;
  }

  /**
   * 리소스 읽기
   */
  async readResource(uri: string): Promise<string> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'resources/read',
      params: {
        uri,
      },
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`Read resource error: ${response.error.message}`);
    }

    if (!isResourceReadResponse(response.result) || response.result.contents.length === 0) {
      throw new Error('Invalid resource read response from MCP server');
    }

    return response.result.contents[0].text;
  }

  /**
   * 다음 요청 ID 생성
   */
  protected getNextId(): number {
    return ++this.requestId;
  }

  /**
   * 연결 상태 확인
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * 도구 목록 가져오기 (캐시된)
   */
  getTools(): MCPTool[] {
    return this.tools;
  }

  /**
   * 리소스 목록 가져오기 (캐시된)
   */
  getResources(): MCPResource[] {
    return this.resources;
  }

  /**
   * 서버 이름
   */
  getName(): string {
    return this.config.name;
  }
}
