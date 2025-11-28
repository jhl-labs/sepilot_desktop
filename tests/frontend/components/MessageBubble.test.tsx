/**
 * MessageBubble 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { Message } from '@/types';
import { useChatStore } from '@/lib/store/chat-store';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(),
}));

// Mock MarkdownRenderer
jest.mock('@/components/markdown/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

// Mock CodeDiffViewer
jest.mock('@/components/chat/CodeDiffViewer', () => ({
  CodeDiffViewer: () => <div data-testid="code-diff">CodeDiff</div>,
}));

// Mock ImageGenerationProgressBar
jest.mock('@/components/chat/ImageGenerationProgressBar', () => ({
  ImageGenerationProgressBar: () => <div data-testid="image-progress">Progress</div>,
}));

describe('MessageBubble', () => {
  const mockChatStore = {
    addMessage: jest.fn(),
    imageGenerationProgress: new Map(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useChatStore as unknown as jest.Mock).mockReturnValue(mockChatStore);

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  const userMessage: Message = {
    id: 'msg-1',
    role: 'user',
    content: 'Hello, how are you?',
    created_at: Date.now(),
  };

  const assistantMessage: Message = {
    id: 'msg-2',
    role: 'assistant',
    content: 'I am doing well, thank you!',
    created_at: Date.now(),
  };

  it('should render user message', () => {
    render(<MessageBubble message={userMessage} />);

    expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
  });

  it('should render assistant message', () => {
    render(<MessageBubble message={assistantMessage} />);

    expect(screen.getByText('I am doing well, thank you!')).toBeInTheDocument();
  });

  it('should show user icon for user messages', () => {
    const { container } = render(<MessageBubble message={userMessage} />);

    // User icon should be present
    const userIcon = container.querySelector('svg');
    expect(userIcon).toBeInTheDocument();
  });

  it('should show bot icon for assistant messages', () => {
    const { container } = render(<MessageBubble message={assistantMessage} />);

    // Bot icon should be present
    const botIcon = container.querySelector('svg');
    expect(botIcon).toBeInTheDocument();
  });

  it('should show copy button on hover for assistant messages', () => {
    render(<MessageBubble message={assistantMessage} />);

    const messageElement = screen.getByText('I am doing well, thank you!').closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    // Copy button should be visible
    const copyButton = screen.getByRole('button', { name: /copy/i });
    expect(copyButton).toBeInTheDocument();
  });

  it('should copy message content to clipboard', async () => {
    render(<MessageBubble message={assistantMessage} />);

    const messageElement = screen.getByText('I am doing well, thank you!').closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const copyButton = screen.getByRole('button', { name: /copy/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('I am doing well, thank you!');
    });

    // Should show "Copied!" feedback
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
  });

  it('should show edit button for user messages on hover', () => {
    const onEdit = jest.fn();
    render(<MessageBubble message={userMessage} onEdit={onEdit} />);

    const messageElement = screen.getByText('Hello, how are you?').closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const editButton = screen.getByRole('button', { name: /edit/i });
    expect(editButton).toBeInTheDocument();
  });

  it('should enter edit mode when edit button clicked', () => {
    const onEdit = jest.fn();
    render(<MessageBubble message={userMessage} onEdit={onEdit} />);

    const messageElement = screen.getByText('Hello, how are you?').closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    // Textarea should appear
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('Hello, how are you?');
  });

  it('should save edited message', async () => {
    const onEdit = jest.fn();
    render(<MessageBubble message={userMessage} onEdit={onEdit} />);

    const messageElement = screen.getByText('Hello, how are you?').closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Updated message' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith('msg-1', 'Updated message');
    });
  });

  it('should cancel editing', () => {
    const onEdit = jest.fn();
    render(<MessageBubble message={userMessage} onEdit={onEdit} />);

    const messageElement = screen.getByText('Hello, how are you?').closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Changed' } });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    // Should revert to original content
    expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('should show regenerate button for last assistant message', () => {
    const onRegenerate = jest.fn();
    render(
      <MessageBubble
        message={assistantMessage}
        onRegenerate={onRegenerate}
        isLastAssistantMessage={true}
      />
    );

    const messageElement = screen.getByText('I am doing well, thank you!').closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const regenerateButton = screen.getByRole('button', { name: /regenerate/i });
    expect(regenerateButton).toBeInTheDocument();
  });

  it('should call onRegenerate when regenerate button clicked', () => {
    const onRegenerate = jest.fn();
    render(
      <MessageBubble
        message={assistantMessage}
        onRegenerate={onRegenerate}
        isLastAssistantMessage={true}
      />
    );

    const messageElement = screen.getByText('I am doing well, thank you!').closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const regenerateButton = screen.getByRole('button', { name: /regenerate/i });
    fireEvent.click(regenerateButton);

    expect(onRegenerate).toHaveBeenCalledWith('msg-2');
  });

  it('should render markdown content', () => {
    render(<MessageBubble message={assistantMessage} />);

    expect(screen.getByTestId('markdown')).toBeInTheDocument();
  });

  it('should display images when present', () => {
    const messageWithImages: Message = {
      ...userMessage,
      images: [
        { id: 'img-1', url: 'data:image/png;base64,abc', filename: 'test.png' },
      ],
    };

    render(<MessageBubble message={messageWithImages} />);

    const image = screen.getByAlt('test.png');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'data:image/png;base64,abc');
  });

  it('should display tool calls when present', () => {
    const messageWithToolCalls: Message = {
      ...assistantMessage,
      tool_calls: [
        {
          id: 'tool-1',
          type: 'function',
          function: { name: 'search', arguments: '{"query": "test"}' },
        },
      ],
    };

    render(<MessageBubble message={messageWithToolCalls} />);

    expect(screen.getByText(/search/i)).toBeInTheDocument();
  });

  it('should not allow editing empty content', () => {
    const onEdit = jest.fn();
    render(<MessageBubble message={userMessage} onEdit={onEdit} />);

    const messageElement = screen.getByText('Hello, how are you?').closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '   ' } }); // Whitespace only

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    // Should not call onEdit with empty/whitespace content
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('should display system messages differently', () => {
    const systemMessage: Message = {
      id: 'sys-1',
      role: 'system',
      content: 'System notification',
      created_at: Date.now(),
    };

    const { container } = render(<MessageBubble message={systemMessage} />);

    expect(screen.getByText('System notification')).toBeInTheDocument();
    // System messages should have different styling
    expect(container.querySelector('.bg-yellow-50')).toBeInTheDocument();
  });

  it('should handle streaming state', () => {
    render(<MessageBubble message={assistantMessage} isStreaming={true} />);

    // Should not show action buttons while streaming
    const messageElement = screen.getByText('I am doing well, thank you!').closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    expect(screen.queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument();
  });
});
