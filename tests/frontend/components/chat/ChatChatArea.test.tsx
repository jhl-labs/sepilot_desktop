/**
 * ChatChatArea 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatChatArea } from '@/components/chat/ChatChatArea';
import { useChatStore } from '@/lib/store/chat-store';
import { Message } from '@/types';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(),
}));

// Mock ScrollArea
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: React.forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string }>(
    ({ children, className }, ref) => (
      <div ref={ref} className={className}>
        {children}
      </div>
    )
  ),
}));

describe('ChatChatArea', () => {
  const mockMessages: Message[] = [
    {
      id: 'msg-1',
      conversation_id: 'conv-1',
      role: 'user',
      content: 'Hello, how are you?',
      created_at: Date.now() - 2000,
    },
    {
      id: 'msg-2',
      conversation_id: 'conv-1',
      role: 'assistant',
      content: 'I am doing well, thank you!',
      created_at: Date.now() - 1000,
    },
    {
      id: 'msg-3',
      conversation_id: 'conv-1',
      role: 'user',
      content: 'Great to hear!',
      created_at: Date.now(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render empty state when no messages', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [],
    });

    render(<ChatChatArea />);

    expect(screen.getByText('• RAG를 활용한 문서 기반 답변')).toBeInTheDocument();
  });

  it('should render message icon in empty state', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [],
    });

    const { container } = render(<ChatChatArea />);

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('opacity-10');
  });

  it('should render feature list in empty state', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [],
    });

    render(<ChatChatArea />);

    expect(screen.getByText('• RAG를 활용한 문서 기반 답변')).toBeInTheDocument();
    expect(screen.getByText('• MCP Tool calling 지원')).toBeInTheDocument();
    expect(screen.getByText('• 이미지 생성 및 해석')).toBeInTheDocument();
    expect(screen.getByText('• 멀티모달 대화')).toBeInTheDocument();
  });

  it('should render messages when available', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: mockMessages,
    });

    render(<ChatChatArea />);

    expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
    expect(screen.getByText('I am doing well, thank you!')).toBeInTheDocument();
    expect(screen.getByText('Great to hear!')).toBeInTheDocument();
  });

  it('should apply user message styling', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [mockMessages[0]], // User message
    });

    render(<ChatChatArea />);

    const messageElement = screen.getByText('Hello, how are you?').parentElement;
    expect(messageElement).toHaveClass('bg-primary');
    expect(messageElement).toHaveClass('text-primary-foreground');
  });

  it('should apply assistant message styling', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [mockMessages[1]], // Assistant message
    });

    render(<ChatChatArea />);

    const messageElement = screen.getByText('I am doing well, thank you!').parentElement;
    expect(messageElement).toHaveClass('bg-muted');
  });

  it('should align user messages to the right', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [mockMessages[0]], // User message
    });

    render(<ChatChatArea />);

    const messageContainer = screen.getByText('Hello, how are you?').parentElement?.parentElement;
    expect(messageContainer).toHaveClass('justify-end');
  });

  it('should align assistant messages to the left', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [mockMessages[1]], // Assistant message
    });

    render(<ChatChatArea />);

    const messageContainer = screen.getByText('I am doing well, thank you!').parentElement
      ?.parentElement;
    expect(messageContainer).toHaveClass('justify-start');
  });

  it('should render multiple messages in order', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: mockMessages,
    });

    const { container } = render(<ChatChatArea />);

    const messages = container.querySelectorAll('.whitespace-pre-wrap');
    expect(messages).toHaveLength(3);
    expect(messages[0].textContent).toBe('Hello, how are you?');
    expect(messages[1].textContent).toBe('I am doing well, thank you!');
    expect(messages[2].textContent).toBe('Great to hear!');
  });

  it('should handle long messages with whitespace-pre-wrap', () => {
    const longMessage: Message = {
      id: 'msg-long',
      conversation_id: 'conv-1',
      role: 'user',
      content:
        'This is a very long message that should wrap properly.\nIt also has multiple lines.',
      created_at: Date.now(),
    };

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [longMessage],
    });

    render(<ChatChatArea />);

    const messageElement = screen.getByText(/This is a very long message/);
    expect(messageElement).toHaveClass('whitespace-pre-wrap');
    expect(messageElement).toHaveClass('break-words');
  });

  it('should update when new messages are added', () => {
    const { rerender } = render(<ChatChatArea />);

    // Initially no messages
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [],
    });
    rerender(<ChatChatArea />);
    expect(screen.getByText('• RAG를 활용한 문서 기반 답변')).toBeInTheDocument();

    // Add messages
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: mockMessages,
    });
    rerender(<ChatChatArea />);
    expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
  });

  it('should render empty assistant message', () => {
    const emptyMessage: Message = {
      id: 'msg-empty',
      conversation_id: 'conv-1',
      role: 'assistant',
      content: '',
      created_at: Date.now(),
    };

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [emptyMessage],
    });

    const { container } = render(<ChatChatArea />);

    const messages = container.querySelectorAll('.whitespace-pre-wrap');
    expect(messages).toHaveLength(1);
    expect(messages[0].textContent).toBe('');
  });

  it('should render messages with special characters', () => {
    const specialMessage: Message = {
      id: 'msg-special',
      conversation_id: 'conv-1',
      role: 'user',
      content: '<script>alert("XSS")</script> & special chars: © ® ™',
      created_at: Date.now(),
    };

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: [specialMessage],
    });

    render(<ChatChatArea />);

    expect(
      screen.getByText(/<script>alert\("XSS"\)<\/script> & special chars: © ® ™/)
    ).toBeInTheDocument();
  });

  it('should use message id as key', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      messages: mockMessages,
    });

    const { container } = render(<ChatChatArea />);

    // Check that messages are rendered (keys are internal to React)
    const messageContainers = container.querySelectorAll('.flex.justify-start, .flex.justify-end');
    expect(messageContainers).toHaveLength(3);
  });
});
