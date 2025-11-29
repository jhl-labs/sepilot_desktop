/**
 * BrowserSettings 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserSettings } from '@/components/browser/BrowserSettings';
import { enableElectronMode, mockElectronAPI } from '../../../setup';
import * as chatStoreModule from '@/lib/store/chat-store';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(() => ({
    setBrowserViewMode: jest.fn(),
  })),
}));

describe('BrowserSettings', () => {
  const mockSettings = {
    snapshotsPath: '/home/user/snapshots',
    bookmarksPath: '/home/user/bookmarks',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    enableElectronMode();
  });

  it('should show loading state', () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<BrowserSettings />);

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  });

  it('should load settings on mount', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSettings,
    });

    render(<BrowserSettings />);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.getBrowserSettings).toHaveBeenCalled();
      expect(screen.getByText('/home/user/snapshots')).toBeInTheDocument();
      expect(screen.getByText('/home/user/bookmarks')).toBeInTheDocument();
    });
  });

  it('should handle load error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockRejectedValue(
      new Error('Load failed')
    );

    render(<BrowserSettings />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  it('should not load when not in Electron', () => {
    (window as any).electronAPI = undefined;

    render(<BrowserSettings />);

    expect(mockElectronAPI.browserView.getBrowserSettings).not.toHaveBeenCalled();
  });

  it('should show header with title', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSettings,
    });

    render(<BrowserSettings />);

    await waitFor(() => {
      expect(screen.getByText('Browser 설정')).toBeInTheDocument();
    });
  });

  it('should call setBrowserViewMode when back button is clicked', async () => {
    const mockSetBrowserViewMode = jest.fn();
    (chatStoreModule.useChatStore as jest.Mock).mockReturnValue({
      setBrowserViewMode: mockSetBrowserViewMode,
    });

    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSettings,
    });

    const { container } = render(<BrowserSettings />);

    await waitFor(() => {
      expect(screen.getByText('Browser 설정')).toBeInTheDocument();
    });

    // Back button is the first button in the header
    const backButton = container.querySelector('button');
    fireEvent.click(backButton as HTMLElement);

    expect(mockSetBrowserViewMode).toHaveBeenCalledWith('chat');
  });

  it('should show labels for settings', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSettings,
    });

    render(<BrowserSettings />);

    await waitFor(() => {
      expect(screen.getByText('스냅샷 저장 경로')).toBeInTheDocument();
      expect(screen.getByText('북마크 저장 경로')).toBeInTheDocument();
    });
  });

  it('should open snapshots folder when button clicked', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSettings,
    });
    (mockElectronAPI.shell.openExternal as jest.Mock).mockResolvedValue(undefined);

    render(<BrowserSettings />);

    await waitFor(() => {
      expect(screen.getByText('/home/user/snapshots')).toBeInTheDocument();
    });

    const openButtons = screen.getAllByTitle('폴더 열기');
    fireEvent.click(openButtons[0]); // First button is for snapshots

    await waitFor(() => {
      expect(mockElectronAPI.shell.openExternal).toHaveBeenCalledWith(
        'file:///home/user/snapshots'
      );
    });
  });

  it('should open bookmarks folder when button clicked', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSettings,
    });
    (mockElectronAPI.shell.openExternal as jest.Mock).mockResolvedValue(undefined);

    render(<BrowserSettings />);

    await waitFor(() => {
      expect(screen.getByText('/home/user/bookmarks')).toBeInTheDocument();
    });

    const openButtons = screen.getAllByTitle('폴더 열기');
    fireEvent.click(openButtons[1]); // Second button is for bookmarks

    await waitFor(() => {
      expect(mockElectronAPI.shell.openExternal).toHaveBeenCalledWith(
        'file:///home/user/bookmarks'
      );
    });
  });

  it('should disable folder buttons when paths are not loaded', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '',
        bookmarksPath: '',
      },
    });

    render(<BrowserSettings />);

    await waitFor(() => {
      const openButtons = screen.getAllByTitle('폴더 열기');
      expect(openButtons[0]).toBeDisabled();
      expect(openButtons[1]).toBeDisabled();
    });
  });

  it('should show placeholder when paths are empty', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '',
        bookmarksPath: '',
      },
    });

    render(<BrowserSettings />);

    await waitFor(() => {
      const placeholders = screen.getAllByText('경로를 불러오는 중...');
      expect(placeholders).toHaveLength(2);
    });
  });

  it('should show descriptions for settings', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSettings,
    });

    render(<BrowserSettings />);

    await waitFor(() => {
      expect(
        screen.getByText('페이지 캡처로 저장된 스냅샷 파일이 저장되는 위치입니다.')
      ).toBeInTheDocument();
      expect(screen.getByText('북마크 데이터가 저장되는 위치입니다.')).toBeInTheDocument();
    });
  });

  it('should show future settings message', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSettings,
    });

    render(<BrowserSettings />);

    await waitFor(() => {
      expect(screen.getByText('추가 설정이 향후 지원될 예정입니다.')).toBeInTheDocument();
    });
  });

  it('should handle openExternal error for snapshots folder', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSettings,
    });
    (mockElectronAPI.shell.openExternal as jest.Mock).mockRejectedValue(
      new Error('Open failed')
    );

    render(<BrowserSettings />);

    await waitFor(() => {
      expect(screen.getByText('/home/user/snapshots')).toBeInTheDocument();
    });

    const openButtons = screen.getAllByTitle('폴더 열기');
    fireEvent.click(openButtons[0]);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  it('should handle openExternal error for bookmarks folder', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: mockSettings,
    });
    (mockElectronAPI.shell.openExternal as jest.Mock).mockRejectedValue(
      new Error('Open failed')
    );

    render(<BrowserSettings />);

    await waitFor(() => {
      expect(screen.getByText('/home/user/bookmarks')).toBeInTheDocument();
    });

    const openButtons = screen.getAllByTitle('폴더 열기');
    fireEvent.click(openButtons[1]);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });
});
