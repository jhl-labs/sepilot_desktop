/**
 * Extension System Types
 *
 * SEPilot Desktop의 확장 기능 시스템을 위한 타입 정의
 */

import type { ComponentType } from 'react';
import type { AgentTraceMetrics, ApprovalHistoryEntry } from './agent-state';
import type { Message, ToolCall } from './message';

/**
 * LLM Chat Options
 */
export interface LLMChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
  [key: string]: unknown; // 추가 옵션
}

/**
 * LLM Chat Response
 */
export interface LLMChatResponse {
  content: string;
  tool_calls?: ToolCall[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  [key: string]: unknown; // 추가 응답 속성
}

/**
 * Extension Permission 타입
 *
 * Extension이 요청할 수 있는 권한 목록
 */
export type ExtensionPermission =
  // 파일 시스템 권한
  | 'filesystem:read'
  | 'filesystem:write'
  | 'filesystem:delete'
  | 'filesystem:execute'
  // LLM 권한
  | 'llm:chat'
  | 'llm:stream'
  | 'llm:vision'
  // Vector DB 권한
  | 'vectordb:read'
  | 'vectordb:write'
  | 'vectordb:delete'
  // MCP 권한
  | 'mcp:call-tool'
  | 'mcp:list-tools'
  // IPC 권한
  | 'ipc:invoke'
  | 'ipc:handle'
  | 'ipc:send'
  // Network 권한
  | 'network:http'
  | 'network:websocket'
  // Storage 권한
  | 'storage:read'
  | 'storage:write'
  // Skill 권한
  | 'skills:read'
  | 'skills:execute'
  | 'skills:manage'
  // Terminal 권한
  | 'terminal:create'
  | 'terminal:execute'
  // Browser 권한
  | 'browser:navigate'
  | 'browser:execute-script'
  // Clipboard 권한
  | 'clipboard:read'
  | 'clipboard:write'
  // Notification 권한
  | 'notification:show'
  // UI 권한
  | 'ui:show-toast'
  | 'ui:show-dialog'
  // All (모든 권한)
  | 'all';

/**
 * Permission Check Result
 */
export interface PermissionCheckResult {
  granted: boolean;
  permission: ExtensionPermission;
  reason?: string;
}

/**
 * Manifest Validation Result
 */
export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Manifest Required Fields
 */
export const MANIFEST_REQUIRED_FIELDS = [
  'id',
  'name',
  'description',
  'version',
  'author',
  'icon',
  'mode',
] as const;

/**
 * Permission Categories
 */
export const PERMISSION_CATEGORIES = {
  filesystem: ['filesystem:read', 'filesystem:write', 'filesystem:delete', 'filesystem:execute'],
  llm: ['llm:chat', 'llm:stream', 'llm:vision'],
  vectordb: ['vectordb:read', 'vectordb:write', 'vectordb:delete'],
  mcp: ['mcp:call-tool', 'mcp:list-tools'],
  ipc: ['ipc:invoke', 'ipc:handle', 'ipc:send'],
  network: ['network:http', 'network:websocket'],
  storage: ['storage:read', 'storage:write'],
  skills: ['skills:read', 'skills:execute', 'skills:manage'],
  terminal: ['terminal:create', 'terminal:execute'],
  browser: ['browser:navigate', 'browser:execute-script'],
  clipboard: ['clipboard:read', 'clipboard:write'],
  notification: ['notification:show'],
  ui: ['ui:show-toast', 'ui:show-dialog'],
} as const;

/**
 * Agent Manifest - 선언적 Agent 정의
 */
export interface AgentManifest {
  /** Agent 고유 식별자 */
  id: string;
  /** Agent 이름 */
  name: string;
  /** Agent 설명 */
  description: string;
  /** Agent 타입 */
  type: 'tool-calling' | 'rag' | 'thinking' | 'custom';

  /** LLM 설정 */
  llmConfig?: {
    /** LLM Provider 필요 여부 */
    requiresProvider: boolean;
    /** 기본 모델 */
    defaultModel?: string;
    /** 기본 Temperature */
    defaultTemperature?: number;
  };

  /** Tool 설정 */
  tools?: {
    /** Tool 네임스페이스 */
    namespace: string;
    /** Tool Registry export 이름 */
    registry: string;
  }[];

  /** RAG 설정 */
  rag?: {
    /** RAG 활성화 여부 */
    enabled: boolean;
    /** Vector DB 접근 필요 여부 */
    vectorDBAccess: boolean;
  };

  /** System Prompt Template (Mustache 형식) */
  systemPromptTemplate: string;

