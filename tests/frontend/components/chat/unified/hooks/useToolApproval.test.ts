/**
 * useToolApproval Hook Tests
 */

import { renderHook, act } from '@testing-library/react';
import { enableElectronMode } from '../../../../../setup';

// Mock dependencies
jest.mock('@/lib/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockClearPendingToolApprovalForConversation = jest.fn();
const mockSetAlwaysApproveToolsForSession = jest.fn();
let mockPendingToolApproval: any = null;

jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(() => ({
    pendingToolApproval: mockPendingToolApproval,
    clearPendingToolApprovalForConversation: mockClearPendingToolApprovalForConversation,
    setAlwaysApproveToolsForSession: mockSetAlwaysApproveToolsForSession,
  })),
}));

jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => false),
}));

import { useToolApproval } from '@/components/chat/unified/hooks/useToolApproval';
import { isElectron } from '@/lib/platform';
import type { ToolCall } from '@/types';

describe('useToolApproval', () => {
  const mockToolCalls: ToolCall[] = [
    { id: 'tc-1', name: 'file_read', arguments: { path: '/tmp/test.txt' } },
    { id: 'tc-2', name: 'file_write', arguments: { path: '/tmp/out.txt', content: 'hello' } },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockPendingToolApproval = null;
    (isElectron as jest.Mock).mockReturnValue(false);
  });

  it('should initialize with no pending approval', () => {
    const { result } = renderHook(() => useToolApproval());

    expect(result.current.pendingToolApproval).toBeNull();
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.errorMessage).toBeNull();
  });

  it('should return pending approval from store', () => {
    mockPendingToolApproval = {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCalls: mockToolCalls,
      timestamp: Date.now(),
    };

    const { result } = renderHook(() => useToolApproval());

    expect(result.current.pendingToolApproval).toBeDefined();
    expect(result.current.pendingToolApproval?.conversationId).toBe('conv-1');
  });

  it('should approve tools and clear pending approval', async () => {
    mockPendingToolApproval = {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCalls: mockToolCalls,
      timestamp: Date.now(),
    };

    const { result } = renderHook(() => useToolApproval());

    await act(async () => {
      await result.current.handleToolApprove(mockToolCalls);
    });

    expect(mockClearPendingToolApprovalForConversation).toHaveBeenCalledWith('conv-1');
  });

  it('should reject tools and clear pending approval', async () => {
    mockPendingToolApproval = {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCalls: mockToolCalls,
      timestamp: Date.now(),
    };

    const { result } = renderHook(() => useToolApproval());

    await act(async () => {
      await result.current.handleToolReject();
    });

    expect(mockClearPendingToolApprovalForConversation).toHaveBeenCalledWith('conv-1');
  });

  it('should not approve when no pending approval', async () => {
    mockPendingToolApproval = null;

    const { result } = renderHook(() => useToolApproval());

    await act(async () => {
      await result.current.handleToolApprove(mockToolCalls);
    });

    expect(mockClearPendingToolApprovalForConversation).not.toHaveBeenCalled();
  });

  it('should not reject when no pending approval', async () => {
    mockPendingToolApproval = null;

    const { result } = renderHook(() => useToolApproval());

    await act(async () => {
      await result.current.handleToolReject();
    });

    expect(mockClearPendingToolApprovalForConversation).not.toHaveBeenCalled();
  });

  it('should send IPC response in electron mode on approve', async () => {
    (isElectron as jest.Mock).mockReturnValue(true);
    enableElectronMode();

    const mockRespondToolApproval = jest.fn().mockResolvedValue(undefined);
    (window as any).electronAPI.langgraph = {
      respondToolApproval: mockRespondToolApproval,
    };

    mockPendingToolApproval = {
      conversationId: 'conv-electron',
      messageId: 'msg-1',
      toolCalls: mockToolCalls,
      timestamp: Date.now(),
    };

    const { result } = renderHook(() => useToolApproval());

    await act(async () => {
      await result.current.handleToolApprove(mockToolCalls);
    });

    expect(mockRespondToolApproval).toHaveBeenCalledWith('conv-electron', true);
    expect(mockClearPendingToolApprovalForConversation).toHaveBeenCalledWith('conv-electron');
  });

  it('should send IPC response in electron mode on reject', async () => {
    (isElectron as jest.Mock).mockReturnValue(true);
    enableElectronMode();

    const mockRespondToolApproval = jest.fn().mockResolvedValue(undefined);
    (window as any).electronAPI.langgraph = {
      respondToolApproval: mockRespondToolApproval,
    };

    mockPendingToolApproval = {
      conversationId: 'conv-electron',
      messageId: 'msg-1',
      toolCalls: mockToolCalls,
      timestamp: Date.now(),
    };

    const { result } = renderHook(() => useToolApproval());

    await act(async () => {
      await result.current.handleToolReject();
    });

    expect(mockRespondToolApproval).toHaveBeenCalledWith('conv-electron', false);
  });

  it('should set always approve for session', async () => {
    (isElectron as jest.Mock).mockReturnValue(false);

    mockPendingToolApproval = {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCalls: mockToolCalls,
      timestamp: Date.now(),
    };

    const { result } = renderHook(() => useToolApproval());

    await act(async () => {
      await result.current.handleToolAlwaysApprove(mockToolCalls);
    });

    expect(mockSetAlwaysApproveToolsForSession).toHaveBeenCalledWith(true);
    expect(mockClearPendingToolApprovalForConversation).toHaveBeenCalledWith('conv-1');
  });

  it('should handle IPC error with "No pending approval"', async () => {
    (isElectron as jest.Mock).mockReturnValue(true);
    enableElectronMode();

    const mockRespondToolApproval = jest
      .fn()
      .mockRejectedValue(new Error('No pending approval found'));
    (window as any).electronAPI.langgraph = {
      respondToolApproval: mockRespondToolApproval,
    };

    mockPendingToolApproval = {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCalls: mockToolCalls,
      timestamp: Date.now(),
    };

    const { result } = renderHook(() => useToolApproval());

    await act(async () => {
      await result.current.handleToolApprove(mockToolCalls);
    });

    // Should clear the approval since "No pending approval" means it expired
    expect(mockClearPendingToolApprovalForConversation).toHaveBeenCalledWith('conv-1');
    expect(result.current.errorMessage).toContain('승인 요청이 만료되었습니다');
  });

  it('should handle generic IPC error', async () => {
    (isElectron as jest.Mock).mockReturnValue(true);
    enableElectronMode();

    const mockRespondToolApproval = jest.fn().mockRejectedValue(new Error('Network error'));
    (window as any).electronAPI.langgraph = {
      respondToolApproval: mockRespondToolApproval,
    };

    mockPendingToolApproval = {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCalls: mockToolCalls,
      timestamp: Date.now(),
    };

    const { result } = renderHook(() => useToolApproval());

    await act(async () => {
      await result.current.handleToolApprove(mockToolCalls);
    });

    expect(result.current.errorMessage).toBe('Network error');
  });

  it('should clear error message', () => {
    const { result } = renderHook(() => useToolApproval());

    act(() => {
      result.current.clearError();
    });

    expect(result.current.errorMessage).toBeNull();
  });

  it('should not approve while already submitting (handled by guard)', async () => {
    mockPendingToolApproval = {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCalls: mockToolCalls,
      timestamp: Date.now(),
    };

    const { result } = renderHook(() => useToolApproval());

    // isSubmitting should start false and return to false after completion
    expect(result.current.isSubmitting).toBe(false);

    await act(async () => {
      await result.current.handleToolApprove(mockToolCalls);
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  it('should handle non-Error thrown from IPC', async () => {
    (isElectron as jest.Mock).mockReturnValue(true);
    enableElectronMode();

    const mockRespondToolApproval = jest.fn().mockRejectedValue('string error');
    (window as any).electronAPI.langgraph = {
      respondToolApproval: mockRespondToolApproval,
    };

    mockPendingToolApproval = {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCalls: mockToolCalls,
      timestamp: Date.now(),
    };

    const { result } = renderHook(() => useToolApproval());

    await act(async () => {
      await result.current.handleToolApprove(mockToolCalls);
    });

    // Non-Error rejection should produce a generic error message
    expect(result.current.errorMessage).toContain('승인 응답을 전송하지 못했습니다');
  });
});
