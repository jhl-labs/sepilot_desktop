/**
 * MessageBubble 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { Message } from '@/types';
import { enableElectronMode, disableElectronMode, mockElectronAPI } from '../../../setup';

// Mock dependencies
jest.mock('@/components/markdown/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));

jest.mock('@/components/chat/ImageGenerationProgressBar', () => ({
  ImageGenerationProgressBar: () => <div data-testid="image-gen-progress">Generating...</div>,
}));

jest.mock('@/components/chat/CodeDiffViewer', () => ({
  CodeDiffViewer: ({ filePath }: { filePath: string }) => (
    <div data-testid="code-diff-viewer">{filePath}</div>
  ),
}));

jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(() => ({
    addMessage: jest.fn(),
    imageGenerationProgress: new Map(),
  })),
}));

describe('MessageBubble', () => {
  const mockOnEdit = jest.fn();
  const mockOnRegenerate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    disableElectronMode();
  });

  const userMessage: Message = {
    id: 'msg-1',
    role: 'user',
    content: 'Hello, AI!',
    created_at: Date.now(),
  };

  const assistantMessage: Message = {
    id: 'msg-2',
    role: 'assistant',
    content: 'Hello! How can I help you?',
    created_at: Date.now(),
  };

  describe('기본 렌더링', () => {
    it('should render user message', () => {
      render(<MessageBubble message={userMessage} />);

      expect(screen.getByText('You')).toBeInTheDocument();
      expect(screen.getByText('Hello, AI!')).toBeInTheDocument();
    });

    it('should render assistant message', () => {
      render(<MessageBubble message={assistantMessage} />);

      expect(screen.getByText('Assistant')).toBeInTheDocument();
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    it('should show user avatar icon', () => {
      const { container } = render(<MessageBubble message={userMessage} />);

      const avatar = container.querySelector('.from-blue-600');
      expect(avatar).toBeInTheDocument();
    });

    it('should show assistant avatar icon', () => {
      const { container } = render(<MessageBubble message={assistantMessage} />);

      const avatar = container.querySelector('.from-secondary');
      expect(avatar).toBeInTheDocument();
    });
  });

  describe('복사 기능', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: jest.fn().mockResolvedValue(undefined),
        },
        writable: true,
        configurable: true,
      });
    });

    it('should show copy button on hover', async () => {
      const user = userEvent.setup();
      const { container } = render(<MessageBubble message={userMessage} />);

      const messageDiv = container.querySelector('.group');
      if (messageDiv) {
        await user.hover(messageDiv);
      }

      await waitFor(() => {
        const copyButton = screen.getByTitle(/복사/);
        expect(copyButton).toBeInTheDocument();
      });
    });

    it('should copy message content to clipboard', async () => {
      const user = userEvent.setup();
      const { container } = render(<MessageBubble message={userMessage} />);

      const messageDiv = container.querySelector('.group');
      if (messageDiv) {
        fireEvent.mouseEnter(messageDiv);
      }

      const copyButton = await screen.findByTitle(/복사$/);
      await user.click(copyButton);

      await waitFor(() => {
        expect(screen.getByTitle('복사됨')).toBeInTheDocument();
      });
    });

    it('should reset copy state after 2 seconds', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ delay: null });
      const { container } = render(<MessageBubble message={userMessage} />);

      const messageDiv = container.querySelector('.group');
      if (messageDiv) {
        fireEvent.mouseEnter(messageDiv);
      }

      const copyButton = await screen.findByTitle(/복사/);
      await user.click(copyButton);

      await waitFor(() => {
        expect(screen.getByTitle('복사됨')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(2000);

      await waitFor(() => {
        expect(screen.getByTitle(/복사$/)).toBeInTheDocument();
      });

      jest.useRealTimers();
    });
  });

  describe('편집 기능 (사용자 메시지)', () => {
    it('should show edit button on user message hover', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <MessageBubble message={userMessage} onEdit={mockOnEdit} />
      );

      const messageDiv = container.querySelector('.group');
      if (messageDiv) {
        await user.hover(messageDiv);
      }

      await waitFor(() => {
        const editButton = screen.getByTitle('편집');
        expect(editButton).toBeInTheDocument();
      });
    });

    it('should enter edit mode on edit button click', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <MessageBubble message={userMessage} onEdit={mockOnEdit} />
      );

      const messageDiv = container.querySelector('.group');
      if (messageDiv) {
        fireEvent.mouseEnter(messageDiv);
      }

      const editButton = await screen.findByTitle('편집');
      await user.click(editButton);

      await waitFor(() => {
        const textarea = container.querySelector('textarea');
        expect(textarea).toBeInTheDocument();
        expect(textarea).toHaveValue('Hello, AI!');
        expect(screen.getByText('저장')).toBeInTheDocument();
        expect(screen.getByText('취소')).toBeInTheDocument();
      });
    });

    it('should save edited content', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <MessageBubble message={userMessage} onEdit={mockOnEdit} />
      );

      const messageDiv = container.querySelector('.group');
      if (messageDiv) {
        fireEvent.mouseEnter(messageDiv);
      }

      const editButton = await screen.findByTitle('편집');
      await user.click(editButton);

      const textarea = container.querySelector('textarea');
      if (textarea) {
        await user.clear(textarea);
        await user.type(textarea, 'Edited message');
      }

      const saveButton = screen.getByText('저장');
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnEdit).toHaveBeenCalledWith('msg-1', 'Edited message');
      });
    });

    it('should cancel edit and restore original content', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <MessageBubble message={userMessage} onEdit={mockOnEdit} />
      );

      const messageDiv = container.querySelector('.group');
      if (messageDiv) {
        fireEvent.mouseEnter(messageDiv);
      }

      const editButton = await screen.findByTitle('편집');
      await user.click(editButton);

      const textarea = container.querySelector('textarea');
      if (textarea) {
        await user.clear(textarea);
        await user.type(textarea, 'Changed');
      }

      const cancelButton = screen.getByText('취소');
      await user.click(cancelButton);

      await waitFor(() => {
        expect(mockOnEdit).not.toHaveBeenCalled();
        expect(container.querySelector('textarea')).not.toBeInTheDocument();
      });
    });

    it('should not save empty content', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <MessageBubble message={userMessage} onEdit={mockOnEdit} />
      );

      const messageDiv = container.querySelector('.group');
      if (messageDiv) {
        fireEvent.mouseEnter(messageDiv);
      }

      const editButton = await screen.findByTitle('편집');
      await user.click(editButton);

      const textarea = container.querySelector('textarea');
      if (textarea) {
        await user.clear(textarea);
      }

      const saveButton = screen.getByText('저장');
      await user.click(saveButton);

      expect(mockOnEdit).not.toHaveBeenCalled();
    });
  });

  describe('재생성 기능 (어시스턴트 메시지)', () => {
    it('should show regenerate button on last assistant message', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <MessageBubble
          message={assistantMessage}
          onRegenerate={mockOnRegenerate}
          isLastAssistantMessage={true}
        />
      );

      const messageDiv = container.querySelector('.group');
      if (messageDiv) {
        await user.hover(messageDiv);
      }

      await waitFor(() => {
        const regenerateButton = screen.getByTitle('재생성');
        expect(regenerateButton).toBeInTheDocument();
      });
    });

    it('should not show regenerate button on non-last assistant message', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <MessageBubble
          message={assistantMessage}
          onRegenerate={mockOnRegenerate}
          isLastAssistantMessage={false}
        />
      );

      const messageDiv = container.querySelector('.group');
      if (messageDiv) {
        await user.hover(messageDiv);
      }

      await waitFor(() => {
        expect(screen.queryByTitle('재생성')).not.toBeInTheDocument();
      });
    });

    it('should call onRegenerate when clicked', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <MessageBubble
          message={assistantMessage}
          onRegenerate={mockOnRegenerate}
          isLastAssistantMessage={true}
        />
      );

      const messageDiv = container.querySelector('.group');
      if (messageDiv) {
        fireEvent.mouseEnter(messageDiv);
      }

      const regenerateButton = await screen.findByTitle('재생성');
      await user.click(regenerateButton);

      expect(mockOnRegenerate).toHaveBeenCalledWith('msg-2');
    });
  });

  describe('이미지 표시', () => {
    it('should render attached images', () => {
      const messageWithImages: Message = {
        ...assistantMessage,
        images: [
          {
            id: 'img-1',
            filename: 'test.png',
            mimeType: 'image/png',
            base64: 'data:image/png;base64,test',
          },
        ],
      };

      render(<MessageBubble message={messageWithImages} />);

      const image = screen.getByAltText('test.png');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'data:image/png;base64,test');
    });

    it('should open image in new window on click', async () => {
      const user = userEvent.setup();
      const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation();

      const messageWithImages: Message = {
        ...assistantMessage,
        images: [
          {
            id: 'img-1',
            filename: 'test.png',
            mimeType: 'image/png',
            base64: 'data:image/png;base64,test',
          },
        ],
      };

      render(<MessageBubble message={messageWithImages} />);

      const image = screen.getByAltText('test.png');
      await user.click(image);

      expect(windowOpenSpy).toHaveBeenCalledWith('data:image/png;base64,test', '_blank');

      windowOpenSpy.mockRestore();
    });

    it('should render multiple images', () => {
      const messageWithImages: Message = {
        ...assistantMessage,
        images: [
          {
            id: 'img-1',
            filename: 'test1.png',
            mimeType: 'image/png',
            base64: 'data:image/png;base64,test1',
          },
          {
            id: 'img-2',
            filename: 'test2.png',
            mimeType: 'image/png',
            base64: 'data:image/png;base64,test2',
          },
        ],
      };

      render(<MessageBubble message={messageWithImages} />);

      expect(screen.getByAltText('test1.png')).toBeInTheDocument();
      expect(screen.getByAltText('test2.png')).toBeInTheDocument();
    });
  });

  describe('Image generation progress', () => {
    it('should show image generation progress', () => {
      const mockUseChatStore = require('@/lib/store/chat-store').useChatStore;
      mockUseChatStore.mockReturnValue({
        addMessage: jest.fn(),
        imageGenerationProgress: new Map([
          [
            'gen-1',
            {
              messageId: 'msg-2',
              status: 'in_progress',
              progress: 50,
            },
          ],
        ]),
      });

      render(<MessageBubble message={assistantMessage} />);

      expect(screen.getByTestId('image-gen-progress')).toBeInTheDocument();

      mockUseChatStore.mockReturnValue({
        addMessage: jest.fn(),
        imageGenerationProgress: new Map(),
      });
    });
  });

  describe('Referenced documents', () => {
    const messageWithDocs: Message = {
      ...assistantMessage,
      referenced_documents: [
        {
          id: 'doc-1',
          title: 'Document 1',
          source: 'github',
          content: 'This is a long document content that should be truncated in preview...',
        },
      ],
    };

    it('should render referenced documents', () => {
      render(<MessageBubble message={messageWithDocs} />);

      expect(screen.getByText(/참조 문서/)).toBeInTheDocument();
      expect(screen.getByText(/Document 1/)).toBeInTheDocument();
    });

    it('should expand document when clicking expand button', async () => {
      const user = userEvent.setup();
      render(<MessageBubble message={messageWithDocs} />);

      const expandButton = screen.getByText('펼치기');
      await user.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('접기')).toBeInTheDocument();
        expect(screen.getByText(/long document content/)).toBeInTheDocument();
      });
    });

    it('should collapse document when clicking collapse button', async () => {
      const user = userEvent.setup();
      render(<MessageBubble message={messageWithDocs} />);

      // Expand first
      const expandButton = screen.getByText('펼치기');
      await user.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('접기')).toBeInTheDocument();
      });

      // Collapse
      const collapseButton = screen.getByText('접기');
      await user.click(collapseButton);

      await waitFor(() => {
        expect(screen.getByText('펼치기')).toBeInTheDocument();
      });
    });

    it('should add document to chat when clicking document area', async () => {
      const mockAddMessage = jest.fn();
      const mockUseChatStore = require('@/lib/store/chat-store').useChatStore;
      mockUseChatStore.mockReturnValue({
        addMessage: mockAddMessage,
        imageGenerationProgress: new Map(),
      });

      const user = userEvent.setup();
      const { container } = render(<MessageBubble message={messageWithDocs} />);

      // Click on document (but not on the expand button)
      const docDiv = container.querySelector('.bg-muted\\/30.rounded-lg');
      if (docDiv) {
        await user.click(docDiv);
      }

      expect(mockAddMessage).toHaveBeenCalled();

      mockUseChatStore.mockReturnValue({
        addMessage: jest.fn(),
        imageGenerationProgress: new Map(),
      });
    });
  });

  describe('File changes', () => {
    it('should render file changes from message', () => {
      const messageWithFileChanges: Message = {
        ...assistantMessage,
        fileChanges: [
          {
            filePath: '/test/file.ts',
            changeType: 'modified',
            oldContent: 'old',
            newContent: 'new',
          },
        ],
      };

      render(<MessageBubble message={messageWithFileChanges} />);

      expect(screen.getByText(/파일 변경/)).toBeInTheDocument();
      expect(screen.getByTestId('code-diff-viewer')).toBeInTheDocument();
    });
  });

  describe('Mouse interactions', () => {
    it('should hide action buttons on mouse leave', async () => {
      const { container } = render(<MessageBubble message={userMessage} onEdit={mockOnEdit} />);

      const messageDiv = container.querySelector('.group');
      if (messageDiv) {
        fireEvent.mouseEnter(messageDiv);
        await waitFor(() => {
          expect(screen.getByTitle(/복사/)).toBeInTheDocument();
        });

        fireEvent.mouseLeave(messageDiv);
        await waitFor(() => {
          expect(screen.queryByTitle(/복사/)).not.toBeInTheDocument();
        });
      }
    });
  });

  describe('Streaming state', () => {
    it('should pass isStreaming to MarkdownRenderer', () => {
      render(<MessageBubble message={assistantMessage} isStreaming={true} />);

      // MarkdownRenderer is mocked, but we can verify it rendered
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });
  });

  describe('Auto-detect file changes from tool_calls', () => {
    beforeEach(() => {
      enableElectronMode();
    });

    afterEach(() => {
      disableElectronMode();
    });

    it('should auto-detect file changes from file_edit tool', async () => {
      const messageWithToolCalls: Message = {
        ...assistantMessage,
        tool_calls: [
          {
            id: 'tool-1',
            name: 'file_edit',
            arguments: {
              path: '/test/file.ts',
              old_str: 'old text',
              new_str: 'new text',
            },
          },
        ],
      };

      (mockElectronAPI.file.read as jest.Mock).mockResolvedValue('This is old text content');

      render(<MessageBubble message={messageWithToolCalls} />);

      await waitFor(() => {
        expect(mockElectronAPI.file.read).toHaveBeenCalledWith('/test/file.ts');
      });

      await waitFor(() => {
        expect(screen.getByText(/파일 변경/)).toBeInTheDocument();
        expect(screen.getByTestId('code-diff-viewer')).toBeInTheDocument();
      });
    });

    it('should auto-detect file changes from file_write tool', async () => {
      const messageWithToolCalls: Message = {
        ...assistantMessage,
        tool_calls: [
          {
            id: 'tool-1',
            name: 'file_write',
            arguments: {
              path: '/test/newfile.ts',
              content: 'New file content',
            },
          },
        ],
      };

      (mockElectronAPI.file.read as jest.Mock).mockRejectedValue(new Error('File not found'));

      render(<MessageBubble message={messageWithToolCalls} />);

      await waitFor(() => {
        expect(mockElectronAPI.file.read).toHaveBeenCalledWith('/test/newfile.ts');
      });

      await waitFor(() => {
        expect(screen.getByText(/파일 변경/)).toBeInTheDocument();
      });
    });

    it('should handle multiple file tool_calls', async () => {
      const messageWithMultipleTools: Message = {
        ...assistantMessage,
        tool_calls: [
          {
            id: 'tool-1',
            name: 'file_edit',
            arguments: {
              path: '/test/file1.ts',
              old_str: 'old',
              new_str: 'new',
            },
          },
          {
            id: 'tool-2',
            name: 'file_write',
            arguments: {
              path: '/test/file2.ts',
              content: 'content',
            },
          },
        ],
      };

      (mockElectronAPI.file.read as jest.Mock).mockResolvedValue('old content');

      render(<MessageBubble message={messageWithMultipleTools} />);

      await waitFor(() => {
        const diffViewers = screen.getAllByTestId('code-diff-viewer');
        expect(diffViewers.length).toBe(2);
      });
    });

    it('should skip non-file-edit tools', async () => {
      const messageWithBashTool: Message = {
        ...assistantMessage,
        tool_calls: [
          {
            id: 'tool-1',
            name: 'bash',
            arguments: {
              command: 'ls -la',
            },
          },
        ],
      };

      render(<MessageBubble message={messageWithBashTool} />);

      await waitFor(() => {
        expect(mockElectronAPI.file.read).not.toHaveBeenCalled();
      });
    });

    it('should skip tool_calls without path', async () => {
      const messageWithInvalidTool: Message = {
        ...assistantMessage,
        tool_calls: [
          {
            id: 'tool-1',
            name: 'file_edit',
            arguments: {
              // Missing path
              old_str: 'old',
              new_str: 'new',
            },
          },
        ],
      };

      render(<MessageBubble message={messageWithInvalidTool} />);

      await waitFor(() => {
        expect(mockElectronAPI.file.read).not.toHaveBeenCalled();
      });
    });

    it('should not auto-detect in non-Electron environment', () => {
      disableElectronMode();

      const messageWithToolCalls: Message = {
        ...assistantMessage,
        tool_calls: [
          {
            id: 'tool-1',
            name: 'file_edit',
            arguments: {
              path: '/test/file.ts',
              old_str: 'old',
              new_str: 'new',
            },
          },
        ],
      };

      render(<MessageBubble message={messageWithToolCalls} />);

      expect(mockElectronAPI.file.read).not.toHaveBeenCalled();
    });

    it('should handle file read errors gracefully', async () => {
      const messageWithToolCalls: Message = {
        ...assistantMessage,
        tool_calls: [
          {
            id: 'tool-1',
            name: 'file_edit',
            arguments: {
              path: '/test/file.ts',
              old_str: 'old',
              new_str: 'new',
            },
          },
        ],
      };

      // Mock file.read to throw an error during the edit content processing
      (mockElectronAPI.file.read as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      render(<MessageBubble message={messageWithToolCalls} />);

      // Component should not crash even when file read fails
      await waitFor(() => {
        expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
      });
    });

    it('should determine changeType as created when oldContent is empty', async () => {
      const messageWithToolCalls: Message = {
        ...assistantMessage,
        tool_calls: [
          {
            id: 'tool-1',
            name: 'file_write',
            arguments: {
              path: '/test/newfile.ts',
              content: 'New content',
            },
          },
        ],
      };

      (mockElectronAPI.file.read as jest.Mock).mockResolvedValue('');

      render(<MessageBubble message={messageWithToolCalls} />);

      await waitFor(() => {
        expect(screen.getByText(/파일 변경/)).toBeInTheDocument();
      });
    });

    it('should not show auto-detected changes when user message', async () => {
      const userMessageWithToolCalls: Message = {
        ...userMessage,
        tool_calls: [
          {
            id: 'tool-1',
            name: 'file_edit',
            arguments: {
              path: '/test/file.ts',
              old_str: 'old',
              new_str: 'new',
            },
          },
        ],
      };

      render(<MessageBubble message={userMessageWithToolCalls} />);

      expect(mockElectronAPI.file.read).not.toHaveBeenCalled();
    });
  });
});