  /** Agent 옵션 */
  options?: {
    /** 최대 반복 횟수 */
    maxIterations?: number;
    /** 스트리밍 활성화 */
    streaming?: boolean;
    /** Tool 실행 전 승인 필요 */
    toolApproval?: boolean;
  };
}

/**
 * Extension Manifest
 * 모든 extension이 반드시 제공해야 하는 메타데이터
 */
export interface ExtensionManifest {
  /** 확장 기능 고유 식별자 (예: 'presentation', 'diagram', 'mindmap') */
  id: string;
  /** 표시 이름 */
  name: string;
  /** 설명 */
  description: string;
  /** 버전 (semver) */
  version: string;
  /** 작성자 */
  author: string;
  /** 아이콘 (lucide-react 아이콘 이름) */
  icon: string;
  /** 이 extension이 활성화할 앱 모드 */
  mode: string;
  /** 사이드바에 표시할지 여부 */
  showInSidebar: boolean;
  /** 의존하는 다른 extension ID 목록 */
  dependencies?: string[];
  /** 설정 스키마 (옵션) */
  settingsSchema?: Record<string, unknown>;
  /** extension이 활성화되어 있는지 여부 */
  enabled?: boolean;
  /** 모드 선택 드롭다운에서의 표시 순서 (낮을수록 위) */
  order?: number;
  /** 베타 기능 플래그 키 (예: 'enablePresentationMode') */
  betaFlag?: string;
  /** IPC 채널 등록 정보 (Main Process에서 사용) */
  ipcChannels?: {
    /** Extension이 등록할 IPC handler 채널 목록 */
    handlers: string[];
  };
  /** Extension이 실행되는 프로세스. 기본값: 'renderer' */
  processType?: 'renderer' | 'main' | 'both';

  /** Main 진입점 파일 경로 (기본값: 'dist/main.js') */
  main?: string;

  /** Settings 탭 표시 정보 (Settings Dialog에 표시할 경우) */
  settingsTab?: {
    /** Settings 탭 ID (SettingSection에 추가될 값) */
    id: string;
    /** Settings 탭 레이블 (다국어 키 또는 직접 텍스트) */
    label: string;
    /** Settings 탭 설명 */
    description: string;
    /** Settings 탭 아이콘 (lucide-react 아이콘 이름) */
    icon: string;
  };

  // 새로운 필드
  /** Agent 선언 (선언적 구조) */
  agents?: AgentManifest[];
  /** 권한 선언 */
  permissions?: ExtensionPermission[];
  /** Export 항목 (Tool Registry 등) */
  exports?: Record<string, unknown>;
}

/**
 * Workspace API - 파일 시스템 접근
 */
export interface WorkspaceAPI {
  /** 파일 읽기 */
  readFile(path: string): Promise<string>;
  /** 파일 쓰기 */
  writeFile(path: string, content: string): Promise<void>;
  /** 파일 목록 조회 */
  listFiles(dirPath: string, pattern?: string): Promise<string[]>;
  /** 현재 작업 디렉토리 (읽기 전용, getWorkingDirectory() 별칭) */
  readonly workingDirectory?: string;
  /** 현재 작업 디렉토리 조회 */
  getWorkingDirectory(): string;
  /** 작업 디렉토리 변경 */
  setWorkingDirectory(path: string): void;
  /** 작업 디렉토리 로드 (비동기) */
  loadWorkingDirectory?(): Promise<string>;
  /** 파일 변경 감지 */
  watchFile(path: string, callback: (event: FileChangeEvent) => void): Disposable;

