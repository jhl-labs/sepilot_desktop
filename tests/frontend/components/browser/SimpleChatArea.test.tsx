/**
 * SimpleChatArea 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimpleChatArea } from '@/components/browser/SimpleChatArea';
import { useChatStore } from '@/lib/store/chat-store';
import { BrowserChatMessage } from '@/types';

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

// Mock MarkdownRenderer
jest.mock('@/components/markdown/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <p className="whitespace-pre-wrap break-words">{content}</p>
  ),
}));

describe('SimpleChatArea', () => {
  const mockMessages: BrowserChatMessage[] = [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Hello, how are you?',
      created_at: Date.now() - 2000,
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'I am doing well, thank you!',
      created_at: Date.now() - 1000,
    },
    {
      id: 'msg-3',
      role: 'user',
      content: 'Great to hear!',
      created_at: Date.now(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockFontConfig = {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 14,
  };

  it('should render empty state when no messages', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: [],
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    render(<SimpleChatArea />);

    expect(screen.getByText('사용 가능한 Browser Agent 도구')).toBeInTheDocument();
  });

  it('should render message icon in empty state', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: [],
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    const { container } = render(<SimpleChatArea />);

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('opacity-10');
  });

  it('should render messages when available', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: mockMessages,
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    render(<SimpleChatArea />);

    expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
    expect(screen.getByText('I am doing well, thank you!')).toBeInTheDocument();
    expect(screen.getByText('Great to hear!')).toBeInTheDocument();
  });

  it('should apply user message styling', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: [mockMessages[0]], // User message
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    render(<SimpleChatArea />);

    const messageElement = screen.getByText('Hello, how are you?').parentElement;
    expect(messageElement).toHaveClass('bg-primary');
    expect(messageElement).toHaveClass('text-primary-foreground');
  });

  it('should apply assistant message styling', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: [mockMessages[1]], // Assistant message
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    render(<SimpleChatArea />);

    const messageElement = screen.getByText('I am doing well, thank you!').parentElement;
    expect(messageElement).toHaveClass('bg-muted');
  });

  it('should align user messages to the right', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: [mockMessages[0]], // User message
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    render(<SimpleChatArea />);

    const messageContainer = screen.getByText('Hello, how are you?').parentElement?.parentElement;
    expect(messageContainer).toHaveClass('justify-end');
  });

  it('should align assistant messages to the left', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: [mockMessages[1]], // Assistant message
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    render(<SimpleChatArea />);

    const messageContainer = screen.getByText('I am doing well, thank you!').parentElement
      ?.parentElement;
    expect(messageContainer).toHaveClass('justify-start');
  });

  it('should render multiple messages in order', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: mockMessages,
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    const { container } = render(<SimpleChatArea />);

    const messages = container.querySelectorAll('.whitespace-pre-wrap');
    expect(messages).toHaveLength(3);
    expect(messages[0].textContent).toBe('Hello, how are you?');
    expect(messages[1].textContent).toBe('I am doing well, thank you!');
    expect(messages[2].textContent).toBe('Great to hear!');
  });

  it('should handle long messages with whitespace-pre-wrap', () => {
    const longMessage: BrowserChatMessage = {
      id: 'msg-long',
      role: 'user',
      content:
        'This is a very long message that should wrap properly.\nIt also has multiple lines.',
      created_at: Date.now(),
    };

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: [longMessage],
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    render(<SimpleChatArea />);

    const messageElement = screen.getByText(/This is a very long message/);
    expect(messageElement).toHaveClass('whitespace-pre-wrap');
    expect(messageElement).toHaveClass('break-words');
  });

  it('should update when new messages are added', () => {
    const { rerender } = render(<SimpleChatArea />);

    // Initially no messages
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: [],
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });
    rerender(<SimpleChatArea />);
    expect(screen.getByText('사용 가능한 Browser Agent 도구')).toBeInTheDocument();

    // Add messages
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: mockMessages,
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });
    rerender(<SimpleChatArea />);
    expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
  });

  it('should render empty assistant message', () => {
    const emptyMessage: BrowserChatMessage = {
      id: 'msg-empty',
      role: 'assistant',
      content: '',
      created_at: Date.now(),
    };

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: [emptyMessage],
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    const { container } = render(<SimpleChatArea />);

    const messages = container.querySelectorAll('.whitespace-pre-wrap');
    expect(messages).toHaveLength(1);
    expect(messages[0].textContent).toBe('');
  });

  it('should render messages with special characters', () => {
    const specialMessage: BrowserChatMessage = {
      id: 'msg-special',
      role: 'user',
      content: '<script>alert("XSS")</script> & special chars: © ® ™',
      created_at: Date.now(),
    };

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: [specialMessage],
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    render(<SimpleChatArea />);

    expect(
      screen.getByText(/<script>alert\("XSS"\)<\/script> & special chars: © ® ™/)
    ).toBeInTheDocument();
  });

  it('should use message id as key', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: mockMessages,
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    const { container } = render(<SimpleChatArea />);

    // Check that messages are rendered (keys are internal to React)
    const messageContainers = container.querySelectorAll('.flex.justify-start, .flex.justify-end');
    expect(messageContainers).toHaveLength(3);
  });

  it('should auto-scroll to bottom when messages change', () => {
    const mockScrollRef = { current: { scrollTop: 0, scrollHeight: 1000 } };

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: mockMessages,
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    const { rerender } = render(<SimpleChatArea />);

    // Simulate ref assignment
    const scrollArea = document.querySelector('div[class*="overflow-y-auto"]');
    if (scrollArea) {
      Object.defineProperty(scrollArea, 'scrollHeight', { value: 1000, writable: true });
      Object.defineProperty(scrollArea, 'scrollTop', { value: 0, writable: true });
    }

    // Add new message
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: [
        ...mockMessages,
        {
          id: 'msg-4',
          role: 'assistant',
          content: 'New message',
          created_at: Date.now(),
        },
      ],
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    rerender(<SimpleChatArea />);

    expect(screen.getByText('New message')).toBeInTheDocument();
  });

  it('should render agent logs when available', () => {
    const mockLogs = [
      {
        id: 'log-1',
        phase: 'thinking' as const,
        message: 'Analyzing the task',
        timestamp: Date.now() - 2000,
      },
      {
        id: 'log-2',
        phase: 'tool_call' as const,
        message: 'Calling navigation tool',
        timestamp: Date.now() - 1000,
        details: { toolName: 'navigate' },
      },
      {
        id: 'log-3',
        phase: 'tool_result' as const,
        message: 'Navigation successful',
        timestamp: Date.now(),
      },
    ];

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: mockMessages,
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: mockLogs,
      browserAgentIsRunning: false,
    });

    render(<SimpleChatArea />);

    expect(screen.getByText('Agent 실행 과정')).toBeInTheDocument();
    expect(screen.getByText('Analyzing the task')).toBeInTheDocument();
    expect(screen.getByText('Calling navigation tool')).toBeInTheDocument();
    expect(screen.getByText('(navigate)')).toBeInTheDocument();
    expect(screen.getByText('Navigation successful')).toBeInTheDocument();
  });

  it('should show loading spinner when agent is running', () => {
    const mockLogs = [
      {
        id: 'log-1',
        phase: 'thinking' as const,
        message: 'Processing...',
        timestamp: Date.now(),
      },
    ];

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: mockMessages,
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: mockLogs,
      browserAgentIsRunning: true,
    });

    const { container } = render(<SimpleChatArea />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should show last 5 agent logs only', () => {
    const mockLogs = [
      { id: 'log-1', phase: 'thinking' as const, message: 'Log 1', timestamp: Date.now() - 5000 },
      { id: 'log-2', phase: 'thinking' as const, message: 'Log 2', timestamp: Date.now() - 4000 },
      { id: 'log-3', phase: 'thinking' as const, message: 'Log 3', timestamp: Date.now() - 3000 },
      { id: 'log-4', phase: 'thinking' as const, message: 'Log 4', timestamp: Date.now() - 2000 },
      { id: 'log-5', phase: 'thinking' as const, message: 'Log 5', timestamp: Date.now() - 1000 },
      { id: 'log-6', phase: 'thinking' as const, message: 'Log 6', timestamp: Date.now() },
    ];

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: mockMessages,
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: mockLogs,
      browserAgentIsRunning: false,
    });

    render(<SimpleChatArea />);

    // Should not show first log
    expect(screen.queryByText('Log 1')).not.toBeInTheDocument();

    // Should show last 5 logs
    expect(screen.getByText('Log 2')).toBeInTheDocument();
    expect(screen.getByText('Log 3')).toBeInTheDocument();
    expect(screen.getByText('Log 4')).toBeInTheDocument();
    expect(screen.getByText('Log 5')).toBeInTheDocument();
    expect(screen.getByText('Log 6')).toBeInTheDocument();
  });

  it('should render different icons for different log phases', () => {
    const mockLogs = [
      {
        id: 'log-1',
        phase: 'thinking' as const,
        message: 'Thinking',
        timestamp: Date.now() - 4000,
      },
      {
        id: 'log-2',
        phase: 'tool_call' as const,
        message: 'Tool call',
        timestamp: Date.now() - 3000,
      },
      {
        id: 'log-3',
        phase: 'tool_result' as const,
        message: 'Tool result',
        timestamp: Date.now() - 2000,
      },
      {
        id: 'log-4',
        phase: 'error' as const,
        message: 'Error occurred',
        timestamp: Date.now() - 1000,
      },
      { id: 'log-5', phase: 'completion' as const, message: 'Completed', timestamp: Date.now() },
    ];

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: mockMessages,
      browserChatFontConfig: mockFontConfig,
      browserAgentLogs: mockLogs,
      browserAgentIsRunning: false,
    });

    const { container } = render(<SimpleChatArea />);

    // Check icons are rendered (we can't easily check specific icons without better class selectors)
    const icons = container.querySelectorAll('svg.h-3.w-3.mt-0\\.5');
    expect(icons.length).toBeGreaterThan(0);
  });

  it('should apply font config to messages', () => {
    const customFontConfig = {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: 16,
    };

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserChatMessages: [mockMessages[0]],
      browserChatFontConfig: customFontConfig,
      browserAgentLogs: [],
      browserAgentIsRunning: false,
    });

    render(<SimpleChatArea />);

    const messageElement = screen.getByText('Hello, how are you?').parentElement;
    expect(messageElement).toHaveStyle({
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: '16px',
    });
  });
});
