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

  describe('에러 처리', () => {
    beforeEach(() => {
      window.alert = jest.fn();
    });

    it('should handle loadSnapshots error (success: false)', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Load failed',
      });

      render(<SnapshotsDialog open={true} onOpenChange={jest.fn()} />);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[SnapshotsDialog] Failed to load snapshots:',
          'Load failed'
        );
      });

      consoleSpy.mockRestore();
    });

    it('should handle deleteSnapshot error (success: false)', async () => {
      const mockSnapshots = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example',
          createdAt: Date.now(),
          imagePath: '/path/to/image.png',
        },
      ];

      (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
        success: true,
        data: mockSnapshots,
      });
      (mockElectronAPI.browserView.deleteSnapshot as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Delete failed',
      });

      window.confirm = jest.fn(() => true);

      const { container } = render(<SnapshotsDialog open={true} onOpenChange={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Example')).toBeInTheDocument();
      });

      // Find delete button
      const allButtons = container.querySelectorAll('button');
      const deleteButton = allButtons[allButtons.length - 1];
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('스냅샷 삭제 실패: Delete failed');
      });
    });

    it('should handle deleteSnapshot exception', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockSnapshots = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example',
          createdAt: Date.now(),
          imagePath: '/path/to/image.png',
        },
      ];

      (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
        success: true,
        data: mockSnapshots,
      });
      (mockElectronAPI.browserView.deleteSnapshot as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      window.confirm = jest.fn(() => true);

      const { container } = render(<SnapshotsDialog open={true} onOpenChange={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Example')).toBeInTheDocument();
      });

      const allButtons = container.querySelectorAll('button');
      const deleteButton = allButtons[allButtons.length - 1];
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('스냅샷 삭제 중 오류가 발생했습니다.');
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });

    it('should open snapshot when clicked', async () => {
      const mockSnapshot = {
        id: '1',
        url: 'https://example.com',
        title: 'Example',
        createdAt: Date.now(),
        imagePath: '/path/to/image.png',
      };

      (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
        success: true,
        data: [mockSnapshot],
      });
      (mockElectronAPI.browserView.openSnapshot as jest.Mock).mockResolvedValue({
        success: true,
      });

      const onOpenChange = jest.fn();

      render(<SnapshotsDialog open={true} onOpenChange={onOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('Example')).toBeInTheDocument();
      });

      const snapshot = screen.getByText('Example').closest('div[class*="cursor-pointer"]');
      fireEvent.click(snapshot as HTMLElement);

      await waitFor(() => {
        expect(mockElectronAPI.browserView.openSnapshot).toHaveBeenCalledWith('1');
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('should handle openSnapshot error (success: false)', async () => {
      const mockSnapshot = {
        id: '1',
        url: 'https://example.com',
        title: 'Example',
        createdAt: Date.now(),
        imagePath: '/path/to/image.png',
      };

      (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
        success: true,
        data: [mockSnapshot],
      });
      (mockElectronAPI.browserView.openSnapshot as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Open failed',
      });

      render(<SnapshotsDialog open={true} onOpenChange={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Example')).toBeInTheDocument();
      });

      const snapshot = screen.getByText('Example').closest('div[class*="cursor-pointer"]');
      fireEvent.click(snapshot as HTMLElement);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('스냅샷 열기 실패: Open failed');
      });
    });

    it('should handle openSnapshot exception', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockSnapshot = {
        id: '1',
        url: 'https://example.com',
        title: 'Example',
        createdAt: Date.now(),
        imagePath: '/path/to/image.png',
      };

      (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
        success: true,
        data: [mockSnapshot],
      });
      (mockElectronAPI.browserView.openSnapshot as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      render(<SnapshotsDialog open={true} onOpenChange={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Example')).toBeInTheDocument();
      });

      const snapshot = screen.getByText('Example').closest('div[class*="cursor-pointer"]');
      fireEvent.click(snapshot as HTMLElement);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('스냅샷 열기 중 오류가 발생했습니다.');
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });
});
