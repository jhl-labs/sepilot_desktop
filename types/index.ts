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
  prompt: string; // 질문 템플릿, {{clipboard}} 플레이스홀더 사용 가능
  enabled: boolean;
}

export interface QuickInputConfig {
  quickInputShortcut: string; // 기본값: "CommandOrControl+Shift+Space"
  quickQuestions: QuickQuestion[]; // 최대 5개
}

export interface AppConfig {
  llm: LLMConfig;
  network?: NetworkConfig;
  vectorDB?: VectorDBConfig;
  embedding?: EmbeddingConfig;
  mcp: MCPServerConfig[];
  comfyUI?: ComfyUIConfig;
  github?: GitHubOAuthConfig;
  quickInput?: QuickInputConfig;
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
