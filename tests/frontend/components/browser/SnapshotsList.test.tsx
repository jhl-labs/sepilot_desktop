/**
 * SnapshotsList 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SnapshotsList } from '@/extensions/browser/components/SnapshotsList';
import { enableElectronMode, mockElectronAPI } from '../../../setup';
import * as chatStoreModule from '@/lib/store/chat-store';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(() => ({
    setBrowserViewMode: jest.fn(),
  })),
}));

describe('SnapshotsList', () => {
  const mockSnapshots = [
    {
      id: '1',
      url: 'https://example.com',
      title: 'Example Page',
      thumbnail: '/tmp/thumbnail1.png',
      screenshotPath: '/tmp/screenshot1.png',
      createdAt: new Date('2024-01-01T10:00:00Z').getTime(),
    },
    {
      id: '2',
      url: 'https://test.com',
      title: 'Test Page',
      thumbnail: '/tmp/thumbnail2.png',
      screenshotPath: '/tmp/screenshot2.png',
      createdAt: new Date('2024-01-02T10:00:00Z').getTime(),
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

  it('should show loading state', () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<SnapshotsList />);

    // i18n key is displayed as-is in tests
    expect(screen.getByText('browser.snapshots.loading')).toBeInTheDocument();
  });

  it('should load snapshots on mount', async () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.getSnapshots).toHaveBeenCalled();
      expect(screen.getByText('Example Page')).toBeInTheDocument();
      expect(screen.getByText('Test Page')).toBeInTheDocument();
    });
  });

  it('should show empty state when no snapshots', async () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(screen.getByText('browser.snapshots.noSnapshots')).toBeInTheDocument();
    });
  });

  it('should handle load error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockRejectedValue(
      new Error('Load failed')
    );

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  it('should not load when not in Electron', () => {
    (window as any).electronAPI = undefined;

    render(<SnapshotsList />);

    expect(mockElectronAPI.browserView.getSnapshots).not.toHaveBeenCalled();
  });

  it('should show header with title', async () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(screen.getByText('browser.snapshots.title')).toBeInTheDocument();
    });
  });

  it('should call setBrowserViewMode when back button is clicked', async () => {
    const mockSetBrowserViewMode = jest.fn();
    (chatStoreModule.useChatStore as jest.Mock).mockReturnValue({
      setBrowserViewMode: mockSetBrowserViewMode,
    });

    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    const { container } = render(<SnapshotsList />);

    await waitFor(() => {
      expect(screen.getByText('browser.snapshots.title')).toBeInTheDocument();
    });

    // Back button is the first button in the header
    const backButton = container.querySelector('button');
    fireEvent.click(backButton as HTMLElement);

    expect(mockSetBrowserViewMode).toHaveBeenCalledWith('chat');
  });

  it('should show snapshot URLs and timestamps', async () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(screen.getByText('https://example.com')).toBeInTheDocument();
      expect(screen.getByText('https://test.com')).toBeInTheDocument();
    });
  });

  it('should delete snapshot when confirmed', async () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });
    (mockElectronAPI.browserView.deleteSnapshot as jest.Mock).mockResolvedValue({
      success: true,
    });

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(screen.getByText('Example Page')).toBeInTheDocument();
    });

    // Find all buttons and get the delete button for the first snapshot
    const allButtons = screen.getAllByRole('button');
    const deleteButton = allButtons[allButtons.length - 2]; // First snapshot's delete button
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.deleteSnapshot).toHaveBeenCalledWith('1');
      expect(screen.queryByText('Example Page')).not.toBeInTheDocument();
    });
  });

  it('should not delete snapshot when user cancels', async () => {
    window.confirm = jest.fn(() => false);

    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(screen.getByText('Example Page')).toBeInTheDocument();
    });

    const allButtons = screen.getAllByRole('button');
    const deleteButton = allButtons[allButtons.length - 2];
    fireEvent.click(deleteButton);

    // Should not call delete API
    expect(mockElectronAPI.browserView.deleteSnapshot).not.toHaveBeenCalled();
  });

  it('should handle delete error', async () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });
    (mockElectronAPI.browserView.deleteSnapshot as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Delete failed',
    });

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(screen.getByText('Example Page')).toBeInTheDocument();
    });

    const allButtons = screen.getAllByRole('button');
    const deleteButton = allButtons[allButtons.length - 2];
    fireEvent.click(deleteButton);

    await waitFor(() => {
      // i18n key is displayed as-is in tests
      expect(window.alert).toHaveBeenCalledWith('browser.snapshots.deleteFailed');
    });
  });

  it('should handle delete exception', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });
    (mockElectronAPI.browserView.deleteSnapshot as jest.Mock).mockRejectedValue(
      new Error('Network error')
    );

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(screen.getByText('Example Page')).toBeInTheDocument();
    });

    const allButtons = screen.getAllByRole('button');
    const deleteButton = allButtons[allButtons.length - 2];
    fireEvent.click(deleteButton);

    await waitFor(() => {
      // i18n key is displayed as-is in tests
      expect(window.alert).toHaveBeenCalledWith('browser.snapshots.deleteError');
      expect(consoleSpy).toHaveBeenCalledWith(
        '[SnapshotsList] Error deleting snapshot:',
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  it('should open snapshot when clicked', async () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });
    (mockElectronAPI.browserView.openSnapshot as jest.Mock).mockResolvedValue({
      success: true,
    });

    const mockSetBrowserViewMode = jest.fn();
    (chatStoreModule.useChatStore as jest.Mock).mockReturnValue({
      setBrowserViewMode: mockSetBrowserViewMode,
    });

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(screen.getByText('Example Page')).toBeInTheDocument();
    });

    // Click on the snapshot card
    const snapshotCard = screen.getByText('Example Page').closest('div');
    fireEvent.click(snapshotCard as HTMLElement);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.openSnapshot).toHaveBeenCalledWith('1');
      expect(mockSetBrowserViewMode).toHaveBeenCalledWith('chat');
    });
  });

  it('should handle open snapshot error', async () => {
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });
    (mockElectronAPI.browserView.openSnapshot as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Open failed',
    });

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(screen.getByText('Example Page')).toBeInTheDocument();
    });

    const snapshotCard = screen.getByText('Example Page').closest('div');
    fireEvent.click(snapshotCard as HTMLElement);

    await waitFor(() => {
      // i18n key is displayed as-is in tests
      expect(window.alert).toHaveBeenCalledWith('browser.snapshots.openFailed');
    });
  });

  it('should handle open snapshot exception', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });
    (mockElectronAPI.browserView.openSnapshot as jest.Mock).mockRejectedValue(
      new Error('Network error')
    );

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(screen.getByText('Example Page')).toBeInTheDocument();
    });

    const snapshotCard = screen.getByText('Example Page').closest('div');
    fireEvent.click(snapshotCard as HTMLElement);

    await waitFor(() => {
      // i18n key is displayed as-is in tests
      expect(window.alert).toHaveBeenCalledWith('browser.snapshots.openError');
      expect(consoleSpy).toHaveBeenCalledWith(
        '[SnapshotsList] Error opening snapshot:',
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  it('should handle load result without success flag', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Load error',
    });

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[SnapshotsList] Failed to load snapshots:',
        'Load error'
      );
    });

    consoleSpy.mockRestore();
  });

  it('should not delete when not in Electron', async () => {
    enableElectronMode();
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(screen.getByText('Example Page')).toBeInTheDocument();
    });

    // Disable Electron mode after loading
    (window as any).electronAPI = undefined;

    const allButtons = screen.getAllByRole('button');
    const deleteButton = allButtons[allButtons.length - 2];
    fireEvent.click(deleteButton);

    // Should not call delete API in non-Electron environment
    expect(mockElectronAPI.browserView.deleteSnapshot).not.toHaveBeenCalled();
  });

  it('should not open when not in Electron', async () => {
    enableElectronMode();
    (mockElectronAPI.browserView.getSnapshots as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSnapshots,
    });

    render(<SnapshotsList />);

    await waitFor(() => {
      expect(screen.getByText('Example Page')).toBeInTheDocument();
    });

    // Disable Electron mode after loading
    (window as any).electronAPI = undefined;

    const snapshotCard = screen.getByText('Example Page').closest('div');
    fireEvent.click(snapshotCard as HTMLElement);

    // Should not call open API in non-Electron environment
    expect(mockElectronAPI.browserView.openSnapshot).not.toHaveBeenCalled();
  });
});
