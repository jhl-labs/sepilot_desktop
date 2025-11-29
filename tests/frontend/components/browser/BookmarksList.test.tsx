/**
 * BookmarksList 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BookmarksList } from '@/components/browser/BookmarksList';
import { enableElectronMode, mockElectronAPI } from '../../../setup';
import * as chatStoreModule from '@/lib/store/chat-store';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(() => ({
    setBrowserViewMode: jest.fn(),
  })),
}));

describe('BookmarksList', () => {
  const mockBookmarks = [
    {
      id: '1',
      url: 'https://example.com',
      title: 'Example Site',
      createdAt: Date.now(),
    },
    {
      id: '2',
      url: 'https://test.com',
      title: 'Test Site',
      folderId: 'f1',
      createdAt: Date.now() - 3600000,
    },
  ];

  const mockFolders = [
    { id: 'f1', name: 'Work', createdAt: Date.now() },
    { id: 'f2', name: 'Personal', createdAt: Date.now() - 1000 },
  ];

  const originalAlert = window.alert;
  const originalConfirm = window.confirm;

  beforeEach(() => {
    jest.clearAllMocks();
    enableElectronMode();
    window.alert = jest.fn();
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    window.alert = originalAlert;
    window.confirm = originalConfirm;
  });

  it('should show loading state', () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockImplementation(
      () => new Promise(() => {})
    );

    render(<BookmarksList />);

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  });

  it('should load bookmarks and folders on mount', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: mockBookmarks,
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: mockFolders,
    });

    render(<BookmarksList />);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.getBookmarks).toHaveBeenCalled();
      expect(mockElectronAPI.browserView.getBookmarkFolders).toHaveBeenCalled();
      // Only shows bookmarks without folderId by default
      expect(screen.getByText('Example Site')).toBeInTheDocument();
    });
  });

  it('should show empty state when no bookmarks', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('북마크가 없습니다')).toBeInTheDocument();
    });
  });

  it('should display folder list in dropdown', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: mockBookmarks,
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: mockFolders,
    });

    render(<BookmarksList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('전체')).toBeInTheDocument();
    });

    // Click dropdown to open folder list
    const dropdown = screen.getByText('전체').closest('button');
    fireEvent.click(dropdown as HTMLElement);

    // Check if folders are displayed
    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument();
      expect(screen.getByText('Personal')).toBeInTheDocument();
    });
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

    render(<BookmarksList />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  it('should not load when not in Electron', () => {
    (window as any).electronAPI = undefined;

    render(<BookmarksList />);

    expect(mockElectronAPI.browserView.getBookmarks).not.toHaveBeenCalled();
  });

  it('should show header with title', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('북마크 관리')).toBeInTheDocument();
    });
  });

  it('should call setBrowserViewMode when back button is clicked', async () => {
    const mockSetBrowserViewMode = jest.fn();
    (chatStoreModule.useChatStore as jest.Mock).mockReturnValue({
      setBrowserViewMode: mockSetBrowserViewMode,
    });

    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    const { container } = render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('북마크 관리')).toBeInTheDocument();
    });

    // Back button is the first button in the header
    const backButton = container.querySelector('button');
    fireEvent.click(backButton as HTMLElement);

    expect(mockSetBrowserViewMode).toHaveBeenCalledWith('chat');
  });

  it('should show bookmark URLs', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: mockBookmarks,
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<BookmarksList />);

    await waitFor(() => {
      // Only shows bookmarks without folderId
      expect(screen.getByText('https://example.com')).toBeInTheDocument();
      expect(screen.queryByText('https://test.com')).not.toBeInTheDocument();
    });
  });
});
