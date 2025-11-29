import { create } from 'zustand';
import { Conversation, Message, PendingToolApproval, ImageGenerationProgress } from '@/types';
import { generateId } from '@/lib/utils';
import type { GraphType, ThinkingMode, GraphConfig } from '@/lib/langgraph';
import { isElectron } from '@/lib/platform';
import type { BrowserAgentLogEntry } from '@/types/browser-agent';

// App mode types
export type AppMode = 'chat' | 'editor' | 'browser';

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
};

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

interface ChatStore {
  // State
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  messagesCache: Map<string, Message[]>; // conversationId -> messages cache (for background streaming)
  streamingConversations: Map<string, string>; // conversationId -> messageId mapping
  isLoading: boolean;

  // App Mode (Chat vs Editor)
  appMode: AppMode;

  // Editor State
  openFiles: OpenFile[];
  activeFilePath: string | null;
  activeEditorTab: 'files' | 'search' | 'browser'; // Files, Search, or Browser tab in Editor mode
  showTerminalPanel: boolean; // Show/hide terminal panel in Editor mode

  // New: Thinking Mode and Feature Toggles
  thinkingMode: ThinkingMode;
  enableRAG: boolean;
  enableTools: boolean;
  enableImageGeneration: boolean;
  workingDirectory: string | null; // Coding Agent working directory

  // Tool Approval (Human-in-the-loop)
  pendingToolApproval: PendingToolApproval | null;
  alwaysApproveToolsForSession: boolean; // Session-wide auto-approval (like Claude Code)

  // Image Generation Progress (per conversation)
  imageGenerationProgress: Map<string, ImageGenerationProgress>; // conversationId -> progress

  // Browser Mode Chat (simple side chat)
  browserChatMessages: Message[];
  browserViewMode: 'chat' | 'snapshots' | 'bookmarks' | 'settings';

  // Browser Agent Logs (실행 과정 가시성)
  browserAgentLogs: BrowserAgentLogEntry[];
  browserAgentIsRunning: boolean;
  showBrowserAgentLogs: boolean; // 로그 패널 표시 여부

  // Deprecated: kept for backward compatibility
  graphType: GraphType;
  isStreaming: boolean;
  streamingMessageId: string | null;

  // Actions - Conversations
  createConversation: () => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  setActiveConversation: (id: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
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

  // Actions - Streaming
  startStreaming: (conversationId: string, messageId: string) => void;
  stopStreaming: (conversationId: string) => void;
  isConversationStreaming: (conversationId: string) => boolean;

  // Actions - Graph Config
  setThinkingMode: (mode: ThinkingMode) => void;
  setEnableRAG: (enable: boolean) => void;
  setEnableTools: (enable: boolean) => void;
  setEnableImageGeneration: (enable: boolean) => void;
  setWorkingDirectory: (directory: string | null) => void;
  getGraphConfig: () => GraphConfig;

  // Actions - Tool Approval (Human-in-the-loop)
  setPendingToolApproval: (approval: PendingToolApproval) => void;
  clearPendingToolApproval: () => void;
  setAlwaysApproveToolsForSession: (enable: boolean) => void;

  // Actions - Image Generation Progress
  setImageGenerationProgress: (progress: ImageGenerationProgress) => void;
  updateImageGenerationProgress: (conversationId: string, updates: Partial<ImageGenerationProgress>) => void;
  clearImageGenerationProgress: (conversationId: string) => void;
  getImageGenerationProgress: (conversationId: string) => ImageGenerationProgress | undefined;

  // Actions - Browser Chat
  addBrowserChatMessage: (message: Omit<Message, 'id' | 'created_at' | 'conversation_id'>) => void;
  updateBrowserChatMessage: (id: string, updates: Partial<Message>) => void;
  clearBrowserChat: () => void;
  setBrowserViewMode: (mode: 'chat' | 'snapshots' | 'bookmarks' | 'settings') => void;

  // Actions - Browser Agent Logs
  addBrowserAgentLog: (log: Omit<BrowserAgentLogEntry, 'id' | 'timestamp'>) => void;
  clearBrowserAgentLogs: () => void;
  setBrowserAgentIsRunning: (isRunning: boolean) => void;
  setShowBrowserAgentLogs: (show: boolean) => void;

  // Actions - App Mode
  setAppMode: (mode: AppMode) => void;
  setActiveEditorTab: (tab: 'files' | 'search') => void;
  setShowTerminalPanel: (show: boolean) => void;

  // Actions - Editor
  openFile: (file: Omit<OpenFile, 'isDirty'> & { initialPosition?: { lineNumber: number; column?: number } }) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  updateFileContent: (path: string, content: string) => void;
  markFileDirty: (path: string, isDirty: boolean) => void;
  clearInitialPosition: (path: string) => void;
  closeAllFiles: () => void;

  // Deprecated: kept for backward compatibility
  setGraphType: (type: GraphType) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  // Initial state
  conversations: [],
  activeConversationId: null,
  messages: [],
  messagesCache: new Map<string, Message[]>(),
  streamingConversations: new Map<string, string>(),
  isLoading: false,

  // App Mode
  appMode: 'chat',

  // Editor State
  openFiles: [],
  activeFilePath: null,
  activeEditorTab: 'files',
  showTerminalPanel: false,

  // New: Graph Configuration
  thinkingMode: 'instant',
  enableRAG: false,
  enableTools: false,
  enableImageGeneration: false,
  workingDirectory: null,

  // Tool Approval (Human-in-the-loop)
  pendingToolApproval: null,
  alwaysApproveToolsForSession: false,

  // Image Generation Progress
  imageGenerationProgress: new Map<string, ImageGenerationProgress>(),

  // Browser Chat
  browserChatMessages: [],
  browserViewMode: 'chat',

  // Browser Agent Logs
  browserAgentLogs: [],
  browserAgentIsRunning: false,
  showBrowserAgentLogs: false,

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
    const newConversation: Conversation = {
      id: generateId(),
      title: '새 대화',
      created_at: Date.now(),
      updated_at: Date.now(),
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
    set((state) => {
      const newConversations = [newConversation, ...state.conversations];
      // Web or Electron DB save failed: localStorage에 저장
      if (!saved) {
        saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, newConversations);
      }
      // Initialize empty cache for new conversation
      const newCache = new Map(state.messagesCache);
      newCache.set(newConversation.id, []);

      return {
        conversations: newConversations,
        activeConversationId: newConversation.id,
        messages: [],
        messagesCache: newCache,
      };
    });

    return newConversation.id;
  },

