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
    activeEditorTab: 'files' as const,
    setActiveEditorTab: jest.fn(),
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
    expect(screen.getByTestId('chat-history')).toBeInTheDocument();
  });

  it('should render sidebar in editor mode', () => {
    const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
    (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

    render(<Sidebar />);

    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.getByTestId('file-explorer')).toBeInTheDocument();
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

  it('should show new chat button in chat mode', () => {
    render(<Sidebar />);

    const newChatButton = screen.getByRole('button', { name: /새 대화/i });
    expect(newChatButton).toBeInTheDocument();
  });

  it('should not show new chat button in editor mode', () => {
    const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
    (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

    render(<Sidebar />);

    const newChatButton = screen.queryByRole('button', { name: /새 대화/i });
    expect(newChatButton).not.toBeInTheDocument();
  });

  it('should create new conversation on new chat button click', async () => {
    render(<Sidebar />);

    const newChatButton = screen.getByRole('button', { name: /새 대화/i });
    fireEvent.click(newChatButton);

    expect(mockChatStore.createConversation).toHaveBeenCalled();
  });

  it('should show delete all button in chat mode', () => {
    render(<Sidebar />);

    const deleteAllButton = screen.getByRole('button', { name: /모든 대화 삭제/i });
    expect(deleteAllButton).toBeInTheDocument();
  });

  it('should disable delete all button when no conversations', () => {
    const emptyMockStore = { ...mockChatStore, conversations: [] };
    (useChatStore as unknown as jest.Mock).mockReturnValue(emptyMockStore);

    render(<Sidebar />);

    const deleteAllButton = screen.getByRole('button', { name: /모든 대화 삭제/i });
    expect(deleteAllButton).toBeDisabled();
  });

  it('should delete all conversations on delete all button click', async () => {
    render(<Sidebar />);

    const deleteAllButton = screen.getByRole('button', { name: /모든 대화 삭제/i });
    fireEvent.click(deleteAllButton);

    await waitFor(() => {
      expect(mockChatStore.deleteConversation).toHaveBeenCalledTimes(2);
      expect(mockChatStore.createConversation).toHaveBeenCalled();
    });
  });

  it('should not delete if user cancels confirmation', async () => {
    (global.confirm as jest.Mock).mockReturnValueOnce(false);

    render(<Sidebar />);

    const deleteAllButton = screen.getByRole('button', { name: /모든 대화 삭제/i });
    fireEvent.click(deleteAllButton);

    await waitFor(() => {
      expect(mockChatStore.deleteConversation).not.toHaveBeenCalled();
    });
  });

  it('should call onConversationClick when ChatHistory triggers it', () => {
    const onConversationClick = jest.fn();
    render(<Sidebar onConversationClick={onConversationClick} />);

    const chatHistory = screen.getByTestId('chat-history');
    fireEvent.click(chatHistory);

    expect(onConversationClick).toHaveBeenCalled();
  });

  it('should render ChatHistory only in chat mode', () => {
    render(<Sidebar />);

    expect(screen.getByTestId('chat-history')).toBeInTheDocument();
    expect(screen.queryByTestId('file-explorer')).not.toBeInTheDocument();
  });

  it('should render FileExplorer only in editor mode', () => {
    const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
    (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

    render(<Sidebar />);

    expect(screen.getByTestId('file-explorer')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-history')).not.toBeInTheDocument();
  });

  it('should handle empty conversations for delete all', () => {
    const emptyMockStore = { ...mockChatStore, conversations: [] };
    (useChatStore as unknown as jest.Mock).mockReturnValue(emptyMockStore);

    render(<Sidebar />);

    const deleteAllButton = screen.getByRole('button', { name: /모든 대화 삭제/i });
    fireEvent.click(deleteAllButton);

    // Should not call deleteConversation or createConversation
    expect(mockChatStore.deleteConversation).not.toHaveBeenCalled();
    expect(mockChatStore.createConversation).not.toHaveBeenCalled();
  });

  describe('Browser mode', () => {
    it('should render sidebar in browser mode', () => {
      const browserMockStore = { ...mockChatStore, appMode: 'browser' as const };
      (useChatStore as unknown as jest.Mock).mockReturnValue(browserMockStore);

      render(<Sidebar />);

      expect(screen.getByText('Browser')).toBeInTheDocument();
      expect(screen.getByTestId('simple-chat-area')).toBeInTheDocument();
      expect(screen.getByTestId('simple-chat-input')).toBeInTheDocument();
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

    it('should show browser toolbar buttons in browser mode', () => {
      const browserMockStore = { ...mockChatStore, appMode: 'browser' as const };
      (useChatStore as unknown as jest.Mock).mockReturnValue(browserMockStore);

      render(<Sidebar />);

      // Browser 모드에는 Footer에 "새 대화" 버튼이 있음 (clearBrowserChat)
      expect(screen.getByTitle('새 대화')).toBeInTheDocument();
      expect(screen.getByTitle('페이지 캡처')).toBeInTheDocument();
      expect(screen.getByTitle('스냅샷 관리')).toBeInTheDocument();
      expect(screen.getByTitle('북마크')).toBeInTheDocument();
    });
  });

  describe('Editor tabs', () => {
    beforeEach(() => {
      const editorMockStore = { ...mockChatStore, appMode: 'editor' as const, activeEditorTab: 'files' as const };
      (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);
    });

    it('should show files tab button in editor mode', () => {
      render(<Sidebar />);

      const filesButton = screen.getByRole('button', { name: /파일 탐색기/i });
      expect(filesButton).toBeInTheDocument();
    });

    it('should show search tab button in editor mode', () => {
      render(<Sidebar />);

      const searchButton = screen.getByRole('button', { name: /전체 검색/i });
      expect(searchButton).toBeInTheDocument();
    });

    it('should switch to search tab', () => {
      const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
      (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

      render(<Sidebar />);

      const searchButton = screen.getByRole('button', { name: /전체 검색/i });
      fireEvent.click(searchButton);

      expect(editorMockStore.setEditorViewMode).toHaveBeenCalledWith('search');
    });

    it('should switch to files tab', () => {
      const editorMockStore = { ...mockChatStore, appMode: 'editor' as const, editorViewMode: 'search' as const };
      (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

      render(<Sidebar />);

      const filesButton = screen.getByRole('button', { name: /파일 탐색기/i });
      fireEvent.click(filesButton);

      expect(editorMockStore.setEditorViewMode).toHaveBeenCalledWith('files');
    });

    it('should highlight active tab', () => {
      const editorMockStore = { ...mockChatStore, appMode: 'editor' as const };
      (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

      render(<Sidebar />);

      const filesButton = screen.getByRole('button', { name: /파일 탐색기/i });
      expect(filesButton).toHaveClass('bg-accent');
    });

    it('should show search panel when search tab is active', () => {
      const editorMockStore = { ...mockChatStore, appMode: 'editor' as const, editorViewMode: 'search' as const };
      (useChatStore as unknown as jest.Mock).mockReturnValue(editorMockStore);

      render(<Sidebar />);

      expect(screen.getByTestId('search-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('file-explorer')).not.toBeInTheDocument();
    });
  });

  describe('Footer buttons', () => {
    it('should render theme toggle', () => {
      render(<Sidebar />);

      expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    });

    it('should call onDocumentsClick when documents button clicked', () => {
      const onDocumentsClick = jest.fn();
      render(<Sidebar onDocumentsClick={onDocumentsClick} />);

      const documentsButton = screen.getByRole('button', { name: /문서 관리/i });
      fireEvent.click(documentsButton);

      expect(onDocumentsClick).toHaveBeenCalled();
    });

    it('should call onGalleryClick when gallery button clicked', () => {
      const onGalleryClick = jest.fn();
      render(<Sidebar onGalleryClick={onGalleryClick} />);

      const galleryButton = screen.getByRole('button', { name: /이미지 갤러리/i });
      fireEvent.click(galleryButton);

      expect(onGalleryClick).toHaveBeenCalled();
    });

    it('should open settings dialog when settings button clicked', async () => {
      render(<Sidebar />);

      const settingsButton = screen.getByRole('button', { name: /설정/i });
      fireEvent.click(settingsButton);

      await waitFor(() => {
        expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();
      });
    });
  });
});
