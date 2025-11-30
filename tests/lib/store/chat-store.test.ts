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
      messagesCache: new Map(),
      streamingConversations: new Map(),
      isLoading: false,
      graphType: 'chat',
      appMode: 'chat',
      openFiles: [],
      activeFilePath: null,
      activeEditorTab: 'files',
      thinkingMode: 'instant',
      enableRAG: false,
      enableTools: false,
      enableImageGeneration: false,
      workingDirectory: null,
      pendingToolApproval: null,
      alwaysApproveToolsForSession: false,
      imageGenerationProgress: new Map(),
      browserChatMessages: [],
      isStreaming: false,
      streamingMessageId: null,
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

      // Reset localStorage mock to avoid interference from previous test
      (localStorage.getItem as jest.Mock).mockReset();
      (localStorage.getItem as jest.Mock).mockReturnValue(null);

      const mockMessages: Message[] = [
        { id: 'msg-1', role: 'user', content: 'Test', created_at: 100 },
      ];
      mockElectronAPI.chat.loadMessages.mockResolvedValue({
        success: true,
        data: mockMessages,
      });

      // Clear store state completely including cache
      useChatStore.setState({
        conversations: [{ id: 'conv-1', title: 'Test', created_at: 100, updated_at: 100 }],
        messages: [],
        messagesCache: new Map(), // Clear cache to avoid interference
        activeConversationId: null,
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
        messages: [{ id: 'msg-1', role: 'assistant', content: 'Hello', created_at: 100 }],
      });

      useChatStore.getState().updateMessage('msg-1', { content: 'Updated content' });
      const state = useChatStore.getState();

      expect(state.messages[0].content).toBe('Updated content');
    });

    it('should not update if conversation ID does not match', () => {
      useChatStore.setState({
        activeConversationId: 'conv-1',
        messages: [{ id: 'msg-1', role: 'assistant', content: 'Hello', created_at: 100 }],
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
        JSON.stringify({
          'conv-1': [{ id: 'msg-1', role: 'user', content: 'Hello', created_at: 100 }],
        })
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

    it('should handle localStorage parse errors', async () => {
      disableElectronMode();
      (localStorage.getItem as jest.Mock).mockReturnValue('invalid json');

      await useChatStore.getState().loadConversations();
      const state = useChatStore.getState();

      // Should fallback to empty array
      expect(state.conversations).toEqual([]);
    });

    it('should handle Electron load errors', async () => {
      enableElectronMode();
      mockElectronAPI.chat.loadConversations.mockRejectedValue(new Error('DB error'));

      await useChatStore.getState().loadConversations();

      // Should not crash, error is logged
      expect(useChatStore.getState().conversations).toBeDefined();
    });
  });

  describe('graph configuration', () => {
    it('should set thinking mode', () => {
      useChatStore.getState().setThinkingMode('deep');
      expect(useChatStore.getState().thinkingMode).toBe('deep');

      useChatStore.getState().setThinkingMode('instant');
      expect(useChatStore.getState().thinkingMode).toBe('instant');
    });

    it('should enable/disable RAG', () => {
      useChatStore.getState().setEnableRAG(true);
      expect(useChatStore.getState().enableRAG).toBe(true);

      useChatStore.getState().setEnableRAG(false);
      expect(useChatStore.getState().enableRAG).toBe(false);
    });

    it('should enable/disable Tools', () => {
      useChatStore.getState().setEnableTools(true);
      expect(useChatStore.getState().enableTools).toBe(true);

      useChatStore.getState().setEnableTools(false);
      expect(useChatStore.getState().enableTools).toBe(false);
    });

    it('should enable/disable Image Generation', () => {
      useChatStore.getState().setEnableImageGeneration(true);
      expect(useChatStore.getState().enableImageGeneration).toBe(true);

      useChatStore.getState().setEnableImageGeneration(false);
      expect(useChatStore.getState().enableImageGeneration).toBe(false);
    });

    it('should set working directory', () => {
      useChatStore.getState().setWorkingDirectory('/test/path');
      expect(useChatStore.getState().workingDirectory).toBe('/test/path');

      useChatStore.getState().setWorkingDirectory(null);
      expect(useChatStore.getState().workingDirectory).toBeNull();
    });

    it('should get graph config', () => {
      useChatStore.setState({
        thinkingMode: 'deep',
        enableRAG: true,
        enableTools: false,
        enableImageGeneration: true,
      });

      const config = useChatStore.getState().getGraphConfig();

      expect(config).toEqual({
        thinkingMode: 'deep',
        enableRAG: true,
        enableTools: false,
        enableImageGeneration: true,
      });
    });
  });

  describe('tool approval', () => {
    it('should set pending tool approval', () => {
      const approval = {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolName: 'file_read',
        args: { path: '/test.txt' },
      };

      useChatStore.getState().setPendingToolApproval(approval);
      expect(useChatStore.getState().pendingToolApproval).toEqual(approval);
    });

    it('should clear pending tool approval', () => {
      const approval = {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolName: 'file_read',
        args: { path: '/test.txt' },
      };

      useChatStore.getState().setPendingToolApproval(approval);
      useChatStore.getState().clearPendingToolApproval();
      expect(useChatStore.getState().pendingToolApproval).toBeNull();
    });

    it('should set always approve tools for session', () => {
      useChatStore.getState().setAlwaysApproveToolsForSession(true);
      expect(useChatStore.getState().alwaysApproveToolsForSession).toBe(true);

      useChatStore.getState().setAlwaysApproveToolsForSession(false);
      expect(useChatStore.getState().alwaysApproveToolsForSession).toBe(false);
    });
  });

  describe('image generation progress', () => {
    it('should set image generation progress', () => {
      const progress = {
        conversationId: 'conv-1',
        status: 'processing' as const,
        prompt: 'test prompt',
        progress: 50,
      };

      useChatStore.getState().setImageGenerationProgress(progress);
      expect(useChatStore.getState().getImageGenerationProgress('conv-1')).toEqual(progress);
    });

    it('should update image generation progress', () => {
      const progress = {
        conversationId: 'conv-1',
        status: 'processing' as const,
        prompt: 'test prompt',
        progress: 50,
      };

      useChatStore.getState().setImageGenerationProgress(progress);
      useChatStore.getState().updateImageGenerationProgress('conv-1', { progress: 80 });

      const updated = useChatStore.getState().getImageGenerationProgress('conv-1');
      expect(updated?.progress).toBe(80);
    });

    it('should not update if progress does not exist', () => {
      useChatStore.getState().updateImageGenerationProgress('non-existent', { progress: 100 });
      expect(useChatStore.getState().getImageGenerationProgress('non-existent')).toBeUndefined();
    });

    it('should clear image generation progress', () => {
      const progress = {
        conversationId: 'conv-1',
        status: 'processing' as const,
        prompt: 'test prompt',
        progress: 50,
      };

      useChatStore.getState().setImageGenerationProgress(progress);
      useChatStore.getState().clearImageGenerationProgress('conv-1');
      expect(useChatStore.getState().getImageGenerationProgress('conv-1')).toBeUndefined();
    });
  });

  describe('app mode', () => {
    it('should set app mode', () => {
      useChatStore.getState().setAppMode('editor');
      expect(useChatStore.getState().appMode).toBe('editor');

      useChatStore.getState().setAppMode('browser');
      expect(useChatStore.getState().appMode).toBe('browser');

      useChatStore.getState().setAppMode('chat');
      expect(useChatStore.getState().appMode).toBe('chat');
    });

    it('should set active editor tab', () => {
      useChatStore.getState().setActiveEditorTab('search');
      expect(useChatStore.getState().activeEditorTab).toBe('search');

      useChatStore.getState().setActiveEditorTab('files');
      expect(useChatStore.getState().activeEditorTab).toBe('files');
    });
  });

  describe('browser chat', () => {
    it('should add browser chat message', () => {
      useChatStore.getState().addBrowserChatMessage({
        role: 'user',
        content: 'Hello browser',
      });

      const messages = useChatStore.getState().browserChatMessages;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello browser');
      expect(messages[0].conversation_id).toBe('browser-chat');
    });

    it('should update browser chat message', () => {
      useChatStore.getState().addBrowserChatMessage({
        role: 'assistant',
        content: 'Original',
      });

      const messageId = useChatStore.getState().browserChatMessages[0].id;
      useChatStore.getState().updateBrowserChatMessage(messageId, { content: 'Updated' });

      const messages = useChatStore.getState().browserChatMessages;
      expect(messages[0].content).toBe('Updated');
    });

    it('should clear browser chat', () => {
      useChatStore.getState().addBrowserChatMessage({
        role: 'user',
        content: 'Test',
      });

      useChatStore.getState().clearBrowserChat();
      expect(useChatStore.getState().browserChatMessages).toHaveLength(0);
    });
  });

  describe('editor actions', () => {
    it('should open a new file', () => {
      useChatStore.getState().openFile({
        path: '/test/file.ts',
        filename: 'file.ts',
        content: 'const x = 1;',
        language: 'typescript',
      });

      const state = useChatStore.getState();
      expect(state.openFiles).toHaveLength(1);
      expect(state.openFiles[0].path).toBe('/test/file.ts');
      expect(state.openFiles[0].isDirty).toBe(false);
      expect(state.activeFilePath).toBe('/test/file.ts');
    });

    it('should open file with initial position', () => {
      useChatStore.getState().openFile({
        path: '/test/file.ts',
        filename: 'file.ts',
        content: 'const x = 1;',
        language: 'typescript',
        initialPosition: { lineNumber: 10, column: 5 },
      });

      const state = useChatStore.getState();
      expect(state.openFiles[0].initialPosition).toEqual({ lineNumber: 10, column: 5 });
    });

    it('should update existing file with new initial position', () => {
      useChatStore.getState().openFile({
        path: '/test/file.ts',
        filename: 'file.ts',
        content: 'const x = 1;',
      });

      useChatStore.getState().openFile({
        path: '/test/file.ts',
        filename: 'file.ts',
        content: 'const x = 1;',
        initialPosition: { lineNumber: 20 },
      });

      const state = useChatStore.getState();
      expect(state.openFiles).toHaveLength(1);
      expect(state.openFiles[0].initialPosition).toEqual({ lineNumber: 20 });
    });

    it('should set active file when reopening', () => {
      useChatStore.getState().openFile({
        path: '/test/file1.ts',
        filename: 'file1.ts',
        content: 'const x = 1;',
      });

      useChatStore.getState().openFile({
        path: '/test/file2.ts',
        filename: 'file2.ts',
        content: 'const y = 2;',
      });

      expect(useChatStore.getState().activeFilePath).toBe('/test/file2.ts');

      useChatStore.getState().openFile({
        path: '/test/file1.ts',
        filename: 'file1.ts',
        content: 'const x = 1;',
      });

      expect(useChatStore.getState().activeFilePath).toBe('/test/file1.ts');
    });

    it('should close file', () => {
      useChatStore.getState().openFile({
        path: '/test/file1.ts',
        filename: 'file1.ts',
        content: 'const x = 1;',
      });

      useChatStore.getState().openFile({
        path: '/test/file2.ts',
        filename: 'file2.ts',
        content: 'const y = 2;',
      });

      useChatStore.getState().closeFile('/test/file1.ts');

      const state = useChatStore.getState();
      expect(state.openFiles).toHaveLength(1);
      expect(state.openFiles[0].path).toBe('/test/file2.ts');
    });

    it('should update active file when closing active file', () => {
      useChatStore.getState().openFile({
        path: '/test/file1.ts',
        filename: 'file1.ts',
        content: 'const x = 1;',
      });

      useChatStore.getState().openFile({
        path: '/test/file2.ts',
        filename: 'file2.ts',
        content: 'const y = 2;',
      });

      useChatStore.getState().closeFile('/test/file2.ts');

      const state = useChatStore.getState();
      expect(state.activeFilePath).toBe('/test/file1.ts');
    });

    it('should set active file path to null when closing last file', () => {
      useChatStore.getState().openFile({
        path: '/test/file.ts',
        filename: 'file.ts',
        content: 'const x = 1;',
      });

      useChatStore.getState().closeFile('/test/file.ts');

      expect(useChatStore.getState().activeFilePath).toBeNull();
    });

    it('should set active file', () => {
      useChatStore.getState().openFile({
        path: '/test/file1.ts',
        filename: 'file1.ts',
        content: 'const x = 1;',
      });

      useChatStore.getState().openFile({
        path: '/test/file2.ts',
        filename: 'file2.ts',
        content: 'const y = 2;',
      });

      useChatStore.getState().setActiveFile('/test/file1.ts');
      expect(useChatStore.getState().activeFilePath).toBe('/test/file1.ts');
    });

    it('should update file content and mark as dirty', () => {
      useChatStore.getState().openFile({
        path: '/test/file.ts',
        filename: 'file.ts',
        content: 'const x = 1;',
      });

      useChatStore.getState().updateFileContent('/test/file.ts', 'const x = 2;');

      const state = useChatStore.getState();
      expect(state.openFiles[0].content).toBe('const x = 2;');
      expect(state.openFiles[0].isDirty).toBe(true);
    });

    it('should mark file dirty/clean', () => {
      useChatStore.getState().openFile({
        path: '/test/file.ts',
        filename: 'file.ts',
        content: 'const x = 1;',
      });

      useChatStore.getState().markFileDirty('/test/file.ts', true);
      expect(useChatStore.getState().openFiles[0].isDirty).toBe(true);

      useChatStore.getState().markFileDirty('/test/file.ts', false);
      expect(useChatStore.getState().openFiles[0].isDirty).toBe(false);
    });

    it('should clear initial position', () => {
      useChatStore.getState().openFile({
        path: '/test/file.ts',
        filename: 'file.ts',
        content: 'const x = 1;',
        initialPosition: { lineNumber: 10 },
      });

      useChatStore.getState().clearInitialPosition('/test/file.ts');
      expect(useChatStore.getState().openFiles[0].initialPosition).toBeUndefined();
    });

    it('should close all files', () => {
      useChatStore.getState().openFile({
        path: '/test/file1.ts',
        filename: 'file1.ts',
        content: 'const x = 1;',
      });

      useChatStore.getState().openFile({
        path: '/test/file2.ts',
        filename: 'file2.ts',
        content: 'const y = 2;',
      });

      useChatStore.getState().closeAllFiles();

      const state = useChatStore.getState();
      expect(state.openFiles).toHaveLength(0);
      expect(state.activeFilePath).toBeNull();
    });
  });

  describe('searchConversations - message matching', () => {
    it('should find messages with matching content', async () => {
      disableElectronMode();
      useChatStore.setState({
        conversations: [{ id: 'conv-1', title: 'Shopping List', created_at: 100, updated_at: 100 }],
      });

      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify({
          'conv-1': [
            { id: 'msg-1', role: 'user', content: 'Buy groceries today', created_at: 100 },
            { id: 'msg-2', role: 'assistant', content: 'I can help with that', created_at: 200 },
          ],
        })
      );

      const results = await useChatStore.getState().searchConversations('groceries');

      expect(results).toHaveLength(1);
      expect(results[0].matchedMessages).toHaveLength(1);
      expect(results[0].matchedMessages[0].content).toContain('groceries');
    });

    it('should sort results by title match first', async () => {
      disableElectronMode();
      useChatStore.setState({
        conversations: [
          { id: 'conv-1', title: 'Other Topic', created_at: 100, updated_at: 100 },
          { id: 'conv-2', title: 'React Tutorial', created_at: 200, updated_at: 200 },
        ],
      });

      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify({
          'conv-1': [
            { id: 'msg-1', role: 'user', content: 'I love React', created_at: 100 },
            { id: 'msg-2', role: 'user', content: 'React is great', created_at: 200 },
          ],
          'conv-2': [{ id: 'msg-3', role: 'user', content: 'Hello', created_at: 100 }],
        })
      );

      const results = await useChatStore.getState().searchConversations('react');

      // Title match should come first
      expect(results[0].conversation.title).toBe('React Tutorial');
    });
  });
});
