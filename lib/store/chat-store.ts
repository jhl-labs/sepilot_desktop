import { create } from 'zustand';
import {
  Conversation,
  Message,
  PendingToolApproval,
  ImageGenerationProgress,
  ConversationChatSettings,
  AgentProgress,
} from '@/types';
import { generateId } from '@/lib/utils/id-generator';
import type {
  GraphType,
  ThinkingMode,
  GraphConfig,
  InputTrustLevel,
} from '@/lib/domains/agent/types';
import { isElectron } from '@/lib/platform';
// Extension 타입 imports (타입은 런타임에 영향 없으므로 유지)
import type {
  BrowserAgentLogEntry,
  BrowserAgentLLMConfig,
  BrowserChatFontConfig,
} from '@/resources/extensions/browser/src/types';
import type { Persona } from '@/types/persona';
import { BUILTIN_PERSONAS } from '@/types/persona';
import {
  DEFAULT_EDITOR_APPEARANCE,
  DEFAULT_EDITOR_LLM_PROMPTS,
  type EditorAppearanceConfig,
  type EditorLLMPromptsConfig,
} from '@/lib/store/editor-defaults';
import {
  mergeExtensionStoreSlices,
  type ExtensionStoreState,
  type AppMode,
} from './extension-slices';
import type { ExtensionDefinition, ExtensionRuntimeContext } from '@/lib/extensions/types';
import type { ScheduledTask, ExecutionRecord, ExecutionHistoryQuery } from '@/types/scheduler';
import { chunkArray } from '@/lib/utils/batch';

// App mode types
import { logger } from '@/lib/utils/logger';
import { getI18nInstance } from '@/lib/i18n';

// Re-export AppMode for backward compatibility
export type { AppMode };

// Open file tab interface
export interface OpenFile {
  path: string;
  filename: string;
  content: string;
  language?: string;
  isDirty: boolean; // Has unsaved changes
  initialPosition?: {
    lineNumber: number;
    column?: number;
  };
}

// Web fallback: localStorage 헬퍼 함수들
const STORAGE_KEYS = {
  CONVERSATIONS: 'sepilot_conversations',
  MESSAGES: 'sepilot_messages',
  PENDING_TOOL_APPROVAL: 'sepilot_pending_tool_approval',
};

const PENDING_APPROVAL_MAX_AGE_MS = 15 * 60 * 1000;
const DUPLICATE_MESSAGE_SAVE_BATCH_SIZE = 100;

function loadFromLocalStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') {
    return defaultValue;
  }
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
    return defaultValue;
  }
}

function saveToLocalStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
}

function loadPendingToolApprovalFromStorage(): PendingToolApproval | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const parsed = loadFromLocalStorage<PendingToolApproval | null>(
    STORAGE_KEYS.PENDING_TOOL_APPROVAL,
    null
  );
  if (!parsed) {
    return null;
  }

  const isExpired = Date.now() - parsed.timestamp > PENDING_APPROVAL_MAX_AGE_MS;
  if (isExpired) {
    localStorage.removeItem(STORAGE_KEYS.PENDING_TOOL_APPROVAL);
    return null;
  }

  if (
    typeof parsed.conversationId !== 'string' ||
    typeof parsed.messageId !== 'string' ||
    !Array.isArray(parsed.toolCalls)
  ) {
    localStorage.removeItem(STORAGE_KEYS.PENDING_TOOL_APPROVAL);
    return null;
  }

  return parsed;
}

function persistPendingToolApproval(approval: PendingToolApproval | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (!approval) {
    localStorage.removeItem(STORAGE_KEYS.PENDING_TOOL_APPROVAL);
    return;
  }
  saveToLocalStorage(STORAGE_KEYS.PENDING_TOOL_APPROVAL, approval);
}

function getPendingApprovalIdentity(approval: PendingToolApproval): string {
  if (typeof approval.requestKey === 'string' && approval.requestKey.trim().length > 0) {
    return `key:${approval.requestKey}`;
  }
  return `msg:${approval.conversationId}:${approval.messageId}`;
}

function getPendingApprovalQueueFromState(state: {
  pendingToolApproval: PendingToolApproval | null;
  pendingToolApprovalQueue?: PendingToolApproval[];
}): PendingToolApproval[] {
  if (Array.isArray(state.pendingToolApprovalQueue) && state.pendingToolApprovalQueue.length > 0) {
    return [...state.pendingToolApprovalQueue];
  }
  return state.pendingToolApproval ? [state.pendingToolApproval] : [];
}

// Load working directory from localStorage and verify it exists
async function loadWorkingDirectory(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const savedDir = localStorage.getItem('sepilot_working_directory');
    if (!savedDir) {
      return null;
    }

    // Verify directory exists (only in Electron)
    if (window.electronAPI?.fs) {
      try {
        const result = await window.electronAPI.fs.readDirectory(savedDir);
        if (result.success) {
          return savedDir;
        } else {
          // Directory no longer exists, remove from localStorage
          localStorage.removeItem('sepilot_working_directory');
          return null;
        }
      } catch (error) {
        console.error('Failed to verify directory:', error);
        localStorage.removeItem('sepilot_working_directory');
        return null;
      }
    }

    // Web environment or no fs API, return saved directory
    return savedDir;
  } catch (error) {
    console.error('Failed to load working directory:', error);
    return null;
  }
}

