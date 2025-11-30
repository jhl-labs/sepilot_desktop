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
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
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

    const messageElement = screen
      .getByText('I am doing well, thank you!')
      .closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    // Copy button should be visible
    const copyButton = screen.getByRole('button', { name: /복사/ });
    expect(copyButton).toBeInTheDocument();
  });

  it('should copy message content to clipboard', async () => {
    render(<MessageBubble message={assistantMessage} />);

    const messageElement = screen
      .getByText('I am doing well, thank you!')
      .closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const copyButton = screen.getByRole('button', { name: /복사/ });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('I am doing well, thank you!');
      // Should show "Copied!" feedback
      expect(screen.getByRole('button', { name: /복사됨/ })).toBeInTheDocument();
    });
  });

  it('should show edit button for user messages on hover', () => {
    const onEdit = jest.fn();
    render(<MessageBubble message={userMessage} onEdit={onEdit} />);

    const messageElement = screen.getByText('Hello, how are you?').closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const editButton = screen.getByRole('button', { name: /편집/ });
    expect(editButton).toBeInTheDocument();
  });

  it('should enter edit mode when edit button clicked', () => {
    const onEdit = jest.fn();
    render(<MessageBubble message={userMessage} onEdit={onEdit} />);

    const messageElement = screen.getByText('Hello, how are you?').closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const editButton = screen.getByRole('button', { name: /편집/ });
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

    const editButton = screen.getByRole('button', { name: /편집/ });
    fireEvent.click(editButton);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Updated message' } });

    const saveButton = screen.getByRole('button', { name: /저장/ });
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

    const editButton = screen.getByRole('button', { name: /편집/ });
    fireEvent.click(editButton);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Changed' } });

    const cancelButton = screen.getByRole('button', { name: /취소/ });
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

    const messageElement = screen
      .getByText('I am doing well, thank you!')
      .closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const regenerateButton = screen.getByRole('button', { name: /재생성/ });
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

    const messageElement = screen
      .getByText('I am doing well, thank you!')
      .closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const regenerateButton = screen.getByRole('button', { name: /재생성/ });
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
        {
          id: 'img-1',
          path: '/test/test.png',
          filename: 'test.png',
          mimeType: 'image/png',
          base64: 'data:image/png;base64,abc',
        },
      ],
    };

    render(<MessageBubble message={messageWithImages} />);

    // Images should be displayed
    const image = screen.getByAltText('test.png');
    expect(image).toBeInTheDocument();
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

    const { container } = render(<MessageBubble message={messageWithToolCalls} />);

    // Message with tool calls should render successfully
    expect(container.firstChild).toBeInTheDocument();
    // Content should still be displayed
    expect(screen.getByText('I am doing well, thank you!')).toBeInTheDocument();
  });

  it('should not allow editing empty content', () => {
    const onEdit = jest.fn();
    render(<MessageBubble message={userMessage} onEdit={onEdit} />);

    const messageElement = screen.getByText('Hello, how are you?').closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    const editButton = screen.getByRole('button', { name: /편집/ });
    fireEvent.click(editButton);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '   ' } }); // Whitespace only

    const saveButton = screen.getByRole('button', { name: /저장/ });
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
    // System messages should have different styling (check for any background color class)
    const hasBackgroundStyling = container.querySelector('[class*="bg-"]') !== null;
    expect(hasBackgroundStyling).toBe(true);
  });

  it('should handle streaming state', () => {
    render(<MessageBubble message={assistantMessage} isStreaming={true} />);

    // Should not show action buttons while streaming
    const messageElement = screen
      .getByText('I am doing well, thank you!')
      .closest('div')!.parentElement!;
    fireEvent.mouseEnter(messageElement);

    expect(screen.queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument();
  });

  describe('참조 문서 기능', () => {
    it('should display referenced documents', () => {
      const messageWithDocs: Message = {
        ...assistantMessage,
        referenced_documents: [
          {
            id: 'doc-1',
            title: 'Test Document',
            content: 'This is a test document content',
            source: 'test.md',
            similarity: 0.95,
          },
        ],
      };

      render(<MessageBubble message={messageWithDocs} />);

      expect(screen.getByText(/참조 문서/)).toBeInTheDocument();
      expect(screen.getByText(/【출처: test.md - Test Document】/)).toBeInTheDocument();
    });

    it('should show document preview by default', () => {
      const messageWithDocs: Message = {
        ...assistantMessage,
        referenced_documents: [
          {
            id: 'doc-1',
            title: 'Test Document',
            content:
              'This is a very long test document content that should be truncated in preview mode',
            source: 'test.md',
            similarity: 0.95,
          },
        ],
      };

      render(<MessageBubble message={messageWithDocs} />);

      // Should show preview (first 100 chars)
      expect(screen.getByText(/This is a very long test document/)).toBeInTheDocument();
    });

    it('should toggle document expansion', async () => {
      const messageWithDocs: Message = {
        ...assistantMessage,
        referenced_documents: [
          {
            id: 'doc-1',
            title: 'Test Document',
            content: 'Full document content',
            source: 'test.md',
            similarity: 0.95,
          },
        ],
      };

      render(<MessageBubble message={messageWithDocs} />);

      const expandButton = screen.getByRole('button', { name: /펼치기/ });
      fireEvent.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('Full document content')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /접기/ })).toBeInTheDocument();
      });

      const collapseButton = screen.getByRole('button', { name: /접기/ });
      fireEvent.click(collapseButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /펼치기/ })).toBeInTheDocument();
      });
    });

    it('should add document to chat when clicked', () => {
      const addMessageMock = jest.fn();
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        addMessage: addMessageMock,
      });

      const messageWithDocs: Message = {
        ...assistantMessage,
        referenced_documents: [
          {
            id: 'doc-1',
            title: 'Test Doc',
            content: 'Document content',
            source: 'test.md',
            similarity: 0.95,
          },
        ],
      };

      render(<MessageBubble message={messageWithDocs} />);

      const docElement = screen.getByText(/【출처: test.md - Test Doc】/).closest('div');
      fireEvent.click(docElement!);

      expect(addMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('📄 참조 문서: Test Doc'),
        })
      );
    });
  });

  describe('파일 변경 사항 표시', () => {
    it('should display file changes from message.fileChanges', () => {
      const messageWithFileChanges: Message = {
        ...assistantMessage,
        fileChanges: [
          {
            filePath: '/test/file.ts',
            changeType: 'modified',
            oldContent: 'old code',
            newContent: 'new code',
            toolName: 'file_edit',
          },
        ],
      };

      render(<MessageBubble message={messageWithFileChanges} />);

      expect(screen.getByText(/파일 변경/)).toBeInTheDocument();
      expect(screen.getByTestId('code-diff')).toBeInTheDocument();
    });

    it('should display multiple file changes', () => {
      const messageWithMultipleChanges: Message = {
        ...assistantMessage,
        fileChanges: [
          {
            filePath: '/test/file1.ts',
            changeType: 'modified',
            oldContent: 'old',
            newContent: 'new',
            toolName: 'file_edit',
          },
          {
            filePath: '/test/file2.js',
            changeType: 'created',
            oldContent: '',
            newContent: 'content',
            toolName: 'file_write',
          },
        ],
      };

      render(<MessageBubble message={messageWithMultipleChanges} />);

      expect(screen.getByText(/파일 변경 \(2개\)/)).toBeInTheDocument();
      const diffs = screen.getAllByTestId('code-diff');
      expect(diffs).toHaveLength(2);
    });
  });

  describe('이미지 기능', () => {
    it('should display multiple images', () => {
      const messageWithMultipleImages: Message = {
        ...userMessage,
        images: [
          {
            id: 'img-1',
            path: '/test/test1.png',
            filename: 'test1.png',
            mimeType: 'image/png',
            base64: 'data:image/png;base64,abc',
          },
          {
            id: 'img-2',
            path: '/test/test2.jpg',
            filename: 'test2.jpg',
            mimeType: 'image/jpeg',
            base64: 'data:image/jpeg;base64,def',
          },
        ],
      };

      render(<MessageBubble message={messageWithMultipleImages} />);

      expect(screen.getByAltText('test1.png')).toBeInTheDocument();
      expect(screen.getByAltText('test2.jpg')).toBeInTheDocument();
    });

    it('should open image in new window when clicked', () => {
      const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

      const messageWithImage: Message = {
        ...userMessage,
        images: [
          {
            id: 'img-1',
            path: '/test/test.png',
            filename: 'test.png',
            mimeType: 'image/png',
            base64: 'data:image/png;base64,abc',
          },
        ],
      };

      render(<MessageBubble message={messageWithImage} />);

      const image = screen.getByAltText('test.png');
      fireEvent.click(image);

      expect(windowOpenSpy).toHaveBeenCalledWith('data:image/png;base64,abc', '_blank');
      windowOpenSpy.mockRestore();
    });

    it('should show image generation progress', () => {
      const progressMap = new Map();
      progressMap.set('gen-1', {
        messageId: assistantMessage.id,
        status: 'executing',
        progress: 50,
        message: 'Generating...',
      });

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        imageGenerationProgress: progressMap,
      });

      render(<MessageBubble message={assistantMessage} />);

      expect(screen.getByTestId('image-progress')).toBeInTheDocument();
    });

    it('should not show completed image generation progress', () => {
      const progressMap = new Map();
      progressMap.set('gen-1', {
        messageId: assistantMessage.id,
        status: 'completed',
        progress: 100,
      });

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        imageGenerationProgress: progressMap,
      });

      render(<MessageBubble message={assistantMessage} />);

      expect(screen.queryByTestId('image-progress')).not.toBeInTheDocument();
    });
  });

  describe('버튼 표시 조건', () => {
    it('should not show edit button when onEdit is not provided', () => {
      render(<MessageBubble message={userMessage} />);

      const messageElement = screen.getByText('Hello, how are you?').closest('div')!.parentElement!;
      fireEvent.mouseEnter(messageElement);

      expect(screen.queryByRole('button', { name: /편집/ })).not.toBeInTheDocument();
    });

    it('should not show regenerate button for non-last assistant messages', () => {
      const onRegenerate = jest.fn();
      render(
        <MessageBubble
          message={assistantMessage}
          onRegenerate={onRegenerate}
          isLastAssistantMessage={false}
        />
      );

      const messageElement = screen
        .getByText('I am doing well, thank you!')
        .closest('div')!.parentElement!;
      fireEvent.mouseEnter(messageElement);

      expect(screen.queryByRole('button', { name: /재생성/ })).not.toBeInTheDocument();
    });

    it('should not show action buttons during editing', () => {
      const onEdit = jest.fn();
      render(<MessageBubble message={userMessage} onEdit={onEdit} />);

      const messageElement = screen.getByText('Hello, how are you?').closest('div')!.parentElement!;
      fireEvent.mouseEnter(messageElement);

      const editButton = screen.getByRole('button', { name: /편집/ });
      fireEvent.click(editButton);

      // Hover should not show action buttons while editing
      fireEvent.mouseEnter(messageElement);

      // Edit and copy buttons should not be visible during edit mode
      expect(screen.queryByTitle('복사')).not.toBeInTheDocument();
      expect(screen.queryByTitle('편집')).not.toBeInTheDocument();
    });
  });
});
