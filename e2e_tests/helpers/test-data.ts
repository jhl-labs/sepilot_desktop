/**
 * 테스트 데이터 팩토리
 *
 * 테스트에 사용할 샘플 데이터를 생성하는 유틸리티 함수들
 */

/**
 * 테스트용 더미 API 키를 생성합니다.
 *
 * @param prefix - API 키 접두사
 * @returns 더미 API 키
 */
export function generateTestAPIKey(prefix = 'sk-test'): string {
  const random = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);
  return `${prefix}-${random}${timestamp}`;
}

/**
 * 테스트용 채팅 메시지를 생성합니다.
 *
 * @param index - 메시지 인덱스 (선택)
 * @returns 채팅 메시지
 */
export function generateChatMessage(index?: number): string {
  const messages = [
    'Hello, how are you?',
    'What is the weather like today?',
    'Can you help me with my homework?',
    'Tell me a joke.',
    'What is the meaning of life?',
    'Explain quantum mechanics in simple terms.',
    'Write a poem about nature.',
    'How do I learn programming?',
  ];

  if (index !== undefined && index >= 0 && index < messages.length) {
    return messages[index];
  }

  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * 테스트용 코드 질문을 생성합니다.
 *
 * @returns 코드 관련 질문
 */
export function generateCodeQuestion(): string {
  const questions = [
    'How do I implement a binary search in JavaScript?',
    'Explain the difference between let and const.',
    'What is the time complexity of quicksort?',
    'How do closures work in JavaScript?',
    'Write a function to reverse a linked list.',
  ];

  return questions[Math.floor(Math.random() * questions.length)];
}

/**
 * 테스트용 파일 경로를 생성합니다.
 *
 * @param filename - 파일 이름
 * @returns 파일 경로
 */
export function generateTestFilePath(filename: string): string {
  return `${__dirname}/../fixtures/${filename}`;
}

/**
 * LLM 설정 데이터를 생성합니다.
 */
export interface LLMConfig {
  provider: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export function generateLLMConfig(overrides?: Partial<LLMConfig>): LLMConfig {
  const defaults: LLMConfig = {
    provider: 'OpenAI',
    apiKey: generateTestAPIKey('sk-test'),
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000,
  };

  return { ...defaults, ...overrides };
}

/**
 * MCP 서버 설정 데이터를 생성합니다.
 */
export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string;
  env?: Record<string, string>;
}

export function generateMCPServerConfig(
  overrides?: Partial<MCPServerConfig>
): MCPServerConfig {
  const defaults: MCPServerConfig = {
    name: `test-mcp-server-${Date.now()}`,
    command: 'node',
    args: 'server.js',
  };

  return { ...defaults, ...overrides };
}

/**
 * 네트워크 프록시 설정 데이터를 생성합니다.
 */
export interface ProxyConfig {
  enabled: boolean;
  host: string;
  port: number;
  auth?: {
    username: string;
    password: string;
  };
}

export function generateProxyConfig(
  overrides?: Partial<ProxyConfig>
): ProxyConfig {
  const defaults: ProxyConfig = {
    enabled: true,
    host: 'localhost',
    port: 8080,
  };

  return { ...defaults, ...overrides };
}

/**
 * 채팅 세션 데이터를 생성합니다.
 */
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export function generateChatSession(
  messageCount = 4
): ChatSession {
  const id = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const messages: ChatMessage[] = [];

  for (let i = 0; i < messageCount; i++) {
    messages.push({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: generateChatMessage(i),
      timestamp: new Date(Date.now() - (messageCount - i) * 60000).toISOString(),
    });
  }

  return {
    id,
    title: 'Test Chat Session',
    messages,
    createdAt: new Date(Date.now() - messageCount * 60000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * RAG 문서 데이터를 생성합니다.
 */
export interface RAGDocument {
  id: string;
  title: string;
  content: string;
  filePath?: string;
  metadata?: Record<string, unknown>;
}

export function generateRAGDocument(
  overrides?: Partial<RAGDocument>
): RAGDocument {
  const defaults: RAGDocument = {
    id: `doc-${Date.now()}`,
    title: 'Test Document',
    content: `
This is a test document for RAG testing.
It contains multiple paragraphs of text.

The quick brown fox jumps over the lazy dog.
Lorem ipsum dolor sit amet, consectetur adipiscing elit.

This document is used to verify that the RAG system
correctly embeds and retrieves documents.
    `.trim(),
  };

  return { ...defaults, ...overrides };
}

/**
 * 테스트용 사용자 정보를 생성합니다.
 */
export interface TestUser {
  username: string;
  email: string;
  preferences: {
    theme: 'light' | 'dark' | 'system';
    language: string;
    fontSize: 'small' | 'medium' | 'large';
  };
}

export function generateTestUser(
  overrides?: Partial<TestUser>
): TestUser {
  const defaults: TestUser = {
    username: `testuser-${Date.now()}`,
    email: `test-${Date.now()}@example.com`,
    preferences: {
      theme: 'system',
      language: 'ko',
      fontSize: 'medium',
    },
  };

  return { ...defaults, ...overrides };
}

/**
 * 임의의 문자열을 생성합니다.
 *
 * @param length - 문자열 길이
 * @returns 임의의 문자열
 */
export function generateRandomString(length = 10): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
}

/**
 * 임의의 숫자를 생성합니다.
 *
 * @param min - 최소값
 * @param max - 최대값
 * @returns 임의의 숫자
 */
export function generateRandomNumber(min = 0, max = 100): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 테스트용 임시 디렉토리 경로를 생성합니다.
 *
 * @returns 임시 디렉토리 경로
 */
export function generateTempDir(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${__dirname}/../.temp-${timestamp}-${random}`;
}

/**
 * 환경 변수를 위한 테스트 설정을 생성합니다.
 */
export interface TestEnvironment {
  NODE_ENV: string;
  E2E_TEST: string;
  TEST_API_KEY?: string;
  DEBUG?: string;
}

export function generateTestEnvironment(
  overrides?: Partial<TestEnvironment>
): TestEnvironment {
  const defaults: TestEnvironment = {
    NODE_ENV: 'test',
    E2E_TEST: 'true',
    TEST_API_KEY: generateTestAPIKey(),
  };

  return { ...defaults, ...overrides };
}

/**
 * 지연 시간을 시뮬레이션하는 유틸리티.
 *
 * @param ms - 지연 시간 (ms)
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 테스트용 큰 텍스트를 생성합니다.
 *
 * @param paragraphs - 단락 수
 * @returns 큰 텍스트
 */
export function generateLargeText(paragraphs = 10): string {
  const lorem = `Lorem ipsum dolor sit amet, consectetur adipiscing elit.
Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.`;

  return Array(paragraphs)
    .fill(lorem)
    .join('\n\n');
}

/**
 * 코드 스니펫을 생성합니다.
 *
 * @param language - 프로그래밍 언어
 * @returns 코드 스니펫
 */
export function generateCodeSnippet(language = 'javascript'): string {
  const snippets: Record<string, string> = {
    javascript: `
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));
    `.trim(),
    python: `
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

print(fibonacci(10))
    `.trim(),
    typescript: `
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));
    `.trim(),
  };

  return snippets[language] || snippets.javascript;
}
