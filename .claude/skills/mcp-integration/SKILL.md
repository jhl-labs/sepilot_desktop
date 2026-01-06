---
name: MCP (Model Context Protocol) Integration
description: >
  Expert knowledge of MCP tool integration for SEPilot Desktop.
  Use when adding MCP servers, implementing tool calls, or debugging
  MCP communication. Ensures secure and efficient integration with
  external tools and services.
---

# MCP Integration Skill

## Overview

SEPilot Desktop uses MCP (Model Context Protocol) to connect LLMs with external tools and data sources:

- **Location**: `lib/mcp/` contains MCP transport implementations
- **Transports**: SSE (Server-Sent Events), stdio
- **Tools**: Web search, file system, database access, etc.
- **Security**: Tool call validation and sandboxing

## MCP Architecture

```
┌─────────────┐      IPC       ┌──────────────┐     MCP      ┌──────────────┐
│  Frontend   │ ←─────────────→ │   Electron   │ ←──────────→ │  MCP Server  │
│  (React)    │                 │   Main       │              │  (External)  │
└─────────────┘                 └──────────────┘              └──────────────┘
```

## Available MCP Transports

### SSE Transport

Server-Sent Events를 통한 실시간 통신:

```typescript
// lib/mcp/transport/sse-transport.ts
import { SSETransport } from '@/lib/mcp/transport/sse';

const transport = new SSETransport({
  url: 'https://api.example.com/mcp',
  headers: {
    Authorization: `Bearer ${apiKey}`,
  },
});

await transport.connect();
```

### Stdio Transport

표준 입출력을 통한 로컬 프로세스 통신:

```typescript
import { StdioTransport } from '@/lib/mcp/transport/stdio';

const transport = new StdioTransport({
  command: 'python',
  args: ['-m', 'mcp_server'],
  cwd: '/path/to/server',
});

await transport.connect();
```

## Configuring MCP Servers

### Project Configuration

`.mcp.json` 파일에 MCP 서버 정의:

```json
{
  "mcpServers": {
    "brave-search": {
      "transport": "sse",
      "url": "https://mcp.brave.com",
      "apiKey": "${BRAVE_API_KEY}"
    },
    "filesystem": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"]
    },
    "postgres": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
    }
  }
}
```

### Environment Variables

API 키는 환경 변수로 관리:

```bash
# .env.local (gitignore에 포함)
BRAVE_API_KEY=your_api_key_here
ANTHROPIC_API_KEY=your_api_key_here
```

## Tool Call Integration

### Backend: MCP Tool Executor

```typescript
// electron/services/mcp-executor.ts
import { MCPClient } from '@/lib/mcp/client';

export class MCPExecutor {
  private clients: Map<string, MCPClient> = new Map();

  async initializeServer(serverName: string, config: MCPServerConfig): Promise<void> {
    const client = new MCPClient(config);
    await client.connect();
    this.clients.set(serverName, client);
  }

  async callTool(
    serverName: string,
    toolName: string,
    parameters: Record<string, unknown>
  ): Promise<ToolResult> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server not initialized: ${serverName}`);
    }

    // Validate parameters
    this.validateToolCall(toolName, parameters);

    // Execute tool
    const result = await client.callTool(toolName, parameters);
    return result;
  }

  private validateToolCall(toolName: string, parameters: Record<string, unknown>): void {
    // Validate tool name
    const allowedTools = ['web-search', 'read-file', 'write-file', 'query-database'];
    if (!allowedTools.includes(toolName)) {
      throw new Error(`Tool not allowed: ${toolName}`);
    }

    // Validate parameters (prevent injection)
    if (toolName === 'read-file' || toolName === 'write-file') {
      const path = parameters.path as string;
      if (path.includes('..') || path.startsWith('/')) {
        throw new Error('Invalid file path');
      }
    }
  }
}
```

### IPC Handler

```typescript
// electron/ipc/handlers/mcp.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { MCPExecutor } from '../services/mcp-executor';

const executor = new MCPExecutor();

