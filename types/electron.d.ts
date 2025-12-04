// Electron API 타입 정의
import type {
  Conversation,
  Message,
  Activity,
  AppConfig,
  MCPServerConfig,
  NetworkConfig,
  ImageAttachment,
  ImageGenConfig,
} from './index';
import type { Persona } from './persona';

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
  deleteConversationMessages: (conversationId: string) => Promise<IPCResponse>;
  replaceConversationMessages: (
    conversationId: string,
    newMessages: Message[]
  ) => Promise<IPCResponse>;
}

interface ActivityAPI {
  saveActivity: (activity: Activity) => Promise<IPCResponse>;
  loadActivities: (conversationId: string) => Promise<IPCResponse<Activity[]>>;
  deleteActivity: (id: string) => Promise<IPCResponse>;
  deleteActivitiesByConversation: (conversationId: string) => Promise<IPCResponse>;
}

interface PersonaAPI {
  loadAll: () => Promise<Persona[]>;
  save: (persona: Persona) => Promise<void>;
  update: (persona: Persona) => Promise<void>;
  delete: (id: string) => Promise<void>;
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
  callTool: (
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<IPCResponse<unknown>>;
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
  exchangeCode: (
    code: string,
    codeVerifier: string
  ) => Promise<IPCResponse<{ access_token: string; token_type: string; scope: string }>>;
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
  generateTitle: (
    messages: Array<Pick<Message, 'role' | 'content'>>
  ) => Promise<IPCResponse<{ title: string }>>;
  onStreamChunk: (callback: (chunk: string) => void) => (...args: unknown[]) => void;
  onStreamDone: (callback: () => void) => (...args: unknown[]) => void;
  onStreamError: (callback: (error: string) => void) => (...args: unknown[]) => void;
  removeStreamListener: (event: string, handler: (...args: unknown[]) => void) => void;
  removeAllStreamListeners?: () => void;
  editorAutocomplete: (context: {
    code: string;
    cursorPosition: number;
    language?: string;
    useRag?: boolean;
    useTools?: boolean;
    metadata?: {
      currentLine: string;
      previousLine: string;
      nextLine: string;
      lineNumber: number;
      hasContextBefore: boolean;
      hasContextAfter: boolean;
    };
  }) => Promise<IPCResponse<{ completion: string }>>;
  editorAction: (params: {
    action:
      | 'summarize'
      | 'translate'
      | 'complete'
      | 'explain'
      | 'fix'
      | 'improve'
      | 'continue'
      | 'make-shorter'
      | 'make-longer'
      | 'simplify'
      | 'fix-grammar'
      | 'change-tone-professional'
      | 'change-tone-casual'
      | 'change-tone-friendly'
      | 'find-action-items'
      | 'create-outline';
    text: string;
    language?: string;
    targetLanguage?: string;
    context?: {
      before: string;
      after: string;
      fullCode?: string;
      filePath?: string;
      lineStart: number;
      lineEnd: number;
    };
  }) => Promise<IPCResponse<{ result: string }>>;
}

// LangGraph 관련 타입
interface GraphConfig {
  thinkingMode:
    | 'instant'
    | 'sequential'
    | 'tree-of-thought'
    | 'deep'
    | 'coding'
    | 'browser-agent'
    | 'editor-agent'
    | 'deep-web-research';
  enableRAG: boolean;
  enableTools: boolean;
}

// LangGraph 스트리밍 이벤트 타입 (conversationId 포함)
// LangGraph Stream Event Base
interface LangGraphStreamEventBase {
  conversationId?: string;
  type: string;
}

interface LangGraphStreamingEvent extends LangGraphStreamEventBase {
  type: 'streaming';
  chunk: string;
}

interface LangGraphImageProgressEvent extends LangGraphStreamEventBase {
  type: 'image_progress';
  progress: {
    status: 'queued' | 'executing' | 'completed' | 'error';
    message: string;
    progress?: number;
    currentStep?: number;
    totalSteps?: number;
  };
}

interface LangGraphToolApprovalRequestEvent extends LangGraphStreamEventBase {
  type: 'tool_approval_request';
  messageId: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}

interface LangGraphToolApprovalResultEvent extends LangGraphStreamEventBase {
  type: 'tool_approval_result';
  approved: boolean;
}

interface LangGraphNodeEvent extends LangGraphStreamEventBase {
  type: 'node';
  node: string;
  data?: {
    messages?: Message[];
    toolResults?: Array<{
      toolName: string;
      result: unknown;
      error?: string;
    }>;
  };
}

interface LangGraphErrorEvent extends LangGraphStreamEventBase {
  type: 'error';
  error: string;
}

interface LangGraphCompletionEvent extends LangGraphStreamEventBase {
  type: 'completion';
  iterations?: number;
}

type LangGraphStreamEvent =
  | LangGraphStreamingEvent
  | LangGraphImageProgressEvent
  | LangGraphToolApprovalRequestEvent
  | LangGraphToolApprovalResultEvent
  | LangGraphNodeEvent
  | LangGraphErrorEvent
  | LangGraphCompletionEvent;

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
    imageGenConfig?: ImageGenConfig,
    networkConfig?: NetworkConfig,
    workingDirectory?: string
  ) => Promise<IPCResponse<{ conversationId?: string }>>;
  onStreamEvent: (callback: (event: LangGraphStreamEvent) => void) => (...args: unknown[]) => void;
  onStreamDone: (
    callback: (data?: LangGraphStreamDoneData) => void
  ) => (...args: unknown[]) => void;
  onStreamError: (
    callback: (data: LangGraphStreamErrorData) => void
  ) => (...args: unknown[]) => void;
  // Tool Approval (Human-in-the-loop)
  onToolApprovalRequest: (
    callback: (data: LangGraphToolApprovalRequest) => void
  ) => (...args: unknown[]) => void;
  respondToolApproval: (conversationId: string, approved: boolean) => Promise<IPCResponse>;
  // Abort streaming
  abort: (conversationId: string) => Promise<IPCResponse>;
  // Stop Browser Agent
  stopBrowserAgent: (conversationId: string) => Promise<IPCResponse>;
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

