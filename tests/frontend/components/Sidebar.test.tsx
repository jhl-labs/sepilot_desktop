/**
 * Sidebar 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { useChatStore } from '@/lib/store/chat-store';
import { Conversation } from '@/types';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(),
}));

// Mock SettingsDialog
jest.mock('@/components/settings/SettingsDialog', () => ({
  SettingsDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="settings-dialog">Settings</div> : null,
}));

// Mock ThemeToggle
jest.mock('@/components/theme/ThemeToggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme</button>,
}));

// Mock ChatHistory
jest.mock('@/components/layout/ChatHistory', () => ({
  ChatHistory: ({ onConversationClick }: { onConversationClick?: () => void }) => (
    <div data-testid="chat-history" onClick={onConversationClick}>
      Chat History
    </div>
  ),
}));

// Mock FileExplorer
jest.mock('@/extensions/editor/components/FileExplorer', () => ({
  FileExplorer: () => <div data-testid="file-explorer">File Explorer</div>,
}));

// Mock SearchPanel
jest.mock('@/extensions/editor/components/SearchPanel', () => ({
  SearchPanel: () => <div data-testid="search-panel">Search Panel</div>,
}));

// Mock SimpleChatArea and SimpleChatInput
jest.mock('@/extensions/browser/components/SimpleChatArea', () => ({
  SimpleChatArea: () => <div data-testid="simple-chat-area">Simple Chat Area</div>,
}));

jest.mock('@/extensions/browser/components/SimpleChatInput', () => ({
  SimpleChatInput: () => <div data-testid="simple-chat-input">Simple Chat Input</div>,
}));

// Mock EditorChatArea
jest.mock('@/extensions/editor/components/EditorChatArea', () => ({
  EditorChatArea: () => <div data-testid="editor-chat-area">Editor Chat Area</div>,
}));

// Mock SidebarChat, SidebarEditor, SidebarBrowser
jest.mock('@/components/layout/SidebarChat', () => ({
  SidebarChat: ({ onGalleryClick, onConversationClick, onSettingsClick }: any) => (
    <div data-testid="sidebar-chat">
      <div data-testid="chat-history">Chat History</div>
      <button onClick={onGalleryClick}>Gallery</button>
      <button onClick={onConversationClick}>Conversation</button>
      <button onClick={onSettingsClick}>Settings</button>
    </div>
  ),
}));

jest.mock('@/components/layout/SidebarEditor', () => ({
  SidebarEditor: ({ onSettingsClick }: any) => (
    <div data-testid="sidebar-editor">
      <button onClick={onSettingsClick}>Settings</button>
    </div>
  ),
}));

jest.mock('@/components/layout/SidebarBrowser', () => ({
  SidebarBrowser: () => <div data-testid="sidebar-browser">Sidebar Browser</div>,
}));

// Mock window.confirm
global.confirm = jest.fn(() => true);

describe('Sidebar', () => {
  const mockConversations: Conversation[] = [
    {
      id: 'conv-1',
      title: 'First Chat',
      created_at: Date.now() - 3600000,
      updated_at: Date.now() - 3600000,
    },
    {
      id: 'conv-2',
      title: 'Second Chat',
      created_at: Date.now() - 7200000,
      updated_at: Date.now() - 7200000,
    },
  ];

  const mockChatStore = {
    conversations: mockConversations,
    activeConversationId: 'conv-1',
    createConversation: jest.fn(),
    setActiveConversation: jest.fn(),
    deleteConversation: jest.fn(),
    appMode: 'chat' as const,
    setAppMode: jest.fn(),
    chatViewMode: 'history' as const,
    setChatViewMode: jest.fn(),
    editorViewMode: 'files' as const,
    setEditorViewMode: jest.fn(),
    browserViewMode: 'chat' as const,
    setBrowserViewMode: jest.fn(),
    browserChatMessages: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useChatStore as unknown as jest.Mock).mockReturnValue(mockChatStore);
  });

  it('should render sidebar in chat mode', () => {
    render(<Sidebar />);

    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-chat')).toBeInTheDocument();
  });

  it('should render sidebar in editor mode', () => {
    const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
    (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

    render(<Sidebar />);

    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-editor')).toBeInTheDocument();
  });

  it('should show mode selector dropdown', async () => {
    render(<Sidebar />);

    const modeButton = screen.getByText('Chat');
    fireEvent.click(modeButton);

    await waitFor(() => {
      expect(screen.getAllByText('Chat')).toHaveLength(2); // Button text + menu item
      expect(screen.getByText('Editor')).toBeInTheDocument();
    });
  });

  it('should switch to editor mode', async () => {
    render(<Sidebar />);

    const modeButton = screen.getByText('Chat');
    fireEvent.click(modeButton);

    await waitFor(() => {
      const editorOption = screen.getAllByText('Editor')[0];
      fireEvent.click(editorOption);
    });

    expect(mockChatStore.setAppMode).toHaveBeenCalledWith('editor');
  });

  it('should switch to chat mode', async () => {
    const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
    (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

    render(<Sidebar />);

    const modeButton = screen.getByText('Editor');
    fireEvent.click(modeButton);

    await waitFor(() => {
      const chatOption = screen.getByText('Chat');
      fireEvent.click(chatOption);
    });

    expect(mockChatStore.setAppMode).toHaveBeenCalledWith('chat');
  });

  it.skip('should show chat view mode buttons in chat mode', () => {
    // TODO: These buttons are in SidebarChat component, test there instead
    render(<Sidebar />);

    expect(screen.getByTitle('대화 기록')).toBeInTheDocument();
    expect(screen.getByTitle('AI 어시스턴트')).toBeInTheDocument();
    expect(screen.getByTitle('문서 관리')).toBeInTheDocument();
  });

  it.skip('should not show chat view mode buttons in editor mode', () => {
    // TODO: These buttons are in SidebarChat component, test there instead
    const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
    (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

    render(<Sidebar />);

    expect(screen.queryByTitle('대화 기록')).not.toBeInTheDocument();
    expect(screen.queryByTitle('AI 어시스턴트')).not.toBeInTheDocument();
    expect(screen.queryByTitle('문서 관리')).not.toBeInTheDocument();
  });

  it.skip('should switch chat view mode to history', () => {
    // TODO: These buttons are in SidebarChat component, test there instead
    render(<Sidebar />);

    const historyButton = screen.getByTitle('대화 기록');
    fireEvent.click(historyButton);

    expect(mockChatStore.setChatViewMode).toHaveBeenCalledWith('history');
  });

  it.skip('should switch chat view mode to chat', () => {
    // TODO: These buttons are in SidebarChat component, test there instead
    render(<Sidebar />);

    const chatButton = screen.getByTitle('AI 어시스턴트');
    fireEvent.click(chatButton);

    expect(mockChatStore.setChatViewMode).toHaveBeenCalledWith('chat');
  });

  it.skip('should switch chat view mode to documents', () => {
    // TODO: These buttons are in SidebarChat component, test there instead
    render(<Sidebar />);

    const documentsButton = screen.getByTitle('문서 관리');
    fireEvent.click(documentsButton);

    expect(mockChatStore.setChatViewMode).toHaveBeenCalledWith('documents');
  });

  it.skip('should highlight active chat view mode', () => {
    // TODO: These buttons are in SidebarChat component, test there instead
    render(<Sidebar />);

    const historyButton = screen.getByTitle('대화 기록');
    expect(historyButton).toHaveClass('bg-accent');
  });

  it('should call onConversationClick when SidebarChat triggers it', () => {
    const onConversationClick = jest.fn();
    render(<Sidebar onConversationClick={onConversationClick} />);

    const conversationButton = screen.getByText('Conversation');
    fireEvent.click(conversationButton);

    expect(onConversationClick).toHaveBeenCalled();
  });

  it('should render SidebarChat only in chat mode', () => {
    render(<Sidebar />);

    expect(screen.getByTestId('sidebar-chat')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-browser')).not.toBeInTheDocument();
  });

  it('should render SidebarEditor only in editor mode', () => {
    const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
    (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

    render(<Sidebar />);

    expect(screen.getByTestId('sidebar-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-chat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-browser')).not.toBeInTheDocument();
  });

  describe('Browser mode', () => {
    it('should render SidebarBrowser in browser mode', () => {
      const browserMockStore = { ...mockChatStore, appMode: 'browser' as const };
      (useChatStore as unknown as jest.Mock).mockReturnValue(browserMockStore);

      render(<Sidebar />);

      expect(screen.getByText('Browser')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-browser')).toBeInTheDocument();
      expect(screen.queryByTestId('sidebar-chat')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sidebar-editor')).not.toBeInTheDocument();
    });

    it('should switch to browser mode', async () => {
      render(<Sidebar />);

      const modeButton = screen.getByText('Chat');
      fireEvent.click(modeButton);

      await waitFor(() => {
        const browserOption = screen.getByText('Browser');
        fireEvent.click(browserOption);
      });

      expect(mockChatStore.setAppMode).toHaveBeenCalledWith('browser');
    });
  });

  describe('Editor view mode', () => {
    it('should show files and search buttons in editor mode', () => {
      const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
      (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

      render(<Sidebar />);

      expect(screen.getByTitle('파일 탐색기')).toBeInTheDocument();
      expect(screen.getByTitle('전체 검색')).toBeInTheDocument();
    });

    it('should switch to search view mode', () => {
      const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
      (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

      render(<Sidebar />);

      const searchButton = screen.getByTitle('전체 검색');
      fireEvent.click(searchButton);

      expect(editorMockStore.setEditorViewMode).toHaveBeenCalledWith('search');
    });

    it('should switch to files view mode', () => {
      const editorMockStore = {
        ...mockChatStore,
        appMode: 'editor' as const,
        editorViewMode: 'search' as const,
      };
      (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

      render(<Sidebar />);

      const filesButton = screen.getByTitle('파일 탐색기');
      fireEvent.click(filesButton);

      expect(editorMockStore.setEditorViewMode).toHaveBeenCalledWith('files');
    });

    it('should highlight active view mode', () => {
      const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
      (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

      render(<Sidebar />);

      const filesButton = screen.getByTitle('파일 탐색기');
      expect(filesButton).toHaveClass('bg-accent');
    });
  });

  describe('Props delegation', () => {
    it('should pass onGalleryClick to SidebarChat', () => {
      const onGalleryClick = jest.fn();
      render(<Sidebar onGalleryClick={onGalleryClick} />);

      const galleryButton = screen.getByText('Gallery');
      fireEvent.click(galleryButton);

      expect(onGalleryClick).toHaveBeenCalled();
    });

    it('should open settings dialog when SidebarChat triggers settings', async () => {
      render(<Sidebar />);

      const settingsButton = screen.getByText('Settings');
      fireEvent.click(settingsButton);

      await waitFor(() => {
        expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();
      });
    });

    it.skip('should open settings dialog when SidebarEditor triggers settings', async () => {
      const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
      (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

      render(<Sidebar />);

      const settingsButton = screen.getByText('Settings');
      fireEvent.click(settingsButton);

      await waitFor(() => {
        expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();
      });
    });
  });

  describe('Chat mode actions', () => {
    beforeEach(() => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        appMode: 'chat',
        chatViewMode: 'history',
        setAppMode: jest.fn(),
        setChatViewMode: jest.fn(),
        createConversation: jest.fn(),
        deleteConversation: jest.fn(),
      });
    });

    it('should create new conversation when Plus button clicked', async () => {
      const mockCreateConversation = jest.fn();
      const mockSetChatViewMode = jest.fn();
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        appMode: 'chat',
        createConversation: mockCreateConversation,
        setChatViewMode: mockSetChatViewMode,
      });

      render(<Sidebar />);

      const plusButton = screen.getByTitle('새 대화');
      fireEvent.click(plusButton);

      await waitFor(() => {
        expect(mockCreateConversation).toHaveBeenCalled();
        expect(mockSetChatViewMode).toHaveBeenCalledWith('history');
      });
    });

    it('should show delete all button in chat mode', () => {
      render(<Sidebar />);

      const deleteAllButton = screen.getByTitle('전체 대화 삭제');
      expect(deleteAllButton).toBeInTheDocument();
    });

    it('should delete all conversations when confirmed', async () => {
      const mockDeleteConversation = jest.fn();
      const mockCreateConversation = jest.fn();
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        appMode: 'chat',
        conversations: mockConversations,
        deleteConversation: mockDeleteConversation,
        createConversation: mockCreateConversation,
      });

      (global.confirm as jest.Mock).mockReturnValueOnce(true);

      render(<Sidebar />);

      const deleteAllButton = screen.getByTitle('전체 대화 삭제');
      fireEvent.click(deleteAllButton);

      await waitFor(() => {
        expect(global.confirm).toHaveBeenCalledWith(
          '모든 대화(2개)를 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.'
        );
        expect(mockDeleteConversation).toHaveBeenCalledTimes(2);
        expect(mockDeleteConversation).toHaveBeenCalledWith('conv-1');
        expect(mockDeleteConversation).toHaveBeenCalledWith('conv-2');
        expect(mockCreateConversation).toHaveBeenCalled();
      });
    });

    it('should not delete conversations when cancelled', async () => {
      const mockDeleteConversation = jest.fn();
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        appMode: 'chat',
        conversations: mockConversations,
        deleteConversation: mockDeleteConversation,
      });

      (global.confirm as jest.Mock).mockReturnValueOnce(false);

      render(<Sidebar />);

      const deleteAllButton = screen.getByTitle('전체 대화 삭제');
      fireEvent.click(deleteAllButton);

      await waitFor(() => {
        expect(mockDeleteConversation).not.toHaveBeenCalled();
      });
    });

    it('should not call confirm when no conversations', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        appMode: 'chat',
        conversations: [],
      });

      render(<Sidebar />);

      const deleteAllButton = screen.getByTitle('전체 대화 삭제');

      // Button exists but clicking should do nothing
      fireEvent.click(deleteAllButton);

      // confirm should not be called
      expect(global.confirm).not.toHaveBeenCalled();
    });
  });
});