  deleteConversation: async (id: string) => {
    const state = get();
    const wasActive = state.activeConversationId === id;

    // Immediately update UI state to prevent input blocking
    // This prevents the textarea from being disabled during async DB operation
    set((currentState) => {
      const filtered = currentState.conversations.filter((c) => c.id !== id);
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
      const newMessages = newActiveId ? newCache.get(newActiveId) || [] : [];

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
      const newState = get();
      if (newState.activeConversationId) {
        // Load messages for the new active conversation (non-blocking)
        get().setActiveConversation(newState.activeConversationId);
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
      const currentState = get();
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

  setActiveConversation: async (id: string) => {
    const state = get();
    const isCurrentlyStreaming = state.streamingConversations.has(id);
    const cachedMessages = state.messagesCache.get(id);

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
      set((currentState) => {
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

    set((state) => {
      const updatedConversations = state.conversations.map((c) =>
        c.id === id ? { ...c, title, updated_at: Date.now() } : c
      );
      // Web or Electron DB update failed: localStorage에 저장
      if (!updated) {
        saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, updatedConversations);
      }
      return { conversations: updatedConversations };
    });
  },

  searchConversations: async (query: string) => {
    if (!query.trim()) {
      return [];
    }

    const searchTerm = query.toLowerCase();
    const results: Array<{ conversation: Conversation; matchedMessages: Message[] }> = [];

    // Search through all conversations
    for (const conversation of get().conversations) {
      // Check if conversation title matches
      const titleMatches = conversation.title.toLowerCase().includes(searchTerm);

      // Load messages for this conversation
      let conversationMessages: Message[] = [];

      if (isElectron() && window.electronAPI) {
        try {
          const result = await window.electronAPI.chat.loadMessages(conversation.id);
          if (result.success && result.data) {
            conversationMessages = result.data;
          }
        } catch (error) {
          console.error('Failed to load messages for search:', error);
        }
      } else {
        // Web: localStorage에서 로드
        const allMessages = loadFromLocalStorage<Record<string, Message[]>>(
          STORAGE_KEYS.MESSAGES,
          {}
        );
        conversationMessages = allMessages[conversation.id] || [];
      }

      // Find matching messages
      const matchedMessages = conversationMessages.filter((msg) =>
        msg.content.toLowerCase().includes(searchTerm)
      );

      // Add to results if title matches or has matching messages
      if (titleMatches || matchedMessages.length > 0) {
        results.push({
          conversation,
          matchedMessages,
        });
      }
    }

    // Sort by relevance: title matches first, then by number of matched messages
    results.sort((a, b) => {
      const aTitleMatch = a.conversation.title.toLowerCase().includes(searchTerm) ? 1 : 0;
      const bTitleMatch = b.conversation.title.toLowerCase().includes(searchTerm) ? 1 : 0;

      if (aTitleMatch !== bTitleMatch) {
        return bTitleMatch - aTitleMatch; // Title matches first
      }

      return b.matchedMessages.length - a.matchedMessages.length; // More matches first
    });

    return results;
  },

  // Messages
  addMessage: async (message, conversationId) => {
    const activeId = conversationId || get().activeConversationId;
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

    // Update both UI messages and cache
    set((state) => {
      // Always update the cache for this conversation
      const newCache = new Map(state.messagesCache);
      const cachedMessages = newCache.get(activeId) || [];
      newCache.set(activeId, [...cachedMessages, newMessage]);

      return {
        // Only update UI if this is the active conversation
        messages:
          state.activeConversationId === activeId ? [...state.messages, newMessage] : state.messages,
        messagesCache: newCache,
      };
    });

    // Update conversation updated_at
    const conversation = get().conversations.find((c) => c.id === activeId);
    if (conversation) {
      if (isElectron() && window.electronAPI) {
        await window.electronAPI.chat.saveConversation({
          ...conversation,
          updated_at: Date.now(),
        });
      }

      set((state) => {
        const updatedConversations = state.conversations.map((c) =>
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

  updateMessage: (id: string, updates: Partial<Message>, conversationId) => {
    set((state) => {
      const targetConvId = conversationId || state.activeConversationId;
      if (!targetConvId) {
        return state;
      }

      // Always update the cache for this conversation
      const newCache = new Map(state.messagesCache);
      const cachedMessages = newCache.get(targetConvId) || [];
      const updatedCachedMessages = cachedMessages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      );
      newCache.set(targetConvId, updatedCachedMessages);

      // Update UI only if the message belongs to the currently active conversation
      if (state.activeConversationId === targetConvId) {
        return {
          messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
          messagesCache: newCache,
        };
      }

      // Background conversation: only update cache
      return {
        messagesCache: newCache,
      };
    });
  },

  deleteMessage: async (id: string) => {
    const activeId = get().activeConversationId;

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
        allMessages[activeId] = allMessages[activeId].filter((m) => m.id !== id);
        saveToLocalStorage(STORAGE_KEYS.MESSAGES, allMessages);
      }
    }

    set((state) => {
      // Also delete from cache
      const newCache = new Map(state.messagesCache);
      if (activeId) {
        const cachedMessages = newCache.get(activeId) || [];
        newCache.set(activeId, cachedMessages.filter((m) => m.id !== id));
      }

      return {
        messages: state.messages.filter((m) => m.id !== id),
        messagesCache: newCache,
      };
    });
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  // Streaming actions (conversation-specific)
  startStreaming: (conversationId: string, messageId: string) => {
    set((state) => {
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
    set((state) => {
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
    return get().streamingConversations.has(conversationId);
  },

  // Graph Configuration
  setThinkingMode: (mode: ThinkingMode) => {
    set({ thinkingMode: mode });
  },

  setEnableRAG: (enable: boolean) => {
    set({ enableRAG: enable });
  },

  setEnableTools: (enable: boolean) => {
    set({ enableTools: enable });
  },

  setEnableImageGeneration: (enable: boolean) => {
    set({ enableImageGeneration: enable });
  },

  setWorkingDirectory: (directory: string | null) => {
    set({ workingDirectory: directory });
  },

  getGraphConfig: (): GraphConfig => {
    const state = get();
    return {
      thinkingMode: state.thinkingMode,
      enableRAG: state.enableRAG,
      enableTools: state.enableTools,
      enableImageGeneration: state.enableImageGeneration,
    };
  },

  // Deprecated: kept for backward compatibility
  setGraphType: (type: GraphType) => {
    // Map old GraphType to new configuration
    switch (type) {
      case 'chat':
        set({ graphType: type, thinkingMode: 'instant', enableRAG: false, enableTools: false });
        break;
      case 'rag':
        set({ graphType: type, thinkingMode: 'instant', enableRAG: true, enableTools: false });
        break;
      case 'agent':
        set({ graphType: type, thinkingMode: 'instant', enableRAG: false, enableTools: true });
        break;
    }
  },

  // Tool Approval (Human-in-the-loop)
  setPendingToolApproval: (approval: PendingToolApproval) => {
    set({ pendingToolApproval: approval });
  },

  clearPendingToolApproval: () => {
    set({ pendingToolApproval: null });
  },

  setAlwaysApproveToolsForSession: (enable: boolean) => {
    set({ alwaysApproveToolsForSession: enable });
  },

  // Image Generation Progress
  setImageGenerationProgress: (progress: ImageGenerationProgress) => {
    set((state) => {
      const newMap = new Map(state.imageGenerationProgress);
      newMap.set(progress.conversationId, progress);
      return { imageGenerationProgress: newMap };
    });
  },

  updateImageGenerationProgress: (conversationId: string, updates: Partial<ImageGenerationProgress>) => {
    set((state) => {
      const newMap = new Map(state.imageGenerationProgress);
      const existing = newMap.get(conversationId);
      if (existing) {
        newMap.set(conversationId, { ...existing, ...updates });
      }
      return { imageGenerationProgress: newMap };
    });
  },

  clearImageGenerationProgress: (conversationId: string) => {
    set((state) => {
      const newMap = new Map(state.imageGenerationProgress);
      newMap.delete(conversationId);
      return { imageGenerationProgress: newMap };
    });
  },

  getImageGenerationProgress: (conversationId: string) => {
    return get().imageGenerationProgress.get(conversationId);
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

  // Browser Chat Actions
  addBrowserChatMessage: (message: Omit<Message, 'id' | 'created_at' | 'conversation_id'>) => {
    const newMessage: Message = {
      ...message,
      id: generateId(),
      conversation_id: 'browser-chat',
      created_at: Date.now(),
    };

    set((state) => ({
      browserChatMessages: [...state.browserChatMessages, newMessage],
    }));
  },

  updateBrowserChatMessage: (id: string, updates: Partial<Message>) => {
    set((state) => ({
      browserChatMessages: state.browserChatMessages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    }));
  },

  clearBrowserChat: () => {
    set({ browserChatMessages: [] });
  },

  setBrowserViewMode: (mode: 'chat' | 'snapshots' | 'bookmarks' | 'settings') => {
    set({ browserViewMode: mode });
  },

  // Browser Agent Logs Actions
  addBrowserAgentLog: (log: Omit<BrowserAgentLogEntry, 'id' | 'timestamp'>) => {
    const newLog: BrowserAgentLogEntry = {
      ...log,
      id: generateId(),
      timestamp: Date.now(),
    };
    set((state) => ({
      browserAgentLogs: [...state.browserAgentLogs, newLog],
    }));
  },

  clearBrowserAgentLogs: () => {
    set({ browserAgentLogs: [] });
  },

  setBrowserAgentIsRunning: (isRunning: boolean) => {
    set({ browserAgentIsRunning: isRunning });
  },

  setShowBrowserAgentLogs: (show: boolean) => {
    set({ showBrowserAgentLogs: show });
  },

  // Editor Actions
  openFile: (file: Omit<OpenFile, 'isDirty'> & { initialPosition?: { lineNumber: number; column?: number } }) => {
    set((state) => {
      // Check if file is already open
      const existingFileIndex = state.openFiles.findIndex((f) => f.path === file.path);
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
    set((state) => {
      const filtered = state.openFiles.filter((f) => f.path !== path);
      const newActiveFilePath =
        state.activeFilePath === path
          ? filtered[0]?.path || null
          : state.activeFilePath;

      return {
        openFiles: filtered,
        activeFilePath: newActiveFilePath,
      };
    });
  },

  setActiveFile: (path: string | null) => {
    set({ activeFilePath: path });
  },

  updateFileContent: (path: string, content: string) => {
    set((state) => {
      const updatedFiles = state.openFiles.map((file) =>
        file.path === path ? { ...file, content, isDirty: true } : file
      );

      return { openFiles: updatedFiles };
    });
  },

  markFileDirty: (path: string, isDirty: boolean) => {
    set((state) => {
      const updatedFiles = state.openFiles.map((file) =>
        file.path === path ? { ...file, isDirty } : file
      );

      return { openFiles: updatedFiles };
    });
  },

  clearInitialPosition: (path: string) => {
    set((state) => {
      const updatedFiles = state.openFiles.map((file) =>
        file.path === path ? { ...file, initialPosition: undefined } : file
      );

      return { openFiles: updatedFiles };
    });
  },

  closeAllFiles: () => {
    set({ openFiles: [], activeFilePath: null });
  },
}));
