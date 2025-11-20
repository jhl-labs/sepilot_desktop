// Electron API 타입 정의
import type { Conversation, Message, AppConfig, MCPServerConfig, NetworkConfig, ImageAttachment } from './index';

// IPC 응답 타입
interface IPCResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

interface ChatAPI {
  saveConversation: (conversation: Conversation) => Promise<IPCResponse>;
  loadConversations: () => Promise<IPCResponse<Conversation[]>>;
  deleteConversation: (id: string) => Promise<IPCResponse>;
  updateConversationTitle: (id: string, title: string) => Promise<IPCResponse>;
  saveMessage: (message: Message) => Promise<IPCResponse>;
  loadMessages: (conversationId: string) => Promise<IPCResponse<Message[]>>;
  deleteMessage: (id: string) => Promise<IPCResponse>;
}

interface ConfigAPI {
  load: () => Promise<IPCResponse<AppConfig>>;
  save: (config: AppConfig) => Promise<IPCResponse>;
  updateSetting: (key: string, value: unknown) => Promise<IPCResponse>;
  getSetting: (key: string) => Promise<IPCResponse<unknown>>;
}

// MCP 관련 타입
interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface MCPAPI {
  addServer: (config: MCPServerConfig) => Promise<IPCResponse<MCPServerConfig>>;
  removeServer: (name: string) => Promise<IPCResponse>;
  listServers: () => Promise<IPCResponse<MCPServerConfig[]>>;
  getAllTools: () => Promise<IPCResponse<MCPTool[]>>;
  callTool: (serverName: string, toolName: string, args: Record<string, unknown>) => Promise<IPCResponse<unknown>>;
  toggleServer: (name: string) => Promise<IPCResponse>;
}

// GitHub 사용자 정보 타입
interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name?: string;
  email?: string;
}

// OAuth 로그인 정보 타입
interface OAuthLoginInfo {
  authUrl: string;
  codeVerifier: string;
}

interface AuthAPI {
  initiateLogin: () => Promise<OAuthLoginInfo>;
  githubLogin: (authUrl: string) => Promise<IPCResponse>;
  exchangeCode: (code: string, codeVerifier: string) => Promise<IPCResponse<{ access_token: string }>>;
  saveToken: (token: string) => Promise<IPCResponse>;
  getUserInfo: (token: string) => Promise<IPCResponse<GitHubUser>>;
  getToken: () => Promise<IPCResponse<string | null>>;
  logout: () => Promise<IPCResponse>;
  syncFromGitHub: (token: string, masterPassword: string) => Promise<IPCResponse<AppConfig>>;
  syncToGitHub: (token: string, config: AppConfig, masterPassword: string) => Promise<IPCResponse>;
  onAuthSuccess: (callback: () => void) => () => void;
  removeAuthSuccessListener: (handler: () => void) => void;
  onOAuthCallback: (callback: (url: string) => void) => (event: Event, url: string) => void;
  removeOAuthCallbackListener: (handler: (event: Event, url: string) => void) => void;
}

// LLM 응답 타입
interface LLMChatResponse {
  content: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

// LLM 옵션 타입
interface LLMChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

// LLM 모델 가져오기 설정 타입
interface LLMFetchModelsConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  baseURL?: string;
  apiKey: string;
  networkConfig?: NetworkConfig;
}

