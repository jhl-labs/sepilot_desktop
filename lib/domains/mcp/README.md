# lib/domains/mcp/ - MCP (Model Context Protocol)

> MCP 서버 관리 및 도구 호출을 담당하는 도메인

## 📋 목차

- [개요](#개요)
- [폴더 구조](#폴더-구조)
- [주요 파일](#주요-파일)
- [사용 방법](#사용-방법)
- [새 MCP 도구 추가 가이드](#새-mcp-도구-추가-가이드)
- [MCP 서버 추가](#mcp-서버-추가)
- [보안 및 에러 처리](#보안-및-에러-처리)
- [예제 코드](#예제-코드)
- [관련 문서](#관련-문서)

---

## 개요

MCP(Model Context Protocol) 도메인은 외부 MCP 서버와의 통신 및 도구 호출을 담당합니다. MCP는 LLM이 외부 데이터 소스 및 도구에 접근할 수 있도록 하는 표준 프로토콜입니다.

**핵심 원칙:**

- **표준 프로토콜**: JSON-RPC 2.0 기반 통신
- **서버 격리**: 각 MCP 서버는 독립 프로세스로 실행
- **도구 레지스트리**: 모든 MCP 도구를 중앙 집중식으로 관리
- **보안 우선**: 도구 인자 검증 및 Sandbox 실행

**지원 기능:**

- MCP 서버 생명주기 관리 (시작, 중단, 재시작)
- JSON-RPC 2.0 통신 (요청/응답, 알림)
- 도구 검색 및 호출
- Stdio 및 SSE 전송 지원
- Built-in 도구 (Google Search, Browser 등)

---

## 폴더 구조

```
lib/domains/mcp/
├── client.ts                 # MCP 클라이언트 (JSON-RPC 2.0)
├── server-manager.ts         # MCP 서버 생명주기 관리
├── types.ts                  # MCP 타입 정의
├── tools/                    # MCP 도구 구현
│   ├── registry.ts           # 도구 레지스트리
│   ├── executor.ts           # 도구 실행기
│   ├── builtin-tools.ts      # Built-in 도구
│   ├── google-search-handlers.ts   # Google Search 핸들러
│   ├── google-search-tools.ts      # Google Search 도구
│   ├── browser-handlers-enhanced.ts  # Browser 핸들러
│   └── browser-handlers-vision.ts    # Browser Vision 핸들러
├── transport/                # 전송 계층
│   ├── stdio.ts              # Standard I/O 전송
│   └── sse.ts                # Server-Sent Events 전송
└── index.ts                  # Export
```

---

## 주요 파일

### server-manager.ts - MCPServerManager

**역할:** MCP 서버 생명주기 관리 및 중앙 제어

**주요 기능:**

```typescript
class MCPServerManager {
  static getInstance(): MCPServerManager;

  // 서버 추가
  async addServer(config: MCPServerConfig): Promise<void>;

  // 서버 제거
  async removeServer(serverName: string): Promise<void>;

  // 서버 시작
  async startServer(serverName: string): Promise<void>;

  // 서버 중단
  async stopServer(serverName: string): Promise<void>;

  // 도구 호출
  async callTool(serverName: string, toolName: string, args: any): Promise<any>;

  // 모든 도구 목록
  getAllTools(): MCPTool[];

  // 서버 상태 조회
  getServerStatus(serverName: string): MCPServerStatus;
}
```

**사용 예:**

```typescript
import { MCPServerManager } from '@/lib/domains/mcp/server-manager';

const manager = MCPServerManager.getInstance();

// 서버 추가
await manager.addServer({
  name: 'filesystem',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/user/documents'],
  env: {},
});

// 도구 호출
const result = await manager.callTool('filesystem', 'read_file', {
  path: '/home/user/documents/README.md',
});

console.log('파일 내용:', result);
```

---

### client.ts - MCPClient

**역할:** MCP 서버와의 JSON-RPC 2.0 통신

**주요 기능:**

```typescript
class MCPClient {
  constructor(transport: Transport);

  // 요청 전송 (응답 대기)
  async request(method: string, params?: any): Promise<any>;

  // 알림 전송 (응답 없음)
  notify(method: string, params?: any): void;

  // 이벤트 리스너
  on(event: string, handler: Function): void;

  // 연결 종료
  close(): void;
}
```

**JSON-RPC 2.0 요청 예:**

```typescript
const client = new MCPClient(new StdioTransport(process));

// tools/list 요청
const tools = await client.request('tools/list');
console.log('사용 가능한 도구:', tools);

// tools/call 요청
const result = await client.request('tools/call', {
  name: 'read_file',
  arguments: { path: '/path/to/file.txt' },
});
```

---

### tools/registry.ts - MCPToolRegistry

**역할:** 모든 MCP 도구를 중앙 집중식으로 관리

**주요 기능:**

```typescript
class MCPToolRegistry {
  // 도구 등록
  register(serverName: string, tools: MCPTool[]): void;

  // 도구 검색
  findTool(toolName: string): MCPTool | undefined;

  // 모든 도구 목록
  getAllTools(): MCPTool[];

  // 서버별 도구 목록
  getToolsByServer(serverName: string): MCPTool[];

  // 도구 제거 (서버 중단 시)
  unregister(serverName: string): void;
}
```

**도구 타입:**

```typescript
interface MCPTool {
  name: string; // 도구 이름
  description: string; // 설명
  inputSchema: object; // JSON Schema (인자 검증)
  serverName: string; // 소속 서버
}
```

---

### tools/executor.ts - MCPToolExecutor

**역할:** MCP 도구 실행 및 인자 검증

**주요 기능:**

```typescript
class MCPToolExecutor {
  // 도구 실행
  async execute(toolName: string, args: any): Promise<any>;

  // 인자 검증 (JSON Schema)
  validateArgs(tool: MCPTool, args: any): boolean;

  // 타임아웃 설정
  setTimeout(ms: number): void;
}
```

**검증 예:**

```typescript
const tool = {
  name: 'read_file',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
    },
    required: ['path'],
  },
};

const executor = new MCPToolExecutor();

// ✅ 유효한 인자
executor.validateArgs(tool, { path: '/path/to/file.txt' }); // true

// ❌ 잘못된 인자
executor.validateArgs(tool, { path: 123 }); // false (타입 오류)
executor.validateArgs(tool, {}); // false (필수 인자 누락)
```

---

### tools/builtin-tools.ts - Built-in Tools

**역할:** SEPilot에 내장된 MCP 도구

**Built-in 도구 목록:**

1. **google_search** - Google 검색
2. **browser_navigate** - 웹 페이지 탐색
3. **browser_screenshot** - 스크린샷 캡처
4. **browser_click** - 요소 클릭
5. **browser_type** - 텍스트 입력
6. **browser_extract** - 콘텐츠 추출

**등록:**

```typescript
import { registerBuiltinTools } from '@/lib/domains/mcp/tools/builtin-tools';

const manager = MCPServerManager.getInstance();
registerBuiltinTools(manager);
```

---

### transport/stdio.ts - StdioTransport

**역할:** Standard I/O 기반 MCP 통신

**사용 예:**

```typescript
import { spawn } from 'child_process';
import { StdioTransport } from '@/lib/domains/mcp/transport/stdio';

const process = spawn('npx', ['-y', '@modelcontextprotocol/server-filesystem', '/path']);
const transport = new StdioTransport(process);

const client = new MCPClient(transport);
const tools = await client.request('tools/list');
```

---

### transport/sse.ts - SSETransport

**역할:** Server-Sent Events 기반 MCP 통신

**사용 예:**

```typescript
import { SSETransport } from '@/lib/domains/mcp/transport/sse';

const transport = new SSETransport('http://localhost:3000/mcp');
const client = new MCPClient(transport);

const tools = await client.request('tools/list');
```

---

## 사용 방법

### 1. MCP 서버 추가

```typescript
import { MCPServerManager } from '@/lib/domains/mcp/server-manager';

const manager = MCPServerManager.getInstance();

// Filesystem 서버 추가
await manager.addServer({
  name: 'filesystem',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/user/documents'],
  env: {},
});

// GitHub 서버 추가
await manager.addServer({
  name: 'github',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: {
    GITHUB_TOKEN: 'ghp_...',
  },
});
```

### 2. 도구 목록 조회

```typescript
const tools = manager.getAllTools();

tools.forEach((tool) => {
  console.log(`도구: ${tool.name}`);
  console.log(`설명: ${tool.description}`);
  console.log(`서버: ${tool.serverName}`);
});
```

### 3. 도구 호출

```typescript
// 파일 읽기
const content = await manager.callTool('filesystem', 'read_file', {
  path: '/home/user/documents/README.md',
});

console.log('파일 내용:', content);

// GitHub Issue 생성
const issue = await manager.callTool('github', 'create_issue', {
  repo: 'owner/repo',
  title: '버그 리포트',
  body: '설명...',
});

console.log('Issue 생성됨:', issue.url);
```

### 4. 서버 상태 확인

```typescript
const status = manager.getServerStatus('filesystem');

console.log('서버 상태:', status);
// {
//   name: 'filesystem',
//   status: 'running',
//   pid: 12345,
//   tools: [...],
// }
```

### 5. 서버 제거

```typescript
await manager.removeServer('filesystem');
console.log('서버 제거됨');
```

---

## 새 MCP 도구 추가 가이드

### 1. Built-in 도구 추가

**예시: Weather 도구**

```typescript
// lib/domains/mcp/tools/weather-tools.ts
import type { MCPTool } from '../types';

export const weatherTools: MCPTool[] = [
  {
    name: 'get_weather',
    description: '특정 도시의 날씨를 가져옵니다',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '도시 이름',
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: '온도 단위',
          default: 'celsius',
        },
      },
      required: ['city'],
    },
    serverName: 'builtin',
  },
];

// 핸들러 구현
export async function handleGetWeather(args: { city: string; unit?: string }) {
  const { city, unit = 'celsius' } = args;

  // 날씨 API 호출
  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=${unit === 'celsius' ? 'metric' : 'imperial'}`
  );

  const data = await response.json();

  return {
    city: data.name,
    temperature: data.main.temp,
    description: data.weather[0].description,
    unit,
  };
}
```

### 2. builtin-tools.ts에 등록

```typescript
// lib/domains/mcp/tools/builtin-tools.ts
import { weatherTools, handleGetWeather } from './weather-tools';

export function registerBuiltinTools(manager: MCPServerManager) {
  // 기존 도구 등록
  // ...

  // Weather 도구 등록
  weatherTools.forEach((tool) => {
    manager.registerTool(tool, async (args) => {
      if (tool.name === 'get_weather') {
        return handleGetWeather(args);
      }
    });
  });
}
```

### 3. UI에서 사용

```typescript
// LangGraph Agent에서 자동으로 사용 가능
const result = await manager.callTool('builtin', 'get_weather', {
  city: 'Seoul',
  unit: 'celsius',
});

console.log(`서울 날씨: ${result.temperature}°C, ${result.description}`);
```

---

## MCP 서버 추가

### 1. 공식 MCP 서버 설치

**Filesystem 서버:**

```bash
npx -y @modelcontextprotocol/server-filesystem /path/to/directory
```

**GitHub 서버:**

```bash
export GITHUB_TOKEN=ghp_...
npx -y @modelcontextprotocol/server-github
```

**Google Drive 서버:**

```bash
npx -y @modelcontextprotocol/server-gdrive
```

### 2. 커스텀 MCP 서버 작성

**예시: Simple Echo 서버**

```typescript
// my-mcp-server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  {
    name: 'echo-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 도구 목록 핸들러
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'echo',
        description: '입력된 메시지를 그대로 반환합니다',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        },
      },
    ],
  };
});

// 도구 호출 핸들러
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'echo') {
    return {
      content: [
        {
          type: 'text',
          text: `Echo: ${args.message}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// 서버 시작
const transport = new StdioServerTransport();
await server.connect(transport);
```

### 3. SEPilot에 추가

```typescript
await manager.addServer({
  name: 'echo-server',
  command: 'tsx',
  args: ['my-mcp-server.ts'],
  env: {},
});

// 사용
const result = await manager.callTool('echo-server', 'echo', {
  message: 'Hello, MCP!',
});

console.log(result); // "Echo: Hello, MCP!"
```

---

## 보안 및 에러 처리

### 1. 인자 검증

**JSON Schema 기반 검증:**

```typescript
import Ajv from 'ajv';

const ajv = new Ajv();

function validateArgs(tool: MCPTool, args: any): boolean {
  const validate = ajv.compile(tool.inputSchema);
  const valid = validate(args);

  if (!valid) {
    console.error('인자 검증 실패:', validate.errors);
    return false;
  }

  return true;
}
```

### 2. Prototype Pollution 방지

```typescript
function sanitizeArgs(args: any): any {
  // __proto__, constructor, prototype 제거
  const sanitized = { ...args };
  delete sanitized.__proto__;
  delete sanitized.constructor;
  delete sanitized.prototype;

  return sanitized;
}

// 사용
const result = await manager.callTool('server', 'tool', sanitizeArgs(args));
```

### 3. 타임아웃 설정

```typescript
async function callToolWithTimeout(
  serverName: string,
  toolName: string,
  args: any,
  timeoutMs = 30000
): Promise<any> {
  const manager = MCPServerManager.getInstance();

  return Promise.race([
    manager.callTool(serverName, toolName, args),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Tool execution timeout')), timeoutMs)
    ),
  ]);
}
```

### 4. 에러 처리

```typescript
try {
  const result = await manager.callTool('filesystem', 'read_file', {
    path: '/path/to/file.txt',
  });
} catch (error) {
  if (error.message.includes('ENOENT')) {
    console.error('파일을 찾을 수 없습니다');
  } else if (error.message.includes('EACCES')) {
    console.error('파일 접근 권한이 없습니다');
  } else if (error.message.includes('timeout')) {
    console.error('도구 실행 시간 초과');
  } else {
    console.error('도구 실행 실패:', error.message);
  }
}
```

---

## 예제 코드

### 예제 1: Filesystem 서버 사용

```typescript
import { MCPServerManager } from '@/lib/domains/mcp/server-manager';

async function readProjectFiles() {
  const manager = MCPServerManager.getInstance();

  // Filesystem 서버 추가
  await manager.addServer({
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
    env: {},
  });

  // package.json 읽기
  const packageJson = await manager.callTool('filesystem', 'read_file', {
    path: './package.json',
  });

  console.log('package.json:', JSON.parse(packageJson));

  // 디렉토리 목록
  const files = await manager.callTool('filesystem', 'list_directory', {
    path: './src',
  });

  console.log('src/ 파일 목록:', files);

  // 서버 제거
  await manager.removeServer('filesystem');
}
```

### 예제 2: Google Search 도구

```typescript
import { MCPServerManager } from '@/lib/domains/mcp/server-manager';

async function searchWeb(query: string) {
  const manager = MCPServerManager.getInstance();

  // Built-in Google Search 도구 사용
  const results = await manager.callTool('builtin', 'google_search', {
    query,
    num: 5,
  });

  results.forEach((result: any, index: number) => {
    console.log(`${index + 1}. ${result.title}`);
    console.log(`   ${result.link}`);
    console.log(`   ${result.snippet}`);
    console.log();
  });
}

// 사용
await searchWeb('MCP Model Context Protocol');
```

### 예제 3: LangGraph Agent와 통합

```typescript
import { GraphFactory } from '@/lib/domains/agent/factory/GraphFactory';
import { MCPServerManager } from '@/lib/domains/mcp/server-manager';

async function runAgentWithMCP() {
  const manager = MCPServerManager.getInstance();

  // GitHub 서버 추가
  await manager.addServer({
    name: 'github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN!,
    },
  });

  // Agent 실행 (MCP 도구 자동 사용)
  const messages = [
    {
      role: 'user',
      content: 'jhl-labs/sepilot_desktop-private 리포지토리의 최근 Issue를 조회해주세요',
    },
  ];

  const stream = await GraphFactory.streamWithConfig({ graphType: 'agent' }, messages, {
    conversationId: 'test-123',
  });

  for await (const event of stream) {
    if (event.type === 'streaming') {
      process.stdout.write(event.chunk);
    } else if (event.type === 'tool_call') {
      console.log('\n[Tool Call]', event.toolName, event.args);
    }
  }

  // 서버 제거
  await manager.removeServer('github');
}
```

### 예제 4: Browser 자동화

```typescript
import { MCPServerManager } from '@/lib/domains/mcp/server-manager';

async function automateWebsite() {
  const manager = MCPServerManager.getInstance();

  // 1. 페이지 탐색
  await manager.callTool('builtin', 'browser_navigate', {
    url: 'https://www.google.com',
  });

  // 2. 검색어 입력
  await manager.callTool('builtin', 'browser_type', {
    selector: 'textarea[name="q"]',
    text: 'Model Context Protocol',
  });

  // 3. 엔터 키 입력
  await manager.callTool('builtin', 'browser_type', {
    selector: 'textarea[name="q"]',
    text: '\n',
  });

  // 4. 결과 대기 (3초)
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 5. 스크린샷
  const screenshot = await manager.callTool('builtin', 'browser_screenshot', {
    fullPage: false,
  });

  console.log('스크린샷 저장:', screenshot.path);

  // 6. 콘텐츠 추출
  const content = await manager.callTool('builtin', 'browser_extract', {
    selector: '#search',
  });

  console.log('검색 결과:', content);
}
```

---

## 관련 문서

### 도메인

- [lib/README.md](../../README.md) - lib 폴더 가이드
- [lib/domains/llm/README.md](../llm/README.md) - LLM 클라이언트
- [lib/domains/agent/README.md](../agent/README.md) - LangGraph Agent

### 아키텍처

- [docs/architecture/dependency-rules.md](../../../docs/architecture/dependency-rules.md) - 의존성 규칙

### IPC 통신

- [electron/ipc/README.md](../../../electron/ipc/README.md) - IPC 핸들러 가이드

### 개발 가이드

- [CLAUDE.md](../../../CLAUDE.md) - 프로젝트 전체 가이드

### 외부 리소스

- [Model Context Protocol 공식 문서](https://modelcontextprotocol.io/)
- [MCP SDK GitHub](https://github.com/modelcontextprotocol/sdk)
- [MCP Servers GitHub](https://github.com/modelcontextprotocol/servers)

---

## 변경 이력

- **2025-02-10**: Phase 3 리팩토링 완료 (도메인 구조화)
- **2025-01-17**: 초기 MCP 통합 구축