  /** 디렉토리 선택 다이얼로그 */
  selectDirectory(): Promise<string | null>;
  /** 파일 선택 다이얼로그 */
  selectFile(options?: {
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | null>;
  /** 파일 통계 정보 조회 */
  getFileStat(path: string): Promise<{ mtime: number; size: number } | null>;

  /** 이미지 파일을 Base64로 읽기 */
  readImageAsBase64?(path: string): Promise<string>;
  /** 패턴으로 파일 검색 (glob) */
  searchFiles?(pattern: string): Promise<string[]>;
  /** 상대 경로를 절대 경로로 변환 */
  resolvePath?(relativePath: string): string;
  /** 파일 복사 */
  duplicate?(sourcePath: string, targetPath: string): Promise<void>;
  /** 클립보드 이미지를 지정된 디렉토리에 저장하고 파일 경로 반환 */
  saveClipboardImage?(directory: string): Promise<string | null>;
}

/**
 * 파일 변경 이벤트
 */
export interface FileChangeEvent {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  timestamp: number;
}

/**
 * Disposable - 리소스 해제 인터페이스
 */
export interface Disposable {
  dispose(): void;
}

/**
 * UI API - Toast, Dialog 등 UI 상호작용
 */
export interface UIAPI {
  /** Toast 메시지 표시 */
  showToast?(message: string, options?: ToastOptions): void;
  /** Dialog 표시 */
  showDialog?(options: DialogOptions): Promise<DialogResult>;
  /** Status Bar Item 생성 */
  createStatusBarItem?(options: StatusBarItemOptions): StatusBarItem;
  /** Quick Pick 표시 (선택 목록) */
  showQuickPick?<T>(items: QuickPickItem<T>[], options?: QuickPickOptions): Promise<T | undefined>;

  // Editor Extension specific UI API
  /** 터미널 패널 표시 상태 (읽기 전용) */
  readonly showTerminalPanel?: boolean;
  /** 에디터 외형 설정 (읽기 전용) */
  readonly editorAppearanceConfig?: Readonly<EditorAppearanceConfig>;

  /** 터미널 패널 토글 */
  toggleTerminal?(): void;
  /** 터미널 패널 표시 제어 */
  setTerminalVisible?(visible: boolean): void;
  /** 에디터 설정 업데이트 */
  updateEditorConfig?(config: Partial<EditorAppearanceConfig>): void;
  /** 에디터 외형 설정 초기화 */
  resetEditorAppearanceConfig?(): void;

  /** UI 상태 변경 이벤트 구독 */
  onDidChangeUIState?(callback: () => void): () => void;
}

/**
 * Toast 옵션
 */
export interface ToastOptions {
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

/**
 * Dialog 옵션
 */
export interface DialogOptions {
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'question';
  buttons?: string[];
  defaultButton?: number;
}

/**
 * Dialog 결과
 */
export interface DialogResult {
  buttonIndex: number;
  buttonLabel: string;
}

/**
 * Status Bar Item 옵션
 */
export interface StatusBarItemOptions {
  text: string;
  tooltip?: string;
  alignment?: 'left' | 'right';
  priority?: number;
}

/**
 * Status Bar Item
 */
export interface StatusBarItem extends Disposable {
  text: string;
  tooltip?: string;
  show(): void;
  hide(): void;
}

/**
 * Quick Pick Item
 */
export interface QuickPickItem<T = any> {
  label: string;
  description?: string;
  detail?: string;
  value: T;
}

/**
 * Quick Pick 옵션
 */
export interface QuickPickOptions {
  placeholder?: string;
  canSelectMany?: boolean;
}

/**
 * Command API - 명령어 등록 및 실행
 */
export interface CommandAPI {
  /** 명령어 등록 */
  registerCommand(commandId: string, handler: CommandHandler): Disposable;
  /** 명령어 실행 */
  executeCommand(commandId: string, ...args: any[]): Promise<any>;
  /** 등록된 명령어 목록 조회 */
  getCommands(): string[];
}

/**
 * Command Handler
 */
export type CommandHandler = (...args: any[]) => any | Promise<any>;

/**
 * Tool Registry - Tool 관리 (네임스페이스 격리)
 */
export interface ToolRegistry {
  /** Tool 등록 (자동으로 네임스페이스 추가) */
  register(tool: Tool): void;
  /** Tool 조회 */
  get(toolName: string): Tool | undefined;
  /** Tool 실행 */
  execute(toolName: string, args: any): Promise<any>;
  /** OpenAI 형식으로 변환 */
  toOpenAIFormat(toolNames?: string[]): any[];
}

/**
 * Tool 정의
 */
export interface Tool {
  name: string;
  description: string;
  parameters: any; // JSON Schema
  execute: (args: any) => Promise<any>;
}

/**
 * Agent Builder - Agent 생성 및 실행
 */
export interface AgentBuilder {
  /** Agent 실행 */
  run<TInput = any, TOutput = any>(
    agentId: string,
    input: TInput,
    options?: AgentRunOptions
  ): AsyncGenerator<TOutput>;
  /** Agent 정보 조회 */
  getAgentInfo(agentId: string): AgentInfo | undefined;
}

/**
 * Agent 실행 옵션
 */
export interface AgentRunOptions {
  streaming?: boolean;
  maxIterations?: number;
  toolApproval?: boolean;
  temperature?: number;
  model?: string;
}

/**
 * Agent 정보
 */
export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  type: 'tool-calling' | 'rag' | 'thinking' | 'custom';
}

/**
 * Extension Runtime Context
 *
 * Store slice 생성 시 주입되는 런타임 의존성
 * Extension이 메인 앱의 구현에 의존하지 않고 독립적으로 개발할 수 있게 합니다.
 */
export interface ExtensionRuntimeContext {
  /** IPC 통신 브리지 */
  ipc: IPCBridge;
  /** Logger 인스턴스 */
  logger: Logger;
  /** Platform 유틸리티 */
  platform: {
    isElectron: () => boolean;
    isMac: () => boolean;
    isWindows: () => boolean;
    isLinux: () => boolean;
  };

  // 새로운 API (단계적 구현을 위해 optional)
  /** Workspace API - 파일 시스템 */
  workspace?: WorkspaceAPI;
  /** UI API - Toast, Dialog */
  ui?: UIAPI;
  /** Command API - 명령어 등록/실행 */
  commands?: CommandAPI;
  /** Tool Registry - Extension별 Tool 관리 */
  tools?: ToolRegistry;
  /** Agent Builder - Agent 생성 및 실행 */
  agent?: AgentBuilder;
  /** LLM Provider - Extension별 LLM 인스턴스 */
  llm?: LLMProvider;
  /** Vector DB 접근 */
  vectorDB?: VectorDBAccess;
  /** MCP (Model Context Protocol) 접근 */
  mcp?: MCPAccess;
  /** Skills 접근 */
  skills?: SkillsAccess;
}

/**
 * Vector DB 접근 인터페이스
 */
export interface VectorDBAccess {
  search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]>;
  add(documents: VectorDocument[]): Promise<void>;
  insert(documents: VectorDocument[]): Promise<void>; // 별칭
  delete(ids: string[]): Promise<void>;
}

/**
 * MCP (Model Context Protocol) 접근 인터페이스
 */
export interface MCPAccess {
  /** MCP 도구 실행 */
  execute(
    toolName: string,
    args: Record<string, unknown>,
    options?: { serverId?: string }
  ): Promise<unknown>;
  /** MCP 도구 실행 (별칭) */
  executeTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: { serverId?: string }
  ): Promise<unknown>;
  /** 사용 가능한 MCP 도구 목록 조회 */
  listTools(options?: { serverId?: string }): Promise<MCPToolInfo[]>;
  /** 연결된 MCP 서버 목록 조회 */
  listServers(): Promise<MCPServerInfo[]>;
}

/**
 * MCP Tool 정보
 */
export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  serverId: string;
}

