// Electron API 타입 정의
import type { Conversation, Message, Activity, AppConfig, MCPServerConfig, NetworkConfig, ImageAttachment, ComfyUIConfig } from './index';

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

interface ActivityAPI {
  saveActivity: (activity: Activity) => Promise<IPCResponse>;
  loadActivities: (conversationId: string) => Promise<IPCResponse<Activity[]>>;
  deleteActivity: (id: string) => Promise<IPCResponse>;
  deleteActivitiesByConversation: (conversationId: string) => Promise<IPCResponse>;
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
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  serverName: string;
}

// MCP 서버 상태 타입
interface MCPServerStatus {
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  toolCount?: number;
  tools?: string[];
  errorMessage?: string;
}

interface MCPAPI {
  addServer: (config: MCPServerConfig) => Promise<IPCResponse<MCPServerConfig>>;
  removeServer: (name: string) => Promise<IPCResponse>;
  listServers: () => Promise<IPCResponse<MCPServerConfig[]>>;
  getAllTools: () => Promise<IPCResponse<MCPTool[]>>;
  callTool: (serverName: string, toolName: string, args: Record<string, unknown>) => Promise<IPCResponse<unknown>>;
  toggleServer: (name: string) => Promise<IPCResponse>;
  getServerStatus: (name: string) => Promise<IPCResponse<MCPServerStatus>>;
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
  exchangeCode: (code: string, codeVerifier: string) => Promise<IPCResponse<{ access_token: string; token_type: string; scope: string }>>;
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
  customHeaders?: Record<string, string>;
  networkConfig?: NetworkConfig;
}

interface LLMAPI {
  streamChat: (messages: Message[]) => Promise<IPCResponse<string>>;
  chat: (messages: Message[], options?: LLMChatOptions) => Promise<IPCResponse<LLMChatResponse>>;
  init: (config: AppConfig) => Promise<IPCResponse>;
  validate: () => Promise<IPCResponse>;
  fetchModels: (config: LLMFetchModelsConfig) => Promise<IPCResponse<string[]>>;
  generateTitle: (messages: Array<Pick<Message, 'role' | 'content'>>) => Promise<IPCResponse<{ title: string }>>;
  onStreamChunk: (callback: (chunk: string) => void) => (...args: unknown[]) => void;
  onStreamDone: (callback: () => void) => (...args: unknown[]) => void;
  onStreamError: (callback: (error: string) => void) => (...args: unknown[]) => void;
  removeStreamListener: (event: string, handler: (...args: unknown[]) => void) => void;
  removeAllStreamListeners?: () => void;
}

// LangGraph 관련 타입
interface GraphConfig {
  thinkingMode: 'instant' | 'sequential' | 'tree-of-thought' | 'deep' | 'coding';
  enableRAG: boolean;
  enableTools: boolean;
}

// LangGraph 스트리밍 이벤트 타입 (conversationId 포함)
interface LangGraphStreamEvent {
  type: string;
  conversationId?: string;
  chunk?: string;
  node?: string;
  data?: any;
  progress?: any;
  error?: string;
  // Tool approval specific fields
  messageId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  approved?: boolean;
}

// Tool approval request data type
interface LangGraphToolApprovalRequest {
  conversationId: string;
  messageId: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}

interface LangGraphStreamDoneData {
  conversationId?: string;
}

interface LangGraphStreamErrorData {
  error: string;
  conversationId?: string;
}

interface LangGraphAPI {
  stream: (
    graphConfig: GraphConfig,
    messages: Message[],
    conversationId?: string,
    comfyUIConfig?: ComfyUIConfig,
    networkConfig?: NetworkConfig,
    workingDirectory?: string
  ) => Promise<IPCResponse<{ conversationId?: string }>>;
  onStreamEvent: (callback: (event: LangGraphStreamEvent) => void) => (...args: unknown[]) => void;
  onStreamDone: (callback: (data?: LangGraphStreamDoneData) => void) => (...args: unknown[]) => void;
  onStreamError: (callback: (data: LangGraphStreamErrorData) => void) => (...args: unknown[]) => void;
  // Tool Approval (Human-in-the-loop)
  onToolApprovalRequest: (callback: (data: LangGraphToolApprovalRequest) => void) => (...args: unknown[]) => void;
  respondToolApproval: (conversationId: string, approved: boolean) => Promise<IPCResponse>;
  // Abort streaming
  abort: (conversationId: string) => Promise<IPCResponse>;
  removeStreamListener: (event: string, handler: (...args: unknown[]) => void) => void;
  removeAllStreamListeners: () => void;
}