export function setupMCPHandlers() {
  // Initialize MCP server
  ipcMain.handle('mcp:init', async (event: IpcMainInvokeEvent, config: MCPServerConfig) => {
    try {
      await executor.initializeServer(config.name, config);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Call MCP tool
  ipcMain.handle(
    'mcp:call-tool',
    async (
      event: IpcMainInvokeEvent,
      request: {
        server: string;
        tool: string;
        parameters: Record<string, unknown>;
      }
    ) => {
      try {
        const result = await executor.callTool(request.server, request.tool, request.parameters);
        return { success: true, result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // List available tools
  ipcMain.handle('mcp:list-tools', async (event: IpcMainInvokeEvent, serverName: string) => {
    try {
      const tools = await executor.listTools(serverName);
      return { success: true, tools };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}
```

### Frontend Usage

```typescript
// lib/hooks/useMCP.ts
export function useMCP() {
  const initializeServer = async (config: MCPServerConfig): Promise<void> => {
    const result = await window.electron.invoke('mcp:init', config);
    if (!result.success) {
      throw new Error(result.error);
    }
  };

  const callTool = async (
    server: string,
    tool: string,
    parameters: Record<string, unknown>
  ): Promise<unknown> => {
    const result = await window.electron.invoke('mcp:call-tool', {
      server,
      tool,
      parameters,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    return result.result;
  };

  return { initializeServer, callTool };
}
```

## Common MCP Servers

### Brave Search

웹 검색 기능:

```typescript
await mcpExecutor.callTool('brave-search', 'web-search', {
  query: 'TypeScript best practices',
  count: 5,
});
```

### File System

파일 읽기/쓰기:

```typescript
// Read file
await mcpExecutor.callTool('filesystem', 'read-file', {
  path: 'documents/data.json',
});

// Write file
await mcpExecutor.callTool('filesystem', 'write-file', {
  path: 'output/result.txt',
  content: 'Hello, world!',
});
```

### Database

데이터베이스 쿼리:

```typescript
await mcpExecutor.callTool('postgres', 'query', {
  sql: 'SELECT * FROM users WHERE active = true',
});
```

## Security Best Practices

### Tool Whitelisting

허용된 도구만 실행:

```typescript
const ALLOWED_TOOLS = {
  'brave-search': ['web-search'],
  filesystem: ['read-file', 'write-file'],
  postgres: ['query'],
};

function validateTool(server: string, tool: string): boolean {
  const allowedTools = ALLOWED_TOOLS[server];
  return allowedTools?.includes(tool) ?? false;
}
```

### Parameter Validation

파라미터 검증:

```typescript
function validateFileSystemAccess(path: string): boolean {
  // Prevent path traversal
  if (path.includes('..')) return false;

  // Only allow access to specific directories
  const allowedDirs = ['documents', 'output', 'temp'];
  const firstDir = path.split('/')[0];
  return allowedDirs.includes(firstDir);
}
```

### Rate Limiting

API 호출 제한:

```typescript
class RateLimiter {
  private calls: Map<string, number[]> = new Map();

  canCall(serverName: string, maxCallsPerMinute: number): boolean {
    const now = Date.now();
    const calls = this.calls.get(serverName) || [];

    // Remove calls older than 1 minute
    const recentCalls = calls.filter((time) => now - time < 60000);
    this.calls.set(serverName, recentCalls);

    if (recentCalls.length >= maxCallsPerMinute) {
      return false;
    }

    recentCalls.push(now);
    return true;
  }
}
```

## Error Handling

```typescript
try {
  const result = await mcpExecutor.callTool(server, tool, params);
} catch (error) {
  if (error instanceof MCPConnectionError) {
    // Server connection failed
    console.error('MCP server not available:', error.message);
  } else if (error instanceof MCPToolError) {
    // Tool execution failed
    console.error('Tool execution failed:', error.toolName, error.message);
  } else if (error instanceof MCPValidationError) {
    // Parameter validation failed
    console.error('Invalid parameters:', error.message);
  } else {
    // Unknown error
    console.error('Unknown MCP error:', error);
  }
}
```

## Testing MCP Integration

```typescript
// tests/mcp/brave-search.test.ts
import { MCPExecutor } from '@/electron/services/mcp-executor';

describe('Brave Search MCP', () => {
  let executor: MCPExecutor;

  beforeAll(async () => {
    executor = new MCPExecutor();
    await executor.initializeServer('brave-search', {
      transport: 'sse',
      url: process.env.BRAVE_MCP_URL,
      apiKey: process.env.BRAVE_API_KEY,
    });
  });

  it('should perform web search', async () => {
    const result = await executor.callTool('brave-search', 'web-search', {
      query: 'test query',
      count: 3,
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(3);
  });

  afterAll(async () => {
    await executor.disconnect('brave-search');
  });
});
```

## Debugging MCP

```typescript
// Enable MCP debug logging
const client = new MCPClient({
  ...config,
  debug: true,
  onLog: (level, message) => {
    console.log(`[MCP ${level}]`, message);
  },
});
```

## Real-World Examples

기존 구현 참고:

- `lib/mcp/transport/sse-transport.ts` - SSE 전송 구현
- `lib/mcp/client.ts` - MCP 클라이언트
- `electron/services/mcp-executor.ts` - 도구 실행기 (예정)