/**
 * MCP Server 정보
 */
export interface MCPServerInfo {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
}

/**
 * Skills 접근 인터페이스
 */
export interface SkillsAccess {
  /** 설치된 스킬 목록 조회 */
  list(): Promise<SkillInfo[]>;
  /** 특정 스킬 상세 정보 조회 */
  get(skillId: string): Promise<SkillDetail | null>;
  /** 스킬 콘텐츠 (프롬프트) 조회 */
  getContent(skillId: string): Promise<string | null>;
}

/**
 * Skill 기본 정보
 */
export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

/**
 * Skill 상세 정보
 */
export interface SkillDetail extends SkillInfo {
  version: string;
  author: string;
  tags: string[];
}

/**
 * Vector 검색 옵션
 */
export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  filter?: Record<string, any>;
}

/**
 * Vector 검색 결과
 */
export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * Vector Document
 */
export interface VectorDocument {
  id: string;
  content: string;
  metadata?: Record<string, any>;
}

/**
 * IPC Bridge Interface
 *
 * Extension이 Electron IPC를 통해 Backend와 통신하기 위한 인터페이스
 */
export interface IPCBridge {
  /**
   * IPC 핸들러 호출
   * @param channel IPC 채널 이름
   * @param data 전송할 데이터
   * @returns 결과 (success, data, error)
   */
  invoke<T = any>(
    channel: string,
    data?: any
  ): Promise<{ success: boolean; data?: T; error?: string }>;

  /**
   * IPC 이벤트 구독
   * @param channel IPC 채널 이름
   * @param handler 이벤트 핸들러
   * @returns 구독 취소 함수
   */
  on(channel: string, handler: (data: any) => void): () => void;

  /**
   * IPC 이벤트 발행
   * @param channel IPC 채널 이름
   * @param data 전송할 데이터
   */
  send(channel: string, data?: any): void;
}

/**
 * Logger Interface
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * LLM Provider Interface (옵션)
 */
export interface LLMProvider {
  chat(messages: Message[], options?: LLMChatOptions): Promise<LLMChatResponse>;
  stream(messages: Message[], options?: LLMChatOptions): AsyncIterable<string>;
}

/**
 * Agent Factory Interface (옵션)
 */
export interface AgentFactory {
  create(config: any): any;
}

/**
 * Store Slice Creator Type
 *
 * 새로운 시그니처: ExtensionRuntimeContext를 세 번째 파라미터로 받습니다.
 */
