/**
 * ActivityPanel 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActivityPanel } from '@/components/chat/ActivityPanel';
import { Activity } from '@/types';
import { enableElectronMode, mockElectronAPI } from '../../../setup';

describe('ActivityPanel', () => {
  const mockActivities: Activity[] = [
    {
      id: '1',
      conversation_id: 'conv-1',
      message_id: 'msg-1',
      tool_name: 'file_read',
      tool_args: { path: '/test/file.ts' },
      result: 'File content here',
      status: 'success',
      duration_ms: 150,
      created_at: new Date('2024-01-01T10:00:00Z').toISOString(),
    },
    {
      id: '2',
      conversation_id: 'conv-1',
      message_id: 'msg-2',
      tool_name: 'command_execute',
      tool_args: { command: 'npm test' },
      result: 'Test failed',
      status: 'error',
      duration_ms: 2500,
      created_at: new Date('2024-01-01T10:05:00Z').toISOString(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    enableElectronMode();
  });

  it('should show loading state', () => {
    (mockElectronAPI.activity.loadActivities as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<ActivityPanel conversationId="conv-1" />);

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  });

  it('should load activities on mount', async () => {
    (mockElectronAPI.activity.loadActivities as jest.Mock).mockResolvedValue({
      success: true,
      data: mockActivities,
    });

    render(<ActivityPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(mockElectronAPI.activity.loadActivities).toHaveBeenCalledWith('conv-1');
      expect(screen.getByText('파일 읽기')).toBeInTheDocument();
      expect(screen.getByText('명령 실행')).toBeInTheDocument();
    });
  });

  it('should show empty state when no activities', async () => {
    (mockElectronAPI.activity.loadActivities as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<ActivityPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText('아직 실행된 도구가 없습니다')).toBeInTheDocument();
      expect(screen.getByText('Coding 모드에서 도구가 실행되면 여기에 표시됩니다')).toBeInTheDocument();
    });
  });

  it('should display activity count', async () => {
    (mockElectronAPI.activity.loadActivities as jest.Mock).mockResolvedValue({
      success: true,
      data: mockActivities,
    });

    render(<ActivityPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText('(2개)')).toBeInTheDocument();
    });
  });

  it('should show success status icon for successful activities', async () => {
    (mockElectronAPI.activity.loadActivities as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockActivities[0]], // file_read with success
    });

    const { container } = render(<ActivityPanel conversationId="conv-1" />);

    await waitFor(() => {
      const successElements = container.querySelectorAll('.border-green-500\\/20');
      expect(successElements.length).toBeGreaterThan(0);
    });
  });

  it('should show error status icon for failed activities', async () => {
    (mockElectronAPI.activity.loadActivities as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockActivities[1]], // command_execute with error
    });

    const { container } = render(<ActivityPanel conversationId="conv-1" />);

    await waitFor(() => {
      const errorElements = container.querySelectorAll('.border-red-500\\/20');
      expect(errorElements.length).toBeGreaterThan(0);
    });
  });

  it('should format duration correctly for ms', async () => {
    (mockElectronAPI.activity.loadActivities as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockActivities[0]], // 150ms
    });

    render(<ActivityPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText('150ms')).toBeInTheDocument();
    });
  });

  it('should format duration correctly for seconds', async () => {
    (mockElectronAPI.activity.loadActivities as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockActivities[1]], // 2500ms = 2.50s
    });

    render(<ActivityPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText('2.50s')).toBeInTheDocument();
    });
  });

  it('should show tool arguments preview', async () => {
    (mockElectronAPI.activity.loadActivities as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockActivities[0]],
    });

    render(<ActivityPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText('path:')).toBeInTheDocument();
      expect(screen.getByText('/test/file.ts')).toBeInTheDocument();
    });
  });

  it('should expand activity when clicked', async () => {
    (mockElectronAPI.activity.loadActivities as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockActivities[0]],
    });

    render(<ActivityPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText('파일 읽기')).toBeInTheDocument();
    });

    // Click to expand
    const activity = screen.getByText('파일 읽기').closest('div');
    fireEvent.click(activity as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('인자:')).toBeInTheDocument();
      expect(screen.getByText('결과:')).toBeInTheDocument();
      expect(screen.getByText('File content here')).toBeInTheDocument();
    });
  });

  it('should collapse activity when clicked again', async () => {
    (mockElectronAPI.activity.loadActivities as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockActivities[0]],
    });

    render(<ActivityPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText('파일 읽기')).toBeInTheDocument();
    });

    const activity = screen.getByText('파일 읽기').closest('div');

    // Expand
    fireEvent.click(activity as HTMLElement);
    await waitFor(() => {
      expect(screen.getByText('인자:')).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(activity as HTMLElement);
    await waitFor(() => {
      expect(screen.queryByText('인자:')).not.toBeInTheDocument();
    });
  });

  it('should handle load error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    (mockElectronAPI.activity.loadActivities as jest.Mock).mockRejectedValue(
      new Error('Load failed')
    );

    render(<ActivityPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  it('should not load when not in Electron', () => {
    (window as any).electronAPI = undefined;

    render(<ActivityPanel conversationId="conv-1" />);

    expect(mockElectronAPI.activity.loadActivities).not.toHaveBeenCalled();
  });

  it('should not load when conversationId is empty', () => {
    render(<ActivityPanel conversationId="" />);

    expect(mockElectronAPI.activity.loadActivities).not.toHaveBeenCalled();
  });

  it('should apply custom className', () => {
    (mockElectronAPI.activity.loadActivities as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    const { container } = render(<ActivityPanel conversationId="conv-1" className="custom-class" />);

    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });

  it('should show tool label for unknown tools', async () => {
    const unknownActivity: Activity = {
      id: '3',
      conversation_id: 'conv-1',
      message_id: 'msg-3',
      tool_name: 'unknown_tool',
      tool_args: {},
      result: 'result',
      status: 'success',
      created_at: new Date().toISOString(),
    };

    (mockElectronAPI.activity.loadActivities as jest.Mock).mockResolvedValue({
      success: true,
      data: [unknownActivity],
    });

    render(<ActivityPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText('unknown_tool')).toBeInTheDocument();
    });
  });

  it('should show timestamp when expanded', async () => {
    (mockElectronAPI.activity.loadActivities as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockActivities[0]],
    });

    render(<ActivityPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText('파일 읽기')).toBeInTheDocument();
    });

    // Expand
    const activity = screen.getByText('파일 읽기').closest('div');
    fireEvent.click(activity as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText(/실행 시각:/)).toBeInTheDocument();
    });
  });
});
