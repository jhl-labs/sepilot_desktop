/**
 * ToolApprovalDialog 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToolApprovalDialog } from '@/components/chat/ToolApprovalDialog';
import { useChatStore } from '@/lib/store/chat-store';
import { enableElectronMode, mockElectronAPI } from '../../../setup';
import { ToolCall } from '@/types';

// Mock chat store
jest.mock('@/lib/store/chat-store');

describe('ToolApprovalDialog', () => {
  const mockOnApprove = jest.fn();
  const mockOnReject = jest.fn();
  const mockOnAlwaysApprove = jest.fn();

  const mockToolCalls: ToolCall[] = [
    {
      id: 'tool-1',
      name: 'bash',
      arguments: {
        command: 'ls -la',
      },
    },
    {
      id: 'tool-2',
      name: 'file_edit',
      arguments: {
        path: '/test/file.txt',
        old_str: 'old text',
        new_str: 'new text',
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    enableElectronMode();

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCalls: mockToolCalls,
      },
    });

    // Mock file.read to return some content
    (mockElectronAPI.file.read as jest.Mock).mockResolvedValue('old text in file');
  });

  it('should not render when pendingToolApproval is null', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: null,
    });

    const { container } = render(
      <ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render dialog with tool count', () => {
    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    expect(screen.getByText('도구 실행 승인 필요')).toBeInTheDocument();
    expect(screen.getByText(/AI가 2개의 도구를 실행하려고 합니다/)).toBeInTheDocument();
  });

  it('should display all tool names', () => {
    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    expect(screen.getByText('bash')).toBeInTheDocument();
    expect(screen.getByText('file_edit')).toBeInTheDocument();
  });

  it('should expand tool when clicked', () => {
    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    const bashTool = screen.getByText('bash');
    fireEvent.click(bashTool);

    // Should show arguments
    expect(screen.getByText('인자 (Arguments):')).toBeInTheDocument();
    expect(screen.getByText(/"command": "ls -la"/)).toBeInTheDocument();
  });

  it('should collapse tool when clicked again', () => {
    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    const bashTool = screen.getByText('bash');

    // Expand
    fireEvent.click(bashTool);
    expect(screen.getByText('인자 (Arguments):')).toBeInTheDocument();

    // Collapse
    fireEvent.click(bashTool);
    expect(screen.queryByText('인자 (Arguments):')).not.toBeInTheDocument();
  });

  it('should call onReject when reject button clicked', () => {
    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    const rejectButton = screen.getByText('아니오');
    fireEvent.click(rejectButton);

    expect(mockOnReject).toHaveBeenCalled();
  });

  it('should call onApprove with toolCalls when approve button clicked', () => {
    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    const approveButton = screen.getByText('예');
    fireEvent.click(approveButton);

    expect(mockOnApprove).toHaveBeenCalledWith(mockToolCalls);
  });

  it('should show always approve button when onAlwaysApprove is provided', () => {
    render(
      <ToolApprovalDialog
        onApprove={mockOnApprove}
        onReject={mockOnReject}
        onAlwaysApprove={mockOnAlwaysApprove}
      />
    );

    expect(screen.getByText('항상 예 (이번 세션)')).toBeInTheDocument();
  });

  it('should not show always approve button when onAlwaysApprove is not provided', () => {
    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    expect(screen.queryByText('항상 예 (이번 세션)')).not.toBeInTheDocument();
  });

  it('should call onAlwaysApprove with toolCalls when always approve button clicked', () => {
    render(
      <ToolApprovalDialog
        onApprove={mockOnApprove}
        onReject={mockOnReject}
        onAlwaysApprove={mockOnAlwaysApprove}
      />
    );

    const alwaysApproveButton = screen.getByText('항상 예 (이번 세션)');
    fireEvent.click(alwaysApproveButton);

    expect(mockOnAlwaysApprove).toHaveBeenCalledWith(mockToolCalls);
  });

  it('should load file content for file_edit tool', async () => {
    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    await waitFor(() => {
      expect(mockElectronAPI.file.read).toHaveBeenCalledWith('/test/file.txt');
    });
  });

  it('should handle file read error gracefully (file does not exist)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    (mockElectronAPI.file.read as jest.Mock).mockRejectedValue(new Error('File not found'));

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCalls: [
          {
            id: 'tool-write',
            name: 'file_write',
            arguments: {
              path: '/new/file.txt',
              content: 'New file content',
            },
          },
        ],
      },
    });

    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    // Should not crash and should complete loading
    await waitFor(() => {
      expect(mockElectronAPI.file.read).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  it('should show diff viewer for file_edit tool', async () => {
    (mockElectronAPI.file.read as jest.Mock).mockResolvedValue('old text in file');

    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    await waitFor(() => {
      expect(mockElectronAPI.file.read).toHaveBeenCalled();
    });

    const fileEditTool = screen.getByText('file_edit');
    fireEvent.click(fileEditTool);

    // CodeDiffViewer should show file path
    await waitFor(() => {
      expect(screen.getByText('/test/file.txt')).toBeInTheDocument();
    });
  });

  it('should show diff viewer for file_write tool', async () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCalls: [
          {
            id: 'tool-write',
            name: 'file_write',
            arguments: {
              path: '/new/file.txt',
              content: 'New file content',
            },
          },
        ],
      },
    });

    (mockElectronAPI.file.read as jest.Mock).mockRejectedValue(new Error('File not found'));

    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    await waitFor(() => {
      expect(mockElectronAPI.file.read).toHaveBeenCalled();
    });

    const fileWriteTool = screen.getByText('file_write');
    fireEvent.click(fileWriteTool);

    await waitFor(() => {
      expect(screen.getByText('/new/file.txt')).toBeInTheDocument();
    });
  });

  it('should format JSON arguments correctly', () => {
    const jsonArgs = {
      command: 'ls -la',
      workingDir: '/home/user',
      env: { PATH: '/usr/bin' },
    };

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCalls: [
          {
            id: 'tool-1',
            name: 'bash',
            arguments: jsonArgs,
          },
        ],
      },
    });

    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    const bashTool = screen.getByText('bash');
    fireEvent.click(bashTool);

    expect(screen.getByText(/"command": "ls -la"/)).toBeInTheDocument();
    expect(screen.getByText(/"workingDir": "\/home\/user"/)).toBeInTheDocument();
  });

  it('should handle non-JSON serializable arguments', () => {
    const circularRef: any = {};
    circularRef.self = circularRef;

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCalls: [
          {
            id: 'tool-1',
            name: 'test',
            arguments: circularRef,
          },
        ],
      },
    });

    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    const testTool = screen.getByText('test');
    fireEvent.click(testTool);

    // Should show string representation instead of throwing
    expect(screen.getByText(/\[object Object\]/)).toBeInTheDocument();
  });

  it('should expand multiple tools independently', () => {
    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    const bashTool = screen.getByText('bash');
    const fileEditTool = screen.getByText('file_edit');

    // Expand both
    fireEvent.click(bashTool);
    fireEvent.click(fileEditTool);

    // Both should be expanded
    expect(screen.getAllByText('인자 (Arguments):').length).toBeGreaterThan(0);
  });

  it('should handle tool without path in file_edit', async () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCalls: [
          {
            id: 'tool-invalid',
            name: 'file_edit',
            arguments: {
              // Missing path
              old_str: 'old',
              new_str: 'new',
            },
          },
        ],
      },
    });

    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    await waitFor(() => {
      // Should not call file.read without path
      expect(mockElectronAPI.file.read).not.toHaveBeenCalled();
    });
  });

  it('should apply edit correctly for file_edit tool', async () => {
    (mockElectronAPI.file.read as jest.Mock).mockResolvedValue(
      'This is old text that should be replaced'
    );

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      pendingToolApproval: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCalls: [
          {
            id: 'tool-edit',
            name: 'file_edit',
            arguments: {
              path: '/test/file.txt',
              old_str: 'old text',
              new_str: 'new text',
            },
          },
        ],
      },
    });

    render(<ToolApprovalDialog onApprove={mockOnApprove} onReject={mockOnReject} />);

    await waitFor(() => {
      expect(mockElectronAPI.file.read).toHaveBeenCalled();
    });

    // The component should compute new content by replacing old_str with new_str
    // We can't directly test the internal state, but we can verify the diff viewer shows up
    const fileEditTool = screen.getByText('file_edit');
    fireEvent.click(fileEditTool);

    await waitFor(() => {
      expect(screen.getByText('/test/file.txt')).toBeInTheDocument();
    });
  });
});