export type StoreSliceCreator<T = any> = (
  set: (...args: any[]) => void,
  get: () => any,
  context: ExtensionRuntimeContext
) => T;

/**
 * Extension Diagnostic Result
 * Extension 자체 진단 결과
 */
export interface ExtensionDiagnosticResult {
  /** 진단 상태 */
  status: 'healthy' | 'warning' | 'error';
  /** 전체 상태 메시지 */
  message: string;
  /** 추가 상세 정보 */
  details?: Record<string, any>;
  /** 개별 체크 항목 */
  checks?: {
    /** 체크 항목 이름 */
    name: string;
    /** 통과 여부 */
    passed: boolean;
    /** 설명 또는 에러 메시지 */
    message?: string;
    /** 추가 데이터 */
    data?: any;
  }[];
}

/**
 * Extension Definition
 * Extension의 실제 구현체를 포함하는 인터페이스
 */
export interface ExtensionDefinition {
  /** Extension 메타데이터 */
  manifest: ExtensionManifest;

  /** 메인 컴포넌트 (Studio/Workspace) */
  MainComponent?: ComponentType;

  /** 사이드바 컴포넌트 */
  SidebarComponent?: ComponentType;

  /** 사이드바 헤더 액션 버튼 (Plus 버튼 등) */
  HeaderActionsComponent?: ComponentType<any>;

  /** 설정 페이지 컴포넌트 (Beta Settings에 표시될 설정 UI) */
  SettingsComponent?: ComponentType<{
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
  }>;

  /** Settings 탭 컴포넌트 (Settings Dialog에 표시될 전체 설정 탭) */
  SettingsTabComponent?: ComponentType<{
    onSave: () => void;
    isSaving: boolean;
    message: { type: 'success' | 'error'; text: string } | null;
  }>;

  /** Store slice 생성 함수 (새 시그니처: context 추가) */
  createStoreSlice?: StoreSliceCreator;

  /** IPC Handler 등록 함수 (Main Process에서 실행) */
  setupIpcHandlers?: () => void;

  /** 세션 초기화 함수 (새 세션 시작 시 호출) */
  clearSession?: () => void;

  /** Extension 활성화 시 호출되는 함수 */
  activate?: (context?: ExtensionContext) => void | Promise<void>;

  /** Extension 비활성화 시 호출되는 함수 */
  deactivate?: (context?: ExtensionContext) => void | Promise<void>;

  /** Extension 자체 진단 함수 (CLI에서 호출 가능) */
  diagnostics?: () => Promise<ExtensionDiagnosticResult> | ExtensionDiagnosticResult;

  /** Export 항목 (Tool Registry, 유틸리티 함수 등) */
  exports?: Record<string, any>;

  /** Extension 번역 리소스 { ko: {...}, en: {...}, zh: {...} } */
  locales?: Record<string, Record<string, unknown>>;
}

/**
 * Extension Registry Entry
 */
export interface ExtensionRegistryEntry {
  /** Extension 정의 */
  definition: ExtensionDefinition;
  /** 로드 시간 */
  loadedAt: number;
  /** 활성화 여부 */
  isActive: boolean;
}

/**
 * Extension Context API
 *
 * Extension이 앱 상태와 상호작용할 수 있는 안전한 API를 제공합니다.
 * chat-store를 직접 import하지 않고도 필요한 기능에 접근할 수 있습니다.
 *
 * @example
 * ```typescript
 * // Extension activate 함수에서 context 사용
 * export async function activate(context: ExtensionContext) {
 *   const mode = context.getAppMode();
 *   context.on('app:mode-changed', (newMode) => {
 *     console.log('Mode changed to:', newMode);
 *   });
 * }
 * ```
 */
export interface ExtensionContext {
  /** Extension ID */
  readonly extensionId: string;

  // ==================== 앱 상태 조회 (읽기 전용) ====================

  /** 현재 앱 모드 조회 */
  getAppMode: () => string;

  /** 현재 활성 세션 ID 조회 */
  getActiveSessionId: () => string | null;

  /** 특정 세션 조회 */
  getSession: (sessionId: string) => any | null;

  // ==================== Extension 상태 관리 ====================

  /** Extension 전용 스토리지에 데이터 저장 */
  setState: <T = any>(key: string, value: T) => void;

  /** Extension 전용 스토리지에서 데이터 조회 */
  getState: <T = any>(key: string) => T | undefined;

  /** Extension 전용 스토리지에서 데이터 삭제 */
  removeState: (key: string) => void;

  // ==================== 이벤트 시스템 ====================

