import { create } from 'zustand';
import { Conversation, Message } from '@/types';
import { generateId } from '@/lib/utils';
import { GraphType } from '@/lib/langgraph';
import { isElectron } from '@/lib/platform';

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
  streamingConversations: Map<string, string>; // conversationId -> messageId mapping
  isLoading: boolean;
  graphType: GraphType;

  // Actions - Conversations
  createConversation: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  setActiveConversation: (id: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
  loadConversations: () => Promise<void>;
  searchConversations: (query: string) => Promise<Array<{conversation: Conversation; matchedMessages: Message[]}>>;

  // Actions - Messages
  addMessage: (message: Omit<Message, 'id' | 'created_at'>, conversationId?: string) => Promise<Message>;
  updateMessage: (id: string, updates: Partial<Message>, conversationId?: string) => void;
  deleteMessage: (id: string) => Promise<void>;
  clearMessages: () => void;

  // Actions - Streaming
  startStreaming: (conversationId: string, messageId: string) => void;
  stopStreaming: (conversationId: string) => void;
  isConversationStreaming: (conversationId: string) => boolean;

  // Actions - Graph
  setGraphType: (type: GraphType) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  // Initial state
  conversations: [],
  activeConversationId: null,
  messages: [],
  streamingConversations: new Map<string, string>(),
  isLoading: false,
  graphType: 'chat',

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
        const conversations = loadFromLocalStorage<Conversation[]>(
          STORAGE_KEYS.CONVERSATIONS,
          []
        );
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
      return {
        conversations: newConversations,
        activeConversationId: newConversation.id,
        messages: [],
      };
    });
  },

  deleteConversation: async (id: string) => {
    // Delete from database
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

    set((state) => {
      const filtered = state.conversations.filter((c) => c.id !== id);
      // Web or Electron DB delete failed: localStorage에서 삭제
      if (!deleted) {
        saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, filtered);
        // 메시지도 삭제
        const allMessages = loadFromLocalStorage<Record<string, Message[]>>(
          STORAGE_KEYS.MESSAGES,
          {}
        );
        delete allMessages[id];
        saveToLocalStorage(STORAGE_KEYS.MESSAGES, allMessages);
      }
      const newActiveId =
        state.activeConversationId === id
          ? filtered[0]?.id || null
          : state.activeConversationId;

      // Remove from streaming conversations if it was streaming
      const newStreamingConversations = new Map(state.streamingConversations);
      const wasStreaming = newStreamingConversations.has(id);
      newStreamingConversations.delete(id);

      return {
        conversations: filtered,
        activeConversationId: newActiveId,
        messages: newActiveId === id ? [] : state.messages,
        streamingConversations: newStreamingConversations,
      };
    });
  },

  setActiveConversation: async (id: string) => {
    set({
      activeConversationId: id,
      messages: [],
      isLoading: true,
    });

    // Load messages from database or localStorage
    try {
      let loaded = false;
      if (isElectron() && window.electronAPI) {
        // Electron: SQLite에서 로드 시도
        try {
          const result = await window.electronAPI.chat.loadMessages(id);
          if (result.success && result.data) {
            set({ messages: result.data, isLoading: false });
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
        set({ messages: allMessages[id] || [], isLoading: false });
      }
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
    const results: Array<{conversation: Conversation; matchedMessages: Message[]}> = [];

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

    // Only update messages if this message belongs to the currently active conversation
    set((state) => ({
      messages: state.activeConversationId === activeId
        ? [...state.messages, newMessage]
        : state.messages,
    }));

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
    // Only update UI if the message belongs to the currently active conversation
    set((state) => {
      const targetConvId = conversationId || state.activeConversationId;
      if (state.activeConversationId === targetConvId) {
        return {
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        };
      }
      return state;
    });

    // TODO: Update in database
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

    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    }));
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  // Streaming actions (conversation-specific)
  startStreaming: (conversationId: string, messageId: string) => {
    set((state) => {
      const newMap = new Map(state.streamingConversations);
      newMap.set(conversationId, messageId);
      return { streamingConversations: newMap };
    });
  },

  stopStreaming: (conversationId: string) => {
    set((state) => {
      const newMap = new Map(state.streamingConversations);
      newMap.delete(conversationId);
      return { streamingConversations: newMap };
    });
  },

  isConversationStreaming: (conversationId: string) => {
    return get().streamingConversations.has(conversationId);
  },

  // Graph
  setGraphType: (type: GraphType) => {
    set({ graphType: type });
  },
}));
