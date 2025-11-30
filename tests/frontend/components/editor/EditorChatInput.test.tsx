/**
 * EditorChatInput 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { EditorChatInput } from '@/components/editor/EditorChatInput';
import { useChatStore } from '@/lib/store/chat-store';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(),
}));

// Mock platform check
jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => false),
}));

// Mock WebLLMClient with delay
const createSlowStreamMock = () => async function* () {
  await new Promise((resolve) => setTimeout(resolve, 50));
  yield { content: 'Hello', done: false };
  await new Promise((resolve) => setTimeout(resolve, 50));
  yield { content: ' ', done: false };
  await new Promise((resolve) => setTimeout(resolve, 50));
  yield { content: 'World', done: false };
  await new Promise((resolve) => setTimeout(resolve, 50));
  yield { done: true };
};

jest.mock('@/lib/llm/web-client', () => ({
  getWebLLMClient: jest.fn(() => ({
    stream: createSlowStreamMock(),
  })),
}));

describe('EditorChatInput', () => {
  const mockAddEditorChatMessage = jest.fn();
  const mockUpdateEditorChatMessage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      addEditorChatMessage: mockAddEditorChatMessage,
      updateEditorChatMessage: mockUpdateEditorChatMessage,
      editorChatMessages: [],
      workingDirectory: null,
      openFiles: [],
    });

    // Mock getState for streaming updates
    (useChatStore as any).getState = jest.fn(() => ({
      editorChatMessages: [
        { id: 'msg-1', role: 'user', content: 'Test', created_at: Date.now() },
        { id: 'msg-2', role: 'assistant', content: '', created_at: Date.now() },
      ],
    }));
  });

  it('should render input textarea', () => {
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
  });

  it('should render send button', () => {
    render(<EditorChatInput />);

    const sendButton = screen.getByRole('button', { name: /전송/ });
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

    const sendButton = screen.getByRole('button', { name: /전송/ });
    expect(sendButton).toBeDisabled();
  });

  it('should enable send button when input has text', async () => {
    const user = userEvent.setup();
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test message');

    const sendButton = screen.getByRole('button', { name: /전송/ });
    expect(sendButton).toBeEnabled();
  });

  it('should send message on Enter key', async () => {
    const user = userEvent.setup();
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test message');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockAddEditorChatMessage).toHaveBeenCalledWith({
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

    // Should not send message, just add newline
    expect(mockAddEditorChatMessage).not.toHaveBeenCalled();
  });

  it('should clear input after sending message', async () => {
    const user = userEvent.setup();
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'Test message');

    const sendButton = screen.getByRole('button', { name: /전송/ });
    await user.click(sendButton);

    await waitFor(() => {
      expect(textarea.value).toBe('');
    });
  });

  it('should not send empty message', async () => {
    const user = userEvent.setup();
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '   '); // Only whitespace

    const sendButton = screen.getByRole('button', { name: /전송/ });
    await user.click(sendButton);

    expect(mockAddEditorChatMessage).not.toHaveBeenCalled();
  });

  it('should trim message before sending', async () => {
    const user = userEvent.setup();
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '  Test message  ');

    const sendButton = screen.getByRole('button', { name: /전송/ });
    await user.click(sendButton);

    await waitFor(() => {
      expect(mockAddEditorChatMessage).toHaveBeenCalledWith({
        role: 'user',
        content: 'Test message',
      });
    });
  });

  it('should handle composition events', async () => {
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox');

    // Start composition (IME input)
    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: '안녕' } });

    // Press Enter during composition - should not send
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(mockAddEditorChatMessage).not.toHaveBeenCalled();

    // End composition
    fireEvent.compositionEnd(textarea);
  });

  it('should create assistant message placeholder when sending', async () => {
    const user = userEvent.setup();
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test');

    const sendButton = screen.getByRole('button', { name: /전송/ });
    await user.click(sendButton);

    await waitFor(() => {
      expect(mockAddEditorChatMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: '',
      });
    });
  });

  it('should enable textarea after streaming completes', async () => {
    const user = userEvent.setup();
    render(<EditorChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test');

    const sendButton = screen.getByRole('button', { name: /전송/ });
    await user.click(sendButton);

    // Wait for streaming to complete
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /전송/ })).toBeInTheDocument();
    });

    // Textarea should be enabled again
    await waitFor(() => {
      expect(textarea).not.toBeDisabled();
    });
  });

  describe('스트리밍 중지 기능', () => {
    beforeEach(() => {
      // Use slower mock for stop tests
      const mockWebLLMClient = require('@/lib/llm/web-client');
      mockWebLLMClient.getWebLLMClient.mockReturnValue({
        stream: createSlowStreamMock(),
      });
    });

    it('should show stop button when streaming', async () => {
      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      // Stop button should appear during streaming
      await waitFor(
        () => {
          const stopButton = screen.getByRole('button', { name: /중지/ });
          expect(stopButton).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should stop streaming when stop button clicked', async () => {
      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      // Wait for stop button
      const stopButton = await screen.findByRole(
        'button',
        { name: /중지/ },
        { timeout: 3000 }
      );
      await user.click(stopButton);

      // Should show send button again
      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /전송/ })).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should stop streaming on Escape key', async () => {
      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      // Wait for streaming to start
      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /중지/ })).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Press Escape key
      fireEvent.keyDown(window, { key: 'Escape' });

      // Should show send button again
      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /전송/ })).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should not send message while streaming', async () => {
      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'First message');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      // Clear mock calls from first send
      mockAddEditorChatMessage.mockClear();

      // Try to send another message while streaming
      await user.type(textarea, 'Second message');

      // Stop button should be shown
      const stopButton = await screen.findByRole(
        'button',
        { name: /중지/ },
        { timeout: 3000 }
      );
      expect(stopButton).toBeInTheDocument();

      // Enter should not send while streaming
      fireEvent.keyDown(textarea, { key: 'Enter' });

      // Should not call addEditorChatMessage
      expect(mockAddEditorChatMessage).not.toHaveBeenCalled();
    });
  });

  describe('에러 처리', () => {
    it('should handle stream error', async () => {
      const mockWebLLMClient = require('@/lib/llm/web-client');
      mockWebLLMClient.getWebLLMClient.mockReturnValue({
        stream: jest.fn(async function* () {
          throw new Error('Network error');
        }),
      });

      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      // Should update assistant message with error
      await waitFor(() => {
        expect(mockUpdateEditorChatMessage).toHaveBeenCalledWith(
          'msg-2',
          { content: 'Error: Network error' }
        );
      });
    });

    it('should handle unknown error type', async () => {
      const mockWebLLMClient = require('@/lib/llm/web-client');
      mockWebLLMClient.getWebLLMClient.mockReturnValue({
        stream: jest.fn(async function* () {
          throw 'Unknown error';
        }),
      });

      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      // Should update with generic error message
      await waitFor(() => {
        expect(mockUpdateEditorChatMessage).toHaveBeenCalledWith(
          'msg-2',
          { content: 'Error: Failed to get response' }
        );
      });
    });
  });

  describe('웹 스트리밍', () => {
    it('should update assistant message with streamed content', async () => {
      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      // Should update assistant message progressively
      await waitFor(() => {
        expect(mockUpdateEditorChatMessage).toHaveBeenCalled();
      });
    });

    it('should respect abort signal during streaming', async () => {
      // Create a longer streaming mock that can be aborted
      const mockWebLLMClient = require('@/lib/llm/web-client');
      mockWebLLMClient.getWebLLMClient.mockReturnValue({
        stream: jest.fn(async function* () {
          for (let i = 0; i < 100; i++) {
            yield { content: `chunk ${i}`, done: false };
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          yield { done: true };
        }),
      });

      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      // Wait a bit then stop
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /중지/ })).toBeInTheDocument();
      });

      const stopButton = screen.getByRole('button', { name: /중지/ });
      await user.click(stopButton);

      // Should stop streaming
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /전송/ })).toBeInTheDocument();
      });
    });
  });

  describe('텍스트 영역 자동 리사이즈', () => {
    it('should auto-resize textarea based on content', async () => {
      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

      // Mock scrollHeight
      Object.defineProperty(textarea, 'scrollHeight', {
        value: 100,
        writable: true,
      });

      await user.type(textarea, 'Line 1\nLine 2\nLine 3');

      // Should adjust height
      await waitFor(() => {
        expect(textarea.style.height).toBe('100px');
      });
    });
  });

  describe('초점 관리', () => {
    it('should call focus on textarea after streaming completes', async () => {
      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      const focusSpy = jest.spyOn(textarea, 'focus');

      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      // Wait for streaming to complete
      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /전송/ })).toBeInTheDocument();
        },
        { timeout: 5000 }
      );

      // Textarea focus should have been called
      await waitFor(
        () => {
          expect(focusSpy).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      focusSpy.mockRestore();
    });
  });

  describe('Agent Progress UI', () => {
    it('should not show progress UI initially', () => {
      render(<EditorChatInput />);

      expect(screen.queryByText(/생각 중/)).not.toBeInTheDocument();
      expect(screen.queryByText(/실행 중/)).not.toBeInTheDocument();
      expect(screen.queryByText(/작업 중/)).not.toBeInTheDocument();
    });

    it('should render progress bar container', () => {
      const { container } = render(<EditorChatInput />);

      const inputContainer = container.querySelector('.relative.flex.items-end');
      expect(inputContainer).toBeInTheDocument();
    });

    it('should show Send icon when not streaming', () => {
      const { container } = render(<EditorChatInput />);

      // Send icon should be present
      const sendIcon = container.querySelector('svg');
      expect(sendIcon).toBeInTheDocument();
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
  });

  describe('Button States', () => {
    it('should show send button with correct title', () => {
      render(<EditorChatInput />);

      const sendButton = screen.getByTitle('전송 (Enter)');
      expect(sendButton).toBeInTheDocument();
    });

    it('should show stop button with correct title when streaming', async () => {
      const user = userEvent.setup();
      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      await waitFor(
        () => {
          const stopButton = screen.getByTitle('중지 (Esc)');
          expect(stopButton).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should apply correct button classes', () => {
      const { container } = render(<EditorChatInput />);

      const buttonContainer = container.querySelector('.flex.items-center.pb-1.pr-1');
      expect(buttonContainer).toBeInTheDocument();
    });
  });

  describe('Container Layout', () => {
    it('should have correct outer container structure', () => {
      const { container } = render(<EditorChatInput />);

      const outerContainer = container.querySelector('.shrink-0.border-t.bg-background.p-2');
      expect(outerContainer).toBeInTheDocument();
    });

    it('should have correct inner container structure', () => {
      const { container } = render(<EditorChatInput />);

      const innerContainer = container.querySelector(
        '.relative.flex.items-end.gap-2.rounded-lg.border.border-input.bg-background'
      );
      expect(innerContainer).toBeInTheDocument();
    });
  });

  describe('Electron Environment - Editor Agent', () => {
    const mockAbort = jest.fn();
    const mockStream = jest.fn();
    const mockOnStreamEvent = jest.fn();
    let eventHandlerCleanup: (() => void) | null = null;

    beforeEach(() => {
      // Mock Electron environment
      const { isElectron } = require('@/lib/platform');
      (isElectron as jest.Mock).mockReturnValue(true);

      // Setup electronAPI mock
      eventHandlerCleanup = jest.fn();
      mockOnStreamEvent.mockReturnValue(eventHandlerCleanup);

      (window as any).electronAPI = {
        langgraph: {
          abort: mockAbort,
          stream: mockStream,
          onStreamEvent: mockOnStreamEvent,
        },
      };

      jest.clearAllMocks();

      // Setup store with editor-specific properties
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        addEditorChatMessage: mockAddEditorChatMessage,
        updateEditorChatMessage: mockUpdateEditorChatMessage,
        editorChatMessages: [],
        workingDirectory: '/test/workspace',
        openFiles: [],
      });

      (useChatStore as any).getState = jest.fn(() => ({
        editorChatMessages: [
          { id: 'msg-1', role: 'user', content: 'Test', created_at: Date.now() },
          { id: 'msg-2', role: 'assistant', content: '', created_at: Date.now() },
        ],
      }));
    });

    afterEach(() => {
      const { isElectron } = require('@/lib/platform');
      (isElectron as jest.Mock).mockReturnValue(false);
      delete (window as any).electronAPI;
    });

    it('should call Editor Agent when sending message in Electron', async () => {
      const user = userEvent.setup();
      mockStream.mockResolvedValue(undefined);

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test Editor Agent');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockStream).toHaveBeenCalled();
      });

      // Check stream was called with correct parameters
      const streamCall = mockStream.mock.calls[0];
      expect(streamCall[0]).toEqual({
        thinkingMode: 'editor-agent',
        enableRAG: false,
        enableTools: true,
        enableImageGeneration: false,
      });
      expect(streamCall[2]).toBe('editor-chat-temp');
      expect(streamCall[5]).toBe('/test/workspace'); // workingDirectory
    });

    it('should handle streaming events from Editor Agent', async () => {
      const user = userEvent.setup();
      let capturedEventHandler: ((event: any) => void) | null = null;

      mockOnStreamEvent.mockImplementation((handler: (event: any) => void) => {
        capturedEventHandler = handler;
        return eventHandlerCleanup;
      });

      mockStream.mockImplementation(async () => {
        // Simulate streaming events
        if (capturedEventHandler) {
          capturedEventHandler({ type: 'streaming', chunk: 'Hello' });
          capturedEventHandler({ type: 'streaming', chunk: ' World' });
        }
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockUpdateEditorChatMessage).toHaveBeenCalled();
      });

      // Check that content was accumulated
      expect(mockUpdateEditorChatMessage).toHaveBeenCalledWith('msg-2', {
        content: expect.stringContaining('Hello'),
      });
    });

    it('should handle progress events from Editor Agent', async () => {
      const user = userEvent.setup();
      let capturedEventHandler: ((event: any) => void) | null = null;

      mockOnStreamEvent.mockImplementation((handler: (event: any) => void) => {
        capturedEventHandler = handler;
        return eventHandlerCleanup;
      });

      mockStream.mockImplementation(async () => {
        if (capturedEventHandler) {
          capturedEventHandler({
            type: 'progress',
            data: {
              iteration: 2,
              maxIterations: 50,
              status: 'thinking',
              message: 'Analyzing code...',
            },
          });
        }
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockOnStreamEvent).toHaveBeenCalled();
      });
    });

    it('should handle node events from Editor Agent', async () => {
      const user = userEvent.setup();
      let capturedEventHandler: ((event: any) => void) | null = null;

      mockOnStreamEvent.mockImplementation((handler: (event: any) => void) => {
        capturedEventHandler = handler;
        return eventHandlerCleanup;
      });

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

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockUpdateEditorChatMessage).toHaveBeenCalledWith('msg-2', {
          content: 'Node response',
        });
      });
    });

    it('should cleanup event listeners after streaming', async () => {
      const user = userEvent.setup();
      mockStream.mockResolvedValue(undefined);

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      await waitFor(() => {
        expect(eventHandlerCleanup).toHaveBeenCalled();
      });
    });

    it('should call abort when stop button clicked in Electron', async () => {
      const user = userEvent.setup();
      mockAbort.mockResolvedValue(undefined);

      // Make stream keep running
      mockStream.mockImplementation(async () => {
        return new Promise(() => {});
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      // Wait for stop button to appear
      const stopButton = await screen.findByRole(
        'button',
        { name: /중지/ },
        { timeout: 3000 }
      );
      await user.click(stopButton);

      await waitFor(() => {
        expect(mockAbort).toHaveBeenCalledWith('editor-chat-temp');
      });
    });

    it('should handle abort errors gracefully', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockAbort.mockRejectedValue(new Error('Abort failed'));

      mockStream.mockImplementation(async () => {
        return new Promise(() => {});
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      const stopButton = await screen.findByRole(
        'button',
        { name: /중지/ },
        { timeout: 3000 }
      );
      await user.click(stopButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[EditorChatInput] Failed to abort stream:'),
          expect.anything()
        );
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle null stream events', async () => {
      const user = userEvent.setup();
      let capturedEventHandler: ((event: any) => void) | null = null;

      mockOnStreamEvent.mockImplementation((handler: (event: any) => void) => {
        capturedEventHandler = handler;
        return eventHandlerCleanup;
      });

      mockStream.mockImplementation(async () => {
        if (capturedEventHandler) {
          // Send null event (should be ignored - line 111)
          capturedEventHandler(null);
          capturedEventHandler(undefined);
          // Then send valid event
          capturedEventHandler({ type: 'streaming', chunk: 'test' });
        }
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockUpdateEditorChatMessage).toHaveBeenCalled();
      });
    });

    it('should handle stream event errors gracefully', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      let capturedEventHandler: ((event: any) => void) | null = null;

      // Store original getState
      const originalGetState = (useChatStore as any).getState;

      mockOnStreamEvent.mockImplementation((handler: (event: any) => void) => {
        capturedEventHandler = handler;
        return eventHandlerCleanup;
      });

      // Mock to throw error
      (useChatStore as any).getState = jest.fn(() => {
        throw new Error('getState error');
      });

      mockStream.mockImplementation(async () => {
        if (capturedEventHandler) {
          capturedEventHandler({ type: 'streaming', chunk: 'test' });
        }
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[EditorChatInput] Stream event error:'),
          expect.anything()
        );
      });

      // Restore original getState
      (useChatStore as any).getState = originalGetState;
      consoleErrorSpy.mockRestore();
    });

    it('should ignore events when aborted', async () => {
      const user = userEvent.setup();
      let capturedEventHandler: ((event: any) => void) | null = null;

      mockOnStreamEvent.mockImplementation((handler: (event: any) => void) => {
        capturedEventHandler = handler;
        return eventHandlerCleanup;
      });

      // Keep stream open for abort test
      mockStream.mockImplementation(async () => {
        return new Promise(() => {});
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      // Wait for stop button
      const stopButton = await screen.findByRole(
        'button',
        { name: /중지/ },
        { timeout: 3000 }
      );
      await user.click(stopButton);

      // Clear previous calls
      mockUpdateEditorChatMessage.mockClear();

      // Now send event after abort - should be ignored
      if (capturedEventHandler) {
        capturedEventHandler({ type: 'streaming', chunk: 'Should not appear' });
      }

      // Wait a bit to ensure no update happens
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockUpdateEditorChatMessage).not.toHaveBeenCalled();
    });

    it('should pass workingDirectory to stream call', async () => {
      const user = userEvent.setup();
      mockStream.mockResolvedValue(undefined);

      // Set different workingDirectory
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        addEditorChatMessage: mockAddEditorChatMessage,
        updateEditorChatMessage: mockUpdateEditorChatMessage,
        editorChatMessages: [],
        workingDirectory: '/custom/path',
        openFiles: [],
      });

      render(<EditorChatInput />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');

      const sendButton = screen.getByRole('button', { name: /전송/ });
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockStream).toHaveBeenCalled();
      });

      const streamCall = mockStream.mock.calls[0];
      expect(streamCall[5]).toBe('/custom/path');
    });
  });
});