  /** 이벤트 구독 */
  on: <T = any>(event: ExtensionEventType, handler: (data: T) => void) => () => void;

  /** 이벤트 발행 (다른 Extension에게 전달) */
  emit: <T = any>(event: ExtensionEventType, data: T) => void;

  // ==================== 로깅 ====================

  /** Extension 전용 로거 */
  logger: {
    info: (message: string, meta?: any) => void;
    warn: (message: string, meta?: any) => void;
    error: (message: string, meta?: any) => void;
    debug: (message: string, meta?: any) => void;
  };

  // ==================== Main Process 전용 API (optional) ====================

  /** IPC 핸들러 등록 (Main Process만 사용) */
  registerIpcHandler?: <TResult = any>(
    channel: string,
    handler: (...args: any[]) => Promise<TResult> | TResult
  ) => void;

  /** IPC 호출 (Main Process/Renderer 모두 사용 가능) */
  invoke?: <TResult = any>(channel: string, data?: any) => Promise<TResult>;

  /** 설정 조회 (Main Process만 사용) */
  getSetting?: <T = any>(key: string) => Promise<T | null>;

  /** 설정 저장 (Main Process만 사용) */
  setSetting?: <T = any>(key: string, value: T) => Promise<void>;

  /** 설정 삭제 (Main Process만 사용) */
  removeSetting?: (key: string) => Promise<void>;

  // ==================== Runtime Context (optional) ====================

  /** IPC 통신 브리지 */
  ipc?: IPCBridge;

  /** LLM Provider */
  llm?: LLMProvider;

  /** Vector DB 접근 */
  vectorDB?: VectorDBAccess;

  /** MCP 접근 */
  mcp?: MCPAccess;

  /** Skills 접근 */
  skills?: SkillsAccess;

  /** Workspace API */
  workspace?: WorkspaceAPI;

  /** UI API */
  ui?: UIAPI;

  /** Command API */
  commands?: CommandAPI;

  /** Tool Registry */
  tools?: ToolRegistry;

  /** Agent Builder */
  agent?: AgentBuilder;

  /** 파일 시스템 (legacy) */
  fs?: any;

  /** Storage Path (legacy) */
  storagePath?: string;

  /** Dialog (legacy) */
  dialog?: any;

  /** Secure Storage API (Main Process only) */
  storage?: {
    /** Secure storage using OS keychain */
    secure?: {
      /** Encrypt plaintext using OS keychain (returns Base64 string) */
      encrypt(plaintext: string): Promise<string>;
      /** Decrypt encrypted data (Base64 string) using OS keychain */
      decrypt(encrypted: string): Promise<string>;
      /** Check if encryption is available on this platform */
      isAvailable(): boolean;
    };
  };

  /** Window Management API (Main Process only) */
  window?: {
    /** Send event to renderer process (all windows) */
    sendToRenderer(channel: string, data?: any): void;
  };
}

/**
 * Extension Event Type
 *
 * Extension 간 통신을 위한 이벤트 타입 정의
 */
export type ExtensionEventType =
  // 앱 상태 변경 이벤트
  | 'app:mode-changed'
  | 'app:session-created'
  | 'app:session-deleted'
  | 'app:session-switched'
  // Extension 생명주기 이벤트
  | 'extension:activated'
  | 'extension:deactivated'
  // 사용자 정의 이벤트 (extension-id:event-name 형식)
  | `${string}:${string}`;

/**
 * Extension Event Payload
 */
export interface ExtensionEvent<T = any> {
  /** 이벤트 타입 */
  type: ExtensionEventType;
  /** 이벤트를 발행한 Extension ID */
  source: string;
  /** 이벤트 데이터 */
  data: T;
  /** 이벤트 발생 시간 */
  timestamp: number;
}

// ============================================================================
// Extension API Context (Component-level API)
// ============================================================================

/**
 * Open File Information
 */
export interface OpenFile {
  path: string;
  filename?: string; // Optional for backward compatibility
  content: string;
  language?: string;
  isDirty?: boolean;
  initialPosition?: {
    lineNumber: number;
    column?: number;
  };
}

/**
 * Chat Message
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Editor Appearance Configuration
 */
export interface EditorAppearanceConfig {
  fontSize: number;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded';
  wordWrapColumn?: number;
  lineNumbers: 'on' | 'off' | 'relative' | 'interval';
  minimap: boolean;
  autoSave: boolean;
  autoSaveDelay: number;
  theme: string;
  fontFamily?: string;
  rulers?: number[];
}

/**
 * File System API for Extensions
 */
