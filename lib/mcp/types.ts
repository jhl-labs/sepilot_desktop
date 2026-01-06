/**
 * MCP (Model Context Protocol) 타입 정의
 */

// Re-export from main types
export type { MCPServerConfig } from '../../types';

/**
 * MCP 전송 방식
 */
export type MCPTransport = 'stdio' | 'sse';

/**
 * MCP 도구 정의
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  serverName: string;
}

/**
 * MCP 리소스
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * JSON-RPC 요청
 */
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC 응답
 */
export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCP 초기화 결과
 */
export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: {
    tools?: Record<string, unknown>;
    resources?: Record<string, unknown>;
    prompts?: Record<string, unknown>;
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

/**
 * Tool 호출 결과
 */
export interface ToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * MCP Prompt Argument
 */
export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * MCP Prompt (Template)
 */
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

/**
 * MCP Prompt Message
 */
export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  };
}

/**
 * MCP Prompt Get Result
 */
export interface MCPPromptResult {
  description?: string;
  messages: MCPPromptMessage[];
}
