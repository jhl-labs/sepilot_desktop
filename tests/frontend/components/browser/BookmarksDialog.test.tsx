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

  it('should show empty state when no bookmarks', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('북마크가 없습니다')).toBeInTheDocument();
    });
  });

  it('should show folder list', async () => {
    const mockFolders = [
      { id: 'f1', name: 'Work', createdAt: Date.now() },
      { id: 'f2', name: 'Personal', createdAt: Date.now() },
    ];

    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: mockFolders,
    });

    render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument();
      expect(screen.getByText('Personal')).toBeInTheDocument();
      expect(screen.getByText('전체')).toBeInTheDocument();
    });
  });

  it('should show add folder button', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    const { container } = render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('폴더')).toBeInTheDocument();
    });

    // Find Plus button next to "폴더" heading
    const plusButtons = container.querySelectorAll('button');
    expect(plusButtons.length).toBeGreaterThan(0);
  });

  it('should show add current page button', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('현재 페이지 추가')).toBeInTheDocument();
    });
  });

  it('should add bookmark when add current page button is clicked', async () => {
    const mockBookmark = {
      id: '1',
      url: 'https://example.com',
      title: 'Example',
      createdAt: Date.now(),
    };

    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.addBookmark as jest.Mock).mockResolvedValue({
      success: true,
      data: mockBookmark,
    });

    window.alert = jest.fn();

    render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('현재 페이지 추가')).toBeInTheDocument();
    });

    const addButton = screen.getByText('현재 페이지 추가');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.addBookmark).toHaveBeenCalled();
      expect(window.alert).toHaveBeenCalledWith('현재 페이지가 북마크에 추가되었습니다.');
    });
  });

  it('should display bookmarks', async () => {
    const mockBookmarks = [
      { id: '1', url: 'https://example.com', title: 'Example', createdAt: Date.now() },
      { id: '2', url: 'https://test.com', title: 'Test', createdAt: Date.now() },
    ];

    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: mockBookmarks,
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Example')).toBeInTheDocument();
      expect(screen.getByText('Test')).toBeInTheDocument();
      expect(screen.getByText('https://example.com')).toBeInTheDocument();
      expect(screen.getByText('https://test.com')).toBeInTheDocument();
    });
  });

  it('should open bookmark when clicked', async () => {
    const mockBookmark = {
      id: '1',
      url: 'https://example.com',
      title: 'Example',
      createdAt: Date.now(),
    };

    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockBookmark],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.openBookmark as jest.Mock).mockResolvedValue({
      success: true,
    });

    const onOpenChange = jest.fn();

    render(<BookmarksDialog open={true} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(screen.getByText('Example')).toBeInTheDocument();
    });

    const bookmark = screen.getByText('Example').closest('div');
    fireEvent.click(bookmark as HTMLElement);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.openBookmark).toHaveBeenCalledWith('1');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('should delete bookmark when confirmed', async () => {
    const mockBookmarks = [
      { id: '1', url: 'https://example.com', title: 'Example', createdAt: Date.now() },
    ];

    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: mockBookmarks,
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.deleteBookmark as jest.Mock).mockResolvedValue({
      success: true,
    });

    window.confirm = jest.fn(() => true);

    const { container } = render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Example')).toBeInTheDocument();
    });

    // Find delete button (last button in the bookmark item)
    const allButtons = container.querySelectorAll('button');
    const deleteButton = allButtons[allButtons.length - 1];
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
      expect(mockElectronAPI.browserView.deleteBookmark).toHaveBeenCalledWith('1');
      expect(screen.queryByText('Example')).not.toBeInTheDocument();
    });
  });

  it('should not delete bookmark when user cancels', async () => {
    const mockBookmarks = [
      { id: '1', url: 'https://example.com', title: 'Example', createdAt: Date.now() },
    ];

    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: mockBookmarks,
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    window.confirm = jest.fn(() => false);

    const { container } = render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Example')).toBeInTheDocument();
    });

    const allButtons = container.querySelectorAll('button');
    const deleteButton = allButtons[allButtons.length - 1];
    fireEvent.click(deleteButton);

    expect(mockElectronAPI.browserView.deleteBookmark).not.toHaveBeenCalled();
  });

  it('should filter bookmarks by folder', async () => {
    const mockBookmarks = [
      { id: '1', url: 'https://example.com', title: 'Example', createdAt: Date.now() },
      { id: '2', url: 'https://test.com', title: 'Test', folderId: 'f1', createdAt: Date.now() },
    ];
    const mockFolders = [{ id: 'f1', name: 'Work', createdAt: Date.now() }];

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
      expect(screen.getByText('Example')).toBeInTheDocument();
      expect(screen.queryByText('Test')).not.toBeInTheDocument(); // Test is in folder
    });

    // Click on Work folder
    const workFolder = screen.getByText('Work');
    fireEvent.click(workFolder);

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
      expect(screen.queryByText('Example')).not.toBeInTheDocument(); // Example is not in folder
    });
  });

  it('should show all bookmarks when "전체" is clicked', async () => {
    const mockBookmarks = [
      { id: '1', url: 'https://example.com', title: 'Example', createdAt: Date.now() },
      { id: '2', url: 'https://test.com', title: 'Test', folderId: 'f1', createdAt: Date.now() },
    ];
    const mockFolders = [{ id: 'f1', name: 'Work', createdAt: Date.now() }];

    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: mockBookmarks,
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: mockFolders,
    });

    render(<BookmarksDialog open={true} onOpenChange={jest.fn()} />);

    // First, click Work folder
    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument();
    });

    const workFolder = screen.getByText('Work');
    fireEvent.click(workFolder);

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    // Then click "전체"
    const allFolder = screen.getByText('전체');
    fireEvent.click(allFolder);

    await waitFor(() => {
      expect(screen.getByText('Example')).toBeInTheDocument();
      expect(screen.queryByText('Test')).not.toBeInTheDocument(); // Test is in folder, not in "전체"
    });
  });
});
