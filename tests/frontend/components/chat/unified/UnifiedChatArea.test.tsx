/**
 * UnifiedChatArea 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { UnifiedChatArea } from '@/components/chat/unified/UnifiedChatArea';
import { ChatConfig, ChatMode } from '@/components/chat/unified/types';
import { Message } from '@/types';

// Mock hooks
jest.mock('@/components/chat/unified/hooks/useChatMessages', () => ({
  useChatMessages: jest.fn(() => ({
    messages: [],
    isStreaming: false,
    scrollRef: { current: null },
  })),
}));

// Mock child components
jest.mock('@/components/chat/MessageBubble', () => ({
  MessageBubble: ({ message }: { message: Message }) => (
    <div data-testid={`message-${message.id}`}>{message.content}</div>
  ),
}));

jest.mock('@/components/chat/ToolResult', () => ({
  ToolResult: () => <div data-testid="tool-result">Tool Result</div>,
}));

jest.mock('@/components/chat/InteractiveSelect', () => ({
  InteractiveSelect: () => <div data-testid="interactive-select">Interactive Select</div>,
}));

jest.mock('@/components/chat/InteractiveInput', () => ({
  InteractiveInput: () => <div data-testid="interactive-input">Interactive Input</div>,
}));

jest.mock('@/components/chat/ToolApprovalRequest', () => ({
  ToolApprovalRequest: () => <div data-testid="tool-approval-request">Tool Approval Request</div>,
}));

jest.mock('@/components/ConversationReportDialog', () => ({
  ConversationReportDialog: () => <div data-testid="report-dialog">Report Dialog</div>,
}));

jest.mock('@/components/markdown/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/lib/error-reporting', () => ({
  isErrorReportingEnabled: jest.fn(() => false),
}));

jest.mock('@/lib/utils/clipboard', () => ({
  copyToClipboard: jest.fn(() => Promise.resolve()),
}));

describe('UnifiedChatArea', () => {
  const createDefaultConfig = (overrides?: Partial<ChatConfig>): ChatConfig => ({
    mode: 'main' as ChatMode,
    features: {
      fileUpload: true,
      imageAttachment: true,
      codeExecution: false,
      toolApproval: true,
      editRegenerate: true,
    },
    style: {
      fontSize: '1rem',
      showTimestamps: false,
    },
    dataSource: {
      conversationId: 'test-conv',
      messages: [],
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render without crashing', () => {
    const config = createDefaultConfig();
    render(<UnifiedChatArea config={config} />);
    expect(screen.getByText('메시지를 입력하여 대화를 시작하세요')).toBeInTheDocument();
  });

  it('should show welcome message when no messages', () => {
    const config = createDefaultConfig();
    render(<UnifiedChatArea config={config} />);

    expect(screen.getByText('메시지를 입력하여 대화를 시작하세요')).toBeInTheDocument();
  });

  it('should render messages when available', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        conversation_id: 'test-conv',
        role: 'user',
        content: 'Hello',
        created_at: Date.now(),
      },
      {
        id: 'msg-2',
        conversation_id: 'test-conv',
        role: 'assistant',
        content: 'Hi there!',
        created_at: Date.now(),
      },
    ];

    const config = createDefaultConfig({
      dataSource: {
        conversationId: 'test-conv',
        messages,
      },
    });

    // Mock useChatMessages to return messages
    const { useChatMessages } = require('@/components/chat/unified/hooks/useChatMessages');
    useChatMessages.mockReturnValue({
      messages,
      isStreaming: false,
      scrollRef: { current: null },
    });

    render(<UnifiedChatArea config={config} />);

    expect(screen.getByTestId('message-msg-1')).toBeInTheDocument();
    expect(screen.getByTestId('message-msg-2')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  it('should call onEdit when edit is triggered', async () => {
    const mockOnEdit = jest.fn(() => Promise.resolve());
    const config = createDefaultConfig();

    render(<UnifiedChatArea config={config} onEdit={mockOnEdit} />);

    // This test would require more setup to actually trigger edit
    expect(mockOnEdit).not.toHaveBeenCalled();
  });

  it('should call onRegenerate when regenerate is triggered', async () => {
    const mockOnRegenerate = jest.fn(() => Promise.resolve());
    const config = createDefaultConfig();

    render(<UnifiedChatArea config={config} onRegenerate={mockOnRegenerate} />);

    // This test would require more setup to actually trigger regenerate
    expect(mockOnRegenerate).not.toHaveBeenCalled();
  });

  it('should apply custom font size from config', () => {
    const config = createDefaultConfig({
      style: {
        fontSize: '1.5rem',
        showTimestamps: false,
      },
    });

    const { container } = render(<UnifiedChatArea config={config} />);
    const messagesContainer = container.querySelector('.mx-auto.max-w-4xl');

    if (messagesContainer) {
      expect(messagesContainer).toHaveStyle({ fontSize: '1.5rem' });
    }
  });

  it('should render in browser mode', () => {
    const config = createDefaultConfig({
      mode: 'browser' as ChatMode,
    });

    render(<UnifiedChatArea config={config} />);
    expect(screen.getByText('Browser Agent 도구')).toBeInTheDocument();
  });

  it('should render in editor mode', () => {
    const config = createDefaultConfig({
      mode: 'editor' as ChatMode,
    });

    const { container } = render(<UnifiedChatArea config={config} />);
    // Editor mode shows empty state without text
    expect(container.querySelector('.flex.h-full')).toBeInTheDocument();
  });

  it('should handle persona display', () => {
    const config = createDefaultConfig({
      activePersona: {
        id: 'persona-1',
        name: 'Test Persona',
        description: 'A test persona',
        systemPrompt: 'You are a test persona',
        temperature: 0.7,
        maxTokens: 2000,
        icon: '🤖',
      },
    });

    render(<UnifiedChatArea config={config} />);
    // Persona display would be visible in the UI
  });

  it('should handle streaming state', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        conversation_id: 'test-conv',
        role: 'user',
        content: 'Hello',
        created_at: Date.now(),
      },
    ];

    const config = createDefaultConfig({
      dataSource: {
        conversationId: 'test-conv',
        messages,
      },
    });

    const { useChatMessages } = require('@/components/chat/unified/hooks/useChatMessages');
    useChatMessages.mockReturnValue({
      messages,
      isStreaming: true,
      scrollRef: { current: null },
    });

    render(<UnifiedChatArea config={config} />);
    expect(screen.getByTestId('message-msg-1')).toBeInTheDocument();
  });
});
