/**
 * BookmarksDialog 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BookmarksDialog } from '@/components/browser/BookmarksDialog';
import { enableElectronMode, mockElectronAPI } from '../../../setup';

describe('BookmarksDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enableElectronMode();
  });

  it('should not render when closed', () => {
    render(<BookmarksDialog open={false} onOpenChange={jest.fn()} />);

    expect(screen.queryByText('북마크 관리')).not.toBeInTheDocument();
  });

  it('should render when opened', () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    expect(screen.getByText('북마크 관리')).toBeInTheDocument();
  });

  it('should load bookmarks and folders on open', async () => {
    const mockBookmarks = [
      { id: '1', url: 'https://example.com', title: 'Example', createdAt: Date.now() },
    ];
    const mockFolders = [
      { id: 'f1', name: 'My Folder', createdAt: Date.now() },
    ];

    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: mockBookmarks,
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: mockFolders,
    });

    render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.getBookmarks).toHaveBeenCalled();
      expect(mockElectronAPI.browserView.getBookmarkFolders).toHaveBeenCalled();
    });
  });

  it('should show loading state', () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockImplementation(
      () => new Promise(() => {})
    );

    render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  });

  it('should handle load error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockRejectedValue(
      new Error('Load failed')
    );
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  it('should not load data when not in Electron', async () => {
    (window as any).electronAPI = undefined;

    render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.getBookmarks).not.toHaveBeenCalled();
    });
  });
});
