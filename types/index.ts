// Global type definitions

export interface ReferencedDocument {
  id: string;
  title: string;
  source: string;
  content: string;
}

export interface ImageAttachment {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  base64?: string; // For display
}

export interface FileChange {
  filePath: string;
  changeType: 'created' | 'modified' | 'deleted';
  oldContent?: string;
  newContent?: string;
  toolName: string; // file_write, file_edit, etc.
}

export interface Message {
  id: string;
  conversation_id?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: number;
  images?: ImageAttachment[]; // Vision model support
  tool_calls?: ToolCall[];
  tool_results?: unknown[];
  referenced_documents?: ReferencedDocument[];
  tool_call_id?: string; // For tool messages - links to the tool call that triggered this result
  name?: string; // For tool messages - the name of the tool
  fileChanges?: FileChange[]; // File modifications from tool execution (for CodeDiffViewer)
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface PendingToolApproval {
  conversationId: string;
  messageId: string;
  toolCalls: ToolCall[];
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  personaId?: string; // 대화에 지정된 페르소나 ID
}

export interface VisionModelConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'custom';
  baseURL?: string;
  apiKey?: string;
  model: string;
  maxImageTokens?: number;
  enableStreaming?: boolean; // Default: false for compatibility (LiteLLM + Ollama streaming issues)
}

export interface AutocompleteConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'custom';
  baseURL?: string;
  apiKey?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  debounceMs?: number; // Debounce time for autocomplete requests (default: 300ms)
}

/**
 * LLM Connection: LLM 서비스에 대한 연결 정보
 * - 여러 Connection을 등록하고 각 Connection에서 모델 목록을 가져옴
 */
export interface LLMConnection {
  id: string; // 고유 식별자
  name: string; // 사용자 정의 이름 (예: "My OpenAI", "Local Ollama")
  provider: 'openai' | 'anthropic' | 'custom';
  baseURL: string;
  apiKey: string;
  customHeaders?: Record<string, string>; // Connection 레벨 커스텀 헤더
  enabled: boolean; // 활성화 여부
}

/**
 * Model Role Tag: 모델의 역할을 나타내는 태그
 */
export type ModelRoleTag = 'base' | 'vision' | 'autocomplete';

/**
 * Model Configuration: 개별 모델의 세부 설정
 * - Connection에서 가져온 모델에 대한 세부 설정
 */
export interface ModelConfig {
  id: string; // 고유 식별자
  connectionId: string; // 소속 Connection ID
  modelId: string; // 모델 ID (예: "gpt-4o", "claude-3-5-sonnet")
  displayName?: string; // 사용자 정의 표시 이름 (선택사항)
  tags: ModelRoleTag[]; // 역할 태그 (base, vision, autocomplete)

  // 모델별 세부 설정
  temperature?: number; // 기본값: Connection의 기본 temperature
  maxTokens?: number; // 기본값: Connection의 기본 maxTokens
  customHeaders?: Record<string, string>; // 모델별 커스텀 헤더 (Connection 헤더에 병합됨)

  // Vision 전용 설정
  maxImageTokens?: number; // Vision 모델 전용
  enableStreaming?: boolean; // Vision 모델 전용

  // Autocomplete 전용 설정
  debounceMs?: number; // Autocomplete 전용
}

/**
 * New LLM Config: Connection 기반 LLM 설정
 */
export interface LLMConfigV2 {
  version: 2; // 설정 버전 (마이그레이션 용도)
  connections: LLMConnection[]; // 등록된 Connection 목록
  models: ModelConfig[]; // 모델 설정 목록

  // 기본 설정값
  defaultTemperature: number;
  defaultMaxTokens: number;

  // 활성 모델 선택
  activeBaseModelId?: string; // 기본 대화용 모델
  activeVisionModelId?: string; // Vision 모델
  activeAutocompleteModelId?: string; // Autocomplete 모델
}

export interface NetworkConfig {
  proxy?: {
    enabled: boolean;
    mode: 'system' | 'manual' | 'none';
    url?: string; // For manual mode: http://proxy.example.com:8080
  };
  ssl?: {
    verify: boolean; // SSL certificate verification
  };
  customHeaders?: Record<string, string>; // Custom HTTP headers
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  baseURL: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  vision?: VisionModelConfig; // Optional vision model configuration
  autocomplete?: AutocompleteConfig; // Optional autocomplete model configuration
  network?: NetworkConfig; // Network settings (proxy, SSL, headers)
  customHeaders?: Record<string, string>; // Custom HTTP headers for LLM API calls only
}

export interface VectorDBConfig {
  type: 'opensearch' | 'elasticsearch' | 'sqlite-vec' | 'pgvector';

  // SQLite-vec용
  dbPath?: string;

  // OpenSearch/Elasticsearch용
  host?: string;
  port?: number;
  username?: string;
  password?: string;

