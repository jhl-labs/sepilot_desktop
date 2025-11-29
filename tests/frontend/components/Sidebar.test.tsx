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
jest.mock('@/components/layout/FileExplorer', () => ({
  FileExplorer: () => <div data-testid="file-explorer">File Explorer</div>,
}));

// Mock SearchPanel
jest.mock('@/components/editor/SearchPanel', () => ({
  SearchPanel: () => <div data-testid="search-panel">Search Panel</div>,
}));

// Mock SimpleChatArea and SimpleChatInput
jest.mock('@/components/browser/SimpleChatArea', () => ({
  SimpleChatArea: () => <div data-testid="simple-chat-area">Simple Chat Area</div>,
}));

jest.mock('@/components/browser/SimpleChatInput', () => ({
  SimpleChatInput: () => <div data-testid="simple-chat-input">Simple Chat Input</div>,
}));

// Mock EditorChatArea
jest.mock('@/components/editor/EditorChatArea', () => ({
  EditorChatArea: () => <div data-testid="editor-chat-area">Editor Chat Area</div>,
}));

// Mock BrowserAgentLog
jest.mock('@/components/browser/BrowserAgentLog', () => ({
  BrowserAgentLog: () => <div data-testid="browser-agent-log">Browser Agent Log</div>,
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
    { id: 'conv-1', title: 'First Chat', created_at: Date.now() - 3600000, updated_at: Date.now() - 3600000 },
    { id: 'conv-2', title: 'Second Chat', created_at: Date.now() - 7200000, updated_at: Date.now() - 7200000 },
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

  it('should show chat view mode buttons in chat mode', () => {
    render(<Sidebar />);

    expect(screen.getByTitle('대화 기록')).toBeInTheDocument();
    expect(screen.getByTitle('AI 어시스턴트')).toBeInTheDocument();
    expect(screen.getByTitle('문서 관리')).toBeInTheDocument();
  });

  it('should not show chat view mode buttons in editor mode', () => {
    const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
    (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

    render(<Sidebar />);

    expect(screen.queryByTitle('대화 기록')).not.toBeInTheDocument();
    expect(screen.queryByTitle('AI 어시스턴트')).not.toBeInTheDocument();
    expect(screen.queryByTitle('문서 관리')).not.toBeInTheDocument();
  });

  it('should switch chat view mode to history', () => {
    render(<Sidebar />);

    const historyButton = screen.getByTitle('대화 기록');
    fireEvent.click(historyButton);

    expect(mockChatStore.setChatViewMode).toHaveBeenCalledWith('history');
  });

  it('should switch chat view mode to chat', () => {
    render(<Sidebar />);

    const chatButton = screen.getByTitle('AI 어시스턴트');
    fireEvent.click(chatButton);

    expect(mockChatStore.setChatViewMode).toHaveBeenCalledWith('chat');
  });

  it('should switch chat view mode to documents', () => {
    render(<Sidebar />);

    const documentsButton = screen.getByTitle('문서 관리');
    fireEvent.click(documentsButton);

    expect(mockChatStore.setChatViewMode).toHaveBeenCalledWith('documents');
  });

  it('should highlight active chat view mode', () => {
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
      const editorMockStore = { ...mockChatStore, appMode: 'editor' as const, editorViewMode: 'search' as const };
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

    it('should open settings dialog when SidebarEditor triggers settings', async () => {
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
});