export interface FileSystemAPI {
  /** 열린 파일 목록 (읽기 전용) */
  readonly openFiles: ReadonlyArray<OpenFile>;
  /** 현재 활성 파일 경로 (읽기 전용) */
  readonly activeFilePath: string | null;

  /** 파일 열기 */
  openFile(path: string, content: string, language?: string): void;
  /** 파일 닫기 */
  closeFile(path: string): void;
  /** 파일 내용 업데이트 */
  updateContent(path: string, content: string): void;
  /** 파일 수정 상태 변경 */
  markDirty(path: string, isDirty: boolean): void;
  /** 활성 파일 변경 */
  setActiveFile(path: string): void;

  /** 다른 모든 파일 닫기 */
  closeOtherFiles(path: string): void;
  /** 오른쪽 파일들 닫기 */
  closeFilesToRight(path: string): void;
  /** 저장된 파일들 닫기 */
  closeSavedFiles(): void;
  /** 모든 파일 닫기 */
  closeAllFiles(): void;
  /** 파일 순서 변경 */
  reorderFiles(fromIndex: number, toIndex: number): void;
  /** 초기 커서 위치 제거 */
  clearInitialPosition(path: string): void;

  /** 활성 파일 변경 이벤트 구독 */
  onDidChangeActiveFile(callback: (path: string | null) => void): () => void;
  /** 파일 내용 변경 이벤트 구독 */
  onDidChangeFileContent(callback: (path: string, content: string) => void): () => void;
}

/**
 * Pending Tool Approval
 */
export interface PendingToolApproval {
  conversationId: string;
  messageId: string;
  toolCalls: any[];
  timestamp: number;
  requestKey?: string;
  note?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

/**
 * Editor API for Extensions
 */
export interface EditorAPI {
  /** RAG 사용 여부 (autocomplete) */
  readonly editorUseRagInAutocomplete: boolean;
  /** Tools 사용 여부 (autocomplete) */
  readonly editorUseToolsInAutocomplete: boolean;
  /** Inline autocomplete 활성화 여부 */
  readonly editorEnableInlineAutocomplete: boolean;
  /** Editor Agent 모드 (읽기 전용) */
  readonly editorAgentMode?: 'editor' | 'coding' | string;
  /** Editor View 모드 (읽기 전용) */
  readonly editorViewMode?: 'split' | 'files' | 'chat' | 'search' | string;
  /** Editor LLM Prompts 설정 (읽기 전용) */
  readonly editorLLMPromptsConfig?: any;

  /** Editor Chat RAG 사용 여부 (읽기 전용) */
  readonly editorChatUseRag?: boolean;
  /** Editor Chat Tools 사용 여부 (읽기 전용) */
  readonly editorChatUseTools?: boolean;
  /** Editor Chat 활성화된 Tools 목록 (읽기 전용) */
  readonly editorChatEnabledTools?: string[];

  /** 채팅 스트리밍 상태 (읽기 전용) */
  readonly editorChatStreaming?: boolean;
  /** Tool 승인 대기 중 (읽기 전용) */
  readonly pendingToolApproval?: PendingToolApproval | null;
  /** Tool 승인 대기 큐 (읽기 전용) */
  readonly pendingToolApprovalQueue?: PendingToolApproval[];
  /** 세션 전체 Tool 자동 승인 (읽기 전용) */
  readonly alwaysApproveToolsForSession?: boolean;

  /** Editor View 모드 변경 */
  setEditorViewMode?(mode: string): void;
  /** Editor Agent 모드 변경 */
  setEditorAgentMode?(mode: 'editor' | 'coding'): void;
  /** Inline autocomplete 활성화 변경 */
  setEditorEnableInlineAutocomplete?(enabled: boolean): void;
  /** Editor LLM Prompts 설정 변경 */
  setEditorLLMPromptsConfig?(config: any): void;
  /** Editor Chat RAG 사용 여부 변경 */
  setEditorChatUseRag?(enabled: boolean): void;
  /** Editor Chat Tools 사용 여부 변경 */
  setEditorChatUseTools?(enabled: boolean): void;
  /** Editor Chat Tool 토글 */
  toggleEditorChatTool?(toolName: string): void;
  /** 채팅 스트리밍 상태 변경 */
  setEditorChatStreaming?(streaming: boolean): void;
  /** Tool 승인 요청 설정 */
  setPendingToolApproval?(approval: PendingToolApproval): void;
  /** Tool 승인 요청 제거 */
  clearPendingToolApproval?(): void;
  /** 특정 대화의 Tool 승인 요청 제거 */
  clearPendingToolApprovalForConversation?(conversationId: string): void;
  /** 세션 전체 Tool 자동 승인 설정 */
  setAlwaysApproveToolsForSession?(approve: boolean): void;
  /** 활성 파일 선택 영역 설정 */
  setActiveFileSelection?(
    selection: {
      text: string;
      range: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      };
    } | null
  ): void;