// VectorDB 문서 타입
interface VectorDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, any>;
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
  indexDocuments: (
    documents: Array<{ id: string; content: string; metadata: Record<string, any> }>,
    options: { chunkSize: number; chunkOverlap: number; batchSize: number }
  ) => Promise<IPCResponse>;
}

// GitHub 저장소 타입
interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    avatar_url: string;
  };
  description?: string;
}

interface DocumentFile {
  path: string;
  filename: string;
  title: string;
  content: string;
}

interface FetchedUrl {
  content: string;
  title: string;
  url: string;
}

// File node type for directory tree
interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

interface FileAPI {
  selectImages: () => Promise<IPCResponse<ImageAttachment[]>>;
  loadImage: (filePath: string) => Promise<IPCResponse<ImageAttachment>>;
  fetchUrl: (url: string) => Promise<IPCResponse<FetchedUrl>>;
  selectDocument: () => Promise<IPCResponse<DocumentFile[]>>;
  read: (filePath: string) => Promise<string>;
  selectDirectory: () => Promise<IPCResponse<string | null>>;
}

// File System API (Editor용)
interface SearchMatch {
  line: number;
  column: number;
  text: string;
}

interface SearchResult {
  file: string;
  matches: SearchMatch[];
}

interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  includePattern?: string;
  excludePattern?: string;
}

interface SearchResponse {
  query: string;
  totalFiles: number;
  totalMatches: number;
  results: SearchResult[];
}

interface FileSystemAPI {
  readDirectory: (dirPath: string) => Promise<IPCResponse<FileNode[]>>;
  readFile: (filePath: string) => Promise<IPCResponse<string>>;
  writeFile: (filePath: string, content: string) => Promise<IPCResponse>;
  searchFiles: (
    query: string,
    dirPath: string,
    options?: SearchOptions
  ) => Promise<IPCResponse<SearchResponse>>;
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

// Update 관련 타입
interface ReleaseInfo {
  version: string;
  name: string;
  publishedAt: string;
  htmlUrl: string;
  body: string;
  downloadUrl?: string;
}

interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseInfo?: ReleaseInfo;
}

interface UpdateAPI {
  check: () => Promise<IPCResponse<UpdateCheckResult>>;
  getVersion: () => Promise<IPCResponse<string>>;
}

interface QuickInputAPI {
  submit: (message: string) => Promise<IPCResponse>;
  close: () => Promise<IPCResponse>;
}

interface ElectronAPI {
  platform: string;
  chat: ChatAPI;
  activity: ActivityAPI;
  config: ConfigAPI;
  mcp: MCPAPI;
  auth: AuthAPI;
  llm: LLMAPI;
  langgraph: LangGraphAPI;
  vectorDB: VectorDBAPI;
  file: FileAPI;
  fs: FileSystemAPI;
  github: GitHubAPI;
  shell: ShellAPI;
  embeddings: EmbeddingsAPI;
  comfyui: ComfyUIAPI;
  update: UpdateAPI;
  quickInput: QuickInputAPI;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }

  // Webview element type definition for React/JSX
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          autosize?: string;
          nodeintegration?: string;
          nodeintegrationinsubframes?: string;
          plugins?: string;
          preload?: string;
          httpreferrer?: string;
          useragent?: string;
          disablewebsecurity?: string;
          partition?: string;
          allowpopups?: string;
          webpreferences?: string;
          enableblinkfeatures?: string;
          disableblinkfeatures?: string;
          allowfullscreen?: string;
        },
        HTMLElement
      >;
    }
  }
}

// Export 타입들 (다른 파일에서 import 가능하도록)
export type {
  IPCResponse,
  ChatAPI,
  ActivityAPI,
  ConfigAPI,
  MCPAPI,
  MCPTool,
  MCPServerStatus,
  AuthAPI,
  GitHubUser,
  OAuthLoginInfo,
  LLMAPI,
  LLMChatResponse,
  LLMChatOptions,
  LLMFetchModelsConfig,
  GraphConfig,
  LangGraphAPI,
  LangGraphStreamEvent,
  LangGraphStreamDoneData,
  LangGraphStreamErrorData,
  LangGraphToolApprovalRequest,
  VectorDBAPI,
  VectorDocument,
  VectorSearchResult,
  FileAPI,
  FileNode,
  FileSystemAPI,
  DocumentFile,
  FetchedUrl,
  GitHubAPI,
  GitHubRepository,
  ShellAPI,
  EmbeddingsAPI,
  EmbeddingsConfig,
  ComfyUIAPI,
  ComfyUIWorkflow,
  ComfyUIPromptResult,
  UpdateAPI,
  UpdateCheckResult,
  ReleaseInfo,
  ElectronAPI,
};
