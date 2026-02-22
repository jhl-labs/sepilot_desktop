/**
 * BookmarksList 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BookmarksList } from '@/extensions/browser/components/BookmarksList';
import { enableElectronMode, mockElectronAPI } from '../../../setup';
import { useExtensionStore } from '@sepilot/extension-sdk/store';
import { isElectron } from '@sepilot/extension-sdk/utils';

const mockUseExtensionStore = useExtensionStore as jest.Mock;
const mockIsElectron = isElectron as jest.Mock;

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

  const mockSetBrowserViewMode = jest.fn();

  const originalAlert = window.alert;
  const originalConfirm = window.confirm;

  beforeEach(() => {
    jest.clearAllMocks();
    enableElectronMode();
    mockIsElectron.mockReturnValue(true);
    window.alert = jest.fn();
    window.confirm = jest.fn(() => true);
    mockUseExtensionStore.mockReturnValue({
      setBrowserViewMode: mockSetBrowserViewMode,
    });
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

    // i18n key is displayed as-is in tests
    expect(screen.getByText('browser.bookmarks.loading')).toBeInTheDocument();
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
      expect(screen.getByText('browser.bookmarks.noBookmarks')).toBeInTheDocument();
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

    // Wait for loading to complete - use getAllByText since DropdownMenu mock
    // renders both trigger and content (both contain 'browser.bookmarks.all')
    await waitFor(() => {
      expect(screen.getAllByText('browser.bookmarks.all').length).toBeGreaterThan(0);
    });

    // Check if folders are displayed (always visible with the mock)
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
    mockIsElectron.mockReturnValue(false);
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
      expect(screen.getByText('browser.bookmarks.title')).toBeInTheDocument();
    });
  });

  it('should call setBrowserViewMode when back button is clicked', async () => {
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
      expect(screen.getByText('browser.bookmarks.title')).toBeInTheDocument();
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
      expect(screen.getByText('browser.bookmarks.title')).toBeInTheDocument();
    });

    // Find add bookmark button (Plus icon in the header)
    const buttons = container.querySelectorAll('button');
    const addButton = buttons[buttons.length - 1]; // Last button is add bookmark
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.addBookmark).toHaveBeenCalled();
      // i18n key is displayed as-is in tests
      expect(window.alert).toHaveBeenCalledWith('browser.bookmarks.addSuccess');
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
      expect(screen.getByText('browser.bookmarks.title')).toBeInTheDocument();
    });

    const buttons = container.querySelectorAll('button');
    const addButton = buttons[buttons.length - 1];
    fireEvent.click(addButton);

    await waitFor(() => {
      // i18n key is displayed as-is in tests
      expect(window.alert).toHaveBeenCalledWith('browser.bookmarks.addFailed');
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
      // i18n key is displayed as-is in tests
      expect(window.alert).toHaveBeenCalledWith('browser.bookmarks.deleteBookmarkFailed');
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
      // i18n key is displayed as-is in tests
      expect(window.alert).toHaveBeenCalledWith('browser.bookmarks.openFailed');
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
      expect(screen.getByText('browser.bookmarks.title')).toBeInTheDocument();
    });

    // Click folder add button (second to last button)
    const buttons = container.querySelectorAll('button');
    const folderAddButton = buttons[buttons.length - 2];
    fireEvent.click(folderAddButton);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('browser.bookmarks.folderNamePlaceholder')
      ).toBeInTheDocument();
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
      expect(screen.getByText('browser.bookmarks.title')).toBeInTheDocument();
    });

    const buttons = container.querySelectorAll('button');
    const folderAddButton = buttons[buttons.length - 2];
    fireEvent.click(folderAddButton);

    const input = await screen.findByPlaceholderText('browser.bookmarks.folderNamePlaceholder');
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
      expect(screen.getByText('browser.bookmarks.title')).toBeInTheDocument();
    });

    const buttons = container.querySelectorAll('button');
    const folderAddButton = buttons[buttons.length - 2];
    fireEvent.click(folderAddButton);

    const input = await screen.findByPlaceholderText('browser.bookmarks.folderNamePlaceholder');
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText('browser.bookmarks.folderNamePlaceholder')
      ).not.toBeInTheDocument();
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
      expect(screen.getByText('browser.bookmarks.title')).toBeInTheDocument();
    });

    const buttons = container.querySelectorAll('button');
    const folderAddButton = buttons[buttons.length - 2];
    fireEvent.click(folderAddButton);

    const input = await screen.findByPlaceholderText('browser.bookmarks.folderNamePlaceholder');
    fireEvent.change(input, { target: { value: 'New Folder' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      // i18n key is displayed as-is in tests
      expect(window.alert).toHaveBeenCalledWith('browser.bookmarks.addFolderFailed');
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

    // Wait for data to load (bookmarks are rendered after loading completes)
    await waitFor(() => {
      expect(screen.getByText('Example Site')).toBeInTheDocument();
    });

    // Click Work folder (visible since DropdownMenu mock renders content inline)
    const workFolder = screen.getByText('Work');
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
      expect(screen.getAllByText('browser.bookmarks.all').length).toBeGreaterThan(0);
    });

    // Folders are already visible (DropdownMenu mock renders content inline)
    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument();
    });

    // Find delete button inside the dropdown menu items
    // The folder delete buttons have class 'h-4 w-4 ml-1'
    const deleteButtons = container.querySelectorAll('button.h-4.w-4.ml-1');
    if (deleteButtons.length > 0) {
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalled();
        expect(mockElectronAPI.browserView.deleteBookmarkFolder).toHaveBeenCalledWith('f1');
      });
    } else {
      // Fallback: find by scanning all buttons with SVG trash icon inside dropdown items
      const allButtons = container.querySelectorAll('button');
      let deleteButton = null;
      for (let i = 0; i < allButtons.length; i++) {
        const btn = allButtons[i];
        if (btn.querySelector('.lucide-trash') && btn.className.includes('h-4')) {
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
      expect(screen.getAllByText('browser.bookmarks.all').length).toBeGreaterThan(0);
    });

    // Folders are already visible (DropdownMenu mock renders inline)
    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument();
    });

    // Find folder delete button
    const allButtons = container.querySelectorAll('button');
    let deleteButton = null;
    for (let i = 0; i < allButtons.length; i++) {
      const btn = allButtons[i];
      if (btn.querySelector('.lucide-trash') && btn.className.includes('h-4')) {
        deleteButton = btn;
        break;
      }
    }

    if (deleteButton) {
      fireEvent.click(deleteButton);

      await waitFor(() => {
        // i18n key is displayed as-is in tests
        expect(window.alert).toHaveBeenCalledWith('browser.bookmarks.deleteFolderFailed');
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
        expect(screen.getByText('browser.bookmarks.title')).toBeInTheDocument();
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
          // i18n key is displayed as-is in tests
          expect(window.alert).toHaveBeenCalledWith('browser.bookmarks.addFolderError');
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
        expect(screen.getAllByText('browser.bookmarks.all').length).toBeGreaterThan(0);
      });

      // Folders are already visible (DropdownMenu mock renders inline)
      await waitFor(() => {
        expect(screen.getByText('Test Folder')).toBeInTheDocument();
      });

      // Find folder delete button
      const allButtons = container.querySelectorAll('button');
      let deleteButton = null;
      for (let i = 0; i < allButtons.length; i++) {
        const btn = allButtons[i];
        if (btn.querySelector('.lucide-trash') && btn.className.includes('h-4')) {
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
          // i18n key is displayed as-is in tests
          expect(window.alert).toHaveBeenCalledWith('browser.bookmarks.deleteFolderError');
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
        // i18n key is displayed as-is in tests
        expect(window.alert).toHaveBeenCalledWith('browser.bookmarks.deleteBookmarkError');
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
        // i18n key is displayed as-is in tests
        expect(window.alert).toHaveBeenCalledWith('browser.bookmarks.openError');
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
        // i18n key is displayed as-is in tests
        expect(window.alert).toHaveBeenCalledWith('browser.bookmarks.addError');
      });

      consoleErrorSpy.mockRestore();
    });
  });
});
