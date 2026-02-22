# lib/domains/llm/ - LLM 클라이언트

> LLM(Large Language Model) API 통신 및 스트리밍 처리를 담당하는 도메인

## 📋 목차

- [개요](#개요)
- [폴더 구조](#폴더-구조)
- [주요 파일](#주요-파일)
- [사용 방법](#사용-방법)
- [Provider 추가 가이드](#provider-추가-가이드)
- [스트리밍 패턴](#스트리밍-패턴)
- [에러 처리](#에러-처리)
- [예제 코드](#예제-코드)
- [관련 문서](#관련-문서)

---

## 개요

llm 도메인은 SEPilot Desktop의 모든 LLM API 통신을 담당합니다. OpenAI, Anthropic, Google Gemini, Ollama 등 다양한 Provider를 지원합니다.

**핵심 원칙:**

- **Provider 추상화**: BaseLLMProvider 기반으로 일관된 인터페이스
- **스트리밍 우선**: AsyncGenerator 기반 실시간 토큰 스트리밍
- **대화별 격리**: conversationId 기반으로 다중 스트림 관리
- **에러 복원력**: 재시도, 타임아웃, Fallback 지원

**지원 Provider:**

- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude 3.5, Claude 3)
- Google Gemini (Gemini Pro, Gemini Ultra)
- Ollama (로컬 LLM)
- OpenAI 호환 API (Groq, Together AI 등)

---

## 폴더 구조

```
lib/domains/llm/
├── base.ts                   # BaseLLMProvider 추상 클래스
├── client.ts                 # LLMClient 싱글톤
├── service.ts                # LLMService (고수준 API)
├── providers/                # Provider 구현
│   ├── openai.ts             # OpenAI 및 호환 Provider
│   └── ollama.ts             # Ollama Provider
├── streaming-callback.ts     # 스트리밍 콜백 관리
├── vision-utils.ts           # 비전 모델 유틸리티
├── http-utils.ts             # HTTP 유틸리티
├── web-client.ts             # 웹 환경 클라이언트
└── index.ts                  # Export
```

---

## 주요 파일

### base.ts - BaseLLMProvider

**역할:** 모든 LLM Provider의 공통 인터페이스 정의

**주요 메서드:**

```typescript
abstract class BaseLLMProvider {
  // 일반 채팅 (비스트리밍)
  abstract chat(messages: Message[], options?: LLMOptions): Promise<string>;

  // 스트리밍 채팅
  abstract stream(messages: Message[], options?: LLMOptions): AsyncGenerator<string>;

  // 설정 검증
  abstract validate(config: LLMConfig): Promise<boolean>;

  // 사용 가능한 모델 목록
  abstract getAvailableModels(): Promise<string[]>;
}
```

---

### client.ts - LLMClient

**역할:** LLM 클라이언트 싱글톤, Provider 관리 및 스트리밍 제어

**주요 기능:**

- Provider 자동 선택 (설정 기반)
- 스트리밍 스케줄링 (한 번에 하나의 스트림만)
- 스트림 중단 (AbortController)
- 대화별 콜백 격리

**사용 예:**

```typescript
import { LLMClient } from '@/lib/domains/llm/client';

const client = LLMClient.getInstance();

// 스트리밍 채팅
for await (const chunk of client.stream(messages, { conversationId: 'conv-123' })) {
  console.log(chunk);
}

// 일반 채팅
const response = await client.chat(messages);
```

**주요 메서드:**

```typescript
class LLMClient {
  static getInstance(): LLMClient;

  // Provider 초기화
  initialize(config: LLMConfig): void;

  // 스트리밍 채팅
  async *stream(messages: Message[], options?: LLMOptions): AsyncGenerator<string>;

  // 일반 채팅
  async chat(messages: Message[], options?: LLMOptions): Promise<string>;

  // 스트림 중단
  abort(conversationId: string): void;

  // 현재 Provider
  getProvider(): BaseLLMProvider;
}
```

---

### service.ts - LLMService

**역할:** 고수준 LLM 서비스, 컨텍스트 관리 및 프롬프트 전처리

**주요 기능:**

- 시스템 프롬프트 주입
- 컨텍스트 길이 관리
- 토큰 카운팅
- 비용 계산

---

### providers/openai.ts - OpenAIProvider

**역할:** OpenAI 및 호환 Provider 구현

**지원 Provider:**

- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude 3.5, Claude 3)
- Google Gemini (Gemini Pro)
- Groq, Together AI, Perplexity 등

**주요 기능:**

```typescript
class OpenAIProvider extends BaseLLMProvider {
  async *stream(messages: Message[], options?: LLMOptions): AsyncGenerator<string> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        ...options,
      }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter((line) => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const json = JSON.parse(data);
            const content = json.choices[0]?.delta?.content;
            if (content) yield content;
          } catch (e) {
            // 파싱 에러 무시
          }
        }
      }
    }
  }
}
```

---

### providers/ollama.ts - OllamaProvider

**역할:** Ollama 로컬 LLM Provider

**특징:**

- 로컬 실행 (인터넷 불필요)
- 커스텀 모델 지원
- 스트리밍 API

**설정 예:**

```typescript
{
  provider: 'ollama',
  baseURL: 'http://localhost:11434',
  model: 'llama3.2',
}
```

---

### streaming-callback.ts - StreamingCallback

**역할:** 대화별 스트리밍 콜백 격리 및 관리

**주요 기능:**

```typescript
class StreamingCallbackManager {
  private callbacks = new Map<string, (chunk: string) => void>();

  // 콜백 등록
  register(conversationId: string, callback: (chunk: string) => void): void {
    this.callbacks.set(conversationId, callback);
  }

  // 콜백 호출
  notify(conversationId: string, chunk: string): void {
    const callback = this.callbacks.get(conversationId);
    if (callback) callback(chunk);
  }

  // 콜백 제거
  unregister(conversationId: string): void {
    this.callbacks.delete(conversationId);
  }
}
```

**사용 예:**

```typescript
const manager = new StreamingCallbackManager();

manager.register('conv-123', (chunk) => {
  console.log('Conv 123:', chunk);
});

manager.register('conv-456', (chunk) => {
  console.log('Conv 456:', chunk);
});

// 각 대화별로 격리된 콜백 실행
manager.notify('conv-123', 'Hello'); // "Conv 123: Hello"
manager.notify('conv-456', 'World'); // "Conv 456: World"
```

---

### vision-utils.ts - Vision Utils

**역할:** 비전 모델 유틸리티 (이미지 입력 처리)

**주요 기능:**

- 이미지 → Base64 변환
- 이미지 리사이징 (토큰 절약)
- 비전 모델 지원 확인

**사용 예:**

```typescript
import { prepareImageForVision, isVisionModel } from '@/lib/domains/llm/vision-utils';

if (isVisionModel('gpt-4-vision-preview')) {
  const base64 = await prepareImageForVision('/path/to/image.png');

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: '이 이미지를 설명해주세요' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
      ],
    },
  ];
}
```

---

## 사용 방법

### 1. 기본 사용 (스트리밍)

```typescript
import { LLMClient } from '@/lib/domains/llm/client';

const client = LLMClient.getInstance();

const messages = [
  { role: 'system', content: '당신은 친절한 AI 어시스턴트입니다.' },
  { role: 'user', content: '안녕하세요!' },
];

// 스트리밍 채팅
for await (const chunk of client.stream(messages, { conversationId: 'conv-123' })) {
  process.stdout.write(chunk);
}
```

### 2. 일반 채팅 (비스트리밍)

```typescript
const response = await client.chat(messages);
console.log('응답:', response);
```

### 3. 스트림 중단

```typescript
// Frontend에서 중단 버튼 클릭
const handleAbort = () => {
  client.abort('conv-123');
};

// 또는 IPC를 통해
await window.electronAPI.llm.abort('conv-123');
```

### 4. 이미지 포함 (Vision 모델)

```typescript
import { prepareImageForVision } from '@/lib/domains/llm/vision-utils';

const imageBase64 = await prepareImageForVision('/path/to/image.png');

const messages = [
  {
    role: 'user',
    content: [
      { type: 'text', text: '이 이미지에 무엇이 있나요?' },
      {
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${imageBase64}` },
      },
    ],
  },
];

for await (const chunk of client.stream(messages, { model: 'gpt-4-vision-preview' })) {
  console.log(chunk);
}
```

### 5. 설정 변경

```typescript
// Electron Main Process
import { LLMClient } from '@/lib/domains/llm/client';

const client = LLMClient.getInstance();

client.initialize({
  provider: 'anthropic',
  apiKey: 'sk-ant-...',
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 4096,
  temperature: 0.7,
});
```

---

## Provider 추가 가이드

### 1. Provider 클래스 생성

**예시: HuggingFaceProvider**

```typescript
// lib/domains/llm/providers/huggingface.ts
import { BaseLLMProvider } from '../base';
import type { Message, LLMOptions, LLMConfig } from '@/types';

export class HuggingFaceProvider extends BaseLLMProvider {
  private apiKey: string;
  private model: string;
  private endpoint = 'https://api-inference.huggingface.co/models';

  constructor(config: LLMConfig) {
    super(config);
    this.apiKey = config.apiKey;
    this.model = config.model || 'mistralai/Mistral-7B-Instruct-v0.2';
  }

  async chat(messages: Message[], options?: LLMOptions): Promise<string> {
    const response = await fetch(`${this.endpoint}/${this.model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: this.formatMessages(messages),
        parameters: {
          max_new_tokens: options?.maxTokens || 1024,
          temperature: options?.temperature || 0.7,
        },
      }),
    });

    const data = await response.json();
    return data[0]?.generated_text || '';
  }

  async *stream(messages: Message[], options?: LLMOptions): AsyncGenerator<string> {
    // HuggingFace 스트리밍 API 구현
    // ...
    yield* this.streamResponse(messages, options);
  }

  async validate(config: LLMConfig): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/${config.model}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return [
      'mistralai/Mistral-7B-Instruct-v0.2',
      'meta-llama/Llama-2-7b-chat-hf',
      'tiiuae/falcon-7b-instruct',
    ];
  }

  private formatMessages(messages: Message[]): string {
    // HuggingFace 형식으로 변환
    return messages.map((m) => `${m.role}: ${m.content}`).join('\n');
  }
}
```

### 2. client.ts에 Provider 등록

```typescript
// lib/domains/llm/client.ts
import { HuggingFaceProvider } from './providers/huggingface';

class LLMClient {
  initialize(config: LLMConfig): void {
    switch (config.provider) {
      case 'openai':
        this.provider = new OpenAIProvider(config);
        break;
      case 'ollama':
        this.provider = new OllamaProvider(config);
        break;
      case 'huggingface': // 추가
        this.provider = new HuggingFaceProvider(config);
        break;
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }
}
```

### 3. 타입 정의 업데이트

```typescript
// types/index.d.ts
export type LLMProviderType = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'huggingface'; // 추가
```

### 4. UI 설정 추가

```tsx
// components/settings/LLMSettings.tsx
<Select>
  <SelectItem value="openai">OpenAI</SelectItem>
  <SelectItem value="anthropic">Anthropic</SelectItem>
  <SelectItem value="ollama">Ollama</SelectItem>
  <SelectItem value="huggingface">HuggingFace</SelectItem>
</Select>
```

---

## 스트리밍 패턴

### 1. AsyncGenerator 기반 스트리밍

**Provider 구현:**

```typescript
async *stream(messages: Message[], options?: LLMOptions): AsyncGenerator<string> {
  const response = await fetch(this.endpoint, {
    method: 'POST',
    body: JSON.stringify({ messages, stream: true }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    // SSE 파싱
    const lines = chunk.split('\n').filter(line => line.trim());

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;

        const json = JSON.parse(data);
        const content = json.choices[0]?.delta?.content;
        if (content) yield content;
      }
    }
  }
}
```

**사용:**

```typescript
for await (const chunk of provider.stream(messages)) {
  console.log(chunk);
}
```

### 2. 대화별 콜백 격리

**Electron IPC에서 사용:**

```typescript
// electron/ipc/handlers/llm/llm.ts
ipcMain.handle('llm-stream-chat', async (event, messages, options) => {
  const conversationId = options.conversationId;
  const client = LLMClient.getInstance();

  try {
    for await (const chunk of client.stream(messages, options)) {
      // conversationId로 격리된 이벤트 전송
      event.sender.send('llm-stream-chunk', {
        conversationId,
        chunk,
      });
    }

    event.sender.send('llm-stream-done', { conversationId });
  } catch (error) {
    event.sender.send('llm-stream-error', {
      conversationId,
      error: error.message,
    });
  }
});
```

### 3. Frontend 리스너

```tsx
// components/chat/unified/UnifiedChatArea.tsx
useEffect(() => {
  const handleChunk = (data: { conversationId: string; chunk: string }) => {
    if (data.conversationId === currentConversationId) {
      setContent((prev) => prev + data.chunk);
    }
  };

  window.electronAPI.on('llm-stream-chunk', handleChunk);

  return () => {
    window.electronAPI.off('llm-stream-chunk', handleChunk);
  };
}, [currentConversationId]);
```

---

## 에러 처리

### 1. 네트워크 에러

```typescript
try {
  for await (const chunk of client.stream(messages)) {
    console.log(chunk);
  }
} catch (error) {
  if (error instanceof NetworkError) {
    console.error('네트워크 연결 실패');
  } else if (error instanceof TimeoutError) {
    console.error('요청 시간 초과');
  }
}
```

### 2. API 에러

```typescript
try {
  const response = await client.chat(messages);
} catch (error) {
  if (error.status === 401) {
    console.error('API 키가 유효하지 않습니다');
  } else if (error.status === 429) {
    console.error('요청 한도 초과');
  } else if (error.status === 500) {
    console.error('LLM 서버 에러');
  }
}
```

### 3. 재시도 로직

```typescript
async function retryStream(
  messages: Message[],
  options: LLMOptions,
  maxRetries = 3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      let result = '';
      for await (const chunk of client.stream(messages, options)) {
        result += chunk;
      }
      return result;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Retry ${attempt + 1}/${maxRetries}:`, error);

      // 지수 백오프
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }

  throw lastError;
}
```

---

## 예제 코드

### 예제 1: 기본 채팅봇

```typescript
import { LLMClient } from '@/lib/domains/llm/client';

const client = LLMClient.getInstance();
const conversationHistory: Message[] = [];

async function chat(userInput: string): Promise<string> {
  conversationHistory.push({ role: 'user', content: userInput });

  let assistantResponse = '';
  for await (const chunk of client.stream(conversationHistory, {
    conversationId: 'chatbot-123',
  })) {
    assistantResponse += chunk;
    process.stdout.write(chunk);
  }

  conversationHistory.push({ role: 'assistant', content: assistantResponse });
  return assistantResponse;
}

// 사용
await chat('안녕하세요!');
await chat('날씨가 어때요?');
```

### 예제 2: 이미지 해석

```typescript
import { LLMClient } from '@/lib/domains/llm/client';
import { prepareImageForVision } from '@/lib/domains/llm/vision-utils';

async function describeImage(imagePath: string): Promise<string> {
  const client = LLMClient.getInstance();
  const imageBase64 = await prepareImageForVision(imagePath);

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: '이 이미지를 자세히 설명해주세요.' },
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${imageBase64}` },
        },
      ],
    },
  ];

  let description = '';
  for await (const chunk of client.stream(messages, {
    model: 'gpt-4-vision-preview',
  })) {
    description += chunk;
  }

  return description;
}
```

### 예제 3: Function Calling

```typescript
import { LLMClient } from '@/lib/domains/llm/client';

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '특정 도시의 날씨를 가져옵니다',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '도시 이름' },
        },
        required: ['city'],
      },
    },
  },
];

async function chatWithTools(userInput: string) {
  const client = LLMClient.getInstance();

  const messages = [{ role: 'user', content: userInput }];

  for await (const chunk of client.stream(messages, {
    tools,
    tool_choice: 'auto',
  })) {
    // Tool call 처리
    if (chunk.includes('function_call')) {
      const functionCall = JSON.parse(chunk);
      const result = await executeFunction(functionCall.name, functionCall.arguments);

      messages.push({
        role: 'function',
        name: functionCall.name,
        content: JSON.stringify(result),
      });
    } else {
      console.log(chunk);
    }
  }
}
```

---

## 관련 문서

### 도메인

- [lib/README.md](../../README.md) - lib 폴더 가이드
- [lib/domains/agent/README.md](../agent/README.md) - LangGraph Agent
- [lib/domains/mcp/README.md](../mcp/README.md) - MCP 통합

### 아키텍처

- [docs/architecture/dependency-rules.md](../../../docs/architecture/dependency-rules.md) - 의존성 규칙

### IPC 통신

- [electron/ipc/README.md](../../../electron/ipc/README.md) - IPC 핸들러 가이드

### 개발 가이드

- [CLAUDE.md](../../../CLAUDE.md) - 프로젝트 전체 가이드

---

## 변경 이력

- **2025-02-10**: Phase 3 리팩토링 완료 (도메인 구조화)
- **2025-01-17**: 초기 LLM 클라이언트 구축
