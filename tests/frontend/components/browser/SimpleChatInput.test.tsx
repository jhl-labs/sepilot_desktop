/**
 * SimpleChatInput 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SimpleChatInput } from '@/extensions/browser/components/SimpleChatInput';
import { useExtensionStore, getExtensionStoreState } from '@sepilot/extension-sdk/store';
import { useLangGraphStream } from '@sepilot/extension-sdk';

const mockUseExtensionStore = useExtensionStore as jest.Mock;
const mockGetExtensionStoreState = getExtensionStoreState as jest.Mock;
const mockUseLangGraphStream = useLangGraphStream as jest.Mock;

describe('SimpleChatInput', () => {
  const mockAddBrowserChatMessage = jest.fn();
  const mockUpdateBrowserChatMessage = jest.fn();
  const mockStartStream = jest.fn();
  const mockStopStream = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseExtensionStore.mockReturnValue({
      addBrowserChatMessage: mockAddBrowserChatMessage,
      updateBrowserChatMessage: mockUpdateBrowserChatMessage,
      browserChatMessages: [],
    });

    mockGetExtensionStoreState.mockReturnValue({
      browserChatMessages: [
        { id: 'msg-1', role: 'user', content: 'Test', created_at: Date.now() },
        { id: 'msg-2', role: 'assistant', content: '', created_at: Date.now() },
      ],
    });

    mockStartStream.mockResolvedValue(undefined);
    mockStopStream.mockResolvedValue(undefined);

    mockUseLangGraphStream.mockReturnValue({
      startStream: mockStartStream,
      stopStream: mockStopStream,
    });
  });

  it('should render input textarea', () => {
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
  });

  it('should render send button', () => {
    render(<SimpleChatInput />);

    const sendButton = screen.getByTitle('전송 (Enter)');
    expect(sendButton).toBeInTheDocument();
  });

  it('should update input value on change', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hello World');

    expect(textarea).toHaveValue('Hello World');
  });

  it('should disable send button when input is empty', () => {
    render(<SimpleChatInput />);

    const sendButton = screen.getByTitle('전송 (Enter)');
    expect(sendButton).toBeDisabled();
  });

  it('should enable send button when input has text', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test message');

    const sendButton = screen.getByTitle('전송 (Enter)');
    expect(sendButton).toBeEnabled();
  });

  it('should send message on button click', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test message');

    const sendButton = screen.getByTitle('전송 (Enter)');
    await user.click(sendButton);

    await waitFor(() => {
      expect(mockAddBrowserChatMessage).toHaveBeenCalledWith({
        role: 'user',
        content: 'Test message',
      });
    });
  });

  it('should send message on Enter key', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test message');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockAddBrowserChatMessage).toHaveBeenCalledWith({
        role: 'user',
        content: 'Test message',
      });
    });
  });

  it('should not send message on Shift+Enter', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Line 1');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    // Should not send message, just add newline
    expect(mockAddBrowserChatMessage).not.toHaveBeenCalled();
  });

  it('should clear input after sending message', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'Test message');

    const sendButton = screen.getByTitle('전송 (Enter)');
    await user.click(sendButton);

    await waitFor(() => {
      expect(textarea.value).toBe('');
    });
  });

  it('should not send empty message', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '   '); // Only whitespace

    const sendButton = screen.getByTitle('전송 (Enter)');
    await user.click(sendButton);

    expect(mockAddBrowserChatMessage).not.toHaveBeenCalled();
  });

  it('should trim message before sending', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '  Test message  ');

    const sendButton = screen.getByTitle('전송 (Enter)');
    await user.click(sendButton);

    await waitFor(() => {
      expect(mockAddBrowserChatMessage).toHaveBeenCalledWith({
        role: 'user',
        content: 'Test message',
      });
    });
  });

  it('should handle composition events', async () => {
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');

    // Start composition (IME input)
    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: '안녕' } });

    // Press Enter during composition - should not send
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(mockAddBrowserChatMessage).not.toHaveBeenCalled();

    // End composition
    fireEvent.compositionEnd(textarea);
  });

  it('should create assistant message placeholder when sending', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test');

    const sendButton = screen.getByTitle('전송 (Enter)');
    await user.click(sendButton);

    await waitFor(() => {
      expect(mockAddBrowserChatMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: '',
      });
    });
  });

  it('should call startStream when sending message', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test');

    const sendButton = screen.getByTitle('전송 (Enter)');
    await user.click(sendButton);

    await waitFor(() => {
      expect(mockStartStream).toHaveBeenCalledWith('Test', 'browser-agent');
    });
  });

  it('should show stop button when streaming', async () => {
    // Make startStream hang to simulate streaming
    mockStartStream.mockImplementation(() => new Promise(() => {}));

    const user = userEvent.setup();
    render(<SimpleChatInput />);

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

  it('should call stopStream when stop button clicked', async () => {
    // Make startStream hang to simulate streaming
    mockStartStream.mockImplementation(() => new Promise(() => {}));

    const user = userEvent.setup();
    render(<SimpleChatInput />);

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

    const stopButton = screen.getByTitle('중지 (Esc)');
    await user.click(stopButton);

    await waitFor(() => {
      expect(mockStopStream).toHaveBeenCalled();
    });
  });

  it('should stop streaming on Escape key', async () => {
    // Make startStream hang to simulate streaming
    mockStartStream.mockImplementation(() => new Promise(() => {}));

    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test');

    const sendButton = screen.getByTitle('전송 (Enter)');
    await user.click(sendButton);

    // Wait for streaming to start
    await waitFor(
      () => {
        expect(screen.getByTitle('중지 (Esc)')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Press Escape key
    fireEvent.keyDown(window, { key: 'Escape' });

    // Should call stopStream
    await waitFor(() => {
      expect(mockStopStream).toHaveBeenCalled();
    });
  });

  it('should enable textarea after streaming completes', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test');

    const sendButton = screen.getByTitle('전송 (Enter)');
    await user.click(sendButton);

    // Wait for streaming to complete (startStream resolves immediately)
    await waitFor(() => {
      expect(screen.getByTitle('전송 (Enter)')).toBeInTheDocument();
    });

    // Textarea should be enabled again
    await waitFor(() => {
      expect(textarea).not.toBeDisabled();
    });
  });

  it('should handle stream error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockStartStream.mockRejectedValue(new Error('Network error'));

    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test');

    const sendButton = screen.getByTitle('전송 (Enter)');
    await user.click(sendButton);

    // Should update assistant message with error
    await waitFor(() => {
      expect(mockUpdateBrowserChatMessage).toHaveBeenCalledWith('msg-2', {
        content: 'Error: Network error',
      });
    });

    consoleSpy.mockRestore();
  });

  it('should handle unknown error type', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockStartStream.mockRejectedValue('Unknown error');

    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Test');

    const sendButton = screen.getByTitle('전송 (Enter)');
    await user.click(sendButton);

    // Should update with generic error message
    await waitFor(() => {
      expect(mockUpdateBrowserChatMessage).toHaveBeenCalledWith('msg-2', {
        content: 'Error: Failed to get response',
      });
    });

    consoleSpy.mockRestore();
  });

  describe('텍스트 영역 자동 리사이즈', () => {
    it('should auto-resize textarea based on content', async () => {
      const user = userEvent.setup();
      render(<SimpleChatInput />);

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
      render(<SimpleChatInput />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      const focusSpy = jest.spyOn(textarea, 'focus');

      await user.type(textarea, 'Test');

      const sendButton = screen.getByTitle('전송 (Enter)');
      await user.click(sendButton);

      // Wait for streaming to complete
      await waitFor(
        () => {
          expect(screen.getByTitle('전송 (Enter)')).toBeInTheDocument();
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
      render(<SimpleChatInput />);

      expect(screen.queryByText(/Agent 실행 중/)).not.toBeInTheDocument();
    });

    it('should render progress bar container', () => {
      const { container } = render(<SimpleChatInput />);

      const inputContainer = container.querySelector('.relative.flex.items-end');
      expect(inputContainer).toBeInTheDocument();
    });

    it('should show Send icon when not streaming', () => {
      const { container } = render(<SimpleChatInput />);

      // Send icon should be present
      const sendIcon = container.querySelector('svg');
      expect(sendIcon).toBeInTheDocument();
    });

    it('should have placeholder text', () => {
      render(<SimpleChatInput />);

      const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
      expect(textarea).toBeInTheDocument();
    });

    it('should apply correct styling classes', () => {
      const { container } = render(<SimpleChatInput />);

      const wrapper = container.querySelector('.shrink-0.border-t.bg-background');
      expect(wrapper).toBeInTheDocument();
    });

    it('should render textarea with correct constraints', () => {
      render(<SimpleChatInput />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveClass('min-h-[40px]');
      expect(textarea).toHaveClass('max-h-[120px]');
      expect(textarea).toHaveClass('resize-none');
    });
  });

  describe('Button States', () => {
    it('should show send button with correct title', () => {
      render(<SimpleChatInput />);

      const sendButton = screen.getByTitle('전송 (Enter)');
      expect(sendButton).toBeInTheDocument();
    });

    it('should show stop button with correct title when streaming', async () => {
      mockStartStream.mockImplementation(() => new Promise(() => {}));

      const user = userEvent.setup();
      render(<SimpleChatInput />);

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

    it('should apply correct button classes', () => {
      const { container } = render(<SimpleChatInput />);

      const buttonContainer = container.querySelector('.flex.items-center.pb-1.pr-1');
      expect(buttonContainer).toBeInTheDocument();
    });
  });

  describe('Container Layout', () => {
    it('should have correct outer container structure', () => {
      const { container } = render(<SimpleChatInput />);

      const outerContainer = container.querySelector('.shrink-0.border-t.bg-background.p-2');
      expect(outerContainer).toBeInTheDocument();
    });

    it('should have correct inner container structure', () => {
      const { container } = render(<SimpleChatInput />);

      const innerContainer = container.querySelector(
        '.relative.flex.items-end.gap-2.rounded-lg.border.border-input.bg-background'
      );
      expect(innerContainer).toBeInTheDocument();
    });
  });
});