  // pgvector용
  connectionString?: string;

  // 공통
  indexName: string;
  dimension: number;
}

export interface EmbeddingConfig {
  provider: 'openai' | 'local';
  apiKey?: string;
  baseURL?: string;
  model?: string;
  dimension: number;
  networkConfig?: NetworkConfig;
}

export interface ComfyUIConfig {
  enabled: boolean;
  httpUrl: string;
  wsUrl: string;
  workflowId: string;
  clientId?: string;
  apiKey?: string;
  positivePrompt?: string;
  negativePrompt?: string;
  steps?: number;
  cfgScale?: number;
  seed?: number;
}

export interface ImageGenerationProgress {
  conversationId: string;
  messageId: string;
  status: 'queued' | 'executing' | 'completed' | 'error';
  message: string;
  progress: number; // 0-100
  currentStep?: number;
  totalSteps?: number;
}

export interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'sse';
  enabled?: boolean; // Default: true

  // stdio 전송 방식용
  command?: string;
  args?: string[];
  env?: Record<string, string>;

  // SSE 전송 방식용
  url?: string; // SSE endpoint URL
  headers?: Record<string, string>; // Custom headers (e.g., Authorization, API keys)
}

/**
 * GitHub Sync Configuration: GitHub Token 기반 동기화 설정
 */
export interface GitHubSyncConfig {
  // GitHub 연결 정보
  token: string; // GitHub Personal Access Token (encrypted)
  owner: string; // Organization 또는 User name
  repo: string; // Repository name
  branch?: string; // 기본값: 'main'

  // 동기화 옵션
  syncSettings: boolean; // 설정 동기화 여부
  syncDocuments: boolean; // RAG 문서 동기화 여부
  syncImages: boolean; // 생성 이미지 동기화 여부
  syncConversations: boolean; // 대화 내역 동기화 여부

  // 암호화 설정
  encryptionKey?: string; // 민감 정보 암호화 키 (자동 생성)

  // 마지막 동기화 정보
  lastSyncAt?: number; // 마지막 동기화 시간 (timestamp)
  lastSyncStatus?: 'success' | 'error'; // 마지막 동기화 상태
  lastSyncError?: string; // 마지막 동기화 에러 메시지
}

// 이전 GitHub OAuth 설정 (하위 호환성 유지)
export interface GitHubOAuthConfig {
  serverType: 'github.com' | 'ghes'; // GitHub.com or GitHub Enterprise Server
  ghesUrl?: string; // GHES URL (e.g., https://github.company.com)
  appId: string; // GitHub App ID
  installationId?: string; // Installation ID after app installation
  selectedRepo?: string; // Selected repository for sync (owner/repo format)
}

export interface QuickQuestion {
  id: string;
  name: string; // 사용자 친화적인 이름
  shortcut: string; // 예: "CommandOrControl+Shift+1"
  prompt: string; // 시스템 프롬프트 (LLM의 system 메시지로 전송됨, 클립보드 내용은 user 메시지로 전송됨)
  enabled: boolean;
}

export interface QuickInputConfig {
  quickInputShortcut: string; // 기본값: "CommandOrControl+Shift+Space"
  quickQuestions: QuickQuestion[]; // 최대 5개
}

export interface QuickInputMessageData {
  systemMessage?: string; // Quick Question의 프롬프트 (시스템 메시지로 전송)
  userMessage: string; // 사용자 입력 또는 클립보드 내용 (사용자 메시지로 전송)
}

export interface AppConfig {
  llm: LLMConfig;
  network?: NetworkConfig;
  vectorDB?: VectorDBConfig;
  embedding?: EmbeddingConfig;
  mcp: MCPServerConfig[];
  comfyUI?: ComfyUIConfig;
  github?: GitHubOAuthConfig; // 이전 버전 호환성
  githubSync?: GitHubSyncConfig; // 새로운 Token 기반 동기화
  quickInput?: QuickInputConfig;
  theme?: 'light' | 'dark' | 'system';
}

/**
 * Activity: Agent의 도구 실행 이력 (메시지와 분리하여 관리)
 * - 컨텍스트 낭비 방지: conversation에 포함되지 않음
 * - 영구 저장: 데이터베이스에 기록되어 프로그램 재시작 후에도 조회 가능
 * - UI 표시: ChatArea에서 별도 패널로 표시
 */
export interface Activity {
  id: string;
  conversation_id: string;
  tool_name: string; // file_read, file_write, command_execute, grep_search, etc.
  tool_args: Record<string, unknown>; // Tool arguments
  result: string; // Tool execution result (success or error message)
  status: 'success' | 'error';
  created_at: number;
  duration_ms?: number; // Execution duration in milliseconds
}

// LangGraph Stream Event Types are defined in electron.d.ts
