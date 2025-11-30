/**
 * ToolApprovalDialog 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToolApprovalDialog } from '@/components/chat/ToolApprovalDialog';
import { useChatStore } from '@/lib/store/chat-store';
import { ToolCall } from '@/types';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(),
}));

// Mock CodeDiffViewer
jest.mock('@/components/chat/CodeDiffViewer', () => ({
  CodeDiffViewer: () => <div data-testid="code-diff">CodeDiff</div>,
}));

describe('ToolApprovalDialog', () => {
  const mockToolCalls: ToolCall[] = [
    {
      id: 'tool-1',
      name: 'web_search',
      arguments: { query: 'test query' },
    },
    {
      id: 'tool-2',
      name: 'file_read',
      arguments: { path: '/test/file.ts' },
    },
  ];

  const mockPendingToolApproval = {
    toolCalls: mockToolCalls,
    messageId: 'msg-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render nothing when no pending approval', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: null,
    });

    const { container } = render(<ToolApprovalDialog onApprove={jest.fn()} onReject={jest.fn()} />);

    expect(container.firstChild).toBeNull();
  });

  it('should render tool approval dialog when pending', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: mockPendingToolApproval,
    });

    render(<ToolApprovalDialog onApprove={jest.fn()} onReject={jest.fn()} />);

    expect(screen.getByText(/도구 실행 승인 필요/i)).toBeInTheDocument();
  });

  it('should display all tool calls', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: mockPendingToolApproval,
    });

    render(<ToolApprovalDialog onApprove={jest.fn()} onReject={jest.fn()} />);

    expect(screen.getByText('web_search')).toBeInTheDocument();
    expect(screen.getByText('file_read')).toBeInTheDocument();
  });

  it('should show tool arguments when expanded', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: mockPendingToolApproval,
    });

    render(<ToolApprovalDialog onApprove={jest.fn()} onReject={jest.fn()} />);

    // Click to expand first tool
    const firstTool = screen.getByText('web_search');
    fireEvent.click(firstTool);

    // Arguments should be visible after expansion
    // Note: Arguments are displayed as JSON, so we check for the value
    expect(screen.getByText(/test query/i)).toBeInTheDocument();
  });

  it('should call onApprove when approve button clicked', () => {
    const onApprove = jest.fn();
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: mockPendingToolApproval,
    });

    render(<ToolApprovalDialog onApprove={onApprove} onReject={jest.fn()} />);

    const approveButton = screen.getByRole('button', { name: /예/i });
    fireEvent.click(approveButton);

    expect(onApprove).toHaveBeenCalledWith(mockToolCalls);
  });

  it('should call onReject when reject button clicked', () => {
    const onReject = jest.fn();
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: mockPendingToolApproval,
    });

    render(<ToolApprovalDialog onApprove={jest.fn()} onReject={onReject} />);

    const rejectButton = screen.getByRole('button', { name: /아니오/i });
    fireEvent.click(rejectButton);

    expect(onReject).toHaveBeenCalled();
  });

  it('should show "Always Approve" button when callback provided', () => {
    const onAlwaysApprove = jest.fn();
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: mockPendingToolApproval,
    });

    render(
      <ToolApprovalDialog
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onAlwaysApprove={onAlwaysApprove}
      />
    );

    expect(screen.getByRole('button', { name: /항상 예/i })).toBeInTheDocument();
  });

  it('should call onAlwaysApprove when always approve button clicked', () => {
    const onAlwaysApprove = jest.fn();
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: mockPendingToolApproval,
    });

    render(
      <ToolApprovalDialog
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onAlwaysApprove={onAlwaysApprove}
      />
    );

    const alwaysApproveButton = screen.getByRole('button', { name: /항상 예/i });
    fireEvent.click(alwaysApproveButton);

    expect(onAlwaysApprove).toHaveBeenCalledWith(mockToolCalls);
  });

  it('should not show "Always Approve" button when callback not provided', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: mockPendingToolApproval,
    });

    render(<ToolApprovalDialog onApprove={jest.fn()} onReject={jest.fn()} />);

    expect(screen.queryByRole('button', { name: /항상 예/i })).not.toBeInTheDocument();
  });

  it('should expand/collapse tool details', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: mockPendingToolApproval,
    });

    render(<ToolApprovalDialog onApprove={jest.fn()} onReject={jest.fn()} />);

    // Initially collapsed - arguments should not be visible
    expect(screen.queryByText(/test query/i)).not.toBeInTheDocument();

    // Click to expand
    const firstTool = screen.getByText('web_search');
    fireEvent.click(firstTool);

    // Arguments should be visible after expansion
    expect(screen.getByText(/test query/i)).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(firstTool);

    // Arguments should be hidden again
    expect(screen.queryByText(/test query/i)).not.toBeInTheDocument();
  });

  it('should display warning icon for potentially dangerous tools', () => {
    const dangerousToolCalls: ToolCall[] = [
      {
        id: 'tool-1',
        name: 'file_write',
        arguments: { path: '/important/file.ts', content: 'new content' },
      },
    ];

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: {
        toolCalls: dangerousToolCalls,
        messageId: 'msg-1',
      },
    });

    const { container } = render(<ToolApprovalDialog onApprove={jest.fn()} onReject={jest.fn()} />);

    // Warning icon should be present
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should handle single tool call', () => {
    const singleToolCall: ToolCall[] = [
      {
        id: 'tool-1',
        name: 'calculator',
        arguments: { expression: '2 + 2' },
      },
    ];

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: {
        toolCalls: singleToolCall,
        messageId: 'msg-1',
      },
    });

    render(<ToolApprovalDialog onApprove={jest.fn()} onReject={jest.fn()} />);

    expect(screen.getByText('calculator')).toBeInTheDocument();
  });

  it('should display tool count', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: mockPendingToolApproval,
    });

    render(<ToolApprovalDialog onApprove={jest.fn()} onReject={jest.fn()} />);

    // Should indicate 2 tools
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it('should handle empty tool arguments', () => {
    const toolWithoutArgs: ToolCall[] = [
      {
        id: 'tool-1',
        name: 'get_time',
        arguments: {},
      },
    ];

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: {
        toolCalls: toolWithoutArgs,
        messageId: 'msg-1',
      },
    });

    render(<ToolApprovalDialog onApprove={jest.fn()} onReject={jest.fn()} />);

    expect(screen.getByText('get_time')).toBeInTheDocument();
  });
});
