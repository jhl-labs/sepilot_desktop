/**
 * SimpleChatInput 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SimpleChatInput } from '@/components/browser/SimpleChatInput';
import { useChatStore } from '@/lib/store/chat-store';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(),
}));

// Mock platform check
jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => false),
}));

// Mock WebLLMClient
jest.mock('@/lib/llm/web-client', () => ({
  getWebLLMClient: jest.fn(() => ({
    stream: jest.fn(async function* () {
      yield { content: 'Hello', done: false };
      yield { content: ' ', done: false };
      yield { content: 'World', done: false };
      yield { done: true };
    }),
  })),
}));

describe('SimpleChatInput', () => {
  const mockAddBrowserChatMessage = jest.fn();
  const mockUpdateBrowserChatMessage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      addBrowserChatMessage: mockAddBrowserChatMessage,
      updateBrowserChatMessage: mockUpdateBrowserChatMessage,
      browserChatMessages: [],
    });

    // Mock getState for streaming updates
    (useChatStore as any).getState = jest.fn(() => ({
      browserChatMessages: [
        { id: 'msg-1', role: 'user', content: 'Test', created_at: Date.now() },
        { id: 'msg-2', role: 'assistant', content: '', created_at: Date.now() },
      ],
    }));
  });

  it('should render input textarea', () => {
    render(<SimpleChatInput />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    expect(textarea).toBeInTheDocument();
  });

  it('should render send button', () => {
    render(<SimpleChatInput />);

    const sendButton = screen.getByRole('button', { name: /전송/ });
    expect(sendButton).toBeInTheDocument();
  });

  it('should update input value on change', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    await user.type(textarea, 'Hello World');

    expect(textarea).toHaveValue('Hello World');
  });

  it('should disable send button when input is empty', () => {
    render(<SimpleChatInput />);

    const sendButton = screen.getByRole('button', { name: /전송/ });
    expect(sendButton).toBeDisabled();
  });

  it('should enable send button when input has text', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    await user.type(textarea, 'Test message');

    const sendButton = screen.getByRole('button', { name: /전송/ });
    expect(sendButton).toBeEnabled();
  });

  it('should send message on Enter key', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
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

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    await user.type(textarea, 'Line 1');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    // Should not send message, just add newline
    expect(mockAddBrowserChatMessage).not.toHaveBeenCalled();
  });

  it('should clear input after sending message', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...') as HTMLTextAreaElement;
    await user.type(textarea, 'Test message');

    const sendButton = screen.getByRole('button', { name: /전송/ });
    await user.click(sendButton);

    await waitFor(() => {
      expect(textarea.value).toBe('');
    });
  });

  it('should not send empty message', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    await user.type(textarea, '   '); // Only whitespace

    const sendButton = screen.getByRole('button', { name: /전송/ });
    await user.click(sendButton);

    expect(mockAddBrowserChatMessage).not.toHaveBeenCalled();
  });

  it('should trim message before sending', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    await user.type(textarea, '  Test message  ');

    const sendButton = screen.getByRole('button', { name: /전송/ });
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

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');

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

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    await user.type(textarea, 'Test');

    const sendButton = screen.getByRole('button', { name: /전송/ });
    await user.click(sendButton);

    await waitFor(() => {
      expect(mockAddBrowserChatMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: '',
      });
    });
  });


  it('should enable textarea after streaming completes', async () => {
    const user = userEvent.setup();
    render(<SimpleChatInput />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
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

});
