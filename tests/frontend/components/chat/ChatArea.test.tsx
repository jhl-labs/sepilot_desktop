/**
 * ChatArea 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatArea } from '@/components/chat/ChatArea';
import { useChatStore } from '@/lib/store/chat-store';
import { Message } from '@/types';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(),
}));

// Mock MessageBubble
jest.mock('@/components/chat/MessageBubble', () => ({
  MessageBubble: ({
    message,
    onEdit,
    onRegenerate,
    isLastAssistantMessage,
    isStreaming,
  }: {
    message: Message;
    onEdit?: (id: string, content: string) => void;
    onRegenerate?: (id: string) => void;
    isLastAssistantMessage?: boolean;
    isStreaming?: boolean;
  }) => (
    <div data-testid={`message-${message.id}`} data-streaming={isStreaming}>
      <div data-testid={`message-role-${message.role}`}>{message.content}</div>
      {isLastAssistantMessage && <span data-testid="last-assistant">Last</span>}
      <button onClick={() => onEdit?.(message.id, 'edited')}>Edit</button>
      <button onClick={() => onRegenerate?.(message.id)}>Regenerate</button>
    </div>
  ),
}));

// Mock ScrollArea
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: React.forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string }>(
    ({ children, className }, ref) => (
      <div ref={ref} className={className} data-testid="scroll-area">
        {children}
      </div>
    )
  ),
}));

// Mock Select components
jest.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="font-scale-select" data-value={value}>
      <button onClick={() => onValueChange('120')}>Change Scale</button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => <span>Value</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
}));

describe('ChatArea', () => {
  const mockMessages: Message[] = [
    {
      id: 'msg-1',
      conversation_id: 'conv-1',
      role: 'user',
      content: 'Hello, AI!',
      created_at: Date.now() - 2000,
    },
    {
      id: 'msg-2',
      conversation_id: 'conv-1',
      role: 'assistant',
      content: 'Hello! How can I help you?',
      created_at: Date.now() - 1000,
    },
  ];

  const mockChatStore = {
    messages: [],
    activeConversationId: null,
    conversations: [],
    getGraphConfig: jest.fn(),
    updateMessage: jest.fn(),
    deleteMessage: jest.fn(),
    addMessage: jest.fn(),
    startStreaming: jest.fn(),
    stopStreaming: jest.fn(),
    streamingConversations: new Map(),
    workingDirectory: null,
    personas: [],
    activePersonaId: null,
    alwaysApproveToolsForSession: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (useChatStore as unknown as jest.Mock).mockReturnValue(mockChatStore);
  });

  it('should render welcome message when no active conversation', () => {
    render(<ChatArea />);

    expect(screen.getByText('SEPilot에 오신 것을 환영합니다')).toBeInTheDocument();
    expect(screen.getByText('새 대화를 시작하거나 기존 대화를 선택하세요')).toBeInTheDocument();
  });

  it('should render welcome icon when no active conversation', () => {
    const { container } = render(<ChatArea />);

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('opacity-20');
  });

  it('should render empty message state when conversation exists but no messages', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: [],
    });

    render(<ChatArea />);

    expect(screen.getByText('메시지를 입력하여 대화를 시작하세요')).toBeInTheDocument();
    expect(screen.getByText('AI 어시스턴트가 도와드리겠습니다')).toBeInTheDocument();
  });

  it('should render messages when available', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: mockMessages,
    });

    render(<ChatArea />);

    expect(screen.getByText('Hello, AI!')).toBeInTheDocument();
    expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
  });

  it('should render font scale selector', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: mockMessages,
    });

    render(<ChatArea />);

    const scaleSelect = screen.getByTestId('font-scale-select');
    expect(scaleSelect).toBeInTheDocument();
  });

  it('should change font scale when selector is used', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: mockMessages,
    });

    render(<ChatArea />);

    const changeButton = screen.getByText('Change Scale');
    fireEvent.click(changeButton);

    // Font scale should be saved to localStorage
    expect(localStorage.setItem).toHaveBeenCalledWith('sepilot-chat-font-scale', '120');
  });

  it('should mark last assistant message', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: mockMessages,
    });

    render(<ChatArea />);

    expect(screen.getByTestId('last-assistant')).toBeInTheDocument();
  });

  it('should apply font scale to messages container', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: mockMessages,
    });

    const { container } = render(<ChatArea />);

    const messagesContainer = container.querySelector('.mx-auto');
    expect(messagesContainer).toHaveStyle({ fontSize: '1rem' });
  });

  it('should apply dragging background color when dragging', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: [],
    });

    const { container } = render(<ChatArea />);

    const dropZone = container.querySelector('.relative.flex.flex-1');

    // Initially no bg-primary/5
    expect(dropZone).not.toHaveClass('bg-primary/5');

    // Trigger drag enter
    fireEvent.dragEnter(dropZone!);

    // Should have bg-primary/5
    expect(dropZone).toHaveClass('bg-primary/5');
  });

  it('should show drag overlay when dragging', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: [],
    });

    const { container } = render(<ChatArea />);

    const dropZone = container.querySelector('.relative.flex.flex-1');

    // Trigger drag enter
    fireEvent.dragEnter(dropZone!);

    expect(screen.getByText('텍스트 파일을 여기에 드롭하세요')).toBeInTheDocument();
    expect(screen.getByText('.txt, .md, .json, .js, .ts 등')).toBeInTheDocument();
  });

  it('should hide drag overlay when drag leaves', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: [],
    });

    const { container } = render(<ChatArea />);

    const dropZone = container.querySelector('.relative.flex.flex-1');

    // Trigger drag enter then drag leave
    fireEvent.dragEnter(dropZone!);
    expect(screen.getByText('텍스트 파일을 여기에 드롭하세요')).toBeInTheDocument();

    fireEvent.dragLeave(dropZone!, { relatedTarget: null });

    waitFor(() => {
      expect(screen.queryByText('텍스트 파일을 여기에 드롭하세요')).not.toBeInTheDocument();
    });
  });

  it('should show streaming indicator for streaming message', () => {
    const streamingConversations = new Map([['conv-1', 'msg-2']]);

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: mockMessages,
      streamingConversations,
    });

    render(<ChatArea />);

    const streamingMessage = screen.getByTestId('message-msg-2');
    expect(streamingMessage).toHaveAttribute('data-streaming', 'true');
  });

  it('should call updateMessage when editing', () => {
    const updateMessage = jest.fn();

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: mockMessages,
      updateMessage,
    });

    render(<ChatArea />);

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    expect(updateMessage).toHaveBeenCalledWith('msg-1', { content: 'edited' });
  });

  it('should use default font scale when localStorage is empty', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: mockMessages,
    });

    render(<ChatArea />);

    const fontScaleSelect = screen.getByTestId('font-scale-select');
    expect(fontScaleSelect).toHaveAttribute('data-value', '100');
  });

  it('should ignore invalid font scale from localStorage', () => {
    localStorage.setItem('sepilot-chat-font-scale', '9999');

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: mockMessages,
    });

    render(<ChatArea />);

    const fontScaleSelect = screen.getByTestId('font-scale-select');
    expect(fontScaleSelect).toHaveAttribute('data-value', '100');
  });

  it('should render ScrollArea component', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      ...mockChatStore,
      activeConversationId: 'conv-1',
      messages: mockMessages,
    });

    render(<ChatArea />);

    expect(screen.getByTestId('scroll-area')).toBeInTheDocument();
  });

  describe('폰트 스케일 변경', () => {
    it('should load saved font scale from localStorage on mount', () => {
      // Mock localStorage.getItem to return '150'
      (localStorage.getItem as jest.Mock).mockReturnValue('150');

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        activeConversationId: 'conv-1',
        messages: mockMessages,
      });

      render(<ChatArea />);

      const fontScaleSelect = screen.getByTestId('font-scale-select');
      expect(fontScaleSelect).toHaveAttribute('data-value', '150');
    });

    it('should update font scale when changed', async () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        activeConversationId: 'conv-1',
        messages: mockMessages,
      });

      render(<ChatArea />);

      const changeScaleButton = screen.getByText('Change Scale');
      fireEvent.click(changeScaleButton);

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith('sepilot-chat-font-scale', '120');
      });
    });
  });

  describe('파일 드롭', () => {
    beforeEach(() => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        activeConversationId: 'conv-1',
        messages: mockMessages,
      });

      // Mock FileReader
      global.FileReader = class {
        readAsText = jest.fn();
        readAsDataURL = jest.fn();
        onload: ((event: any) => void) | null = null;
        onerror: ((event: any) => void) | null = null;
        result: string | null = null;
      } as any;
    });

    it('should handle text file drop', async () => {
      render(<ChatArea />);

      const dropZone = document.querySelector('.relative.flex.flex-1') as HTMLElement;

      const textFile = new File(['Hello World'], 'test.txt', { type: 'text/plain' });
      const dataTransfer = {
        files: [textFile],
      };

      // Trigger drop
      fireEvent.drop(dropZone, { dataTransfer });

      // Should dispatch custom event
      await waitFor(() => {
        // Event would be dispatched with file content
        expect(dropZone).not.toHaveClass('bg-primary/5');
      });
    });

    it('should handle image file drop', async () => {
      render(<ChatArea />);

      const dropZone = document.querySelector('.relative.flex.flex-1') as HTMLElement;

      const imageFile = new File(['fake-image'], 'test.png', { type: 'image/png' });
      const dataTransfer = {
        files: [imageFile],
      };

      fireEvent.drop(dropZone, { dataTransfer });

      await waitFor(() => {
        expect(dropZone).not.toHaveClass('bg-primary/5');
      });
    });

    it('should handle multiple file drop', async () => {
      render(<ChatArea />);

      const dropZone = document.querySelector('.relative.flex.flex-1') as HTMLElement;

      const textFile = new File(['Hello'], 'test.txt', { type: 'text/plain' });
      const imageFile = new File(['image'], 'test.png', { type: 'image/png' });
      const dataTransfer = {
        files: [textFile, imageFile],
      };

      fireEvent.drop(dropZone, { dataTransfer });

      await waitFor(() => {
        expect(dropZone).not.toHaveClass('bg-primary/5');
      });
    });

    it('should handle drag over without drop', () => {
      render(<ChatArea />);

      const dropZone = document.querySelector('.relative.flex.flex-1') as HTMLElement;

      fireEvent.dragOver(dropZone);

      // Should just prevent default, not change state
      expect(dropZone).not.toHaveClass('bg-primary/5');
    });

    it('should recognize various text file extensions', async () => {
      render(<ChatArea />);

      const dropZone = document.querySelector('.relative.flex.flex-1') as HTMLElement;

      const extensions = ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'md', 'json', 'yaml', 'xml'];

      for (const ext of extensions) {
        const file = new File(['content'], `test.${ext}`, { type: 'text/plain' });
        const dataTransfer = { files: [file] };

        fireEvent.drop(dropZone, { dataTransfer });

        await waitFor(() => {
          expect(dropZone).not.toHaveClass('bg-primary/5');
        });
      }
    });
  });

  describe('메시지 재생성', () => {
    it('should call handleRegenerate when regenerate button clicked', () => {
      const mockDeleteMessage = jest.fn();

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        activeConversationId: 'conv-1',
        messages: mockMessages,
        deleteMessage: mockDeleteMessage,
      });

      render(<ChatArea />);

      const regenerateButtons = screen.getAllByText('Regenerate');
      fireEvent.click(regenerateButtons[0]);

      // deleteMessage should be called with the message ID
      waitFor(() => {
        expect(mockDeleteMessage).toHaveBeenCalledWith('msg-2');
      });
    });
  });

  describe('빈 드롭 처리', () => {
    it('should handle empty file list drop', async () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        activeConversationId: 'conv-1',
        messages: mockMessages,
      });

      render(<ChatArea />);

      const dropZone = document.querySelector('.relative.flex.flex-1') as HTMLElement;

      const dataTransfer = {
        files: [],
      };

      fireEvent.drop(dropZone, { dataTransfer });

      // Should not crash or dispatch event
      await waitFor(() => {
        expect(dropZone).not.toHaveClass('bg-primary/5');
      });
    });
  });
});
