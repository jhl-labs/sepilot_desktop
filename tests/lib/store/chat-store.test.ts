/**
 * ChatStore 테스트
 */

import { useChatStore } from '@/lib/store/chat-store';
import { enableElectronMode, disableElectronMode, mockElectronAPI } from '../../setup';
import type { Conversation, Message } from '@/types';

describe('ChatStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    disableElectronMode();

    // Reset store state
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      messages: [],
      streamingConversations: new Map(),
      isLoading: false,
      graphType: 'chat',
    });
  });

  describe('initial state', () => {
    it('should have empty initial state', () => {
      const state = useChatStore.getState();

      expect(state.conversations).toEqual([]);
      expect(state.activeConversationId).toBeNull();
      expect(state.messages).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.graphType).toBe('chat');
    });
  });

  describe('createConversation', () => {
    it('should create a new conversation in web mode', async () => {
      disableElectronMode();

      await useChatStore.getState().createConversation();
      const state = useChatStore.getState();

      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].title).toBe('새 대화');
      expect(state.activeConversationId).toBe(state.conversations[0].id);
      expect(state.messages).toEqual([]);
    });

    it('should create a new conversation in electron mode', async () => {
      enableElectronMode();
      mockElectronAPI.chat.saveConversation.mockResolvedValue({ success: true });

      await useChatStore.getState().createConversation();
      const state = useChatStore.getState();

      expect(state.conversations).toHaveLength(1);
      expect(mockElectronAPI.chat.saveConversation).toHaveBeenCalled();
    });

    it('should fallback to localStorage if Electron save fails', async () => {
      enableElectronMode();
      mockElectronAPI.chat.saveConversation.mockResolvedValue({
        success: false,
        error: 'DB error',
      });

      await useChatStore.getState().createConversation();
      const state = useChatStore.getState();

      expect(state.conversations).toHaveLength(1);
      expect(localStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation and update active', async () => {
      // Setup: create two conversations
      useChatStore.setState({
        conversations: [
          { id: 'conv-1', title: 'First', created_at: 100, updated_at: 100 },
          { id: 'conv-2', title: 'Second', created_at: 200, updated_at: 200 },
        ],
        activeConversationId: 'conv-1',
        messages: [],
      });

      await useChatStore.getState().deleteConversation('conv-1');
      const state = useChatStore.getState();

      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].id).toBe('conv-2');
      expect(state.activeConversationId).toBe('conv-2');
    });

    it('should clear messages when deleting active conversation', async () => {
      useChatStore.setState({
        conversations: [{ id: 'conv-1', title: 'Test', created_at: 100, updated_at: 100 }],
        activeConversationId: 'conv-1',
        messages: [{ id: 'msg-1', role: 'user', content: 'Hello', created_at: 100 }],
      });

      await useChatStore.getState().deleteConversation('conv-1');
      const state = useChatStore.getState();

      expect(state.conversations).toHaveLength(0);
      expect(state.activeConversationId).toBeNull();
    });

    it('should remove from streaming conversations', async () => {
      const streamingMap = new Map<string, string>();
      streamingMap.set('conv-1', 'msg-1');

      useChatStore.setState({
        conversations: [{ id: 'conv-1', title: 'Test', created_at: 100, updated_at: 100 }],
        activeConversationId: 'conv-1',
        streamingConversations: streamingMap,
      });

      await useChatStore.getState().deleteConversation('conv-1');
      const state = useChatStore.getState();

      expect(state.streamingConversations.has('conv-1')).toBe(false);
    });
  });

  describe('setActiveConversation', () => {
    it('should set active conversation and load messages', async () => {
      disableElectronMode();
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify({
          'conv-1': [{ id: 'msg-1', role: 'user', content: 'Hello', created_at: 100 }],
        })
      );

      useChatStore.setState({
        conversations: [{ id: 'conv-1', title: 'Test', created_at: 100, updated_at: 100 }],
      });

      await useChatStore.getState().setActiveConversation('conv-1');
      const state = useChatStore.getState();

      expect(state.activeConversationId).toBe('conv-1');
      expect(state.isLoading).toBe(false);
    });

    it('should load messages from Electron in electron mode', async () => {
      enableElectronMode();
      const mockMessages: Message[] = [
        { id: 'msg-1', role: 'user', content: 'Test', created_at: 100 },
      ];
      mockElectronAPI.chat.loadMessages.mockResolvedValue({
        success: true,
        data: mockMessages,
      });

      await useChatStore.getState().setActiveConversation('conv-1');
      const state = useChatStore.getState();

      expect(state.messages).toEqual(mockMessages);
      expect(mockElectronAPI.chat.loadMessages).toHaveBeenCalledWith('conv-1');
    });
  });

  describe('updateConversationTitle', () => {
    it('should update conversation title', async () => {
      useChatStore.setState({
        conversations: [{ id: 'conv-1', title: 'Old Title', created_at: 100, updated_at: 100 }],
      });

      await useChatStore.getState().updateConversationTitle('conv-1', 'New Title');
      const state = useChatStore.getState();

      expect(state.conversations[0].title).toBe('New Title');
      expect(state.conversations[0].updated_at).toBeGreaterThan(100);
    });
  });

  describe('addMessage', () => {
    it('should throw error if no active conversation', async () => {
      useChatStore.setState({ activeConversationId: null });

      await expect(
        useChatStore.getState().addMessage({ role: 'user', content: 'Hello' })
      ).rejects.toThrow('No active conversation');
    });

    it('should add message in web mode', async () => {
      disableElectronMode();
      (localStorage.getItem as jest.Mock).mockReturnValue('{}');

      useChatStore.setState({
        conversations: [{ id: 'conv-1', title: 'Test', created_at: 100, updated_at: 100 }],
        activeConversationId: 'conv-1',
        messages: [],
      });

      const message = await useChatStore.getState().addMessage({
        role: 'user',
        content: 'Hello',
      });

      expect(message.id).toBeDefined();
      expect(message.conversation_id).toBe('conv-1');
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello');

      const state = useChatStore.getState();
      expect(state.messages).toHaveLength(1);
    });

    it('should add message in electron mode', async () => {
      enableElectronMode();
      mockElectronAPI.chat.saveMessage.mockResolvedValue({ success: true });
      mockElectronAPI.chat.saveConversation.mockResolvedValue({ success: true });

      useChatStore.setState({
        conversations: [{ id: 'conv-1', title: 'Test', created_at: 100, updated_at: 100 }],
        activeConversationId: 'conv-1',
        messages: [],
      });

      await useChatStore.getState().addMessage({ role: 'user', content: 'Test' });

      expect(mockElectronAPI.chat.saveMessage).toHaveBeenCalled();
    });

    it('should throw error when Electron save fails', async () => {
      enableElectronMode();
      mockElectronAPI.chat.saveMessage.mockResolvedValue({
        success: false,
        error: 'Save failed',
      });

      useChatStore.setState({
        conversations: [{ id: 'conv-1', title: 'Test', created_at: 100, updated_at: 100 }],
        activeConversationId: 'conv-1',
      });

      await expect(
        useChatStore.getState().addMessage({ role: 'user', content: 'Test' })
      ).rejects.toThrow('Save failed');
    });
  });

  describe('updateMessage', () => {
    it('should update message content', () => {
      useChatStore.setState({
        activeConversationId: 'conv-1',
        messages: [
          { id: 'msg-1', role: 'assistant', content: 'Hello', created_at: 100 },
        ],
      });

      useChatStore.getState().updateMessage('msg-1', { content: 'Updated content' });
      const state = useChatStore.getState();

      expect(state.messages[0].content).toBe('Updated content');
    });

    it('should not update if conversation ID does not match', () => {
      useChatStore.setState({
        activeConversationId: 'conv-1',
        messages: [
          { id: 'msg-1', role: 'assistant', content: 'Hello', created_at: 100 },
        ],
      });

      useChatStore.getState().updateMessage('msg-1', { content: 'Updated' }, 'conv-2');
      const state = useChatStore.getState();

      expect(state.messages[0].content).toBe('Hello');
    });
  });

  describe('deleteMessage', () => {
    it('should delete message', async () => {
      disableElectronMode();
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify({ 'conv-1': [{ id: 'msg-1', role: 'user', content: 'Hello', created_at: 100 }] })
      );

      useChatStore.setState({
        activeConversationId: 'conv-1',
        messages: [{ id: 'msg-1', role: 'user', content: 'Hello', created_at: 100 }],
      });

      await useChatStore.getState().deleteMessage('msg-1');
      const state = useChatStore.getState();

      expect(state.messages).toHaveLength(0);
    });
  });

  describe('clearMessages', () => {
    it('should clear all messages', () => {
      useChatStore.setState({
        messages: [
          { id: 'msg-1', role: 'user', content: 'Hello', created_at: 100 },
          { id: 'msg-2', role: 'assistant', content: 'Hi', created_at: 200 },
        ],
      });

      useChatStore.getState().clearMessages();
      const state = useChatStore.getState();

      expect(state.messages).toHaveLength(0);
    });
  });

  describe('streaming', () => {
    it('should track streaming state', () => {
      useChatStore.getState().startStreaming('conv-1', 'msg-1');

      expect(useChatStore.getState().isConversationStreaming('conv-1')).toBe(true);
      expect(useChatStore.getState().streamingConversations.get('conv-1')).toBe('msg-1');
    });

    it('should stop streaming', () => {
      useChatStore.getState().startStreaming('conv-1', 'msg-1');
      useChatStore.getState().stopStreaming('conv-1');

      expect(useChatStore.getState().isConversationStreaming('conv-1')).toBe(false);
    });

    it('should handle multiple streaming conversations', () => {
      useChatStore.getState().startStreaming('conv-1', 'msg-1');
      useChatStore.getState().startStreaming('conv-2', 'msg-2');

      expect(useChatStore.getState().isConversationStreaming('conv-1')).toBe(true);
      expect(useChatStore.getState().isConversationStreaming('conv-2')).toBe(true);

      useChatStore.getState().stopStreaming('conv-1');

      expect(useChatStore.getState().isConversationStreaming('conv-1')).toBe(false);
      expect(useChatStore.getState().isConversationStreaming('conv-2')).toBe(true);
    });
  });

  describe('graphType', () => {
    it('should set graph type', () => {
      useChatStore.getState().setGraphType('rag');
      expect(useChatStore.getState().graphType).toBe('rag');

      useChatStore.getState().setGraphType('agent');
      expect(useChatStore.getState().graphType).toBe('agent');

      useChatStore.getState().setGraphType('chat');
      expect(useChatStore.getState().graphType).toBe('chat');
    });
  });

  describe('searchConversations', () => {
    it('should return empty for empty query', async () => {
      const results = await useChatStore.getState().searchConversations('');
      expect(results).toEqual([]);
    });

    it('should return empty for whitespace query', async () => {
      const results = await useChatStore.getState().searchConversations('   ');
      expect(results).toEqual([]);
    });

    it('should search by title', async () => {
      useChatStore.setState({
        conversations: [
          { id: 'conv-1', title: 'React Tutorial', created_at: 100, updated_at: 100 },
          { id: 'conv-2', title: 'Python Basics', created_at: 200, updated_at: 200 },
        ],
      });

      const results = await useChatStore.getState().searchConversations('react');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].conversation.title).toContain('React');
    });
  });

  describe('loadConversations', () => {
    it('should load conversations from localStorage in web mode', async () => {
      disableElectronMode();
      const mockConversations: Conversation[] = [
        { id: 'conv-1', title: 'Test 1', created_at: 100, updated_at: 100 },
        { id: 'conv-2', title: 'Test 2', created_at: 200, updated_at: 200 },
      ];
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(mockConversations));

      await useChatStore.getState().loadConversations();
      const state = useChatStore.getState();

      expect(state.conversations).toEqual(mockConversations);
    });

    it('should load conversations from Electron in electron mode', async () => {
      enableElectronMode();
      const mockConversations: Conversation[] = [
        { id: 'conv-1', title: 'Test', created_at: 100, updated_at: 100 },
      ];
      mockElectronAPI.chat.loadConversations.mockResolvedValue({
        success: true,
        data: mockConversations,
      });

      await useChatStore.getState().loadConversations();
      const state = useChatStore.getState();

      expect(state.conversations).toEqual(mockConversations);
    });
  });
});
