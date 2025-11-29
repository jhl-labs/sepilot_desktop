/**
 * SidebarBrowser 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SidebarBrowser } from '@/components/layout/SidebarBrowser';
import { useChatStore } from '@/lib/store/chat-store';
import { enableElectronMode, disableElectronMode, mockElectronAPI } from '../../../setup';

// Mock chat store
jest.mock('@/lib/store/chat-store');

// Mock child components
jest.mock('@/components/browser/SimpleChatArea', () => ({
  SimpleChatArea: () => <div data-testid="simple-chat-area">Chat Area</div>,
}));

jest.mock('@/components/browser/SimpleChatInput', () => ({
  SimpleChatInput: () => <div data-testid="simple-chat-input">Chat Input</div>,
}));

jest.mock('@/components/browser/SnapshotsList', () => ({
  SnapshotsList: () => <div data-testid="snapshots-list">Snapshots</div>,
}));

jest.mock('@/components/browser/BookmarksList', () => ({
  BookmarksList: () => <div data-testid="bookmarks-list">Bookmarks</div>,
}));

jest.mock('@/components/browser/BrowserSettings', () => ({
  BrowserSettings: () => <div data-testid="browser-settings">Settings</div>,
}));

describe('SidebarBrowser', () => {
  const mockClearBrowserChat = jest.fn();
  const mockSetBrowserViewMode = jest.fn();

  const originalConfirm = window.confirm;
  const originalAlert = window.alert;

  beforeEach(() => {
    jest.clearAllMocks();

    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      clearBrowserChat: mockClearBrowserChat,
      browserViewMode: 'chat',
      setBrowserViewMode: mockSetBrowserViewMode,
    });
  });

  afterEach(() => {
    window.confirm = originalConfirm;
    window.alert = originalAlert;
    disableElectronMode();
  });

  describe('Rendering different view modes', () => {
    it('should render chat view by default', () => {
      render(<SidebarBrowser />);

      expect(screen.getByTestId('simple-chat-area')).toBeInTheDocument();
      expect(screen.getByTestId('simple-chat-input')).toBeInTheDocument();
    });

    it('should render snapshots view', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        clearBrowserChat: mockClearBrowserChat,
        browserViewMode: 'snapshots',
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      render(<SidebarBrowser />);

      expect(screen.getByTestId('snapshots-list')).toBeInTheDocument();
      expect(screen.queryByTestId('simple-chat-area')).not.toBeInTheDocument();
    });

    it('should render bookmarks view', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        clearBrowserChat: mockClearBrowserChat,
        browserViewMode: 'bookmarks',
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      render(<SidebarBrowser />);

      expect(screen.getByTestId('bookmarks-list')).toBeInTheDocument();
    });

    it('should render settings view', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        clearBrowserChat: mockClearBrowserChat,
        browserViewMode: 'settings',
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      render(<SidebarBrowser />);

      expect(screen.getByTestId('browser-settings')).toBeInTheDocument();
    });
  });

  describe('Footer buttons', () => {
    it('should render all footer buttons', () => {
      render(<SidebarBrowser />);

      expect(screen.getByTitle('새 대화')).toBeInTheDocument();
      expect(screen.getByTitle('페이지 캡처')).toBeInTheDocument();
      expect(screen.getByTitle('스냅샷 관리')).toBeInTheDocument();
      expect(screen.getByTitle('북마크')).toBeInTheDocument();
      expect(screen.getByTitle('Browser 설정')).toBeInTheDocument();
    });

    it('should clear chat and switch to chat view when new chat button clicked', () => {
      render(<SidebarBrowser />);

      const newChatButton = screen.getByTitle('새 대화');
      fireEvent.click(newChatButton);

      expect(window.confirm).toHaveBeenCalledWith('현재 대화 내역을 모두 삭제하시겠습니까?');
      expect(mockClearBrowserChat).toHaveBeenCalled();
      expect(mockSetBrowserViewMode).toHaveBeenCalledWith('chat');
    });

    it('should not clear chat when user cancels confirm dialog', () => {
      (window.confirm as jest.Mock).mockReturnValue(false);

      render(<SidebarBrowser />);

      const newChatButton = screen.getByTitle('새 대화');
      fireEvent.click(newChatButton);

      expect(mockClearBrowserChat).not.toHaveBeenCalled();
      expect(mockSetBrowserViewMode).not.toHaveBeenCalled();
    });

    it('should switch to snapshots view when snapshots button clicked', () => {
      render(<SidebarBrowser />);

      const snapshotsButton = screen.getByTitle('스냅샷 관리');
      fireEvent.click(snapshotsButton);

      expect(mockSetBrowserViewMode).toHaveBeenCalledWith('snapshots');
    });

    it('should switch to bookmarks view when bookmarks button clicked', () => {
      render(<SidebarBrowser />);

      const bookmarksButton = screen.getByTitle('북마크');
      fireEvent.click(bookmarksButton);

      expect(mockSetBrowserViewMode).toHaveBeenCalledWith('bookmarks');
    });

    it('should switch to settings view when settings button clicked', () => {
      render(<SidebarBrowser />);

      const settingsButton = screen.getByTitle('Browser 설정');
      fireEvent.click(settingsButton);

      expect(mockSetBrowserViewMode).toHaveBeenCalledWith('settings');
    });
  });

  describe('Page capture functionality', () => {
    beforeEach(() => {
      enableElectronMode();
    });

    it('should capture page successfully', async () => {
      (mockElectronAPI.browserView.capturePage as jest.Mock).mockResolvedValue({
        success: true,
        data: { snapshotId: '123' },
      });

      render(<SidebarBrowser />);

      const captureButton = screen.getByTitle('페이지 캡처');
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(mockElectronAPI.browserView.capturePage).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('페이지가 스냅샷으로 저장되었습니다.');
      });
    });

    it('should handle capture failure', async () => {
      (mockElectronAPI.browserView.capturePage as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Capture failed',
      });

      render(<SidebarBrowser />);

      const captureButton = screen.getByTitle('페이지 캡처');
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('페이지 캡처 실패: Capture failed');
      });
    });

    it('should handle capture exception', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockElectronAPI.browserView.capturePage as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      render(<SidebarBrowser />);

      const captureButton = screen.getByTitle('페이지 캡처');
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('페이지 캡처 중 오류가 발생했습니다.');
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });

    it('should warn when not in Electron environment', async () => {
      disableElectronMode();

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      render(<SidebarBrowser />);

      const captureButton = screen.getByTitle('페이지 캡처');
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('[SidebarBrowser] Not in Electron environment');
        expect(mockElectronAPI.browserView.capturePage).not.toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });

    it('should warn when electronAPI is not available', async () => {
      enableElectronMode();
      (window as any).electronAPI = undefined;

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      render(<SidebarBrowser />);

      const captureButton = screen.getByTitle('페이지 캡처');
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('[SidebarBrowser] Not in Electron environment');
      });

      consoleSpy.mockRestore();
    });
  });
});
