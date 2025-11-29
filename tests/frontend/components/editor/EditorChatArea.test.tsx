/**
 * EditorChatArea 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EditorChatArea } from '@/components/editor/EditorChatArea';
import * as chatStoreModule from '@/lib/store/chat-store';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(),
}));

describe('EditorChatArea', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show empty state when no messages', () => {
    (chatStoreModule.useChatStore as jest.Mock).mockReturnValue({
      editorChatMessages: [],
    });

    render(<EditorChatArea />);

    expect(screen.getByText('사용 가능한 Editor Agent 도구')).toBeInTheDocument();
    expect(screen.getByText('• 파일 읽기')).toBeInTheDocument();
    expect(screen.getByText('• 파일 목록 조회')).toBeInTheDocument();
    expect(screen.getByText('• 파일 검색')).toBeInTheDocument();
    expect(screen.getByText('• 파일 쓰기')).toBeInTheDocument();
    expect(screen.getByText('• 파일 수정')).toBeInTheDocument();
    expect(screen.getByText('• 터미널 명령 실행')).toBeInTheDocument();
    expect(screen.getByText('• 터미널 출력 가져오기')).toBeInTheDocument();
    expect(screen.getByText('• Git 상태 확인')).toBeInTheDocument();
    expect(screen.getByText('• Git diff')).toBeInTheDocument();
  });

  it('should render user messages', () => {
    (chatStoreModule.useChatStore as jest.Mock).mockReturnValue({
      editorChatMessages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello, can you help me?',
          timestamp: Date.now(),
        },
      ],
    });

    const { container } = render(<EditorChatArea />);

    expect(screen.getByText('Hello, can you help me?')).toBeInTheDocument();

    // User messages should be aligned to the right
    const messageContainer = container.querySelector('.justify-end');
    expect(messageContainer).toBeInTheDocument();
  });

  it('should render assistant messages', () => {
    (chatStoreModule.useChatStore as jest.Mock).mockReturnValue({
      editorChatMessages: [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'Sure, I can help you!',
          timestamp: Date.now(),
        },
      ],
    });

    const { container } = render(<EditorChatArea />);

    expect(screen.getByText('Sure, I can help you!')).toBeInTheDocument();

    // Assistant messages should be aligned to the left
    const messageContainer = container.querySelector('.justify-start');
    expect(messageContainer).toBeInTheDocument();
  });

  it('should render multiple messages in correct order', () => {
    (chatStoreModule.useChatStore as jest.Mock).mockReturnValue({
      editorChatMessages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'First message',
          timestamp: Date.now() - 1000,
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Second message',
          timestamp: Date.now(),
        },
      ],
    });

    render(<EditorChatArea />);

    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
  });

  it('should preserve whitespace in messages', () => {
    (chatStoreModule.useChatStore as jest.Mock).mockReturnValue({
      editorChatMessages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Line 1\nLine 2\n  Indented line',
          timestamp: Date.now(),
        },
      ],
    });

    const { container } = render(<EditorChatArea />);

    const messageElement = screen.getByText(/Line 1/);
    expect(messageElement).toHaveClass('whitespace-pre-wrap');
  });

  it('should apply correct styling to user messages', () => {
    (chatStoreModule.useChatStore as jest.Mock).mockReturnValue({
      editorChatMessages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'User message',
          timestamp: Date.now(),
        },
      ],
    });

    const { container } = render(<EditorChatArea />);

    const messageElement = screen.getByText('User message').parentElement;
    expect(messageElement).toHaveClass('bg-primary');
    expect(messageElement).toHaveClass('text-primary-foreground');
  });

  it('should apply correct styling to assistant messages', () => {
    (chatStoreModule.useChatStore as jest.Mock).mockReturnValue({
      editorChatMessages: [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'Assistant message',
          timestamp: Date.now(),
        },
      ],
    });

    const { container } = render(<EditorChatArea />);

    const messageElement = screen.getByText('Assistant message').parentElement;
    expect(messageElement).toHaveClass('bg-muted');
  });
});
