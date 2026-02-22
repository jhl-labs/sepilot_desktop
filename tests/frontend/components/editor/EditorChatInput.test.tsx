/**
 * EditorChatInput 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { EditorChatInput } from '@/extensions/editor/components/EditorChatInput';
import { useExtensionAPIContext } from '@sepilot/extension-sdk';

// Mock useExtensionAPIContext (override the global mock)
const mockAddMessage = jest.fn();
const mockUpdateMessage = jest.fn();
const mockStream = jest.fn();
const mockOnStreamEvent = jest.fn();
const mockAbort = jest.fn();

const createMockContext = (overrides: any = {}) => ({
  chat: {
    messages: [],
    addMessage: mockAddMessage,
    updateMessage: mockUpdateMessage,
    stream: mockStream,
    onStreamEvent: mockOnStreamEvent,
    abort: mockAbort,
    ...overrides.chat,
  },
  workspace: {
    workingDirectory: null,
    ...overrides.workspace,
  },
  files: {
    openFile: jest.fn(),
    openFiles: [],
    ...overrides.files,
  },
  ipc: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn(),
    ...overrides.ipc,
  },
});

describe('EditorChatInput', () => {
  let eventHandlerCleanup: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    eventHandlerCleanup = jest.fn();
    mockOnStreamEvent.mockReturnValue(eventHandlerCleanup);

    const mockContext = createMockContext();
    (useExtensionAPIContext as jest.Mock).mockReturnValue(mockContext);
  });

  it('should render input textarea', () => {
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
  });

  it('should render send button', () => {
    render(<EditorChatInput />);

    const sendButton = screen.getByTitle('전송 (Enter)');
    expect(sendButton).toBeInTheDocument();
  });

  it('should update input value on change', async () => {
    const user = userEvent.setup();
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hello World');

    expect(textarea).toHaveValue('Hello World');
  });

  it('should disable send button when input is empty', () => {
    render(<EditorChatInput />);

    const sendButton = screen.getByTitle('전송 (Enter)');
    expect(sendButton).toBeDisabled();
  });

  it('should enable send button when input has text', async () => {
    const user = userEvent.setup();
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test message');

    const sendButton = screen.getByTitle('전송 (Enter)');
    expect(sendButton).toBeEnabled();
  });

  it('should have placeholder text', () => {
    render(<EditorChatInput />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    expect(textarea).toBeInTheDocument();
  });

  it('should apply correct styling classes', () => {
    const { container } = render(<EditorChatInput />);

    const wrapper = container.querySelector('.shrink-0.border-t.bg-background');
    expect(wrapper).toBeInTheDocument();
  });

  it('should render textarea with correct constraints', () => {
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveClass('min-h-[40px]');
    expect(textarea).toHaveClass('max-h-[120px]');
    expect(textarea).toHaveClass('resize-none');
  });

  it('should handle composition events', async () => {
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox');

    // Start composition (IME input)
    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: '안녕' } });

    // Press Enter during composition - should not send
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(mockAddMessage).not.toHaveBeenCalled();

    // End composition
    fireEvent.compositionEnd(textarea);
  });

  it('should not show progress UI initially', () => {
    render(<EditorChatInput />);

    expect(screen.queryByText(/생각 중/)).not.toBeInTheDocument();
    expect(screen.queryByText(/실행 중/)).not.toBeInTheDocument();
    expect(screen.queryByText(/작업 중/)).not.toBeInTheDocument();
  });

  describe('Electron Environment - Editor Agent', () => {
    beforeEach(() => {
      // Enable Electron mode via extension SDK mock
      const sdkUtils = require('@sepilot/extension-sdk/utils');
      (sdkUtils.isElectron as jest.Mock).mockReturnValue(true);

      const mockContext = createMockContext({
        workspace: { workingDirectory: '/test/workspace' },
      });
      (useExtensionAPIContext as jest.Mock).mockReturnValue(mockContext);
    });

    afterEach(() => {
      const sdkUtils = require('@sepilot/extension-sdk/utils');
      (sdkUtils.isElectron as jest.Mock).mockReturnValue(false);
    });

    it('should call stream when sending message', async () => {
      const user = userEvent.setup();
      mockStream.mockResolvedValue(undefined);

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test Editor Agent');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockAddMessage).toHaveBeenCalledWith({
          role: 'user',
          content: 'Test Editor Agent',
        });
      });

      await waitFor(() => {
        expect(mockStream).toHaveBeenCalled();
      });

      // Check stream was called with correct parameters
      const streamCall = mockStream.mock.calls[0];
      expect(streamCall[0]).toEqual({
        thinkingMode: 'editor-agent',
        enableRAG: true,
        enableTools: true,
        enableImageGeneration: false,
        enableMCPTools: true,
        enablePlanning: true,
        enableVerification: true,
      });
      expect(streamCall[2]).toBe('editor-chat-temp');
      expect(streamCall[5]).toBe('/test/workspace');
    });

    it('should create assistant message placeholder when sending', async () => {
      const user = userEvent.setup();
      mockStream.mockResolvedValue(undefined);

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockAddMessage).toHaveBeenCalledWith({
          role: 'assistant',
          content: '',
        });
      });
    });

    it('should clear input after sending message', async () => {
      const user = userEvent.setup();
      mockStream.mockResolvedValue(undefined);

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await user.type(textarea, 'Test message');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      await waitFor(() => {
        expect(textarea.value).toBe('');
      });
    });

    it('should send message on Enter key', async () => {
      const user = userEvent.setup();
      mockStream.mockResolvedValue(undefined);

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test message');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockAddMessage).toHaveBeenCalledWith({
          role: 'user',
          content: 'Test message',
        });
      });
    });

    it('should not send message on Shift+Enter', async () => {
      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Line 1');
      await user.keyboard('{Shift>}{Enter}{/Shift}');

      expect(mockAddMessage).not.toHaveBeenCalled();
    });

    it('should not send empty message', async () => {
      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '   ');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      expect(mockAddMessage).not.toHaveBeenCalled();
    });

    it('should handle streaming events', async () => {
      const user = userEvent.setup();
      let capturedEventHandler: ((event: any) => void) | null = null;

      mockOnStreamEvent.mockImplementation((handler: (event: any) => void) => {
        capturedEventHandler = handler;
        return eventHandlerCleanup;
      });

      // Mock messages to include the assistant placeholder
      const mockContext = createMockContext({
        chat: {
          messages: [
            { id: 'msg-1', role: 'user', content: 'Test', created_at: Date.now() },
            { id: 'msg-2', role: 'assistant', content: '', created_at: Date.now() },
          ],
        },
        workspace: { workingDirectory: '/test/workspace' },
      });
      (useExtensionAPIContext as jest.Mock).mockReturnValue(mockContext);

      mockStream.mockImplementation(async () => {
        if (capturedEventHandler) {
          capturedEventHandler({ type: 'streaming', chunk: 'Hello' });
          capturedEventHandler({ type: 'streaming', chunk: ' World' });
        }
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockUpdateMessage).toHaveBeenCalled();
      });
    });

    it('should handle node events from Editor Agent', async () => {
      const user = userEvent.setup();
      let capturedEventHandler: ((event: any) => void) | null = null;

      mockOnStreamEvent.mockImplementation((handler: (event: any) => void) => {
        capturedEventHandler = handler;
        return eventHandlerCleanup;
      });

      const mockContext = createMockContext({
        chat: {
          messages: [
            { id: 'msg-1', role: 'user', content: 'Test', created_at: Date.now() },
            { id: 'msg-2', role: 'assistant', content: '', created_at: Date.now() },
          ],
        },
        workspace: { workingDirectory: '/test/workspace' },
      });
      (useExtensionAPIContext as jest.Mock).mockReturnValue(mockContext);

      mockStream.mockImplementation(async () => {
        if (capturedEventHandler) {
          capturedEventHandler({
            type: 'node',
            data: {
              messages: [
                { role: 'user', content: 'Test' },
                { role: 'assistant', content: 'Node response' },
              ],
            },
          });
        }
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockUpdateMessage).toHaveBeenCalledWith('msg-2', 'Node response');
      });
    });

    it('should cleanup event listeners after streaming', async () => {
      const user = userEvent.setup();
      mockStream.mockResolvedValue(undefined);

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      await waitFor(() => {
        expect(eventHandlerCleanup).toHaveBeenCalled();
      });
    });

    it('should show stop button when streaming', async () => {
      const user = userEvent.setup();

      // Make stream keep running
      mockStream.mockImplementation(async () => {
        return new Promise(() => {});
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      await waitFor(
        () => {
          const stopButton = screen.getByTitle('중지 (Esc)');
          expect(stopButton).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should call abort when stop button clicked', async () => {
      const user = userEvent.setup();
      mockAbort.mockResolvedValue(undefined);

      mockStream.mockImplementation(async () => {
        return new Promise(() => {});
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      const stopButton = await screen.findByTitle('중지 (Esc)', {}, { timeout: 3000 });
      await user.click(stopButton);

      await waitFor(() => {
        expect(mockAbort).toHaveBeenCalledWith('editor-chat-temp');
      });
    });

    it('should handle null stream events', async () => {
      const user = userEvent.setup();
      let capturedEventHandler: ((event: any) => void) | null = null;

      mockOnStreamEvent.mockImplementation((handler: (event: any) => void) => {
        capturedEventHandler = handler;
        return eventHandlerCleanup;
      });

      const mockContext = createMockContext({
        workspace: { workingDirectory: '/test/workspace' },
      });
      (useExtensionAPIContext as jest.Mock).mockReturnValue(mockContext);

      mockStream.mockImplementation(async () => {
        if (capturedEventHandler) {
          capturedEventHandler(null);
          capturedEventHandler(undefined);
        }
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      // Should not throw an error
      await waitFor(() => {
        expect(mockOnStreamEvent).toHaveBeenCalled();
      });
    });

    it('should pass workingDirectory to stream call', async () => {
      const user = userEvent.setup();
      mockStream.mockResolvedValue(undefined);

      const mockContext = createMockContext({
        workspace: { workingDirectory: '/custom/path' },
      });
      (useExtensionAPIContext as jest.Mock).mockReturnValue(mockContext);

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockStream).toHaveBeenCalled();
      });

      const streamCall = mockStream.mock.calls[0];
      expect(streamCall[5]).toBe('/custom/path');
    });

    it('should handle stream errors gracefully', async () => {
      const user = userEvent.setup();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const mockContext = createMockContext({
        chat: {
          messages: [
            { id: 'msg-1', role: 'user', content: 'Test', created_at: Date.now() },
            { id: 'msg-2', role: 'assistant', content: '', created_at: Date.now() },
          ],
        },
        workspace: { workingDirectory: '/test/workspace' },
      });
      (useExtensionAPIContext as jest.Mock).mockReturnValue(mockContext);

      mockStream.mockRejectedValue(new Error('Stream error'));

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockUpdateMessage).toHaveBeenCalledWith('msg-2', {
          content: 'Error: Stream error',
        });
      });

      consoleSpy.mockRestore();
    });

    it('should stop streaming on Escape key', async () => {
      const user = userEvent.setup();

      mockStream.mockImplementation(async () => {
        return new Promise(() => {});
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      await waitFor(
        () => {
          expect(screen.getByTitle('중지 (Esc)')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(
        () => {
          expect(screen.getByTitle('전송 (Enter)')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('텍스트 영역 자동 리사이즈', () => {
    it('should auto-resize textarea based on content', async () => {
      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

      Object.defineProperty(textarea, 'scrollHeight', {
        value: 100,
        writable: true,
      });

      await user.type(textarea, 'Line 1\nLine 2\nLine 3');

      await waitFor(() => {
        expect(textarea.style.height).toBe('100px');
      });
    });
  });
});
