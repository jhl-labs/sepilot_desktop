/**
 * BookmarksList 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BookmarksList } from '@/extensions/browser/components/BookmarksList';
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

  it('should add bookmark when add button clicked', async () => {
    const mockBookmark = {
      id: '3',
      url: 'https://new.com',
      title: 'New Site',
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

    const { container } = render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('북마크 관리')).toBeInTheDocument();
    });

    // Find add bookmark button (Plus icon in the header)
    const buttons = container.querySelectorAll('button');
    const addButton = buttons[buttons.length - 1]; // Last button is add bookmark
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.addBookmark).toHaveBeenCalled();
      expect(window.alert).toHaveBeenCalledWith('현재 페이지가 북마크에 추가되었습니다.');
    });
  });

  it('should handle add bookmark error', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.addBookmark as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Add failed',
    });

    const { container } = render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('북마크 관리')).toBeInTheDocument();
    });

    const buttons = container.querySelectorAll('button');
    const addButton = buttons[buttons.length - 1];
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('북마크 추가 실패: Add failed');
    });
  });

  it('should delete bookmark when confirmed', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockBookmarks[0]], // Only first bookmark
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.deleteBookmark as jest.Mock).mockResolvedValue({
      success: true,
    });

    const { container } = render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('Example Site')).toBeInTheDocument();
    });

    // Find delete button (Trash icon)
    const allButtons = container.querySelectorAll('button');
    const deleteButton = allButtons[allButtons.length - 1];
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
      expect(mockElectronAPI.browserView.deleteBookmark).toHaveBeenCalledWith('1');
      expect(screen.queryByText('Example Site')).not.toBeInTheDocument();
    });
  });

  it('should not delete bookmark when user cancels', async () => {
    window.confirm = jest.fn(() => false);

    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockBookmarks[0]],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    const { container } = render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('Example Site')).toBeInTheDocument();
    });

    const allButtons = container.querySelectorAll('button');
    const deleteButton = allButtons[allButtons.length - 1];
    fireEvent.click(deleteButton);

    expect(mockElectronAPI.browserView.deleteBookmark).not.toHaveBeenCalled();
  });

  it('should handle delete bookmark error', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockBookmarks[0]],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.deleteBookmark as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Delete failed',
    });

    const { container } = render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('Example Site')).toBeInTheDocument();
    });

    const allButtons = container.querySelectorAll('button');
    const deleteButton = allButtons[allButtons.length - 1];
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('북마크 삭제 실패: Delete failed');
    });
  });

  it('should open bookmark when clicked', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockBookmarks[0]],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.openBookmark as jest.Mock).mockResolvedValue({
      success: true,
    });

    const mockSetBrowserViewMode = jest.fn();
    (chatStoreModule.useChatStore as jest.Mock).mockReturnValue({
      setBrowserViewMode: mockSetBrowserViewMode,
    });

    render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('Example Site')).toBeInTheDocument();
    });

    const bookmark = screen.getByText('Example Site').closest('div');
    fireEvent.click(bookmark as HTMLElement);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.openBookmark).toHaveBeenCalledWith('1');
      expect(mockSetBrowserViewMode).toHaveBeenCalledWith('chat');
    });
  });

  it('should handle open bookmark error', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockBookmarks[0]],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.openBookmark as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Open failed',
    });

    render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('Example Site')).toBeInTheDocument();
    });

    const bookmark = screen.getByText('Example Site').closest('div');
    fireEvent.click(bookmark as HTMLElement);

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('북마크 열기 실패: Open failed');
    });
  });

  it('should show add folder input when folder add button clicked', async () => {
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

    // Click folder add button (second to last button)
    const buttons = container.querySelectorAll('button');
    const folderAddButton = buttons[buttons.length - 2];
    fireEvent.click(folderAddButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('폴더 이름')).toBeInTheDocument();
    });
  });

  it('should add folder when Enter pressed in input', async () => {
    const mockFolder = { id: 'f3', name: 'New Folder', createdAt: Date.now() };

    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.addBookmarkFolder as jest.Mock).mockResolvedValue({
      success: true,
      data: mockFolder,
    });

    const { container } = render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('북마크 관리')).toBeInTheDocument();
    });

    const buttons = container.querySelectorAll('button');
    const folderAddButton = buttons[buttons.length - 2];
    fireEvent.click(folderAddButton);

    const input = await screen.findByPlaceholderText('폴더 이름');
    fireEvent.change(input, { target: { value: 'New Folder' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockElectronAPI.browserView.addBookmarkFolder).toHaveBeenCalledWith('New Folder');
    });
  });

  it('should close folder input on Escape key', async () => {
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

    const buttons = container.querySelectorAll('button');
    const folderAddButton = buttons[buttons.length - 2];
    fireEvent.click(folderAddButton);

    const input = await screen.findByPlaceholderText('폴더 이름');
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('폴더 이름')).not.toBeInTheDocument();
    });
  });

  it('should handle add folder error', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.addBookmarkFolder as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Folder add failed',
    });

    const { container } = render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('북마크 관리')).toBeInTheDocument();
    });

    const buttons = container.querySelectorAll('button');
    const folderAddButton = buttons[buttons.length - 2];
    fireEvent.click(folderAddButton);

    const input = await screen.findByPlaceholderText('폴더 이름');
    fireEvent.change(input, { target: { value: 'New Folder' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('폴더 추가 실패: Folder add failed');
    });
  });

  it('should filter bookmarks by selected folder', async () => {
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
      expect(screen.getByText('전체')).toBeInTheDocument();
    });

    // Click dropdown
    const dropdown = screen.getByText('전체').closest('button');
    fireEvent.click(dropdown as HTMLElement);

    // Click Work folder
    const workFolder = await screen.findByText('Work');
    fireEvent.click(workFolder);

    await waitFor(() => {
      // Now should show Test Site which is in Work folder
      expect(screen.getByText('Test Site')).toBeInTheDocument();
      expect(screen.queryByText('Example Site')).not.toBeInTheDocument();
    });
  });

  it('should delete folder when confirmed', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: mockBookmarks,
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: mockFolders,
    });
    (mockElectronAPI.browserView.deleteBookmarkFolder as jest.Mock).mockResolvedValue({
      success: true,
    });

    const { container } = render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('전체')).toBeInTheDocument();
    });

    // Click dropdown
    const dropdown = screen.getByText('전체').closest('button');
    fireEvent.click(dropdown as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument();
    });

    // Find delete button in dropdown (Trash icon)
    const deleteButtons = container.querySelectorAll('button');
    // Find the trash button after Work folder item
    let deleteButton = null;
    for (let i = 0; i < deleteButtons.length; i++) {
      const btn = deleteButtons[i];
      if (btn.querySelector('svg') && btn.className.includes('h-4 w-4')) {
        deleteButton = btn;
        break;
      }
    }

    if (deleteButton) {
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalled();
        expect(mockElectronAPI.browserView.deleteBookmarkFolder).toHaveBeenCalledWith('f1');
      });
    }
  });

  it('should handle delete folder error', async () => {
    (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });
    (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
      success: true,
      data: mockFolders,
    });
    (mockElectronAPI.browserView.deleteBookmarkFolder as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Delete folder failed',
    });

    const { container } = render(<BookmarksList />);

    await waitFor(() => {
      expect(screen.getByText('전체')).toBeInTheDocument();
    });

    const dropdown = screen.getByText('전체').closest('button');
    fireEvent.click(dropdown as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument();
    });

    const deleteButtons = container.querySelectorAll('button');
    let deleteButton = null;
    for (let i = 0; i < deleteButtons.length; i++) {
      const btn = deleteButtons[i];
      if (btn.querySelector('svg') && btn.className.includes('h-4 w-4')) {
        deleteButton = btn;
        break;
      }
    }

    if (deleteButton) {
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('폴더 삭제 실패: Delete folder failed');
      });
    }
  });

  describe('Exception Handling (catch blocks)', () => {
    it.skip('should handle exception when adding folder', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });
      (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });
      (mockElectronAPI.browserView.addBookmarkFolder as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const { container } = render(<BookmarksList />);

      await waitFor(() => {
        expect(screen.getByText('북마크 관리')).toBeInTheDocument();
      });

      // Click folder plus button
      const buttons = container.querySelectorAll('button');
      const folderButton = Array.from(buttons).find(
        (btn) => btn.querySelector('svg') && btn.className.includes('shrink-0')
      );

      if (folderButton) {
        fireEvent.click(folderButton);

        // Now click the "새 폴더" button after input appears
        await waitFor(() => {
          const newFolderButton = screen.queryByText('+ 새 폴더');
          if (newFolderButton) {
            fireEvent.click(newFolderButton);
          }
        });

        await waitFor(() => {
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[BookmarksList] Error adding folder:',
            expect.any(Error)
          );
          expect(window.alert).toHaveBeenCalledWith('폴더 추가 중 오류가 발생했습니다.');
        });
      }

      consoleErrorSpy.mockRestore();
    });

    it('should handle exception when deleting folder', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });
      (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
        success: true,
        data: [{ id: 'folder-1', name: 'Test Folder', createdAt: Date.now() }],
      });
      (mockElectronAPI.browserView.deleteBookmarkFolder as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const { container } = render(<BookmarksList />);

      await waitFor(() => {
        expect(screen.getByText('전체')).toBeInTheDocument();
      });

      const dropdown = screen.getByText('전체').closest('button');
      fireEvent.click(dropdown as HTMLElement);

      await waitFor(() => {
        expect(screen.getByText('Test Folder')).toBeInTheDocument();
      });

      const deleteButtons = container.querySelectorAll('button');
      let deleteButton = null;
      for (let i = 0; i < deleteButtons.length; i++) {
        const btn = deleteButtons[i];
        if (btn.querySelector('svg') && btn.className.includes('h-4 w-4')) {
          deleteButton = btn;
          break;
        }
      }

      if (deleteButton) {
        fireEvent.click(deleteButton);

        await waitFor(() => {
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[BookmarksList] Error deleting folder:',
            expect.any(Error)
          );
          expect(window.alert).toHaveBeenCalledWith('폴더 삭제 중 오류가 발생했습니다.');
        });
      }

      consoleErrorSpy.mockRestore();
    });

    it.skip('should handle exception when deleting bookmark', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
        success: true,
        data: [
          {
            id: 'bookmark-1',
            url: 'https://example.com',
            title: 'Example',
            createdAt: Date.now(),
          },
        ],
      });
      (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });
      (mockElectronAPI.browserView.deleteBookmark as jest.Mock).mockRejectedValue(
        new Error('Permission denied')
      );

      render(<BookmarksList />);

      await waitFor(() => {
        expect(screen.getByText('Example')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTitle('삭제');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[BookmarksList] Error deleting bookmark:',
          expect.any(Error)
        );
        expect(window.alert).toHaveBeenCalledWith('북마크 삭제 중 오류가 발생했습니다.');
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle exception when opening bookmark', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
        success: true,
        data: [
          {
            id: 'bookmark-1',
            url: 'https://example.com',
            title: 'Example',
            createdAt: Date.now(),
          },
        ],
      });
      (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });
      (mockElectronAPI.browserView.openBookmark as jest.Mock).mockRejectedValue(
        new Error('Browser not available')
      );

      render(<BookmarksList />);

      await waitFor(() => {
        expect(screen.getByText('Example')).toBeInTheDocument();
      });

      const bookmarkItem = screen.getByText('Example');
      fireEvent.click(bookmarkItem);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[BookmarksList] Error opening bookmark:',
          expect.any(Error)
        );
        expect(window.alert).toHaveBeenCalledWith('북마크 열기 중 오류가 발생했습니다.');
      });

      consoleErrorSpy.mockRestore();
    });

    it.skip('should handle exception when adding current page bookmark', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockElectronAPI.browserView.getBookmarks as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });
      (mockElectronAPI.browserView.getBookmarkFolders as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });
      (mockElectronAPI.browserView.addBookmark as jest.Mock).mockRejectedValue(
        new Error('URL capture failed')
      );

      render(<BookmarksList />);

      await waitFor(() => {
        expect(screen.getByText('+ 현재 페이지 추가')).toBeInTheDocument();
      });

      const addButton = screen.getByText('+ 현재 페이지 추가');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[BookmarksList] Error adding bookmark:',
          expect.any(Error)
        );
        expect(window.alert).toHaveBeenCalledWith('북마크 추가 중 오류가 발생했습니다.');
      });

      consoleErrorSpy.mockRestore();
    });
  });
});
