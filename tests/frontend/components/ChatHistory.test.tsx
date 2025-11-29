/**
 * ChatHistory 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatHistory } from '@/components/layout/ChatHistory';
import { useChatStore } from '@/lib/store/chat-store';
import { Conversation, Message } from '@/types';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(),
}));

// Mock ScrollArea
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

// Mock window.confirm
global.confirm = jest.fn(() => true);

describe('ChatHistory', () => {
  const mockConversations: Conversation[] = [
    { id: 'conv-1', title: 'First Chat', created_at: Date.now() - 3600000, updated_at: Date.now() - 3600000 },
    { id: 'conv-2', title: 'Second Chat', created_at: Date.now() - 7200000, updated_at: Date.now() - 7200000 },
    { id: 'conv-3', title: 'Third Chat', created_at: Date.now() - 10800000, updated_at: Date.now() - 10800000 },
  ];

  const mockChatStore = {
    conversations: mockConversations,
    activeConversationId: 'conv-1',
    setActiveConversation: jest.fn(),
    deleteConversation: jest.fn(),
    updateConversationTitle: jest.fn(),
    searchConversations: jest.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useChatStore as unknown as jest.Mock).mockReturnValue(mockChatStore);
  });

  it('should render conversation list', () => {
    render(<ChatHistory />);

    expect(screen.getByText('First Chat')).toBeInTheDocument();
    expect(screen.getByText('Second Chat')).toBeInTheDocument();
    expect(screen.getByText('Third Chat')).toBeInTheDocument();
  });

  it('should render search bar', () => {
    render(<ChatHistory />);

    const searchInput = screen.getByPlaceholderText('대화 검색...');
    expect(searchInput).toBeInTheDocument();
  });

  it('should highlight active conversation', () => {
    render(<ChatHistory />);

    const activeConv = screen.getByText('First Chat').closest('div');
    expect(activeConv).toHaveClass('bg-accent');
  });

  it('should switch conversation on click', () => {
    render(<ChatHistory />);

    const conversation = screen.getByText('Second Chat');
    fireEvent.click(conversation);

    expect(mockChatStore.setActiveConversation).toHaveBeenCalledWith('conv-2');
  });

  it('should call onConversationClick when conversation clicked', () => {
    const onConversationClick = jest.fn();
    render(<ChatHistory onConversationClick={onConversationClick} />);

    const conversation = screen.getByText('First Chat');
    fireEvent.click(conversation);

    expect(onConversationClick).toHaveBeenCalled();
  });

  it('should show empty state when no conversations', () => {
    const emptyMockStore = { ...mockChatStore, conversations: [] };
    (useChatStore as unknown as jest.Mock).mockReturnValue(emptyMockStore);

    render(<ChatHistory />);

    expect(screen.getByText('대화가 없습니다')).toBeInTheDocument();
    expect(screen.getByText('새 대화를 시작하세요')).toBeInTheDocument();
  });

  it('should handle search input', async () => {
    render(<ChatHistory />);

    const searchInput = screen.getByPlaceholderText('대화 검색...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(mockChatStore.searchConversations).toHaveBeenCalledWith('test');
    });
  });

  it('should show clear button when searching', () => {
    render(<ChatHistory />);

    const searchInput = screen.getByPlaceholderText('대화 검색...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    const clearButton = screen.getByRole('button', { name: '' });
    expect(clearButton).toBeInTheDocument();
  });

  it('should clear search on clear button click', async () => {
    render(<ChatHistory />);

    const searchInput = screen.getByPlaceholderText('대화 검색...') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(searchInput.value).toBe('test');
    });

    const clearButton = screen.getByRole('button', { name: '' });
    fireEvent.click(clearButton);

    expect(searchInput.value).toBe('');
  });

  it('should show no results message when search returns empty', async () => {
    mockChatStore.searchConversations.mockResolvedValue([]);

    render(<ChatHistory />);

    const searchInput = screen.getByPlaceholderText('대화 검색...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    await waitFor(() => {
      expect(screen.getByText('검색 결과가 없습니다')).toBeInTheDocument();
    });
  });

  it('should display search results', async () => {
    const searchResults = [
      {
        conversation: mockConversations[0],
        matchedMessages: [
          { id: 'msg-1', role: 'user', content: 'test message', created_at: Date.now() } as Message,
        ],
      },
    ];
    mockChatStore.searchConversations.mockResolvedValue(searchResults);

    render(<ChatHistory />);

    const searchInput = screen.getByPlaceholderText('대화 검색...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText('1개 일치')).toBeInTheDocument();
      expect(screen.getByText('test message')).toBeInTheDocument();
    });
  });

  it('should handle search result click', async () => {
    const onConversationClick = jest.fn();
    const searchResults = [
      {
        conversation: mockConversations[1],
        matchedMessages: [],
      },
    ];
    mockChatStore.searchConversations.mockResolvedValue(searchResults);

    render(<ChatHistory onConversationClick={onConversationClick} />);

    const searchInput = screen.getByPlaceholderText('대화 검색...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText('Second Chat')).toBeInTheDocument();
    });

    const searchResult = screen.getByText('Second Chat').closest('div');
    fireEvent.click(searchResult!);

    expect(mockChatStore.setActiveConversation).toHaveBeenCalledWith('conv-2');
    expect(onConversationClick).toHaveBeenCalled();
  });

  it('should enter edit mode on edit button click', async () => {
    render(<ChatHistory />);

    // Find the first conversation and hover to show menu
    const firstConv = screen.getByText('First Chat').closest('div');
    const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

    if (menuButton) {
      fireEvent.click(menuButton);

      await waitFor(() => {
        const editButton = screen.getByText('이름 변경');
        fireEvent.click(editButton);
      });

      await waitFor(() => {
        const input = screen.getByDisplayValue('First Chat');
        expect(input).toBeInTheDocument();
      });
    }
  });

  it('should save edited title on Enter key', async () => {
    render(<ChatHistory />);

    const firstConv = screen.getByText('First Chat').closest('div');
    const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

    if (menuButton) {
      fireEvent.click(menuButton);

      await waitFor(() => {
        const editButton = screen.getByText('이름 변경');
        fireEvent.click(editButton);
      });

      await waitFor(() => {
        const input = screen.getByDisplayValue('First Chat') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'Updated Title' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });

      await waitFor(() => {
        expect(mockChatStore.updateConversationTitle).toHaveBeenCalledWith('conv-1', 'Updated Title');
      });
    }
  });

  it('should cancel edit on Escape key', async () => {
    render(<ChatHistory />);

    const firstConv = screen.getByText('First Chat').closest('div');
    const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

    if (menuButton) {
      fireEvent.click(menuButton);

      await waitFor(() => {
        const editButton = screen.getByText('이름 변경');
        fireEvent.click(editButton);
      });

      await waitFor(() => {
        const input = screen.getByDisplayValue('First Chat') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'New Title' } });
        fireEvent.keyDown(input, { key: 'Escape' });
      });

      await waitFor(() => {
        expect(mockChatStore.updateConversationTitle).not.toHaveBeenCalled();
      });
    }
  });

  it('should save edit on blur', async () => {
    render(<ChatHistory />);

    const firstConv = screen.getByText('First Chat').closest('div');
    const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

    if (menuButton) {
      fireEvent.click(menuButton);

      await waitFor(() => {
        const editButton = screen.getByText('이름 변경');
        fireEvent.click(editButton);
      });

      await waitFor(() => {
        const input = screen.getByDisplayValue('First Chat') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'Blurred Title' } });
        fireEvent.blur(input);
      });

      await waitFor(() => {
        expect(mockChatStore.updateConversationTitle).toHaveBeenCalledWith('conv-1', 'Blurred Title');
      });
    }
  });

  it('should delete conversation on delete button click', async () => {
    render(<ChatHistory />);

    const firstConv = screen.getByText('First Chat').closest('div');
    const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

    if (menuButton) {
      fireEvent.click(menuButton);

      await waitFor(() => {
        const deleteButton = screen.getByText('삭제');
        fireEvent.click(deleteButton);
      });

      await waitFor(() => {
        expect(mockChatStore.deleteConversation).toHaveBeenCalledWith('conv-1');
      });
    }
  });

  it('should not delete if user cancels confirmation', async () => {
    (global.confirm as jest.Mock).mockReturnValueOnce(false);

    render(<ChatHistory />);

    const firstConv = screen.getByText('First Chat').closest('div');
    const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

    if (menuButton) {
      fireEvent.click(menuButton);

      await waitFor(() => {
        const deleteButton = screen.getByText('삭제');
        fireEvent.click(deleteButton);
      });

      await waitFor(() => {
        expect(mockChatStore.deleteConversation).not.toHaveBeenCalled();
      });
    }
  });

  it('should show message preview in search results', async () => {
    const searchResults = [
      {
        conversation: mockConversations[0],
        matchedMessages: [
          { id: 'msg-1', role: 'user', content: 'First message', created_at: Date.now() } as Message,
          { id: 'msg-2', role: 'assistant', content: 'Second message', created_at: Date.now() } as Message,
          { id: 'msg-3', role: 'user', content: 'Third message', created_at: Date.now() } as Message,
        ],
      },
    ];
    mockChatStore.searchConversations.mockResolvedValue(searchResults);

    render(<ChatHistory />);

    const searchInput = screen.getByPlaceholderText('대화 검색...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText('First message')).toBeInTheDocument();
      expect(screen.getByText('Second message')).toBeInTheDocument();
      expect(screen.getByText('+1개 더...')).toBeInTheDocument();
    });
  });

  it('should not save empty title on edit', async () => {
    render(<ChatHistory />);

    const firstConv = screen.getByText('First Chat').closest('div');
    const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

    if (menuButton) {
      fireEvent.click(menuButton);

      await waitFor(() => {
        const editButton = screen.getByText('이름 변경');
        fireEvent.click(editButton);
      });

      await waitFor(() => {
        const input = screen.getByDisplayValue('First Chat') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });

      await waitFor(() => {
        expect(mockChatStore.updateConversationTitle).not.toHaveBeenCalled();
      });
    }
  });
});