type ChatStore = ExtensionStoreState & {
  // State
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  messagesCache: Map<string, Message[]>; // conversationId -> messages cache (for background streaming)
  streamingConversations: Map<string, string>; // conversationId -> messageId mapping
  isLoading: boolean;
  isAppFocused: boolean; // Window focus state (for background streaming notifications)

  // App Mode (Chat vs Editor)
  appMode: AppMode;

  // Editor State
  openFiles: OpenFile[];
  activeFilePath: string | null;
  activeEditorTab: 'files' | 'search' | 'browser'; // Files, Search, or Browser tab in Editor mode
  showTerminalPanel: boolean; // Show/hide terminal panel in Editor mode
  fileClipboard: { operation: 'copy' | 'cut'; paths: string[] } | null; // File clipboard for copy/cut/paste

  // New: Thinking Mode and Feature Toggles
  thinkingMode: ThinkingMode;
  inputTrustLevel: InputTrustLevel;
  enableRAG: boolean;
  enableTools: boolean;
  enabledTools: Set<string>; // Individual tool enable/disable
  enableImageGeneration: boolean;
  selectedImageGenProvider: 'comfyui' | 'nanobanana' | null; // User-selected provider for this session
  workingDirectory: string | null; // Coding Agent working directory

  // Scheduler State
  scheduledTasks: ScheduledTask[];
  executionHistory: ExecutionRecord[];
  isLoadingTasks: boolean;
  isLoadingHistory: boolean;

  // Saved settings for image generation mode (restored when disabling image generation)
  savedThinkingMode: ThinkingMode | null;
  savedEnableRAG: boolean | null;
  savedEnableTools: boolean | null;

  // Tool Approval (Human-in-the-loop)
  pendingToolApproval: PendingToolApproval | null;
  pendingToolApprovalQueue: PendingToolApproval[];
  alwaysApproveToolsForSession: boolean; // Session-wide auto-approval (like Claude Code)

  // Editor Selection State (for Agent Interaction)
  activeFileSelection: {
    text: string;
    range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    } | null;
  } | null;

  // Image Generation Progress (per conversation)
  imageGenerationProgress: Map<string, ImageGenerationProgress>; // conversationId -> progress

  // Agent Progress (Coding Agent, Editor Agent 등)
  agentProgress: Map<string, AgentProgress>; // conversationId -> progress

  // Cowork Agent 상태
  coworkPlan: import('@/lib/domains/agent/types').CoworkPlan | null;
  coworkTeamStatus: 'idle' | 'planning' | 'executing' | 'synthesizing';
  coworkTokensConsumed: number;
  coworkTotalTokenBudget: number;

  // Browser Mode Chat (simple side chat)
  browserChatMessages: Message[];
  browserViewMode: 'chat' | 'snapshots' | 'bookmarks' | 'tools' | 'logs';

  // Browser Agent Logs (실행 과정 가시성)
  browserAgentLogs: BrowserAgentLogEntry[];
  browserAgentIsRunning: boolean;
  browserAgentStreamCleanup: (() => void) | null; // Stream cleanup function

  // Browser Agent LLM 설정
  browserAgentLLMConfig: BrowserAgentLLMConfig;

  // Browser Chat 폰트 설정
  browserChatFontConfig: BrowserChatFontConfig;

  // Editor Mode Chat (simple side chat for AI coding assistant)
  editorChatMessages: Message[];
  editorViewMode: 'files' | 'wiki' | 'search' | 'chat' | 'settings'; // files, wiki, search, chat, or settings view in Editor sidebar
  editorChatStreaming: boolean; // Editor chat streaming 상태 (백그라운드 스트리밍 지원)
  fileTreeRefreshTrigger: number; // File tree refresh trigger (timestamp)
  expandedFolderPaths: Set<string>; // Expanded folder paths in file tree

  // Editor Settings
  editorAppearanceConfig: EditorAppearanceConfig;
  editorLLMPromptsConfig: EditorLLMPromptsConfig;
  editorChatUseRag: boolean; // RAG usage in editor chat
  editorChatUseTools: boolean; // MCP Tools usage in editor chat
  editorChatEnabledTools: Set<string>; // Enabled tools for editor chat
  editorAgentMode: 'editor' | 'coding'; // Agent 모드 (editor-agent 또는 coding-agent)
  editorUseRagInAutocomplete: boolean; // RAG usage in editor autocomplete
  editorUseToolsInAutocomplete: boolean; // Tools usage in editor autocomplete
  editorEnableInlineAutocomplete: boolean; // Inline autocomplete enabled

  // Chat Mode View
  chatViewMode: 'history' | 'documents'; // history or documents view in Chat sidebar

  // Persona (AI Bot Role/System Prompt)
  personas: Persona[]; // 사용 가능한 페르소나 목록 (기본 + 사용자 생성)
  activePersonaId: string | null; // 현재 활성화된 페르소나 ID

  // Extension Registry State
  activeExtensions: ExtensionDefinition[]; // 활성화된 Extension 목록 (Registry와 동기화)
  extensionsVersion: number; // Extension 상태 변경 시 증가 (리렌더링 트리거)

  // Deprecated: kept for backward compatibility
  graphType: GraphType;
  isStreaming: boolean;
  streamingMessageId: string | null;

  // Actions - Conversations
  createConversation: () => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  duplicateConversation: (id: string) => Promise<string>;
  setActiveConversation: (id: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
  updateConversationPersona: (id: string, personaId: string | null) => Promise<void>;
  updateConversationSettings: (id: string, settings: ConversationChatSettings) => Promise<void>;
  togglePinConversation: (id: string) => Promise<void>;
  loadConversations: () => Promise<void>;
  searchConversations: (
    query: string
  ) => Promise<Array<{ conversation: Conversation; matchedMessages: Message[] }>>;

  // Actions - Messages
  addMessage: (
    message: Omit<Message, 'id' | 'created_at'>,
    conversationId?: string
  ) => Promise<Message>;
  updateMessage: (id: string, updates: Partial<Message>, conversationId?: string) => void;
  deleteMessage: (id: string) => Promise<void>;
  clearMessages: () => void;
  clearMessagesCache: (conversationId: string) => void;

  // Actions - Streaming
  startStreaming: (conversationId: string, messageId: string) => void;
  stopStreaming: (conversationId: string) => void;
  isConversationStreaming: (conversationId: string) => boolean;
  setAppFocused: (focused: boolean) => void;

  // Actions - Graph Config
  setThinkingMode: (mode: ThinkingMode) => void;
  setInputTrustLevel: (level: InputTrustLevel) => void;
  setEnableRAG: (enable: boolean) => void;
  setEnableTools: (enable: boolean) => void;
  toggleTool: (toolName: string) => void;
  enableAllTools: (toolNames: string[]) => void;
  disableAllTools: () => void;
  setEnableImageGeneration: (enable: boolean) => void;
  setSelectedImageGenProvider: (provider: 'comfyui' | 'nanobanana' | null) => void;
  setWorkingDirectory: (directory: string | null) => void;
  getGraphConfig: () => GraphConfig;

  // Actions - Tool Approval (Human-in-the-loop)
  setPendingToolApproval: (approval: PendingToolApproval) => void;
  clearPendingToolApproval: () => void;
  clearPendingToolApprovalForConversation: (conversationId: string) => void;
  clearAllPendingToolApprovals: () => void;
  setAlwaysApproveToolsForSession: (enable: boolean) => void;

  // Actions - Image Generation Progress
  setImageGenerationProgress: (progress: ImageGenerationProgress) => void;
  updateImageGenerationProgress: (
    conversationId: string,
    updates: Partial<ImageGenerationProgress>
  ) => void;
  clearImageGenerationProgress: (conversationId: string) => void;
  getImageGenerationProgress: (conversationId: string) => ImageGenerationProgress | undefined;

  // Actions - Agent Progress
  setAgentProgress: (conversationId: string, progress: AgentProgress) => void;
  updateAgentProgress: (conversationId: string, updates: Partial<AgentProgress>) => void;
  clearAgentProgress: (conversationId: string) => void;
  getAgentProgress: (conversationId: string) => AgentProgress | undefined;

  // Actions - Cowork
  setCoworkPlan: (plan: import('@/lib/domains/agent/types').CoworkPlan | null) => void;
  updateCoworkTaskStatus: (
    taskId: string,
    status: import('@/lib/domains/agent/types').CoworkTaskStatus,
    result?: string
  ) => void;
  setCoworkTeamStatus: (status: 'idle' | 'planning' | 'executing' | 'synthesizing') => void;
  resetCoworkState: () => void;

  // Actions - Browser Chat
  addBrowserChatMessage: (message: Omit<Message, 'id' | 'created_at' | 'conversation_id'>) => void;
  updateBrowserChatMessage: (id: string, updates: Partial<Message> | string) => void;
  clearBrowserChat: () => void;
  setBrowserViewMode: (
    mode: 'chat' | 'snapshots' | 'bookmarks' | 'tools' | 'logs' | 'settings'
  ) => void;

  // Actions - Extension-specific: Provided by Extension Store Slices

  // Actions - Browser Agent Logs
  addBrowserAgentLog: (log: Omit<BrowserAgentLogEntry, 'id' | 'timestamp'>) => void;
  clearBrowserAgentLogs: () => void;
  setBrowserAgentStreamCleanup: (cleanup: (() => void) | null) => void;
  setBrowserAgentIsRunning: (isRunning: boolean) => void;

  // Actions - Browser Agent LLM Config
  setBrowserAgentLLMConfig: (config: Partial<BrowserAgentLLMConfig>) => void;
  resetBrowserAgentLLMConfig: () => void;

  // Actions - Browser Chat Font Config
  setBrowserChatFontConfig: (config: Partial<BrowserChatFontConfig>) => void;
  resetBrowserChatFontConfig: () => void;

  // Actions - Editor Chat
  addEditorChatMessage: (message: Omit<Message, 'id' | 'created_at' | 'conversation_id'>) => void;
  updateEditorChatMessage: (id: string, updates: Partial<Message>) => void;
  clearEditorChat: () => void;
  setEditorViewMode: (mode: 'files' | 'wiki' | 'search' | 'chat' | 'settings') => void;
  setEditorChatStreaming: (isStreaming: boolean) => void;
  refreshFileTree: () => void;
  toggleExpandedFolder: (path: string) => void;
  addExpandedFolders: (paths: string[]) => void;
  clearExpandedFolders: () => void;

  // Actions - Editor Settings
  setEditorAppearanceConfig: (config: Partial<EditorAppearanceConfig>) => void;
  resetEditorAppearanceConfig: () => void;
  setEditorLLMPromptsConfig: (config: Partial<EditorLLMPromptsConfig>) => void;
  resetEditorLLMPromptsConfig: () => void;
  setEditorChatUseRag: (enable: boolean) => void;
  setEditorChatUseTools: (enable: boolean) => void;
  toggleEditorChatTool: (toolName: string) => void;
  setEditorAgentMode: (mode: 'editor' | 'coding') => void;
  setEditorUseRagInAutocomplete: (enable: boolean) => void;
  setEditorUseToolsInAutocomplete: (enable: boolean) => void;
  setEditorEnableInlineAutocomplete: (enable: boolean) => void;

  // Actions - Chat Mode View
  setChatViewMode: (mode: 'history' | 'documents') => void;

  // Actions - Initialization
  loadWorkingDirectory: () => Promise<void>;

  // Actions - Persona
  loadPersonas: () => Promise<void>;
  addPersona: (
    persona: Omit<Persona, 'id' | 'isBuiltin' | 'created_at' | 'updated_at'>
  ) => Promise<void>;
  updatePersona: (
    id: string,
    updates: Partial<Omit<Persona, 'id' | 'isBuiltin' | 'created_at'>>
  ) => Promise<void>;
  deletePersona: (id: string) => Promise<void>;
  setActivePersona: (personaId: string | null) => void;

  // Actions - App Mode
  setAppMode: (mode: AppMode) => void;
  setActiveEditorTab: (tab: 'files' | 'search') => void;
  setShowTerminalPanel: (show: boolean) => void;

  // Actions - File Clipboard
  setFileClipboard: (clipboard: { operation: 'copy' | 'cut'; paths: string[] } | null) => void;
  copyFiles: (paths: string[]) => void;
  cutFiles: (paths: string[]) => void;
  clearFileClipboard: () => void;

  // Actions - Editor
  openFile: (
    file: Omit<OpenFile, 'isDirty'> & { initialPosition?: { lineNumber: number; column?: number } }
  ) => void;
  closeFile: (path: string) => void;
  closeOtherFiles: (path: string) => void;
  closeFilesToRight: (path: string) => void;
  closeSavedFiles: () => void;
  setActiveFile: (path: string | null) => void;
  updateFileContent: (path: string, content: string) => void;
  markFileDirty: (path: string, isDirty: boolean) => void;
  clearInitialPosition: (path: string) => void;
  closeAllFiles: () => void;
  reorderFiles: (fromIndex: number, toIndex: number) => void;
  setActiveFileSelection: (
    selection: {
      text: string;
      range: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      } | null;
    } | null
  ) => void;

  // Actions - Extensions
  updateActiveExtensions: (extensions: ExtensionDefinition[]) => void;
  refreshExtensions: () => void;

  // Actions - Scheduler
  loadTasks: () => Promise<void>;
  createTask: (task: ScheduledTask) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<ScheduledTask>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  runTaskNow: (taskId: string) => Promise<void>;
  loadExecutionHistory: (taskId?: string, filters?: ExecutionHistoryQuery) => Promise<void>;

  // Deprecated: kept for backward compatibility
  setGraphType: (type: GraphType) => void;
};

/**
 * Extension Runtime Context 생성
 * Extension의 createStoreSlice 함수에 전달될 runtime context를 생성합니다.
 */
function createExtensionRuntimeContext(): ExtensionRuntimeContext {
  return {
    // IPC Bridge
    ipc: {
      invoke: async <T>(channel: string, data?: any) => {
        if (!isElectron() || !window.electronAPI) {
          logger.warn(`[ExtensionRuntime] IPC invoke failed: Electron API not available`, {
            channel,
          });
          return {
            success: false,
            error: 'Electron API not available',
          };
        }
        return window.electronAPI.invoke(channel, data) as Promise<{
          success: boolean;
          data?: T;
          error?: string;
        }>;
      },
      on: (channel: string, handler: (data: any) => void) => {
        if (!isElectron() || !window.electronAPI) {
          logger.warn(`[ExtensionRuntime] IPC on failed: Electron API not available`, { channel });
          return () => {};
        }
        const cleanup = window.electronAPI.on(channel, handler);
        return typeof cleanup === 'function' ? cleanup : () => {};
      },
      send: (channel: string, data?: any) => {
        if (!isElectron() || !window.electronAPI) {
          logger.warn(`[ExtensionRuntime] IPC send failed: Electron API not available`, {
            channel,
          });
          return;
        }
        // ElectronAPI에 send가 없으면 invoke로 대체 (non-blocking)
        if ('send' in window.electronAPI && typeof window.electronAPI.send === 'function') {
          (window.electronAPI as any).send(channel, data);
        } else {
          // send가 없으면 invoke로 처리 (fire-and-forget)
          window.electronAPI.invoke(channel, data).catch((err: any) => {
            logger.error(`[ExtensionRuntime] IPC send via invoke failed`, { channel, error: err });
          });
        }
      },
    },

    // Logger
    logger: {
      info: (message: string, meta?: any) => logger.info(message, meta),
      warn: (message: string, meta?: any) => logger.warn(message, meta),
      error: (message: string, meta?: any) => logger.error(message, meta),
      debug: (message: string, meta?: any) => logger.debug(message, meta),
    },

    // Platform detection
    platform: {
      isElectron: () => isElectron(),
      isMac: () =>
        typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0,
      isWindows: () =>
        typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('WIN') >= 0,
      isLinux: () =>
        typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('LINUX') >= 0,
    },

    // Optional: LLM provider (미래 확장용)
    llm: undefined,

    // Optional: Agent factory (미래 확장용)
    agent: undefined,
  };
}

const initialPendingToolApproval = loadPendingToolApprovalFromStorage();

