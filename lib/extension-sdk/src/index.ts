/**
 * SEPilot Extension SDK
 *
 * Core SDK for developing SEPilot Desktop extensions
 */

// Types
export type {
  ExtensionManifest,
  ExtensionDefinition,
  ExtensionRegistryEntry,
  ExtensionContext,
  ExtensionRuntimeContext,
  ExtensionEventType,
  ExtensionEvent,
  IPCBridge,
  Logger,
  LLMProvider,
  LLMChatOptions,
  LLMChatResponse,
  AgentFactory,
  StoreSliceCreator,
  // Permission types
  ExtensionPermission,
  PermissionCheckResult,
  ManifestValidationResult,
  // Extension API Context types
  ExtensionAPIContext,
  FileSystemAPI,
  WorkspaceAPI,
  UIAPI,
  EditorAPI,
  ChatAPI,
  LLMAPI,
  OpenFile,
  ChatMessage,
  EditorAppearanceConfig,
  LangGraphStreamEvent,
  PendingToolApproval,
  // Agent types
  AgentManifest,
  AgentBuilder,
  AgentInfo,
  AgentRunOptions,
  // Tool types
  ToolRegistry,
  Tool,
  // Command types
  CommandAPI,
  CommandHandler,
  Disposable,
  // UI types
  ToastOptions,
  DialogOptions,
  DialogResult,
  StatusBarItemOptions,
  StatusBarItem,
  QuickPickItem,
  QuickPickOptions,
  // Workspace types
  FileChangeEvent,
  // Vector DB types
  VectorDBAccess,
  VectorSearchOptions,
  VectorSearchResult,
  VectorDocument,
  // MCP types
  MCPAccess,
  MCPToolInfo,
  MCPServerInfo,
  // Skills types
  SkillsAccess,
  SkillInfo,
  SkillDetail,
  ExtensionDiagnosticResult,
} from './types/extension';

// Export constants
export { MANIFEST_REQUIRED_FIELDS, PERMISSION_CATEGORIES } from './types/extension';

// Utils
export {
  cn,
  logger,
  createLogger,
  isElectron,
  isWeb,
  isMac,
  isWindows,
  isLinux,
  getEnvironment,
  getElectronAPI,
  safeElectronAPI,
  platform,
  generateId,
  generateUUID,
  generateShortId,
  // Validation utilities
  validateManifest,
  validateExtensionManifest,
  validateAgentManifest,
  validateExtensionManifestSafe,
  validateManifest as validateExtensionManifestV2,
  isValidPermission,
  getPermissionCategory,
  isValidExtensionId,
  isValidSemver,
  // Copy/Paste utilities
  copyToClipboard,
  readFromClipboard,
  // File language utilities
  getLanguageFromFilename,
  getLanguageFromExtension,
  isCodeFile,
  getFileExtension,
  type Environment,
} from './utils';

// IPC
export { createIPCBridge, ipcBridge, MockIPCBridge } from './ipc';

// Runtime
export {
  createExtensionContext,
  createMockContext,
  ExtensionAPIContextProvider,
  useExtensionAPIContext,
  type ExtensionAPIContextProviderProps,
} from './runtime';

// UI Components - re-export all from ui/index
export * from './ui';

// Re-export shared types for convenience
export type {
  Message,
  ToolCall,
  ImageAttachment,
  FileChange,
  ReferencedDocument,
} from './types/message';
export type {
  ThinkingMode,
  GraphConfig,
  ToolResult,
  ToolApprovalCallback,
  StreamEvent,
  GraphOptions,
} from './types/graph';
export type { LLMOptions, LLMResponse, LLMTool, StreamChunk } from './types/llm';
export type {
  NetworkConfig,
  SupportedLanguage,
  ComfyUIConfig,
  NanoBananaConfig,
  ImageGenConfig,
} from './types/config';
export type { AgentState, CodingAgentState, GeneratedImage } from './types/agent-state';
export type {
  ChatConfig,
  ChatMode,
  ChatFeatures,
  ChatStyle,
  ChatDataSource,
} from './types/chat-config';

// Services
export {
  registerHostServices,
  getHostServices,
  isHostServicesRegistered,
} from './services/host-services';
export type {
  HostServices,
  HostDatabaseService,
  HostNetworkService,
  HostImageGenService,
  HostMCPService,
  HostLLMService,
} from './services/host-services';

// UI Host Components
export {
  registerHostUIComponents,
  getSettingsSectionHeader,
  getErrorBoundary,
  getHostUIComponents,
} from './ui/host-components';
export type { HostUIComponents } from './ui/host-components';

// Host Hooks
export { registerHostHooks, useTerminalHotkeys, getHostHooks } from './hooks/host-hooks';
export type { HostHooks } from './hooks/host-hooks';

// Extension Hooks
export { useLangGraphStream } from './hooks/use-langgraph-stream';
export { useResizeObserver } from './hooks/use-resize-observer';