// VectorDB 검색 옵션 타입
interface VectorSearchOptions {
  // 필터링 옵션
  folderPath?: string;
  tags?: string[];
  category?: string;
  source?: string;

  // 부스팅 옵션
  folderPathBoost?: number;
  titleBoost?: number;
  tagBoost?: number;

  // 하이브리드 검색
  useHybridSearch?: boolean;
  hybridAlpha?: number;

  // 기타
  includeAllMetadata?: boolean;
  recentBoost?: boolean;
  recentBoostDecay?: number;
}

// Export 데이터 타입
interface ExportData {
  version: string;
  exportedAt: string;
  documents: VectorDocument[];
  totalCount: number;
}

// Import 결과 타입
interface ImportResult {
  imported: number;
  overwritten: number;
  skipped: number;
}

interface VectorDBAPI {
  initialize: (config: { indexName: string; dimension: number }) => Promise<IPCResponse>;
  createIndex: (name: string, dimension: number) => Promise<IPCResponse>;
  deleteIndex: (name: string) => Promise<IPCResponse>;
  indexExists: (name: string) => Promise<IPCResponse<boolean>>;
  insert: (documents: VectorDocument[]) => Promise<IPCResponse>;
  search: (
    queryEmbedding: number[],
    k: number,
    options?: VectorSearchOptions,
    queryText?: string
  ) => Promise<IPCResponse<VectorSearchResult[]>>;
  delete: (ids: string[]) => Promise<IPCResponse>;
  updateMetadata: (id: string, metadata: Record<string, any>) => Promise<IPCResponse>;
  count: () => Promise<IPCResponse<number>>;
  getAll: () => Promise<IPCResponse<VectorDocument[]>>;
  indexDocuments: (
    documents: Array<{ id: string; content: string; metadata: Record<string, any> }>,
    options: { chunkSize: number; chunkOverlap: number; batchSize: number }
  ) => Promise<IPCResponse>;
  export: () => Promise<IPCResponse<ExportData>>;
  import: (
    exportData: ExportData,
    options?: { overwrite?: boolean }
  ) => Promise<IPCResponse<ImportResult>>;
  createEmptyFolder: (folderPath: string) => Promise<IPCResponse>;
  deleteEmptyFolder: (folderPath: string) => Promise<IPCResponse>;
  getAllEmptyFolders: () => Promise<IPCResponse<string[]>>;
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
  createFile: (filePath: string, content?: string) => Promise<IPCResponse>;
  createDirectory: (dirPath: string) => Promise<IPCResponse>;
  delete: (targetPath: string) => Promise<IPCResponse>;
  rename: (oldPath: string, newPath: string) => Promise<IPCResponse>;
  copy: (sourcePath: string, destPath: string) => Promise<IPCResponse>;
  move: (sourcePath: string, destPath: string) => Promise<IPCResponse>;
  getAbsolutePath: (filePath: string) => Promise<IPCResponse<string>>;
  getRelativePath: (from: string, to: string) => Promise<IPCResponse<string>>;
  showInFolder: (itemPath: string) => Promise<IPCResponse>;
  duplicate: (sourcePath: string) => Promise<IPCResponse<string>>;
  searchFiles: (
    query: string,
    dirPath: string,
    options?: SearchOptions
  ) => Promise<IPCResponse<SearchResponse>>;
  saveClipboardImage: (
    destDir: string
  ) => Promise<IPCResponse<{ filename: string; path: string; dataUrl: string }>>;
  readImageAsBase64: (filePath: string) => Promise<IPCResponse<string>>;
  getFileStat: (
    filePath: string
  ) => Promise<IPCResponse<{ mtime: number; size: number; isFile: boolean; isDirectory: boolean }>>;
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

// GitHub Sync Result 타입
interface GitHubSyncResult {
  success: boolean;
  message: string;
  sha?: string;
  error?: string;
}

// GitHub Sync API (Token 기반)
interface GitHubSyncAPI {
  getMasterKey: () => Promise<IPCResponse<string>>;
  testConnection: (config: import('./index').GitHubSyncConfig) => Promise<GitHubSyncResult>;
  syncSettings: (config: import('./index').GitHubSyncConfig) => Promise<GitHubSyncResult>;
  syncDocuments: (config: import('./index').GitHubSyncConfig) => Promise<GitHubSyncResult>;
  syncImages: (config: import('./index').GitHubSyncConfig) => Promise<GitHubSyncResult>;
  syncConversations: (config: import('./index').GitHubSyncConfig) => Promise<GitHubSyncResult>;
  syncPersonas: (config: import('./index').GitHubSyncConfig) => Promise<GitHubSyncResult>;
  syncAll: (config: import('./index').GitHubSyncConfig) => Promise<
    IPCResponse<{
      settings: GitHubSyncResult;
      documents: GitHubSyncResult;
      images: GitHubSyncResult;
      conversations: GitHubSyncResult;
      personas: GitHubSyncResult;
    }>
  >;
  pullDocuments: (config: import('./index').GitHubSyncConfig) => Promise<{
    success: boolean;
    documents: Array<{ title: string; content: string; metadata: Record<string, any> }>;
    message?: string;
    error?: string;
  }>;
}

// Team Docs API (여러 GitHub Repo 동기화)
interface TeamDocsAPI {
  testConnection: (config: import('./index').TeamDocsConfig) => Promise<GitHubSyncResult>;
  syncDocuments: (config: import('./index').TeamDocsConfig) => Promise<{
    success: boolean;
    message: string;
    data?: {
      totalDocuments: number;
      indexedDocuments?: number;
      addedDocuments: number;
      updatedDocuments: number;
      deletedDocuments: number;
    };
    error?: string;
  }>;
  pushDocuments: (config: import('./index').TeamDocsConfig) => Promise<{
    success: boolean;
    message: string;
    error?: string;
  }>;
  syncAll: () => Promise<{
    success: boolean;
    message: string;
    data?: {
      totalSynced: number;
      results: Array<{
        teamName: string;
        success: boolean;
        message: string;
      }>;
    };
    error?: string;
  }>;
  pushDocument: (params: {
    teamDocsId: string;
    githubPath: string;
    title: string;
    content: string;
    metadata?: Record<string, any>;
    sha?: string;
    commitMessage?: string;
  }) => Promise<{
    success: boolean;
    message: string;
    data?: {
      sha: string;
    };
    error?: string;
  }>;
}

// Error Reporting API
interface ErrorReportingAPI {
  send: (
    errorData: import('./index').ErrorReportData
  ) => Promise<IPCResponse<{ issueUrl?: string; skipped?: boolean }>>;
  isEnabled: () => Promise<{ enabled: boolean }>;
  getContext: () => Promise<IPCResponse<{ version: string; platform: string; timestamp: number }>>;
  sendConversation: (data: {
    issue: string;
    messages: import('./index').Message[];
    conversationId?: string;
    additionalInfo?: string;
  }) => Promise<IPCResponse<{ issueUrl?: string }>>;
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
  executeQuestion: (prompt: string) => Promise<IPCResponse>;
  reloadShortcuts: () => Promise<IPCResponse>;
}

interface BrowserTab {
  id: string;
  url: string;
  title: string;
  isActive: boolean;
}

// Snapshot 타입
interface Snapshot {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  createdAt: number;
  screenshotPath: string;
  mhtmlPath: string;
}

// Bookmark 타입
interface Bookmark {
  id: string;
  url: string;
  title: string;
  folderId?: string;
  createdAt: number;
}

// Bookmark Folder 타입
interface BookmarkFolder {
  id: string;
  name: string;
  createdAt: number;
}

interface BrowserViewAPI {
  // Tab management
  createTab: (url?: string) => Promise<IPCResponse<{ tabId: string; url: string }>>;
  switchTab: (tabId: string) => Promise<
    IPCResponse<{
      tabId: string;
      url: string;
      title: string;
      canGoBack: boolean;
      canGoForward: boolean;
    }>
  >;
  closeTab: (tabId: string) => Promise<IPCResponse<{ activeTabId: string | null }>>;
  getTabs: () => Promise<IPCResponse<{ tabs: BrowserTab[]; activeTabId: string | null }>>;
  // Navigation (operates on active tab)
  loadURL: (url: string) => Promise<IPCResponse>;
  goBack: () => Promise<IPCResponse>;
  goForward: () => Promise<IPCResponse>;
  reload: () => Promise<IPCResponse>;
  setBounds: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => Promise<IPCResponse>;
  getState: () => Promise<
    IPCResponse<{
      tabId: string;
      url: string;
      title: string;
      canGoBack: boolean;
      canGoForward: boolean;
      isLoading: boolean;
    }>
  >;
  toggleDevTools: () => Promise<IPCResponse>;
  // Show/Hide
  hideAll: () => Promise<IPCResponse>;
  showActive: () => Promise<IPCResponse>;
  // Snapshot operations
  capturePage: () => Promise<IPCResponse<Snapshot>>;
  getSnapshots: () => Promise<IPCResponse<Snapshot[]>>;
  deleteSnapshot: (snapshotId: string) => Promise<IPCResponse>;
  openSnapshot: (snapshotId: string) => Promise<IPCResponse>;
  // Bookmark operations
  addBookmark: (options?: {
    url?: string;
    title?: string;
    folderId?: string;
  }) => Promise<IPCResponse<Bookmark>>;
  getBookmarks: () => Promise<IPCResponse<Bookmark[]>>;
  deleteBookmark: (bookmarkId: string) => Promise<IPCResponse>;
  openBookmark: (bookmarkId: string) => Promise<IPCResponse>;
  addBookmarkFolder: (name: string) => Promise<IPCResponse<BookmarkFolder>>;
  getBookmarkFolders: () => Promise<IPCResponse<BookmarkFolder[]>>;
  deleteBookmarkFolder: (folderId: string) => Promise<IPCResponse>;
  // Browser settings
  getBrowserSettings: () => Promise<IPCResponse<{ snapshotsPath: string; bookmarksPath: string }>>;
  // Event listeners
  onDidNavigate: (
    callback: (data: {
      tabId: string;
      url: string;
      canGoBack: boolean;
      canGoForward: boolean;
    }) => void
  ) => (...args: unknown[]) => void;
  onLoadingState: (
    callback: (data: {
      tabId: string;
      isLoading: boolean;
      canGoBack?: boolean;
      canGoForward?: boolean;
    }) => void
  ) => (...args: unknown[]) => void;
  onTitleUpdated: (
    callback: (data: { tabId: string; title: string }) => void
  ) => (...args: unknown[]) => void;
  onTabCreated: (
    callback: (data: { tabId: string; url: string }) => void
  ) => (...args: unknown[]) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

// Browser Control (AI Agent가 사용)
interface InteractiveElement {
  id: string;
  tag: string;
  type: string | null;
  text: string;
  placeholder: string | null;
  value: string | null;
  href: string | null;
  role: string | null;
  ariaLabel: string | null;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface PageContent {
  title: string;
  url: string;
  text: string;
  html: string;
}

interface BrowserControlAPI {
  getInteractiveElements: () => Promise<IPCResponse<{ elements: InteractiveElement[] }>>;
  getPageContent: () => Promise<IPCResponse<PageContent>>;
  captureScreenshot: () => Promise<IPCResponse<{ image: string }>>;
  clickElement: (elementId: string) => Promise<IPCResponse>;
  typeText: (elementId: string, text: string) => Promise<IPCResponse>;
  scroll: (direction: 'up' | 'down', amount?: number) => Promise<IPCResponse>;
  waitForElement: (selector: string, timeout?: number) => Promise<IPCResponse<{ found: boolean }>>;
  executeScript: (script: string) => Promise<IPCResponse>;
}

// Terminal 관련 타입
interface TerminalSession {
  sessionId: string;
  cwd: string;
  shell: string;
}

interface TerminalAPI {
  // Session management
  createSession: (
    cwd?: string,
    cols?: number,
    rows?: number
  ) => Promise<IPCResponse<TerminalSession>>;
  write: (sessionId: string, data: string) => Promise<IPCResponse>;
  resize: (sessionId: string, cols: number, rows: number) => Promise<IPCResponse>;
  killSession: (sessionId: string) => Promise<IPCResponse>;
  getSessions: () => Promise<IPCResponse<TerminalSession[]>>;
  // Event listeners
  onData: (
    callback: (data: { sessionId: string; data: string }) => void
  ) => (...args: unknown[]) => void;
  onExit: (
    callback: (data: { sessionId: string; exitCode: number; signal?: number }) => void
  ) => (...args: unknown[]) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

// Test Runner 관련 타입
export interface HealthStatus {
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  details?: Record<string, unknown>;
  latency?: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: HealthStatus;
    vectordb: HealthStatus;
    mcpTools: HealthStatus;
    llmProviders: HealthStatus;
  };
  timestamp: number;
  message?: string;
}

export interface TestResult {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  message?: string;
  error?: string;
  timestamp: number;
}

export interface TestSuiteResult {
  id: string;
  name: string;
  tests: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  timestamp: number;
}

interface TestRunnerAPI {
  // Health Check
  healthCheck: () => Promise<HealthCheckResult>;
  getLastHealthCheck: () => Promise<HealthCheckResult | null>;
  startPeriodicHealthCheck: (intervalMs?: number) => Promise<void>;
  stopPeriodicHealthCheck: () => Promise<void>;
  // Test Suites
  runAll: () => Promise<TestSuiteResult>;
  runLLM: () => Promise<TestSuiteResult>;
  runDatabase: () => Promise<TestSuiteResult>;
  runMCP: () => Promise<TestSuiteResult>;
}

interface PresentationAPI {
  exportSlides: (
    slides: import('./presentation').PresentationSlide[],
    format: import('./presentation').PresentationExportFormat
  ) => Promise<string>;
}

interface ElectronAPI {
  platform: string;
  chat: ChatAPI;
  activity: ActivityAPI;
  persona: PersonaAPI;
  config: ConfigAPI;
  mcp: MCPAPI;
  auth: AuthAPI;
  llm: LLMAPI;
  langgraph: LangGraphAPI;
  vectorDB: VectorDBAPI;
  file: FileAPI;
  fs: FileSystemAPI;
  github: GitHubAPI;
  githubSync: GitHubSyncAPI; // 새로운 Token 기반 Sync API
  teamDocs: TeamDocsAPI; // Team Docs 동기화 API (여러 GitHub Repo)
  errorReporting: ErrorReportingAPI; // 에러 자동 리포팅 API
  shell: ShellAPI;
  embeddings: EmbeddingsAPI;
  comfyui: ComfyUIAPI;
  update: UpdateAPI;
  quickInput: QuickInputAPI;
  browserView: BrowserViewAPI;
  browserControl: BrowserControlAPI;
  terminal: TerminalAPI;
  testRunner: TestRunnerAPI; // 테스트 러너 API
  presentation: PresentationAPI;
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
  VectorSearchOptions,
  FileAPI,
  FileNode,
  FileSystemAPI,
  DocumentFile,
  FetchedUrl,
  GitHubAPI,
  GitHubRepository,
  GitHubSyncAPI,
  GitHubSyncResult,
  TeamDocsAPI,
  ErrorReportingAPI,
  ShellAPI,
  EmbeddingsAPI,
  EmbeddingsConfig,
  ComfyUIAPI,
  ComfyUIWorkflow,
  ComfyUIPromptResult,
  UpdateAPI,
  UpdateCheckResult,
  ReleaseInfo,
  TerminalAPI,
  TerminalSession,
  BrowserViewAPI,
  BrowserTab,
  Snapshot,
  Bookmark,
  BookmarkFolder,
  ElectronAPI,
};