  /** Selection 교체 이벤트 구독 (컨텍스트 메뉴에서 사용) */
  onReplaceSelection?(handler: (code: string) => void): () => void;
}

/**
 * LangGraph Stream Event
 */
export interface LangGraphStreamEvent {
  type:
    | 'progress'
    | 'streaming'
    | 'node'
    | 'tool_approval_request'
    | 'tool_approval_result'
    | 'message';
  conversationId?: string;
  messageId?: string;
  data?: any;
  chunk?: string;
  toolCalls?: any[];
  approved?: boolean;
  note?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  approvalHistory?: ApprovalHistoryEntry[];
  traceMetrics?: AgentTraceMetrics;
  message?: any;
}

/**
 * Chat API for Extensions
 */
export interface ChatAPI {
  /** 채팅 메시지 목록 (읽기 전용) */
  readonly messages: ReadonlyArray<ChatMessage>;

  /** 메시지 추가 */
  addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): void;
  /** 메시지 업데이트 */
  updateMessage(id: string, content: string): void;
  /** 메시지 삭제 */
  deleteMessage(id: string): void;
  /** 모든 메시지 삭제 */
  clearMessages(): void;

  /** 메시지 변경 이벤트 구독 */
  onDidChangeMessages(callback: (messages: ReadonlyArray<ChatMessage>) => void): () => void;

  /** LangGraph 스트림 시작 (Editor Agent) */
  stream?(
    graphConfig: any,
    messages: Message[],
    conversationId: string,
    comfyUIConfig?: any,
    networkConfig?: any,
    workingDirectory?: string
  ): Promise<void>;

  /** LangGraph 스트림 중단 */
  abort?(conversationId: string): Promise<void>;

  /** LangGraph 스트림 이벤트 구독 */
  onStreamEvent?(handler: (event: LangGraphStreamEvent) => void): () => void;

  /** Tool 실행 승인 응답 */
  respondToolApproval?(conversationId: string, approved: boolean): Promise<void>;
}

/**
 * LLM API for Extensions
 *
 * Editor 기능을 위한 LLM 호출 API
 */
export interface LLMAPI {
  /**
   * Editor 자동완성 (Inline Autocomplete)
   */
  editorAutocomplete(context: {
    code: string;
    cursorPosition: number;
    language?: string;
    useRag?: boolean;
    useTools?: boolean;
  }): Promise<{
    success: boolean;
    data?: { completion: string };
    error?: string;
  }>;

  /**
   * Editor 액션 (컨텍스트 메뉴)
   */
  editorAction(params: {
    action:
      | 'explain'
      | 'fix'
      | 'improve'
      | 'complete'
      | 'add-comments'
      | 'generate-tests'
      | 'continue'
      | 'make-shorter'
      | 'make-longer'
      | 'simplify'
      | 'fix-grammar'
      | 'summarize'
      | 'translate'
      | 'custom';
    text: string;
    language?: string;
    targetLanguage?: string;
    customPrompt?: string;
    context?: {
      before: string;
      after: string;
      fullCode?: string;
      filePath?: string;
      lineStart: number;
      lineEnd: number;
      useRag?: boolean;
      useTools?: boolean;
    };
  }): Promise<{
    success: boolean;
    data?: { result: string };
    error?: string;
  }>;
}

/**
 * Extension API Context
 *
 * Extension의 컴포넌트가 앱 상태와 상호작용할 수 있는 안전한 API를 제공합니다.
 * React Hook (useExtensionAPIContext)을 통해 접근합니다.
 */
export interface ExtensionAPIContext {
  /** Extension 고유 ID */
  readonly extensionId: string;
  /** Extension 이름 */
  readonly extensionName: string;
  /** Extension 버전 */
  readonly version: string;
  /** Extension 활성화 상태 */
  readonly isActive: boolean;

  /** 파일 시스템 API */
  readonly files: FileSystemAPI;
  /** 작업공간 API */
  readonly workspace: WorkspaceAPI;
  /** UI API */
  readonly ui: UIAPI;
  /** 에디터 API (Extension별로 다를 수 있음) */
  readonly editor?: EditorAPI;
  /** 채팅 API */
  readonly chat: ChatAPI;
  /** LLM API */
  readonly llm?: LLMAPI;

  /** Extension 비활성화 시 호출될 콜백 등록 */
  subscribeToDeactivation(callback: () => void): void;
}
