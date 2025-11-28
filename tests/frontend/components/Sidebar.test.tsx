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

// Mock window.confirm
global.confirm = jest.fn(() => true);

describe('Sidebar', () => {
  const mockConversations: Conversation[] = [
    { id: 'conv-1', title: 'First Chat', created_at: Date.now() - 3600000, updated_at: Date.now() - 3600000 },
    { id: 'conv-2', title: 'Second Chat', created_at: Date.now() - 7200000, updated_at: Date.now() - 7200000 },
    { id: 'conv-3', title: 'Third Chat', created_at: Date.now() - 10800000, updated_at: Date.now() - 10800000 },
  ];

  const mockChatStore = {
    conversations: mockConversations,
    activeConversationId: 'conv-1',
    createConversation: jest.fn(),
    setActiveConversation: jest.fn(),
    loadConversations: jest.fn(),
    deleteConversation: jest.fn(),
    updateConversationTitle: jest.fn(),
    searchConversations: jest.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useChatStore as unknown as jest.Mock).mockReturnValue(mockChatStore);
  });

  it('should render sidebar with conversations', () => {
    render(<Sidebar />);

    expect(screen.getByText('First Chat')).toBeInTheDocument();
    expect(screen.getByText('Second Chat')).toBeInTheDocument();
    expect(screen.getByText('Third Chat')).toBeInTheDocument();
  });

  it('should load conversations on mount', () => {
    render(<Sidebar />);

    expect(mockChatStore.loadConversations).toHaveBeenCalled();
  });

  it('should create new conversation on new chat button click', async () => {
    render(<Sidebar />);

    const newChatButton = screen.getByRole('button', { name: /new chat/i });
    fireEvent.click(newChatButton);

    await waitFor(() => {
      expect(mockChatStore.createConversation).toHaveBeenCalled();
    });
  });

  it('should switch conversation on conversation click', async () => {
    render(<Sidebar />);

    const conversationItem = screen.getByText('Second Chat');
    fireEvent.click(conversationItem);

    await waitFor(() => {
      expect(mockChatStore.setActiveConversation).toHaveBeenCalledWith('conv-2');
    });
  });

  it('should highlight active conversation', () => {
    render(<Sidebar />);

    const activeConv = screen.getByText('First Chat').closest('button');
    expect(activeConv).toHaveClass('bg-muted');
  });

  it('should open settings dialog', () => {
    render(<Sidebar />);

    const settingsButton = screen.getByRole('button', { name: /settings/i });
    fireEvent.click(settingsButton);

    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();
  });

  it('should show theme toggle', () => {
    render(<Sidebar />);

    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
  });

  it('should enter edit mode on edit button click', () => {
    render(<Sidebar />);

    // Find the first conversation's dropdown menu
    const dropdownTriggers = screen.getAllByRole('button', { name: '' });
    const firstDropdown = dropdownTriggers[0];
    fireEvent.click(firstDropdown);

    // Click edit option
    const editButton = screen.getByText(/이름 변경/i);
    fireEvent.click(editButton);

    // Input should appear
    const input = screen.getByDisplayValue('First Chat');
    expect(input).toBeInTheDocument();
  });

  it('should save edited conversation title', async () => {
    render(<Sidebar />);

    // Enter edit mode
    const dropdownTriggers = screen.getAllByRole('button', { name: '' });
    fireEvent.click(dropdownTriggers[0]);
    fireEvent.click(screen.getByText(/이름 변경/i));

    // Edit the title
    const input = screen.getByDisplayValue('First Chat');
    fireEvent.change(input, { target: { value: 'Updated Chat' } });

    // Press Enter to save
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockChatStore.updateConversationTitle).toHaveBeenCalledWith('conv-1', 'Updated Chat');
    });
  });

  it('should cancel edit on Escape key', () => {
    render(<Sidebar />);

    // Enter edit mode
    const dropdownTriggers = screen.getAllByRole('button', { name: '' });
    fireEvent.click(dropdownTriggers[0]);
    fireEvent.click(screen.getByText(/이름 변경/i));

    const input = screen.getByDisplayValue('First Chat');
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    // Should exit edit mode
    expect(screen.queryByDisplayValue('Changed')).not.toBeInTheDocument();
  });

  it('should delete conversation on delete button click', async () => {
    render(<Sidebar />);

    const dropdownTriggers = screen.getAllByRole('button', { name: '' });
    fireEvent.click(dropdownTriggers[0]);
    fireEvent.click(screen.getByText(/삭제/i));

    await waitFor(() => {
      expect(mockChatStore.deleteConversation).toHaveBeenCalledWith('conv-1');
    });
  });

  it('should delete all conversations', async () => {
    render(<Sidebar />);

    // Find delete all button
    const deleteAllButton = screen.getByRole('button', { name: /모두 삭제/i });
    fireEvent.click(deleteAllButton);

    await waitFor(() => {
      // Should delete all conversations
      expect(mockChatStore.deleteConversation).toHaveBeenCalledTimes(3);
      // Should create new conversation after deleting all
      expect(mockChatStore.createConversation).toHaveBeenCalled();
    });
  });

  it('should not delete all if no conversations', async () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      conversations: [],
    });

    render(<Sidebar />);

    const deleteAllButton = screen.getByRole('button', { name: /모두 삭제/i });
    fireEvent.click(deleteAllButton);

    expect(mockChatStore.deleteConversation).not.toHaveBeenCalled();
  });

  it('should search conversations', async () => {
    const searchResults = [
      {
        conversation: mockConversations[0],
        matchedMessages: [
          { id: 'msg-1', role: 'user', content: 'test message', created_at: Date.now() },
        ],
      },
    ];

    mockChatStore.searchConversations.mockResolvedValue(searchResults);

    render(<Sidebar />);

    // Open search
    const searchButton = screen.getByRole('button', { name: /search/i });
    fireEvent.click(searchButton);

    // Enter search query
    const searchInput = screen.getByPlaceholderText(/검색/i);
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(mockChatStore.searchConversations).toHaveBeenCalledWith('test');
    });
  });

  it('should clear search', () => {
    render(<Sidebar />);

    const searchButton = screen.getByRole('button', { name: /search/i });
    fireEvent.click(searchButton);

    const searchInput = screen.getByPlaceholderText(/검색/i);
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Clear search
    const clearButton = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearButton);

    expect(searchInput).toHaveValue('');
  });

  it('should call onDocumentsClick when documents button clicked', () => {
    const onDocumentsClick = jest.fn();
    render(<Sidebar onDocumentsClick={onDocumentsClick} />);

    const documentsButton = screen.getByRole('button', { name: /documents/i });
    fireEvent.click(documentsButton);

    expect(onDocumentsClick).toHaveBeenCalled();
  });

  it('should call onGalleryClick when gallery button clicked', () => {
    const onGalleryClick = jest.fn();
    render(<Sidebar onGalleryClick={onGalleryClick} />);

    const galleryButton = screen.getByRole('button', { name: /gallery/i });
    fireEvent.click(galleryButton);

    expect(onGalleryClick).toHaveBeenCalled();
  });

  it('should call onConversationClick when conversation clicked', () => {
    const onConversationClick = jest.fn();
    render(<Sidebar onConversationClick={onConversationClick} />);

    const conversation = screen.getByText('First Chat');
    fireEvent.click(conversation);

    expect(onConversationClick).toHaveBeenCalled();
  });

  it('should format conversation dates', () => {
    render(<Sidebar />);

    // Dates should be formatted (exact format depends on formatDate implementation)
    // Just check that some date text is rendered
    expect(screen.getByText(/ago|전|시간|분/i)).toBeInTheDocument();
  });

  it('should show empty state when no conversations', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      conversations: [],
    });

    render(<Sidebar />);

    expect(screen.getByText(/대화가 없습니다/i)).toBeInTheDocument();
  });

  it('should not save empty title on edit', async () => {
    render(<Sidebar />);

    const dropdownTriggers = screen.getAllByRole('button', { name: '' });
    fireEvent.click(dropdownTriggers[0]);
    fireEvent.click(screen.getByText(/이름 변경/i));

    const input = screen.getByDisplayValue('First Chat');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockChatStore.updateConversationTitle).not.toHaveBeenCalled();
  });
});
