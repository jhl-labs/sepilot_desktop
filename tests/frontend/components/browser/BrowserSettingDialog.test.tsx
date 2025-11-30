/**
 * BrowserSettingDialog 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { BrowserSettingDialog } from '@/components/browser/BrowserSettingDialog';
import { enableElectronMode, mockElectronAPI } from '../../../setup';

describe('BrowserSettingDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enableElectronMode();
  });

  it('should not render when closed', () => {
    render(<BrowserSettingDialog open={false} onOpenChange={jest.fn()} />);

    expect(screen.queryByText('Browser 설정')).not.toBeInTheDocument();
  });

  it('should render when opened', () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '/path/to/snapshots',
        bookmarksPath: '/path/to/bookmarks',
      },
    });

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    expect(screen.getByText('Browser 설정')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  });

  it('should load browser settings on open', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '/home/user/snapshots',
        bookmarksPath: '/home/user/bookmarks',
      },
    });

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.getBrowserSettings).toHaveBeenCalled();
      expect(screen.getByText('/home/user/snapshots')).toBeInTheDocument();
      expect(screen.getByText('/home/user/bookmarks')).toBeInTheDocument();
    });
  });

  it('should show placeholder text when paths are not loaded', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '',
        bookmarksPath: '',
      },
    });

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText('경로를 불러오는 중...').length).toBeGreaterThan(0);
    });
  });

  it('should handle load error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockRejectedValue(
      new Error('Load failed')
    );

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  it('should open snapshots folder when button clicked', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '/home/user/snapshots',
        bookmarksPath: '/home/user/bookmarks',
      },
    });
    (mockElectronAPI.shell.openExternal as jest.Mock).mockResolvedValue(undefined);

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

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
      data: {
        snapshotsPath: '/home/user/snapshots',
        bookmarksPath: '/home/user/bookmarks',
      },
    });
    (mockElectronAPI.shell.openExternal as jest.Mock).mockResolvedValue(undefined);

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

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

  it('should disable open folder buttons when paths are empty', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '',
        bookmarksPath: '',
      },
    });

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      const openButtons = screen.getAllByTitle('폴더 열기');
      expect(openButtons[0]).toBeDisabled();
      expect(openButtons[1]).toBeDisabled();
    });
  });

  it('should handle shell.openExternal error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '/home/user/snapshots',
        bookmarksPath: '/home/user/bookmarks',
      },
    });
    (mockElectronAPI.shell.openExternal as jest.Mock).mockRejectedValue(
      new Error('Cannot open folder')
    );

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

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

  it('should not load data when not in Electron', async () => {
    (window as any).electronAPI = undefined;

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(mockElectronAPI.browserView.getBrowserSettings).not.toHaveBeenCalled();
    });
  });

  it('should not open folder when not in Electron', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '/home/user/snapshots',
        bookmarksPath: '/home/user/bookmarks',
      },
    });

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('/home/user/snapshots')).toBeInTheDocument();
    });

    // Disable Electron mode
    (window as any).electronAPI = undefined;

    const openButtons = screen.getAllByTitle('폴더 열기');
    fireEvent.click(openButtons[0]);

    expect(mockElectronAPI.shell.openExternal).not.toHaveBeenCalled();
  });

  it('should show font settings section', async () => {
    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '/path',
        bookmarksPath: '/path',
      },
    });

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Browser Chat 폰트 설정')).toBeInTheDocument();
      expect(screen.getByText('폰트')).toBeInTheDocument();
      expect(screen.getByText('폰트 크기 (px)')).toBeInTheDocument();
    });
  });

  it('should handle error when opening bookmarks folder', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '/path/to/snapshots',
        bookmarksPath: '/path/to/bookmarks',
      },
    });

    (mockElectronAPI.shell.openExternal as jest.Mock).mockRejectedValue(
      new Error('Failed to open folder')
    );

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('/path/to/bookmarks')).toBeInTheDocument();
    });

    const openButtons = screen.getAllByTitle('폴더 열기');
    fireEvent.click(openButtons[1]); // bookmarks folder button

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[BrowserSettingDialog] Error opening bookmarks folder:',
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  it('should save font configuration', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();

    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '/path',
        bookmarksPath: '/path',
      },
    });

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Browser Chat 폰트 설정')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /저장/i });
    fireEvent.click(saveButton);

    expect(alertSpy).toHaveBeenCalledWith('폰트 설정이 저장되었습니다.');

    alertSpy.mockRestore();
  });

  it('should reset font configuration', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '/path',
        bookmarksPath: '/path',
      },
    });

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Browser Chat 폰트 설정')).toBeInTheDocument();
    });

    const resetButton = screen.getByRole('button', { name: /초기화/i });
    fireEvent.click(resetButton);

    expect(confirmSpy).toHaveBeenCalledWith('폰트 설정을 기본값으로 초기화하시겠습니까?');
    expect(alertSpy).toHaveBeenCalledWith('폰트 설정이 초기화되었습니다.');

    confirmSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('should not reset when user cancels', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '/path',
        bookmarksPath: '/path',
      },
    });

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Browser Chat 폰트 설정')).toBeInTheDocument();
    });

    const resetButton = screen.getByRole('button', { name: /초기화/i });
    fireEvent.click(resetButton);

    expect(confirmSpy).toHaveBeenCalledWith('폰트 설정을 기본값으로 초기화하시겠습니까?');
    expect(alertSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('should update font size', async () => {
    const user = userEvent.setup();

    (mockElectronAPI.browserView.getBrowserSettings as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        snapshotsPath: '/path',
        bookmarksPath: '/path',
      },
    });

    render(<BrowserSettingDialog open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Browser Chat 폰트 설정')).toBeInTheDocument();
    });

    const fontSizeInput = screen.getByDisplayValue('14');
    await user.clear(fontSizeInput);
    await user.type(fontSizeInput, '18');

    expect(fontSizeInput).toHaveValue(18);
  });
});
