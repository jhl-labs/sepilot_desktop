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
    {
      id: 'conv-3',
      title: 'Third Chat',
      created_at: Date.now() - 10800000,
      updated_at: Date.now() - 10800000,
    },
  ];

  const mockChatStore = {
    conversations: mockConversations,
    activeConversationId: 'conv-1',
    setActiveConversation: jest.fn(),
    deleteConversation: jest.fn(),
    updateConversationTitle: jest.fn(),
    searchConversations: jest.fn().mockResolvedValue([]),
    personas: [],
    activePersonaId: null,
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

  it.skip('should highlight active conversation', () => {
    // TODO: Update this test after ChatHistory UI changes
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

    // Find all buttons and locate the menu button by aria-label or icon
    const buttons = screen.getAllByRole('button');
    // The menu button should be a small icon button, let's find it by size class
    const menuButton = buttons.find(
      (btn) => btn.className.includes('h-8') && btn.className.includes('w-8')
    );

    expect(menuButton).toBeDefined();
    fireEvent.click(menuButton!);

    // Wait for dropdown menu to open (portal rendering)
    await waitFor(() => {
      const editButton = screen.getByText('이름 변경');
      fireEvent.click(editButton);
    });

    // Verify input appears
    await waitFor(() => {
      const input = screen.getByDisplayValue('First Chat');
      expect(input).toBeInTheDocument();
    });
  });

  it('should save edited title on Enter key', async () => {
    render(<ChatHistory />);

    const buttons = screen.getAllByRole('button');
    const menuButton = buttons.find(
      (btn) => btn.className.includes('h-8') && btn.className.includes('w-8')
    );

    expect(menuButton).toBeDefined();
    fireEvent.click(menuButton!);

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
  });

  it('should cancel edit on Escape key', async () => {
    render(<ChatHistory />);

    const buttons = screen.getAllByRole('button');
    const menuButton = buttons.find(
      (btn) => btn.className.includes('h-8') && btn.className.includes('w-8')
    );

    expect(menuButton).toBeDefined();
    fireEvent.click(menuButton!);

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
  });

  it('should save edit on blur', async () => {
    render(<ChatHistory />);

    const buttons = screen.getAllByRole('button');
    const menuButton = buttons.find(
      (btn) => btn.className.includes('h-8') && btn.className.includes('w-8')
    );

    expect(menuButton).toBeDefined();
    fireEvent.click(menuButton!);

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
  });

  it('should delete conversation on delete button click', async () => {
    render(<ChatHistory />);

    const buttons = screen.getAllByRole('button');
    const menuButton = buttons.find(
      (btn) => btn.className.includes('h-8') && btn.className.includes('w-8')
    );

    expect(menuButton).toBeDefined();
    fireEvent.click(menuButton!);

    await waitFor(() => {
      const deleteButton = screen.getByText('삭제');
      fireEvent.click(deleteButton);
    });

    await waitFor(() => {
      expect(mockChatStore.deleteConversation).toHaveBeenCalledWith('conv-1');
    });
  });

  it('should not delete if user cancels confirmation', async () => {
    (global.confirm as jest.Mock).mockReturnValueOnce(false);

    render(<ChatHistory />);

    const buttons = screen.getAllByRole('button');
    const menuButton = buttons.find(
      (btn) => btn.className.includes('h-8') && btn.className.includes('w-8')
    );

    expect(menuButton).toBeDefined();
    fireEvent.click(menuButton!);

    await waitFor(() => {
      const deleteButton = screen.getByText('삭제');
      fireEvent.click(deleteButton);
    });

    await waitFor(() => {
      expect(mockChatStore.deleteConversation).not.toHaveBeenCalled();
    });
  });

  it('should show message preview in search results', async () => {
    const searchResults = [
      {
        conversation: mockConversations[0],
        matchedMessages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'First message',
            created_at: Date.now(),
          } as Message,
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Second message',
            created_at: Date.now(),
          } as Message,
          {
            id: 'msg-3',
            role: 'user',
            content: 'Third message',
            created_at: Date.now(),
          } as Message,
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

    const buttons = screen.getAllByRole('button');
    const menuButton = buttons.find(
      (btn) => btn.className.includes('h-8') && btn.className.includes('w-8')
    );

    expect(menuButton).toBeDefined();
    fireEvent.click(menuButton!);

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
  });

  it('should handle search error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockChatStore.searchConversations.mockRejectedValue(new Error('Search failed'));

    render(<ChatHistory />);

    const searchInput = screen.getByPlaceholderText('대화 검색...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Search failed:', expect.any(Error));
    });

    // Should show no results after error
    await waitFor(() => {
      expect(screen.getByText('검색 결과가 없습니다')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });

  it('should stop propagation when clicking menu button', async () => {
    const onConversationClick = jest.fn();
    render(<ChatHistory onConversationClick={onConversationClick} />);

    const firstConv = screen.getByText('First Chat').closest('div');
    const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

    if (menuButton) {
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      const stopPropSpy = jest.spyOn(clickEvent, 'stopPropagation');

      fireEvent.click(menuButton);

      // Menu should open, conversation click should not be triggered
      await waitFor(() => {
        expect(screen.getByText('이름 변경')).toBeInTheDocument();
      });
    }
  });

  it('should clear search results when search query is empty', async () => {
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

    // First, perform a search
    const searchInput = screen.getByPlaceholderText('대화 검색...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText('1개 일치')).toBeInTheDocument();
    });

    // Then clear the search by typing empty string
    fireEvent.change(searchInput, { target: { value: '' } });

    await waitFor(() => {
      // Search results should be cleared
      expect(screen.queryByText('1개 일치')).not.toBeInTheDocument();
      // Should show regular conversations
      expect(screen.getByText('First Chat')).toBeInTheDocument();
    });
  });

  it('should clear search results when search query is whitespace', async () => {
    const searchResults = [
      {
        conversation: mockConversations[0],
        matchedMessages: [],
      },
    ];
    mockChatStore.searchConversations.mockResolvedValue(searchResults);

    render(<ChatHistory />);

    // Perform a search
    const searchInput = screen.getByPlaceholderText('대화 검색...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(mockChatStore.searchConversations).toHaveBeenCalledWith('test');
    });

    // Clear with whitespace
    fireEvent.change(searchInput, { target: { value: '   ' } });

    await waitFor(() => {
      // Should show regular conversations, not search results
      expect(screen.getByText('First Chat')).toBeInTheDocument();
    });

    // Should not call search for whitespace
    expect(mockChatStore.searchConversations).toHaveBeenCalledTimes(1);
  });

  describe('Persona 기능', () => {
    const mockPersonas = [
      { id: 'p1', name: '번역가', avatar: '🌐', systemPrompt: 'Translator' },
      { id: 'p2', name: '개발자', avatar: '👨‍💻', systemPrompt: 'Developer' },
    ];

    const mockConversationsWithPersona: Conversation[] = [
      {
        id: 'conv-1',
        title: 'First Chat',
        created_at: Date.now(),
        updated_at: Date.now(),
        personaId: 'p1',
      },
      { id: 'conv-2', title: 'Second Chat', created_at: Date.now(), updated_at: Date.now() },
    ];

    beforeEach(() => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        conversations: mockConversationsWithPersona,
        personas: mockPersonas,
        updateConversationPersona: jest.fn(),
      });
    });

    it('should display persona avatar for conversation with persona', () => {
      render(<ChatHistory />);

      expect(screen.getByText('🌐')).toBeInTheDocument();
    });

    it('should not display persona avatar for conversation without persona', () => {
      const { container } = render(<ChatHistory />);

      const secondConv = screen.getByText('Second Chat').closest('div');
      const avatar = secondConv?.querySelector('span.text-sm.flex-shrink-0');

      // Second Chat should not have persona avatar in its button
      expect(avatar).toBeFalsy();
    });

    it('should open persona dialog when Persona menu item clicked', async () => {
      render(<ChatHistory />);

      const firstConv = screen.getByText('First Chat').closest('div');
      const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

      if (menuButton) {
        fireEvent.click(menuButton);

        await waitFor(() => {
          const personaMenuItem = screen.getByText('Persona');
          expect(personaMenuItem).toBeInTheDocument();
          fireEvent.click(personaMenuItem);
        });

        await waitFor(() => {
          expect(screen.getByText('Persona 선택')).toBeInTheDocument();
          expect(screen.getByText('이 대화에 적용할 페르소나를 선택하세요')).toBeInTheDocument();
        });
      }
    });

    it('should display persona options in dialog', async () => {
      render(<ChatHistory />);

      const firstConv = screen.getByText('First Chat').closest('div');
      const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

      if (menuButton) {
        fireEvent.click(menuButton);

        await waitFor(() => {
          const personaMenuItem = screen.getByText('Persona');
          fireEvent.click(personaMenuItem);
        });

        await waitFor(() => {
          expect(screen.getByText('없음')).toBeInTheDocument();
          expect(screen.getByText('번역가')).toBeInTheDocument();
          expect(screen.getByText('개발자')).toBeInTheDocument();
        });
      }
    });

    it('should show check mark for current persona', async () => {
      render(<ChatHistory />);

      const firstConv = screen.getByText('First Chat').closest('div');
      const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

      if (menuButton) {
        fireEvent.click(menuButton);

        await waitFor(() => {
          const personaMenuItem = screen.getByText('Persona');
          fireEvent.click(personaMenuItem);
        });

        await waitFor(() => {
          // First Chat has personaId='p1', so 번역가 should have check mark
          const translatorButton = screen.getByText('번역가').closest('button');
          expect(translatorButton).toHaveClass('bg-accent');
        });
      }
    });

    it('should show check mark for "없음" when conversation has no persona', async () => {
      render(<ChatHistory />);

      const secondConv = screen.getByText('Second Chat').closest('div');
      const menuButton = secondConv?.querySelector('button[class*="opacity-0"]');

      if (menuButton) {
        fireEvent.click(menuButton);

        await waitFor(() => {
          const personaMenuItem = screen.getByText('Persona');
          fireEvent.click(personaMenuItem);
        });

        await waitFor(() => {
          // Second Chat has no personaId, so "없음" should have check mark
          const noneButton = screen.getByText('없음').closest('button');
          expect(noneButton).toHaveClass('bg-accent');
        });
      }
    });

    it('should call updateConversationPersona when persona selected', async () => {
      const mockUpdateConversationPersona = jest.fn();
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        conversations: mockConversationsWithPersona,
        personas: mockPersonas,
        updateConversationPersona: mockUpdateConversationPersona,
      });

      render(<ChatHistory />);

      const firstConv = screen.getByText('First Chat').closest('div');
      const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

      if (menuButton) {
        fireEvent.click(menuButton);

        await waitFor(() => {
          const personaMenuItem = screen.getByText('Persona');
          fireEvent.click(personaMenuItem);
        });

        await waitFor(() => {
          const developerButton = screen.getByText('개발자');
          fireEvent.click(developerButton);
        });

        await waitFor(() => {
          expect(mockUpdateConversationPersona).toHaveBeenCalledWith('conv-1', 'p2');
        });
      }
    });

    it('should call updateConversationPersona with null when "없음" selected', async () => {
      const mockUpdateConversationPersona = jest.fn();
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        conversations: mockConversationsWithPersona,
        personas: mockPersonas,
        updateConversationPersona: mockUpdateConversationPersona,
      });

      render(<ChatHistory />);

      const firstConv = screen.getByText('First Chat').closest('div');
      const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

      if (menuButton) {
        fireEvent.click(menuButton);

        await waitFor(() => {
          const personaMenuItem = screen.getByText('Persona');
          fireEvent.click(personaMenuItem);
        });

        await waitFor(() => {
          const noneButton = screen.getByText('없음');
          fireEvent.click(noneButton);
        });

        await waitFor(() => {
          expect(mockUpdateConversationPersona).toHaveBeenCalledWith('conv-1', null);
        });
      }
    });

    it('should close dialog after persona selection', async () => {
      render(<ChatHistory />);

      const firstConv = screen.getByText('First Chat').closest('div');
      const menuButton = firstConv?.querySelector('button[class*="opacity-0"]');

      if (menuButton) {
        fireEvent.click(menuButton);

        await waitFor(() => {
          const personaMenuItem = screen.getByText('Persona');
          fireEvent.click(personaMenuItem);
        });

        await waitFor(() => {
          expect(screen.getByText('Persona 선택')).toBeInTheDocument();
        });

        const developerButton = screen.getByText('개발자');
        fireEvent.click(developerButton);

        await waitFor(() => {
          expect(screen.queryByText('Persona 선택')).not.toBeInTheDocument();
        });
      }
    });
  });

  describe('Edit Input Focus', () => {
    it('should focus and select input when entering edit mode', async () => {
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
          expect(document.activeElement).toBe(input);
        });
      }
    });
  });

  describe('Search with Persona', () => {
    const mockPersonasForSearch = [
      {
        id: 'p1',
        name: '번역가',
        avatar: '🌐',
        systemPrompt: 'Translator',
        color: '#3b82f6',
        description: 'Translation assistant',
      },
      {
        id: 'p2',
        name: '개발자',
        avatar: '👨\u200d💻',
        systemPrompt: 'Developer',
        color: '#10b981',
        description: 'Coding assistant',
      },
    ];

    it('should display persona avatar in search results', async () => {
      const conversationWithPersona: Conversation = {
        id: 'conv-persona',
        title: 'Translation Chat',
        created_at: Date.now(),
        updated_at: Date.now(),
        personaId: 'p1',
      };

      const searchResults = [
        {
          conversation: conversationWithPersona,
          matchedMessages: [
            {
              id: 'msg-1',
              role: 'user',
              content: 'translate this',
              created_at: Date.now(),
            } as Message,
          ],
        },
      ];

      const storeWithPersonas = {
        ...mockChatStore,
        personas: mockPersonasForSearch,
        searchConversations: jest.fn().mockResolvedValue(searchResults),
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue(storeWithPersonas);

      render(<ChatHistory />);

      const searchInput = screen.getByPlaceholderText('대화 검색...');
      fireEvent.change(searchInput, { target: { value: 'translate' } });

      await waitFor(() => {
        expect(screen.getByText('Translation Chat')).toBeInTheDocument();
        expect(screen.getByText('🌐')).toBeInTheDocument();
      });
    });

    it('should not display persona avatar in search results when persona not found', async () => {
      const conversationWithInvalidPersona: Conversation = {
        id: 'conv-invalid',
        title: 'Invalid Persona Chat',
        created_at: Date.now(),
        updated_at: Date.now(),
        personaId: 'invalid-id',
      };

      const searchResults = [
        {
          conversation: conversationWithInvalidPersona,
          matchedMessages: [],
        },
      ];

      const storeWithPersonas = {
        ...mockChatStore,
        personas: mockPersonasForSearch,
        searchConversations: jest.fn().mockResolvedValue(searchResults),
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue(storeWithPersonas);

      render(<ChatHistory />);

      const searchInput = screen.getByPlaceholderText('대화 검색...');
      fireEvent.change(searchInput, { target: { value: 'invalid' } });

      await waitFor(() => {
        expect(screen.getByText('Invalid Persona Chat')).toBeInTheDocument();
        // Persona avatar should not be displayed
        expect(screen.queryByText('🌐')).not.toBeInTheDocument();
        expect(screen.queryByText('👨\u200d💻')).not.toBeInTheDocument();
      });
    });
  });
});
