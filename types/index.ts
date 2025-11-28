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

export interface AppConfig {
  llm: LLMConfig;
  network?: NetworkConfig;
  vectorDB?: VectorDBConfig;
  embedding?: EmbeddingConfig;
  mcp: MCPServerConfig[];
  comfyUI?: ComfyUIConfig;
  github?: GitHubOAuthConfig;
}
