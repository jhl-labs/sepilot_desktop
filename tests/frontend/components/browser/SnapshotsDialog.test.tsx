/**
 * SnapshotsDialog 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SnapshotsDialog } from '@/components/browser/SnapshotsDialog';
import { enableElectronMode, mockElectronAPI } from '../../../setup';

describe('SnapshotsDialog', () => {
  const mockSnapshots = [
    {
      id: '1',
      url: 'https://example.com',
      title: 'Example Page',
      thumbnail: 'data:image/png;base64,abc',
      createdAt: Date.now(),
      screenshotPath: '/path/to/screenshot.png',
    },
    {
      id: '2',
      url: 'https://test.com',
      title: 'Test Page',
      thumbnail: 'data:image/png;base64,def',
      createdAt: Date.now() - 3600000,
      screenshotPath: '/path/to/test.png',
    },
  ];

  const originalConfirm = window.confirm;
  const originalAlert = window.alert;

  beforeEach(() => {
    jest.clearAllMocks();
    enableElectronMode();
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
  });

  afterEach(() => {
    window.confirm = originalConfirm;
    window.alert = originalAlert;
  });

  it('should not render when closed', () => {
    render(<SnapshotsDialog open={false} onOpenChange={jest.fn()} />);

    expect(screen.queryByText('스냅샷 관리')).not.toBeInTheDocument();
  });

  it('should render when opened', () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<SnapshotsDialog open={true} onOpenChange={jest.fn()} />);

    expect(screen.getByText('스냅샷 관리')).toBeInTheDocument();
  });

  it('should load snapshots on open', async () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });

    render(<SnapshotsDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.getSnapshots).toHaveBeenCalled();
      expect(screen.getByText('Example Page')).toBeInTheDocument();
      expect(screen.getByText('Test Page')).toBeInTheDocument();
    });
  });

  it('should show loading state', () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<SnapshotsDialog open={true} onOpenChange={jest.fn()} />);

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  });

  it('should show empty state when no snapshots', async () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<SnapshotsDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('저장된 스냅샷이 없습니다')).toBeInTheDocument();
    });
  });

  it('should handle load error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockRejectedValue(
      new Error('Load failed')
    );

    render(<SnapshotsDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  it('should delete snapshot when confirmed', async () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });
    (mockElectronAPI.browserView.deleteSnapshot as jest.Mock).mockResolvedValue({
      success: true,
    });

    render(<SnapshotsDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Example Page')).toBeInTheDocument();
    });

    // Find all buttons and filter delete buttons (have Trash icon)
    const allButtons = screen.getAllByRole('button');
    // Delete buttons are the last ones (one per snapshot)
    const deleteButton = allButtons[allButtons.length - 2]; // First snapshot's delete button
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.deleteSnapshot).toHaveBeenCalledWith('1');
    });
  });

  it('should not delete when user cancels', async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });

    render(<SnapshotsDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Example Page')).toBeInTheDocument();
    });

    // Find delete button
    const allButtons = screen.getAllByRole('button');
    const deleteButton = allButtons[allButtons.length - 2]; // First snapshot's delete button
    fireEvent.click(deleteButton);

    expect(mockElectronAPI.browserView.deleteSnapshot).not.toHaveBeenCalled();
  });

  it('should not load data when not in Electron', async () => {
    (window as any).electronAPI = undefined;

    render(<SnapshotsDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.getSnapshots).not.toHaveBeenCalled();
    });
  });
});