interface LLMAPI {
  streamChat: (messages: Message[]) => Promise<IPCResponse<string>>;
  chat: (messages: Message[], options?: LLMChatOptions) => Promise<IPCResponse<LLMChatResponse>>;
  init: (config: AppConfig) => Promise<IPCResponse>;
  validate: () => Promise<IPCResponse>;
  fetchModels: (config: LLMFetchModelsConfig) => Promise<IPCResponse<string[]>>;
  onStreamChunk: (callback: (chunk: string) => void) => (event: Event, chunk: string) => void;
  onStreamDone: (callback: () => void) => () => void;
  onStreamError: (callback: (error: string) => void) => (event: Event, error: string) => void;
  removeStreamListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

// VectorDB 문서 타입
interface VectorDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

// VectorDB 검색 결과 타입
interface VectorSearchResult {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

interface VectorDBAPI {
  initialize: (config: { indexName: string; dimension: number }) => Promise<IPCResponse>;
  createIndex: (name: string, dimension: number) => Promise<IPCResponse>;
  deleteIndex: (name: string) => Promise<IPCResponse>;
  indexExists: (name: string) => Promise<IPCResponse<boolean>>;
  insert: (documents: VectorDocument[]) => Promise<IPCResponse>;
  search: (queryEmbedding: number[], k: number) => Promise<IPCResponse<VectorSearchResult[]>>;
  delete: (ids: string[]) => Promise<IPCResponse>;
  count: () => Promise<IPCResponse<number>>;
  getAll: () => Promise<IPCResponse<VectorDocument[]>>;
}

// GitHub 저장소 타입
interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description?: string;
}

interface FileAPI {
  selectImages: () => Promise<IPCResponse<ImageAttachment[]>>;
  loadImage: (filePath: string) => Promise<IPCResponse<ImageAttachment>>;
}

interface GitHubAPI {
  setPrivateKey: (privateKey: string) => Promise<IPCResponse>;
  hasPrivateKey: () => Promise<IPCResponse<boolean>>;
  getRepositories: (
    baseUrl: string,
    appId: string,
    installationId: string,
    networkConfig: NetworkConfig | null
  ) => Promise<IPCResponse<GitHubRepository[]>>;
  syncFromGitHub: (
    baseUrl: string,
    installationId: string,
    repo: string,
    masterPassword: string,
    networkConfig: NetworkConfig | null
  ) => Promise<IPCResponse<AppConfig>>;
  syncToGitHub: (
    baseUrl: string,
    installationId: string,
    repo: string,
    config: AppConfig,
    masterPassword: string,
    networkConfig: NetworkConfig | null
  ) => Promise<IPCResponse>;
}

// Embeddings 설정 타입
interface EmbeddingsConfig {
  apiKey: string;
  model: string;
  baseURL: string;
  networkConfig?: NetworkConfig;
}

// ComfyUI 워크플로우 타입
interface ComfyUIWorkflow {
  [nodeId: string]: unknown;
}

// ComfyUI Prompt 큐 결과 타입
interface ComfyUIPromptResult {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
}

interface ShellAPI {
  openExternal: (url: string) => Promise<IPCResponse>;
}

interface EmbeddingsAPI {
  generate: (text: string, config: EmbeddingsConfig) => Promise<IPCResponse<number[]>>;
  generateBatch: (texts: string[], config: EmbeddingsConfig) => Promise<IPCResponse<number[][]>>;
  validate: (config: EmbeddingsConfig) => Promise<IPCResponse>;
}

interface ComfyUIAPI {
  testConnection: (
    httpUrl: string,
    apiKey: string | undefined,
    networkConfig: NetworkConfig | null
  ) => Promise<IPCResponse>;
  queuePrompt: (
    httpUrl: string,
    workflow: ComfyUIWorkflow,
    clientId: string,
    apiKey: string | undefined,
    networkConfig: NetworkConfig | null
  ) => Promise<IPCResponse<ComfyUIPromptResult>>;
  fetchImage: (
    httpUrl: string,
    filename: string,
    subfolder: string,
    type: string,
    apiKey: string | undefined,
    networkConfig: NetworkConfig | null
  ) => Promise<IPCResponse<string>>;
}

interface ElectronAPI {
  platform: string;
  chat: ChatAPI;
  config: ConfigAPI;
  mcp: MCPAPI;
  auth: AuthAPI;
  llm: LLMAPI;
  vectorDB: VectorDBAPI;
  file: FileAPI;
  github: GitHubAPI;
  shell: ShellAPI;
  embeddings: EmbeddingsAPI;
  comfyui: ComfyUIAPI;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Export 타입들 (다른 파일에서 import 가능하도록)
export type {
  IPCResponse,
  ChatAPI,
  ConfigAPI,
  MCPAPI,
  MCPTool,
  AuthAPI,
  GitHubUser,
  OAuthLoginInfo,
  LLMAPI,
  LLMChatResponse,
  LLMChatOptions,
  LLMFetchModelsConfig,
  VectorDBAPI,
  VectorDocument,
  VectorSearchResult,
  FileAPI,
  GitHubAPI,
  GitHubRepository,
  ShellAPI,
  EmbeddingsAPI,
  EmbeddingsConfig,
  ComfyUIAPI,
  ComfyUIWorkflow,
  ComfyUIPromptResult,
  ElectronAPI,
};