export const useChatStore = create<ChatStore>((set, get) => ({
  // Extension Slices: All extension store slices are integrated first
  ...mergeExtensionStoreSlices(set as any, get as any, createExtensionRuntimeContext()),

  // Initial state
  conversations: [],
  activeConversationId: null,
  messages: [],
  messagesCache: new Map<string, Message[]>(),
  streamingConversations: new Map<string, string>(),
  isLoading: false,
  isAppFocused: true, // Initially focused

  // App Mode
  appMode: 'chat',

  // Editor State
  openFiles: [],
  activeFilePath: null,
  activeEditorTab: 'files',
  showTerminalPanel: false,
  fileClipboard: null,

  // New: Graph Configuration
  thinkingMode: 'instant',
  inputTrustLevel: 'trusted',
  enableRAG: false,
  enableTools: false,
  enabledTools: new Set<string>(),
  enableImageGeneration: false,
  selectedImageGenProvider: null,
  workingDirectory: null,

  // Saved settings for image generation mode
  savedThinkingMode: null,
  savedEnableRAG: null,
  savedEnableTools: null,

  // Tool Approval (Human-in-the-loop)
  pendingToolApproval: initialPendingToolApproval,
  pendingToolApprovalQueue: initialPendingToolApproval ? [initialPendingToolApproval] : [],
  alwaysApproveToolsForSession: false,
  activeFileSelection: null,

  // Image Generation Progress
  imageGenerationProgress: new Map<string, ImageGenerationProgress>(),

  // Agent Progress
  agentProgress: new Map<string, AgentProgress>(),

  // Cowork
  coworkPlan: null,
  coworkTeamStatus: 'idle' as const,
  coworkTokensConsumed: 0,
  coworkTotalTokenBudget: 200000,

  // Browser Chat
  browserChatMessages: [],
  browserViewMode: 'chat',

  // Extension Features: Provided by Extension Store Slices

  // Browser Agent Logs
  browserAgentLogs: [],
  browserAgentIsRunning: false,
  browserAgentStreamCleanup: null,

  // Browser Agent LLM Config (localStorage에서 로드 또는 기본값)
  browserAgentLLMConfig: (() => {
    const defaultConfig: BrowserAgentLLMConfig = {
      maxTokens: 4096,
      temperature: 0.7,
      topP: 1.0,
      maxIterations: 30,
    };

    if (typeof window === 'undefined') {
      return defaultConfig;
    }

    try {
      const saved = localStorage.getItem('sepilot_browser_agent_llm_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultConfig, ...parsed };
      }
    } catch (error) {
      console.error('Failed to load Browser Agent LLM config from localStorage:', error);
    }

    return defaultConfig;
  })(),

  // Browser Chat Font Config (localStorage에서 로드 또는 기본값)
  browserChatFontConfig: (() => {
    const defaultConfig: BrowserChatFontConfig = {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 14,
    };

    if (typeof window === 'undefined') {
      return defaultConfig;
    }

    try {
      const saved = localStorage.getItem('sepilot_browser_chat_font_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultConfig, ...parsed };
      }
    } catch (error) {
      console.error('Failed to load Browser Chat Font config from localStorage:', error);
    }

    return defaultConfig;
  })(),

  // Editor Chat
  editorChatMessages: [],
  editorViewMode: 'files',
  editorChatStreaming: false,
  fileTreeRefreshTrigger: 0,
  expandedFolderPaths: new Set<string>(),

  // Editor Appearance Config
  editorAppearanceConfig: (() => {
    if (typeof window === 'undefined') {
      return DEFAULT_EDITOR_APPEARANCE;
    }
    try {
      const saved = localStorage.getItem('sepilot_editor_appearance_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_EDITOR_APPEARANCE, ...parsed };
      }
    } catch (error) {
      console.error('Failed to load Editor Appearance config from localStorage:', error);
    }
    return DEFAULT_EDITOR_APPEARANCE;
  })(),

  // Editor LLM Prompts Config
  editorLLMPromptsConfig: (() => {
    if (typeof window === 'undefined') {
      return DEFAULT_EDITOR_LLM_PROMPTS;
    }
    try {
      const saved = localStorage.getItem('sepilot_editor_llm_prompts_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_EDITOR_LLM_PROMPTS, ...parsed };
      }
    } catch (error) {
      console.error('Failed to load Editor LLM Prompts config from localStorage:', error);
    }
    return DEFAULT_EDITOR_LLM_PROMPTS;
  })(),

  editorChatUseRag: (() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      const saved = localStorage.getItem('sepilot_editor_chat_use_rag');
      return saved === 'true';
    } catch (error) {
      console.error('Failed to load editor RAG setting from localStorage:', error);
    }
    return false;
  })(),

  editorChatUseTools: (() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      const saved = localStorage.getItem('sepilot_editor_chat_use_tools');
      return saved === 'true';
    } catch (error) {
      console.error('Failed to load editor Tools setting from localStorage:', error);
    }
    return false;
  })(),

  editorChatEnabledTools: new Set<string>(),

  editorAgentMode: (() => {
    if (typeof window === 'undefined') {
      return 'editor';
    }
    try {
      const saved = localStorage.getItem('sepilot_editor_agent_mode');
      return (saved === 'coding' ? 'coding' : 'editor') as 'editor' | 'coding';
    } catch (error) {
      console.error('Failed to load editor agent mode from localStorage:', error);
    }
    return 'editor';
  })(),

  editorUseRagInAutocomplete: (() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      const saved = localStorage.getItem('sepilot_editor_use_rag_in_autocomplete');
      return saved === 'true';
    } catch (error) {
      console.error('Failed to load editor autocomplete RAG setting from localStorage:', error);
    }
    return false;
  })(),

  editorUseToolsInAutocomplete: (() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      const saved = localStorage.getItem('sepilot_editor_use_tools_in_autocomplete');
      return saved === 'true';
    } catch (error) {
      console.error('Failed to load editor autocomplete Tools setting from localStorage:', error);
    }
    return false;
  })(),

  editorEnableInlineAutocomplete: (() => {
    if (typeof window === 'undefined') {
      return true; // Default to true
    }
    try {
      const saved = localStorage.getItem('sepilot_editor_enable_inline_autocomplete');
      return saved === null ? true : saved === 'true'; // Default to true if not set
    } catch (error) {
      console.error('Failed to load editor inline autocomplete setting from localStorage:', error);
    }
    return true; // Default to true
  })(),

  // Chat Mode View
  chatViewMode: 'history',

  // Persona
  personas: [...BUILTIN_PERSONAS],
  activePersonaId: 'default',

  // Extension Registry State
  activeExtensions: [],
  extensionsVersion: 0,

  // Deprecated
  graphType: 'chat',
  isStreaming: false,
  streamingMessageId: null,

  // Load conversations from database
  loadConversations: async () => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      if (isElectron() && window.electronAPI) {
        // Electron: SQLite에서 로드
        const result = await window.electronAPI.chat.loadConversations();
        if (result.success && result.data) {
          set({ conversations: result.data });
        }
      } else {
        // Web: localStorage에서 로드
        const conversations = loadFromLocalStorage<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
        set({ conversations });
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  },

  // Conversations
  createConversation: async () => {
    const state = get() as any;

    // Default settings for new conversation
    const defaultChatSettings: ConversationChatSettings = {
      thinkingMode: 'instant',
      inputTrustLevel: 'trusted',
      enableRAG: false,
      enableTools: false,
      enabledTools: [],
      enableImageGeneration: false,
      selectedImageGenProvider: state.selectedImageGenProvider,
    };

    // Determine default title based on current language
    let defaultTitle = '새 대화';
    const i18n = getI18nInstance();
    if (i18n && i18n.isInitialized) {
      defaultTitle = i18n.t('chat.newConversation');
    } else if (typeof window !== 'undefined') {
      try {
        const savedLang = localStorage.getItem('sepilot_language');
        if (savedLang === 'en') {
          defaultTitle = 'New Conversation';
        }
      } catch {
        // localStorage 접근 실패 시 기본값 유지
      }
    }

    const newConversation: Conversation = {
      id: generateId(),
      title: defaultTitle,
      created_at: Date.now(),
      updated_at: Date.now(),
      chatSettings: defaultChatSettings,
    };

    // Save to database or localStorage
    let saved = false;
    if (isElectron() && window.electronAPI) {
      // Electron: SQLite에 저장 시도
      try {
        const result = await window.electronAPI.chat.saveConversation(newConversation);
        if (result.success) {
          saved = true;
        } else {
          console.error('Failed to save conversation to DB:', result.error);
        }
      } catch (error) {
        console.error('Error saving conversation to DB:', error);
      }
    }

    // Update state and fallback to localStorage if DB save failed
    set((currentState: any) => {
      const newConversations = [newConversation, ...currentState.conversations];
      // Web or Electron DB save failed: localStorage에 저장
      if (!saved) {
        saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, newConversations);
      }
      // Initialize empty cache for new conversation
      const newCache = new Map(currentState.messagesCache);
      newCache.set(newConversation.id, []);

      return {
        conversations: newConversations,
        activeConversationId: newConversation.id,
        messages: [],
        messagesCache: newCache,
        // Apply default settings to global state
        thinkingMode: 'instant',
        inputTrustLevel: 'trusted',
        enableRAG: false,
        enableTools: false,
        enabledTools: new Set(),
        enableImageGeneration: false,
      };
    });

    return newConversation.id;
  },

  deleteConversation: async (id: string) => {
    const state = get() as any;
    const wasActive = state.activeConversationId === id;
    const wasStreaming = state.streamingConversations.has(id);

    // If the conversation was streaming, abort the specific stream.
    // Note: Do NOT call removeAllStreamListeners() here — it removes ALL
    // langgraph-stream-event listeners globally, which kills Extension
    // (Editor, Browser) stream listeners too. abort(id) already cleans up
    // the specific conversation's stream and sends langgraph-stream-done.
    if (wasStreaming && isElectron() && window.electronAPI?.langgraph) {
      try {
        await window.electronAPI.langgraph.abort(id);
        console.warn(`[deleteConversation] Aborted streaming for conversation: ${id}`);
      } catch (error) {
        console.error('[deleteConversation] Failed to abort streaming:', error);
      }
    }

    // Immediately update UI state to prevent input blocking
    // This prevents the textarea from being disabled during async DB operation
    set((currentState: any) => {
      const filtered = currentState.conversations.filter((c: any) => c.id !== id);
      const newActiveId = wasActive ? filtered[0]?.id || null : currentState.activeConversationId;

      // Remove from streaming conversations if it was streaming
      const newStreamingConversations = new Map(currentState.streamingConversations);
      newStreamingConversations.delete(id);

      // Remove from messages cache
      const newCache = new Map(currentState.messagesCache);
      newCache.delete(id);

      // Check if the new active conversation is streaming
      const newActiveIsStreaming = newActiveId ? newStreamingConversations.has(newActiveId) : false;
      const newActiveStreamingMessageId =
        newActiveIsStreaming && newActiveId
          ? newStreamingConversations.get(newActiveId) || null
          : null;

      // Get messages for the new active conversation from cache
      const newMessages: any[] = newActiveId ? (newCache.get(newActiveId) as any[]) || [] : [];

      return {
        conversations: filtered,
        activeConversationId: newActiveId,
        messages: newMessages,
        messagesCache: newCache,
        streamingConversations: newStreamingConversations,
        // Update streaming state based on the NEW active conversation's streaming status
        isStreaming: newActiveIsStreaming,
        streamingMessageId: newActiveStreamingMessageId,
      };
    });

    // If we switched to a different conversation, load its messages
    if (wasActive) {
      const newState = get() as any;
      if (newState.activeConversationId) {
        // Load messages for the new active conversation (non-blocking)
        (get() as any)
          .setActiveConversation(newState.activeConversationId)
          .catch((error: Error) => {
            console.error('[deleteConversation] Failed to load new conversation messages:', error);
          });
      }
    }

    // Delete from database (async, in background)
    let deleted = false;
    if (isElectron() && window.electronAPI) {
      try {
        const result = await window.electronAPI.chat.deleteConversation(id);
        if (result.success) {
          deleted = true;
        } else {
          console.error('Failed to delete conversation from DB:', result.error);
        }
      } catch (error) {
        console.error('Error deleting conversation from DB:', error);
      }
    }

    // If DB delete failed or web mode, delete from localStorage
    if (!deleted) {
      const currentState = get() as any;
      const filtered = currentState.conversations;
      saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, filtered);
      // 메시지도 삭제
      const allMessages = loadFromLocalStorage<Record<string, Message[]>>(
        STORAGE_KEYS.MESSAGES,
        {}
      );
      delete allMessages[id];
      saveToLocalStorage(STORAGE_KEYS.MESSAGES, allMessages);
    }
  },

  duplicateConversation: async (id: string) => {
    const state = get() as any;
    const sourceConversation = state.conversations.find((c: any) => c.id === id);
    if (!sourceConversation) {
      throw new Error('Source conversation not found');
    }

    // Load messages from source conversation
    let sourceMessages: Message[] = [];
    if (isElectron() && window.electronAPI) {
      try {
        const result = await window.electronAPI.chat.loadMessages(id);
        if (result.success && result.data) {
          sourceMessages = result.data;
        }
      } catch (error) {
        console.error('Error loading source messages:', error);
      }
    } else {
      const allMessages = loadFromLocalStorage<Record<string, Message[]>>(
        STORAGE_KEYS.MESSAGES,
        {}
      );
      sourceMessages = allMessages[id] || [];
    }

    // Create new conversation with duplicated data
    const newConversation: Conversation = {
      ...sourceConversation,
      id: generateId(),
      title: `${sourceConversation.title} (복사본)`,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // Duplicate messages with new IDs
    const duplicatedMessages: Message[] = sourceMessages.map((msg: any) => ({
      ...msg,
      id: generateId(),
      conversation_id: newConversation.id,
      created_at: Date.now(),
    }));

    // Save new conversation
    let saved = false;
    if (isElectron() && window.electronAPI) {
      try {
        const result = await window.electronAPI.chat.saveConversation(newConversation);
        if (result.success) {
          let messagesSaved = true;

          if (duplicatedMessages.length > 0) {
            const messageBatches = chunkArray(
              duplicatedMessages,
              DUPLICATE_MESSAGE_SAVE_BATCH_SIZE
            );

            for (const messageBatch of messageBatches) {
              const batchSaveResult = await window.electronAPI.chat.saveMessagesBulk(messageBatch);
              if (!batchSaveResult.success) {
                messagesSaved = false;
                console.error(
                  '[duplicateConversation] Failed to save duplicated message batch:',
                  batchSaveResult.error
                );
                break;
              }
            }
          }

          if (messagesSaved) {
            saved = true;
          } else {
            // Best-effort rollback to avoid partial duplicate in DB
            await window.electronAPI.chat
              .deleteConversation(newConversation.id)
              .catch((rollbackError) => {
                console.error(
                  '[duplicateConversation] Failed to rollback duplicated conversation:',
                  rollbackError
                );
              });
          }
        } else {
          console.error('Failed to save duplicated conversation to DB:', result.error);
        }
      } catch (error) {
        console.error('Error saving duplicated conversation to DB:', error);
      }
    }

    // Update state and fallback to localStorage if DB save failed
    set((currentState: any) => {
      const newConversations = [newConversation, ...currentState.conversations];
      if (!saved) {
        saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, newConversations);
        // Save messages to localStorage
        const allMessages = loadFromLocalStorage<Record<string, Message[]>>(
          STORAGE_KEYS.MESSAGES,
          {}
        );
        allMessages[newConversation.id] = duplicatedMessages;
        saveToLocalStorage(STORAGE_KEYS.MESSAGES, allMessages);
      }

      // Initialize cache for new conversation
      const newCache = new Map(currentState.messagesCache);
      newCache.set(newConversation.id, duplicatedMessages);

      return {
        conversations: newConversations,
        messagesCache: newCache,
      };
    });

    return newConversation.id;
  },

  setActiveConversation: async (id: string) => {
    const state = get() as any;
    const isCurrentlyStreaming = state.streamingConversations.has(id);
    const cachedMessages = state.messagesCache.get(id);

    // Find the conversation to load its settings
    const conversation = state.conversations.find((c: any) => c.id === id);
    if (!conversation) {
      console.error('Conversation not found:', id);
      return;
    }

    // Restore conversation's chat settings to global state
    const conversationSettings = conversation.chatSettings;
    const settingsUpdate: Partial<ChatStore> = {};

    logger.info('[setActiveConversation] Restoring settings for conversation:', id);
    logger.info('[setActiveConversation] Conversation chatSettings:', conversationSettings);

    if (conversationSettings) {
      if (conversationSettings.thinkingMode !== undefined) {
        settingsUpdate.thinkingMode = conversationSettings.thinkingMode;
        logger.info(
          '[setActiveConversation] Restoring thinkingMode:',
          conversationSettings.thinkingMode
        );
      }
      if (conversationSettings.inputTrustLevel !== undefined) {
        settingsUpdate.inputTrustLevel = conversationSettings.inputTrustLevel;
        logger.info(
          '[setActiveConversation] Restoring inputTrustLevel:',
          conversationSettings.inputTrustLevel
        );
      }
      if (conversationSettings.enableRAG !== undefined) {
        settingsUpdate.enableRAG = conversationSettings.enableRAG;
        logger.info('[setActiveConversation] Restoring enableRAG:', conversationSettings.enableRAG);
      }
      if (conversationSettings.enableTools !== undefined) {
        settingsUpdate.enableTools = conversationSettings.enableTools;
        logger.info(
          '[setActiveConversation] Restoring enableTools:',
          conversationSettings.enableTools
        );
      }
      if (conversationSettings.enabledTools !== undefined) {
        settingsUpdate.enabledTools = new Set(conversationSettings.enabledTools);
        logger.info(
          '[setActiveConversation] Restoring enabledTools:',
          conversationSettings.enabledTools
        );
      }
      if (conversationSettings.enableImageGeneration !== undefined) {
        settingsUpdate.enableImageGeneration = conversationSettings.enableImageGeneration;
        logger.info(
          '[setActiveConversation] Restoring enableImageGeneration:',
          conversationSettings.enableImageGeneration
        );
      }
      if (conversationSettings.selectedImageGenProvider !== undefined) {
        settingsUpdate.selectedImageGenProvider = conversationSettings.selectedImageGenProvider;
        logger.info(
          '[setActiveConversation] Restoring selectedImageGenProvider:',
          conversationSettings.selectedImageGenProvider
        );
      }

      const restoredThinkingMode =
        (settingsUpdate.thinkingMode as ThinkingMode | undefined) ?? state.thinkingMode;

      if (restoredThinkingMode === 'cowork') {
        settingsUpdate.enableTools = true;
        settingsUpdate.inputTrustLevel = 'untrusted';
        logger.info('[setActiveConversation] Cowork mode requires tools, forcing enableTools=true');
      }

      if (settingsUpdate.inputTrustLevel === undefined) {
        settingsUpdate.inputTrustLevel =
          restoredThinkingMode === 'cowork' ? 'untrusted' : 'trusted';
      }

      // CRITICAL: Enforce consistency - if image generation is enabled, tools must be enabled
      if (settingsUpdate.enableImageGeneration === true) {
        logger.info(
          '[setActiveConversation] Image generation is enabled, forcing enableTools=true and enableRAG=false'
        );
        settingsUpdate.enableTools = true;
        settingsUpdate.enableRAG = false;
        settingsUpdate.thinkingMode = 'instant';
      }
    } else {
      logger.info('[setActiveConversation] No chatSettings found, using defaults');
      settingsUpdate.inputTrustLevel = 'trusted';
    }

    // If we have cached messages (e.g., from background streaming), use them immediately
    if (cachedMessages && cachedMessages.length > 0) {
      set({
        activeConversationId: id,
        messages: cachedMessages,
        isLoading: false,
        // Keep backward compatibility: update deprecated fields based on new conversation's streaming state
        isStreaming: isCurrentlyStreaming,
        streamingMessageId: isCurrentlyStreaming
          ? state.streamingConversations.get(id) || null
          : null,
        ...settingsUpdate,
      });
      return;
    }

    set({
      activeConversationId: id,
      messages: [],
      isLoading: true,
      // Keep backward compatibility: update deprecated fields based on new conversation's streaming state
      isStreaming: isCurrentlyStreaming,
      streamingMessageId: isCurrentlyStreaming
        ? state.streamingConversations.get(id) || null
        : null,
      ...settingsUpdate,
    });

    // Load messages from database or localStorage
    try {
      let loaded = false;
      let loadedMessages: Message[] = [];

      if (isElectron() && window.electronAPI) {
        // Electron: SQLite에서 로드 시도
        try {
          const result = await window.electronAPI.chat.loadMessages(id);
          if (result.success && result.data) {
            loadedMessages = result.data;
            loaded = true;
          }
        } catch (error) {
          console.error('Error loading messages from DB:', error);
        }
      }

      // Fallback to localStorage if not loaded
      if (!loaded) {
        const allMessages = loadFromLocalStorage<Record<string, Message[]>>(
          STORAGE_KEYS.MESSAGES,
          {}
        );
        loadedMessages = allMessages[id] || [];
      }

      // Update both messages and cache
      set((currentState: any) => {
        const newCache = new Map(currentState.messagesCache);
        newCache.set(id, loadedMessages);
        return {
          messages: loadedMessages,
          messagesCache: newCache,
          isLoading: false,
        };
      });
    } catch (error) {
      console.error('Failed to load messages:', error);
      set({ isLoading: false });
    }
  },

  updateConversationTitle: async (id: string, title: string) => {
    // Update in database
    let updated = false;
    if (isElectron() && window.electronAPI) {
      try {
        const result = await window.electronAPI.chat.updateConversationTitle(id, title);
        if (result.success) {
          updated = true;
        } else {
          console.error('Failed to update conversation title in DB:', result.error);
        }
      } catch (error) {
        console.error('Error updating conversation title in DB:', error);
      }
    }

    set((state: any) => {
      const updatedConversations = state.conversations.map((c: any) =>
        c.id === id ? { ...c, title, updated_at: Date.now() } : c
      );
      // Web or Electron DB update failed: localStorage에 저장
      if (!updated) {
        saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, updatedConversations);
      }
      return { conversations: updatedConversations };
    });
  },

  updateConversationPersona: async (id: string, personaId: string | null) => {
    set((state: any) => {
      const updatedConversations = state.conversations.map((c: any) =>
        c.id === id ? { ...c, personaId: personaId || undefined, updated_at: Date.now() } : c
      );

      // localStorage에 저장 (Electron DB는 personaId 필드를 아직 지원하지 않으므로)
      saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, updatedConversations);

      return { conversations: updatedConversations };
    });
  },

  updateConversationSettings: async (id: string, settings: ConversationChatSettings) => {
    // Note: Electron DB는 chatSettings 필드를 아직 완전히 지원하지 않으므로
    // localStorage를 주로 사용합니다. 향후 DB 스키마 업데이트 시 개선 예정

    set((state: any) => {
      const updatedConversations = state.conversations.map((c: any) =>
        c.id === id
          ? {
              ...c,
              chatSettings: settings,
              updated_at: Date.now(),
            }
          : c
      );

      // localStorage에 저장
      saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, updatedConversations);

      return { conversations: updatedConversations };
    });
  },

  togglePinConversation: async (id: string) => {
    const state = get() as any;
    const conversation = state.conversations.find((c: any) => c.id === id);
    if (!conversation) {
      return;
    }

    const isPinned = !conversation.isPinned;

    // Update in memory
    set((state: any) => {
      const updatedConversations = state.conversations.map((c: any) =>
        c.id === id ? { ...c, isPinned, updated_at: Date.now() } : c
      );

      // Update in database if Electron
      if (isElectron() && window.electronAPI) {
        window.electronAPI.chat
          .saveConversation({ ...conversation, isPinned, updated_at: Date.now() })
          .catch((err) => console.error('Failed to save pinned status to DB:', err));
      }

      // Update in localStorage
      saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, updatedConversations);

      return { conversations: updatedConversations };
    });
  },

  searchConversations: async (query: string) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const searchTerm = normalizedQuery.toLowerCase();

    if (isElectron() && window.electronAPI?.chat?.searchConversations) {
      try {
        const result = await window.electronAPI.chat.searchConversations(normalizedQuery);
        if (result.success && result.data) {
          return result.data;
        }
        console.error('Failed to search conversations via IPC:', result.error);
      } catch (error) {
        console.error('Search IPC failed, using fallback search:', error);
      }
    }

    const state = get() as any;
    const conversations = state.conversations as Conversation[];
    const resultsByConversation = new Map<
      string,
      { conversation: Conversation; matchedMessages: Message[] }
    >();

    for (const conversation of conversations) {
      if (conversation.title.toLowerCase().includes(searchTerm)) {
        resultsByConversation.set(conversation.id, {
          conversation,
          matchedMessages: [],
        });
      }
    }

    const messagesByConversation: Record<string, Message[]> = {};

    if (isElectron() && window.electronAPI) {
      const cachedMessages = state.messagesCache as Map<string, Message[]>;
      for (const [conversationId, messages] of cachedMessages.entries()) {
        messagesByConversation[conversationId] = messages;
      }

      const conversationIdsToLoad = conversations
        .filter((conversation) => {
          if (messagesByConversation[conversation.id]) {
            return false;
          }
          return !conversation.title.toLowerCase().includes(searchTerm);
        })
        .map((conversation) => conversation.id);

      if (conversationIdsToLoad.length > 0) {
        const loadedResults = await Promise.allSettled(
          conversationIdsToLoad.map((conversationId) =>
            window.electronAPI.chat.loadMessages(conversationId)
          )
        );

        loadedResults.forEach((loadedResult, index) => {
          const conversationId = conversationIdsToLoad[index];
          if (
            loadedResult.status === 'fulfilled' &&
            loadedResult.value.success &&
            loadedResult.value.data
          ) {
            messagesByConversation[conversationId] = loadedResult.value.data;
          } else {
            messagesByConversation[conversationId] = [];
          }
        });
      }
    } else {
      const allMessages = loadFromLocalStorage<Record<string, Message[]>>(
        STORAGE_KEYS.MESSAGES,
        {}
      );
      Object.assign(messagesByConversation, allMessages);
    }

    for (const conversation of conversations) {
      const conversationMessages = messagesByConversation[conversation.id] || [];
      const matchedMessages = conversationMessages.filter((msg) =>
        msg.content.toLowerCase().includes(searchTerm)
      );

      if (matchedMessages.length > 0) {
        const existing = resultsByConversation.get(conversation.id);
        if (existing) {
          existing.matchedMessages = matchedMessages;
        } else {
          resultsByConversation.set(conversation.id, {
            conversation,
            matchedMessages,
          });
        }
      }
    }

    const results = Array.from(resultsByConversation.values());
    results.sort((a, b) => {
      const aTitleMatch = a.conversation.title.toLowerCase().includes(searchTerm) ? 1 : 0;
      const bTitleMatch = b.conversation.title.toLowerCase().includes(searchTerm) ? 1 : 0;

      if (aTitleMatch !== bTitleMatch) {
        return bTitleMatch - aTitleMatch;
      }

      if (a.matchedMessages.length !== b.matchedMessages.length) {
        return b.matchedMessages.length - a.matchedMessages.length;
      }

      return b.conversation.updated_at - a.conversation.updated_at;
    });

    return results;
  },

  // Messages
  addMessage: async (message: any, conversationId?: string) => {
    const activeId = conversationId || (get() as any).activeConversationId;
    if (!activeId) {
      throw new Error('No active conversation');
    }

    const newMessage: Message = {
      ...message,
      id: generateId(),
      conversation_id: activeId,
      created_at: Date.now(),
    };

    // Save to database or localStorage
    if (isElectron() && window.electronAPI) {
      // Electron: SQLite에 저장
      const result = await window.electronAPI.chat.saveMessage(newMessage);
      if (!result.success) {
        console.error('Failed to save message:', result.error);
        throw new Error(result.error || 'Failed to save message');
      }
    } else {
      // Web: localStorage에 저장
      const allMessages = loadFromLocalStorage<Record<string, Message[]>>(
        STORAGE_KEYS.MESSAGES,
        {}
      );
      allMessages[activeId] = [...(allMessages[activeId] || []), newMessage];
      saveToLocalStorage(STORAGE_KEYS.MESSAGES, allMessages);
    }

    // Update both UI messages and cache in a single atomic set call
    set((state: any) => {
      const newCache = new Map(state.messagesCache);
      const cachedMessages: any[] = (newCache.get(activeId) as any[]) || [];
      const updatedCachedMessages = [...cachedMessages, newMessage];
      newCache.set(activeId, updatedCachedMessages);

      return {
        // Only update UI if this is the active conversation
        messages: state.activeConversationId === activeId ? updatedCachedMessages : state.messages,
        messagesCache: newCache,
      };
    });

    // Update conversation updated_at
    const conversation = (get() as any).conversations.find((c: any) => c.id === activeId);
    if (conversation) {
      if (isElectron() && window.electronAPI) {
        try {
          await window.electronAPI.chat.saveConversation({
            ...conversation,
            updated_at: Date.now(),
          });
        } catch (error) {
          console.error('[addMessage] Failed to update conversation timestamp:', error);
        }
      }

      set((state: any) => {
        const updatedConversations = state.conversations.map((c: any) =>
          c.id === activeId ? { ...c, updated_at: Date.now() } : c
        );
        // Web: localStorage에 저장
        if (!isElectron()) {
          saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, updatedConversations);
        }
        return { conversations: updatedConversations };
      });
    }

    return newMessage;
  },

  updateMessage: (id: string, updates: Partial<Message>, conversationId?: string) => {
    set((state: any) => {
      const targetConvId = conversationId || state.activeConversationId;
      if (!targetConvId) {
        return state;
      }

      // 1. Prepare updated messages for the target conversation
      const newCache = new Map(state.messagesCache);
      const cachedMessages: any[] = (newCache.get(targetConvId) as any[]) || [];
      const updatedMessages = cachedMessages.map((m: any) =>
        m.id === id ? { ...m, ...updates } : m
      );

      // 2. Update cache
      newCache.set(targetConvId, updatedMessages);

      // 3. If target is active, update both. If not, only update cache.
      if (state.activeConversationId === targetConvId) {
        return {
          messages: updatedMessages,
          messagesCache: newCache,
        };
      }

      return {
        messagesCache: newCache,
      };
    });
  },

  deleteMessage: async (id: string) => {
    const activeId = (get() as any).activeConversationId;

    // Delete from database
    if (isElectron() && window.electronAPI) {
      const result = await window.electronAPI.chat.deleteMessage(id);
      if (!result.success) {
        console.error('Failed to delete message:', result.error);
        return;
      }
    } else if (activeId) {
      // Web: localStorage에서 삭제
      const allMessages = loadFromLocalStorage<Record<string, Message[]>>(
        STORAGE_KEYS.MESSAGES,
        {}
      );
      if (allMessages[activeId]) {
        allMessages[activeId] = allMessages[activeId].filter((m: any) => m.id !== id);
        saveToLocalStorage(STORAGE_KEYS.MESSAGES, allMessages);
      }
    }

    set((state: any) => {
      if (!activeId) {
        return state;
      }

      // 1. Update cache
      const newCache = new Map(state.messagesCache);
      const cachedMessages: any[] = (newCache.get(activeId) as any[]) || [];
      const updatedMessages = cachedMessages.filter((m: any) => m.id !== id);
      newCache.set(activeId, updatedMessages);

      // 2. Update both UI and cache (assuming only deleting from active conversation for now)
      return {
        messages: updatedMessages,
        messagesCache: newCache,
      };
    });
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  clearMessagesCache: (conversationId: string) => {
    set((state: any) => {
      const newCache = new Map(state.messagesCache);
      newCache.delete(conversationId);
      return { messagesCache: newCache };
    });
  },

  // Streaming actions (conversation-specific)
  startStreaming: (conversationId: string, messageId: string) => {
    set((state: any) => {
      const newMap = new Map(state.streamingConversations);
      newMap.set(conversationId, messageId);

      return {
        streamingConversations: newMap,
        // Update deprecated fields for backward compatibility if this is the active conversation
        isStreaming: state.activeConversationId === conversationId ? true : state.isStreaming,
        streamingMessageId:
          state.activeConversationId === conversationId ? messageId : state.streamingMessageId,
      };
    });
  },

  stopStreaming: (conversationId: string) => {
    set((state: any) => {
      const newMap = new Map(state.streamingConversations);
      newMap.delete(conversationId);

      return {
        streamingConversations: newMap,
        // Update deprecated fields for backward compatibility if this was the active conversation
        isStreaming: state.activeConversationId === conversationId ? false : state.isStreaming,
        streamingMessageId:
          state.activeConversationId === conversationId ? null : state.streamingMessageId,
      };
    });
  },

  isConversationStreaming: (conversationId: string) => {
    return (get() as any).streamingConversations.has(conversationId);
  },

  setAppFocused: (focused: boolean) => {
    set({ isAppFocused: focused });
  },

  // Graph Configuration
  setThinkingMode: (mode: ThinkingMode) => {
    const shouldForceTools = mode === 'cowork';
    const shouldForceUntrustedInput = mode === 'cowork';
    set((state: any) => ({
      thinkingMode: mode,
      inputTrustLevel: shouldForceUntrustedInput ? 'untrusted' : state.inputTrustLevel,
      enableTools: shouldForceTools ? true : state.enableTools,
    }));

    // Update active conversation's settings
    const state = get() as any;
    if (state.activeConversationId) {
      const conversation = state.conversations.find(
        (c: any) => c.id === state.activeConversationId
      );
      if (conversation) {
        (get() as any).updateConversationSettings(state.activeConversationId, {
          ...conversation.chatSettings,
          thinkingMode: mode,
          inputTrustLevel: mode === 'cowork' ? 'untrusted' : state.inputTrustLevel,
          ...(shouldForceTools ? { enableTools: true } : {}),
        });
      }
    }
  },

  setInputTrustLevel: (level: InputTrustLevel) => {
    const state = get() as any;

    if (state.thinkingMode === 'cowork' && level !== 'untrusted') {
      console.warn(
        '[setInputTrustLevel] Cowork mode requires untrusted input mode. Ignoring trusted value.'
      );
      return;
    }

    set({ inputTrustLevel: level });

    if (state.activeConversationId) {
      const conversation = state.conversations.find(
        (c: any) => c.id === state.activeConversationId
      );
      if (conversation) {
        (get() as any).updateConversationSettings(state.activeConversationId, {
          ...conversation.chatSettings,
          inputTrustLevel: level,
        });
      }
    }
  },

  setEnableRAG: (enable: boolean) => {
    set({ enableRAG: enable });

    // Update active conversation's settings
    const state = get() as any;
    if (state.activeConversationId) {
      const conversation = state.conversations.find(
        (c: any) => c.id === state.activeConversationId
      );
      if (conversation) {
        (get() as any).updateConversationSettings(state.activeConversationId, {
          ...conversation.chatSettings,
          enableRAG: enable,
        });
      }
    }
  },

  setEnableTools: (enable: boolean) => {
    const state = get() as any;

    // CRITICAL: Cannot disable tools when image generation is active
    if (!enable && state.enableImageGeneration) {
      console.warn(
        '[setEnableTools] Cannot disable tools while image generation is active. Ignoring.'
      );
      return;
    }

    // Cowork mode always requires tools.
    if (!enable && state.thinkingMode === 'cowork') {
      console.warn('[setEnableTools] Cannot disable tools while cowork mode is active. Ignoring.');
      return;
    }

    set({ enableTools: enable });

    // Update active conversation's settings
    if (state.activeConversationId) {
      const conversation = state.conversations.find(
        (c: any) => c.id === state.activeConversationId
      );
      if (conversation) {
        (get() as any).updateConversationSettings(state.activeConversationId, {
          ...conversation.chatSettings,
          enableTools: enable,
        });
      }
    }
  },

  toggleTool: (toolName: string) => {
    set((state: any) => {
      const newEnabledTools = new Set(state.enabledTools);
      if (newEnabledTools.has(toolName)) {
        newEnabledTools.delete(toolName);
      } else {
        newEnabledTools.add(toolName);
      }
      // Auto-enable tools if at least one tool is enabled
      const shouldEnableTools = newEnabledTools.size > 0;
      return { enabledTools: newEnabledTools, enableTools: shouldEnableTools || state.enableTools };
    });

    // Update active conversation's settings
    const state = get() as any;
    if (state.activeConversationId) {
      const conversation = state.conversations.find(
        (c: any) => c.id === state.activeConversationId
      );
      if (conversation) {
        (get() as any).updateConversationSettings(state.activeConversationId, {
          ...conversation.chatSettings,
          enabledTools: Array.from(state.enabledTools),
          enableTools: state.enableTools,
        });
      }
    }
  },

  enableAllTools: (toolNames: string[]) => {
    // When enabling all tools, also enable the main tools toggle
    set({ enabledTools: new Set(toolNames), enableTools: toolNames.length > 0 });

    // Update active conversation's settings
    const state = get() as any;
    if (state.activeConversationId) {
      const conversation = state.conversations.find(
        (c: any) => c.id === state.activeConversationId
      );
      if (conversation) {
        (get() as any).updateConversationSettings(state.activeConversationId, {
          ...conversation.chatSettings,
          enabledTools: toolNames,
          enableTools: toolNames.length > 0,
        });
      }
    }
  },

  disableAllTools: () => {
    set({ enabledTools: new Set<string>() });

    // Update active conversation's settings
    const state = get() as any;
    if (state.activeConversationId) {
      const conversation = state.conversations.find(
        (c: any) => c.id === state.activeConversationId
      );
      if (conversation) {
        (get() as any).updateConversationSettings(state.activeConversationId, {
          ...conversation.chatSettings,
          enabledTools: [],
        });
      }
    }
  },

  setEnableImageGeneration: (enable: boolean) => {
    const state = get() as any;
    if (enable) {
      // Save current settings before enabling image generation mode
      set({
        savedThinkingMode: state.thinkingMode,
        savedEnableRAG: state.enableRAG,
        savedEnableTools: state.enableTools,
        // Force settings for image generation mode
        thinkingMode: 'instant',
        enableRAG: false,
        enableTools: true, // Keep tools enabled (only generate_image will be used)
        enableImageGeneration: true,
      });
    } else {
      // Restore previous settings when disabling image generation mode
      set({
        thinkingMode: state.savedThinkingMode || 'instant',
        enableRAG: state.savedEnableRAG ?? false,
        enableTools: state.savedEnableTools ?? false,
        enableImageGeneration: false,
        // Clear saved settings
        savedThinkingMode: null,
        savedEnableRAG: null,
        savedEnableTools: null,
      });
    }

    // Update active conversation's settings
    const currentState = get() as any;
    if (currentState.activeConversationId) {
      const conversation = currentState.conversations.find(
        (c: any) => c.id === currentState.activeConversationId
      );
      if (conversation) {
        (get() as any).updateConversationSettings(currentState.activeConversationId, {
          ...conversation.chatSettings,
          enableImageGeneration: enable,
        });
      }
    }
  },

  setSelectedImageGenProvider: (provider: 'comfyui' | 'nanobanana' | null) => {
    set({ selectedImageGenProvider: provider });

    // Update active conversation's settings
    const state = get() as any;
    if (state.activeConversationId) {
      const conversation = state.conversations.find(
        (c: any) => c.id === state.activeConversationId
      );
      if (conversation) {
        (get() as any).updateConversationSettings(state.activeConversationId, {
          ...conversation.chatSettings,
          selectedImageGenProvider: provider,
        });
      }
    }
  },

  setWorkingDirectory: (directory: string | null) => {
    set({
      workingDirectory: directory,
      expandedFolderPaths: new Set<string>(),
      fileTreeRefreshTrigger: Date.now(),
    });
    // Save to localStorage for persistence
    if (directory) {
      localStorage.setItem('sepilot_working_directory', directory);
    } else {
      localStorage.removeItem('sepilot_working_directory');
    }
  },

  getGraphConfig: (): GraphConfig => {
    const state = get() as any;
    const normalizedEnableTools = state.thinkingMode === 'cowork' ? true : state.enableTools;
    const inputTrustLevel =
      state.thinkingMode === 'cowork' ? 'untrusted' : (state.inputTrustLevel ?? 'trusted');
    return {
      thinkingMode: state.thinkingMode,
      inputTrustLevel,
      enableRAG: state.enableRAG,
      enableTools: normalizedEnableTools,
      enableImageGeneration: state.enableImageGeneration,
      workingDirectory: state.workingDirectory || undefined,
      activeFileSelection: state.activeFileSelection || undefined,
      enabledTools: state.enabledTools.size > 0 ? Array.from(state.enabledTools) : undefined,
    };
  },

  // Deprecated: kept for backward compatibility
  setGraphType: (type: GraphType) => {
    // Map old GraphType to new configuration
    switch (type) {
      case 'chat':
        set({
          graphType: type,
          thinkingMode: 'instant',
          inputTrustLevel: 'trusted',
          enableRAG: false,
          enableTools: false,
        });
        break;
      case 'rag':
        set({
          graphType: type,
          thinkingMode: 'instant',
          inputTrustLevel: 'trusted',
          enableRAG: true,
          enableTools: false,
        });
        break;
      case 'agent':
        set({
          graphType: type,
          thinkingMode: 'instant',
          inputTrustLevel: 'trusted',
          enableRAG: false,
          enableTools: true,
        });
        break;
    }
  },

  // Tool Approval (Human-in-the-loop)
  setPendingToolApproval: (approval: PendingToolApproval) => {
    set((state: any) => {
      const queue = getPendingApprovalQueueFromState(state);
      const identity = getPendingApprovalIdentity(approval);
      const existingIndex = queue.findIndex(
        (item) => getPendingApprovalIdentity(item as PendingToolApproval) === identity
      );

      if (existingIndex >= 0) {
        queue[existingIndex] = {
          ...(queue[existingIndex] as PendingToolApproval),
          ...approval,
        };
      } else {
        queue.push(approval);
      }

      const activeApproval = queue[0] || null;
      persistPendingToolApproval(activeApproval);

      return {
        pendingToolApproval: activeApproval,
        pendingToolApprovalQueue: queue,
      };
    });
  },

  clearPendingToolApproval: () => {
    set((state: any) => {
      const queue = getPendingApprovalQueueFromState(state);
      if (queue.length > 0) {
        queue.shift();
      }

      const activeApproval = queue[0] || null;
      persistPendingToolApproval(activeApproval);

      return {
        pendingToolApproval: activeApproval,
        pendingToolApprovalQueue: queue,
      };
    });
  },

  clearPendingToolApprovalForConversation: (conversationId: string) => {
    if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
      return;
    }

    set((state: any) => {
      const queue = getPendingApprovalQueueFromState(state);
      const targetIndex = queue.findIndex(
        (item) => (item as PendingToolApproval).conversationId === conversationId
      );

      if (targetIndex >= 0) {
        queue.splice(targetIndex, 1);
      }

      const activeApproval = queue[0] || null;
      persistPendingToolApproval(activeApproval);

      return {
        pendingToolApproval: activeApproval,
        pendingToolApprovalQueue: queue,
      };
    });
  },

  clearAllPendingToolApprovals: () => {
    persistPendingToolApproval(null);
    set({
      pendingToolApproval: null,
      pendingToolApprovalQueue: [],
    });
  },

  setAlwaysApproveToolsForSession: (enable: boolean) => {
    set({ alwaysApproveToolsForSession: enable });
  },

  // Image Generation Progress
  setImageGenerationProgress: (progress: ImageGenerationProgress) => {
    set((state: any) => {
      const newMap = new Map(state.imageGenerationProgress);
      newMap.set(progress.conversationId, progress);
      return { imageGenerationProgress: newMap };
    });
  },

  updateImageGenerationProgress: (
    conversationId: string,
    updates: Partial<ImageGenerationProgress>
  ) => {
    set((state: any) => {
      const newMap = new Map(state.imageGenerationProgress);
      const existing = newMap.get(conversationId);
      if (existing) {
        newMap.set(conversationId, { ...(existing as object), ...updates });
      }
      return { imageGenerationProgress: newMap };
    });
  },

  clearImageGenerationProgress: (conversationId: string) => {
    set((state: any) => {
      const newMap = new Map(state.imageGenerationProgress);
      newMap.delete(conversationId);
      return { imageGenerationProgress: newMap };
    });
  },

  getImageGenerationProgress: (conversationId: string) => {
    return (get() as any).imageGenerationProgress.get(conversationId);
  },

  // Agent Progress
  setAgentProgress: (conversationId: string, progress: AgentProgress) => {
    set((state: any) => {
      const newMap = new Map(state.agentProgress);
      newMap.set(conversationId, progress);
      return { agentProgress: newMap };
    });
  },

  updateAgentProgress: (conversationId: string, updates: Partial<AgentProgress>) => {
    set((state: any) => {
      const newMap = new Map(state.agentProgress);
      const existing = newMap.get(conversationId);
      if (existing) {
        newMap.set(conversationId, { ...(existing as object), ...updates });
      }
      return { agentProgress: newMap };
    });
  },

  clearAgentProgress: (conversationId: string) => {
    set((state: any) => {
      const newMap = new Map(state.agentProgress);
      newMap.delete(conversationId);
      return { agentProgress: newMap };
    });
  },

  getAgentProgress: (conversationId: string) => {
    return (get() as any).agentProgress.get(conversationId);
  },

  // Cowork Actions
  setCoworkPlan: (plan) => {
    set({ coworkPlan: plan });
  },

  updateCoworkTaskStatus: (taskId, status, result) => {
    set((state: any) => {
      if (!state.coworkPlan) {
        return {};
      }
      const updatedTasks = state.coworkPlan.tasks.map((t: any) =>
        t.id === taskId
          ? {
              ...t,
              status,
              ...(result !== undefined ? { result } : {}),
              ...(status === 'in_progress' ? { startedAt: new Date().toISOString() } : {}),
              ...(status === 'completed' || status === 'failed'
                ? { completedAt: new Date().toISOString() }
                : {}),
            }
          : t
      );
      return {
        coworkPlan: { ...state.coworkPlan, tasks: updatedTasks },
      };
    });
  },

  setCoworkTeamStatus: (status) => {
    set({ coworkTeamStatus: status });
  },

  resetCoworkState: () => {
    set({
      coworkPlan: null,
      coworkTeamStatus: 'idle' as const,
      coworkTokensConsumed: 0,
      coworkTotalTokenBudget: 200000,
    });
  },

  // App Mode Actions
  setAppMode: (mode: AppMode) => {
    set({ appMode: mode });
  },

  setActiveEditorTab: (tab: 'files' | 'search' | 'browser') => {
    set({ activeEditorTab: tab });
  },

  setShowTerminalPanel: (show: boolean) => {
    set({ showTerminalPanel: show });
  },

  // File Clipboard Actions
  setFileClipboard: (clipboard: any) => {
    set({ fileClipboard: clipboard });
  },

  copyFiles: (paths: any) => {
    set({ fileClipboard: { operation: 'copy', paths } });
  },

  cutFiles: (paths: any) => {
    set({ fileClipboard: { operation: 'cut', paths } });
  },

  clearFileClipboard: () => {
    set({ fileClipboard: null });
  },

  // Browser Chat Actions
  addBrowserChatMessage: (message: Omit<Message, 'id' | 'created_at' | 'conversation_id'>) => {
    const newMessage: Message = {
      ...message,
      id: generateId(),
      conversation_id: 'browser-chat',
      created_at: Date.now(),
    };

    set((state: any) => ({
      browserChatMessages: [...state.browserChatMessages, newMessage],
    }));
  },

  updateBrowserChatMessage: (id: string, updatesOrContent: Partial<Message> | string) => {
    const updates =
      typeof updatesOrContent === 'string' ? { content: updatesOrContent } : updatesOrContent;

    set((state: any) => ({
      browserChatMessages: state.browserChatMessages.map((m: any) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    }));
  },

  clearBrowserChat: () => {
    set({ browserChatMessages: [] });
  },

  setBrowserViewMode: (
    mode: 'chat' | 'snapshots' | 'bookmarks' | 'tools' | 'logs' | 'settings'
  ) => {
    // 레거시 번들 호환: 구버전 렌더러가 'settings' 모드를 전달하면
    // 사이드바 렌더링 대신 글로벌 Settings 다이얼로그를 열고 chat 모드 유지
    if (mode === 'settings') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sepilot:open-settings', {
            detail: { section: 'browser' },
          })
        );
      }
      set({ browserViewMode: 'chat' });
      return;
    }
    set({ browserViewMode: mode });
  },

  // Browser Agent Logs Actions
  addBrowserAgentLog: (log: Omit<BrowserAgentLogEntry, 'id' | 'timestamp'>) => {
    const newLog: BrowserAgentLogEntry = {
      ...log,
      id: generateId(),
      timestamp: Date.now(),
    };
    set((state: any) => ({
      browserAgentLogs: [...state.browserAgentLogs, newLog],
    }));
  },

  clearBrowserAgentLogs: () => {
    set({ browserAgentLogs: [] });
  },

  setBrowserAgentIsRunning: (isRunning: boolean) => {
    set({ browserAgentIsRunning: isRunning });
  },

  setBrowserAgentStreamCleanup: (cleanup: (() => void) | null) => {
    set({ browserAgentStreamCleanup: cleanup });
  },

  // Browser Agent LLM Config Actions
  setBrowserAgentLLMConfig: (config: Partial<BrowserAgentLLMConfig>) => {
    set((state: any) => {
      const newConfig = { ...state.browserAgentLLMConfig, ...config };
      // localStorage에 저장
      if (typeof window !== 'undefined') {
        localStorage.setItem('sepilot_browser_agent_llm_config', JSON.stringify(newConfig));
      }
      return { browserAgentLLMConfig: newConfig };
    });
  },

  resetBrowserAgentLLMConfig: () => {
    const defaultConfig: BrowserAgentLLMConfig = {
      maxTokens: 4096,
      temperature: 0.7,
      topP: 1.0,
      maxIterations: 30,
    };
    // localStorage에서 제거
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sepilot_browser_agent_llm_config');
    }
    set({ browserAgentLLMConfig: defaultConfig });
  },

  // Browser Chat Font Config Actions
  setBrowserChatFontConfig: (config: Partial<BrowserChatFontConfig>) => {
    set((state: any) => {
      const newConfig = { ...state.browserChatFontConfig, ...config };
      // localStorage에 저장
      if (typeof window !== 'undefined') {
        localStorage.setItem('sepilot_browser_chat_font_config', JSON.stringify(newConfig));
      }
      return { browserChatFontConfig: newConfig };
    });
  },

  resetBrowserChatFontConfig: () => {
    const defaultConfig: BrowserChatFontConfig = {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 14,
    };
    // localStorage에서 제거
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sepilot_browser_chat_font_config');
    }
    set({ browserChatFontConfig: defaultConfig });
  },

  // Editor Chat Actions
  addEditorChatMessage: (message: Omit<Message, 'id' | 'created_at' | 'conversation_id'>) => {
    const newMessage: Message = {
      ...message,
      id: generateId(),
      conversation_id: 'editor-chat',
      created_at: Date.now(),
    };

    set((state: any) => ({
      editorChatMessages: [...state.editorChatMessages, newMessage],
    }));
  },

  updateEditorChatMessage: (id: string, updates: Partial<Message>) => {
    set((state: any) => ({
      editorChatMessages: state.editorChatMessages.map((m: any) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    }));
  },

  clearEditorChat: async () => {
    const state = get() as any;
    // Abort streaming if active
    if (state.editorChatStreaming && isElectron() && window.electronAPI?.langgraph) {
      try {
        await window.electronAPI.langgraph.abort('editor-chat-temp');
      } catch (error) {
        console.error('[clearEditorChat] Failed to abort streaming:', error);
      }
    }
    persistPendingToolApproval(null);
    set({
      editorChatMessages: [],
      editorChatStreaming: false,
      pendingToolApproval: null, // Clear any pending approval that might block UI
      pendingToolApprovalQueue: [],
    });
  },

  setEditorViewMode: (mode: 'files' | 'wiki' | 'search' | 'chat' | 'settings') => {
    set({ editorViewMode: mode });
  },

  setEditorChatStreaming: (isStreaming: boolean) => {
    set({ editorChatStreaming: isStreaming });
  },

  refreshFileTree: () => {
    set({ fileTreeRefreshTrigger: Date.now() });
  },

  toggleExpandedFolder: (path: string) => {
    set((state: any) => {
      const newExpanded = new Set(state.expandedFolderPaths);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      return { expandedFolderPaths: newExpanded };
    });
  },

  addExpandedFolders: (paths: string[]) => {
    set((state: any) => {
      const newExpanded = new Set(state.expandedFolderPaths);
      paths.forEach((path) => newExpanded.add(path));
      return { expandedFolderPaths: newExpanded };
    });
  },

  clearExpandedFolders: () => {
    set({ expandedFolderPaths: new Set<string>() });
  },

  // Editor Settings
  setEditorAppearanceConfig: (config: Partial<EditorAppearanceConfig>) => {
    set((state: any) => {
      const newConfig = { ...state.editorAppearanceConfig, ...config };
      if (typeof window !== 'undefined') {
        localStorage.setItem('sepilot_editor_appearance_config', JSON.stringify(newConfig));
      }
      return { editorAppearanceConfig: newConfig };
    });
  },

  resetEditorAppearanceConfig: () => {
    set({ editorAppearanceConfig: DEFAULT_EDITOR_APPEARANCE });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sepilot_editor_appearance_config');
    }
  },

  setEditorLLMPromptsConfig: (config: Partial<EditorLLMPromptsConfig>) => {
    set((state: any) => {
      const newConfig = { ...state.editorLLMPromptsConfig, ...config };
      if (typeof window !== 'undefined') {
        localStorage.setItem('sepilot_editor_llm_prompts_config', JSON.stringify(newConfig));
      }
      return { editorLLMPromptsConfig: newConfig };
    });
  },

  resetEditorLLMPromptsConfig: () => {
    set({ editorLLMPromptsConfig: DEFAULT_EDITOR_LLM_PROMPTS });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sepilot_editor_llm_prompts_config');
    }
  },

  setEditorChatUseRag: (enable: boolean) => {
    set({ editorChatUseRag: enable });
    if (typeof window !== 'undefined') {
      localStorage.setItem('sepilot_editor_chat_use_rag', enable.toString());
    }
  },

  setEditorChatUseTools: (enable: boolean) => {
    set({ editorChatUseTools: enable });
    if (typeof window !== 'undefined') {
      localStorage.setItem('sepilot_editor_chat_use_tools', enable.toString());
    }
  },

  toggleEditorChatTool: (toolName: string) => {
    set((state: any) => {
      const newEnabled = new Set(state.editorChatEnabledTools);
      if (newEnabled.has(toolName)) {
        newEnabled.delete(toolName);
      } else {
        newEnabled.add(toolName);
      }
      // Save logic if needed, typically tool selection persists per session or project
      return { editorChatEnabledTools: newEnabled };
    });
  },

  setEditorAgentMode: (mode: 'editor' | 'coding') => {
    set({ editorAgentMode: mode });
    if (typeof window !== 'undefined') {
      localStorage.setItem('sepilot_editor_agent_mode', mode);
    }
  },

  setEditorUseRagInAutocomplete: (enable: boolean) => {
    set({ editorUseRagInAutocomplete: enable });
    if (typeof window !== 'undefined') {
      localStorage.setItem('sepilot_editor_use_rag_in_autocomplete', enable.toString());
    }
  },

  setEditorUseToolsInAutocomplete: (enable: boolean) => {
    set({ editorUseToolsInAutocomplete: enable });
    if (typeof window !== 'undefined') {
      localStorage.setItem('sepilot_editor_use_tools_in_autocomplete', enable.toString());
    }
  },

  setEditorEnableInlineAutocomplete: (enable: boolean) => {
    set({ editorEnableInlineAutocomplete: enable });
    if (typeof window !== 'undefined') {
      localStorage.setItem('sepilot_editor_enable_inline_autocomplete', enable.toString());
    }
  },

  // Chat Mode View Actions
  setChatViewMode: (mode: 'history' | 'documents') => {
    set({ chatViewMode: mode });
  },

  // Initialization Actions
  loadWorkingDirectory: async () => {
    const savedDir = await loadWorkingDirectory();
    if (savedDir) {
      set({ workingDirectory: savedDir, fileTreeRefreshTrigger: Date.now() });
    }
  },

  // Editor Actions
  openFile: (
    file: Omit<OpenFile, 'isDirty'> & { initialPosition?: { lineNumber: number; column?: number } }
  ) => {
    set((state: any) => {
      // Check if file is already open
      const existingFileIndex = state.openFiles.findIndex((f: any) => f.path === file.path);
      if (existingFileIndex !== -1) {
        // File already open, update initialPosition if provided and set as active
        if (file.initialPosition) {
          const updatedFiles = [...state.openFiles];
          updatedFiles[existingFileIndex] = {
            ...updatedFiles[existingFileIndex],
            initialPosition: file.initialPosition,
          };
          return { openFiles: updatedFiles, activeFilePath: file.path };
        }
        return { activeFilePath: file.path };
      }

      // Add new file to open files
      const newFile: OpenFile = {
        ...file,
        isDirty: false,
      };

      return {
        openFiles: [...state.openFiles, newFile],
        activeFilePath: file.path,
      };
    });
  },

  closeFile: (path: string) => {
    set((state: any) => {
      const filtered = state.openFiles.filter((f: any) => f.path !== path);
      const newActiveFilePath =
        state.activeFilePath === path ? filtered[0]?.path || null : state.activeFilePath;

      return {
        openFiles: filtered,
        activeFilePath: newActiveFilePath,
      };
    });
  },

  closeOtherFiles: (path: string) => {
    set((state: any) => {
      const fileToKeep = state.openFiles.find((f: any) => f.path === path);
      if (!fileToKeep) {
        return state;
      }
      return {
        openFiles: [fileToKeep],
        activeFilePath: path,
      };
    });
  },

  closeFilesToRight: (path: string) => {
    set((state: any) => {
      const index = state.openFiles.findIndex((f: any) => f.path === path);
      if (index === -1) {
        return state;
      }
      const filesToKeep = state.openFiles.slice(0, index + 1);
      const newActiveFilePath = filesToKeep.some((f: any) => f.path === state.activeFilePath)
        ? state.activeFilePath
        : filesToKeep[filesToKeep.length - 1]?.path || null;
      return {
        openFiles: filesToKeep,
        activeFilePath: newActiveFilePath,
      };
    });
  },

  closeSavedFiles: () => {
    set((state: any) => {
      const dirtyFiles = state.openFiles.filter((f: any) => f.isDirty);
      const newActiveFilePath = dirtyFiles.some((f: any) => f.path === state.activeFilePath)
        ? state.activeFilePath
        : dirtyFiles[0]?.path || null;
      return {
        openFiles: dirtyFiles,
        activeFilePath: newActiveFilePath,
      };
    });
  },

  setActiveFile: (path: string | null) => {
    set({ activeFilePath: path });
  },

  updateFileContent: (path: string, content: string) => {
    set((state: any) => {
      const updatedFiles = state.openFiles.map((file: any) =>
        file.path === path ? { ...file, content, isDirty: true } : file
      );

      return { openFiles: updatedFiles };
    });
  },

  markFileDirty: (path: string, isDirty: boolean) => {
    set((state: any) => {
      const updatedFiles = state.openFiles.map((file: any) =>
        file.path === path ? { ...file, isDirty } : file
      );

      return { openFiles: updatedFiles };
    });
  },

  clearInitialPosition: (path: string) => {
    set((state: any) => {
      const updatedFiles = state.openFiles.map((file: any) =>
        file.path === path ? { ...file, initialPosition: undefined } : file
      );

      return { openFiles: updatedFiles };
    });
  },

  closeAllFiles: () => {
    set({ openFiles: [], activeFilePath: null });
  },

  reorderFiles: (fromIndex: number, toIndex: number) => {
    set((state: any) => {
      const newFiles = [...state.openFiles];
      const [movedFile] = newFiles.splice(fromIndex, 1);
      newFiles.splice(toIndex, 0, movedFile);
      return { openFiles: newFiles };
    });
  },

  setActiveFileSelection: (selection: any) => {
    set({ activeFileSelection: selection });
  },

  // Extension Actions
  updateActiveExtensions: (extensions: any) => {
    set((state: any) => ({
      activeExtensions: extensions,
      extensionsVersion: state.extensionsVersion + 1,
    }));
  },

  refreshExtensions: () => {
    // ExtensionRegistry에서 활성화된 Extension 목록을 가져와서 업데이트
    // 이 함수는 ExtensionRegistry.activate/deactivate 후에 자동으로 호출됨
    // 여기서는 버전만 증가시켜서 리렌더링 트리거
    set((state: any) => ({
      extensionsVersion: state.extensionsVersion + 1,
    }));
  },

  // Persona Actions
  loadPersonas: async () => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      if (isElectron() && window.electronAPI) {
        // Electron: SQLite에서 로드
        const userPersonas = await window.electronAPI.persona.loadAll();
        set({ personas: [...BUILTIN_PERSONAS, ...userPersonas] });
      } else {
        // Web: localStorage에서 로드
        const savedPersonas = localStorage.getItem('sepilot_personas');
        if (savedPersonas) {
          const userPersonas = JSON.parse(savedPersonas);
          set({ personas: [...BUILTIN_PERSONAS, ...userPersonas] });
        }
      }
    } catch (error) {
      console.error('Failed to load personas:', error);
    }
  },

  addPersona: async (persona: any) => {
    const newPersona: Persona = {
      ...persona,
      id: generateId(),
      isBuiltin: false,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    try {
      if (isElectron() && window.electronAPI) {
        // Electron: SQLite에 저장
        await window.electronAPI.persona.save(newPersona);
      } else {
        // Web: localStorage에 저장
        const currentState = get() as any;
        const userPersonas = currentState.personas.filter((p: any) => !p.isBuiltin);
        localStorage.setItem('sepilot_personas', JSON.stringify([...userPersonas, newPersona]));
      }

      set((state: any) => ({
        personas: [...state.personas, newPersona],
      }));
    } catch (error) {
      console.error('Failed to add persona:', error);
      throw error;
    }
  },

  updatePersona: async (id: any, updates: any) => {
    const currentState = get() as any;
    const persona = currentState.personas.find((p: any) => p.id === id);

    if (!persona) {
      throw new Error('Persona not found');
    }

    if (persona.isBuiltin) {
      throw new Error('Cannot modify builtin persona');
    }

    const updatedPersona: Persona = {
      ...persona,
      ...updates,
      updated_at: Date.now(),
    };

    try {
      if (isElectron() && window.electronAPI) {
        // Electron: SQLite에 업데이트
        await window.electronAPI.persona.update(updatedPersona);
      } else {
        // Web: localStorage에 업데이트
        const userPersonas = currentState.personas
          .filter((p: any) => !p.isBuiltin)
          .map((p: any) => (p.id === id ? updatedPersona : p));
        localStorage.setItem('sepilot_personas', JSON.stringify(userPersonas));
      }

      set((state: any) => ({
        personas: state.personas.map((p: any) => (p.id === id ? updatedPersona : p)),
      }));
    } catch (error) {
      console.error('Failed to update persona:', error);
      throw error;
    }
  },

  deletePersona: async (id: any) => {
    const currentState = get() as any;
    const persona = currentState.personas.find((p: any) => p.id === id);

    if (!persona) {
      throw new Error('Persona not found');
    }

    if (persona.isBuiltin) {
      throw new Error('Cannot delete builtin persona');
    }

    try {
      if (isElectron() && window.electronAPI) {
        // Electron: SQLite에서 삭제
        await window.electronAPI.persona.delete(id);
      } else {
        // Web: localStorage에서 삭제
        const userPersonas = currentState.personas.filter((p: any) => !p.isBuiltin && p.id !== id);
        localStorage.setItem('sepilot_personas', JSON.stringify(userPersonas));
      }

      set((state: any) => ({
        personas: state.personas.filter((p: any) => p.id !== id),
        // 삭제된 페르소나가 활성화되어 있었다면 기본으로 변경
        activePersonaId: state.activePersonaId === id ? 'default' : state.activePersonaId,
      }));
    } catch (error) {
      console.error('Failed to delete persona:', error);
      throw error;
    }
  },

  setActivePersona: (personaId: any) => {
    set({ activePersonaId: personaId });
    // TODO: localStorage에 저장하여 앱 재시작 시에도 유지
    if (typeof window !== 'undefined') {
      localStorage.setItem('sepilot_active_persona', personaId || '');
    }
  },
}));
