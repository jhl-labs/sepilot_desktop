/**
 * WorkingDirectoryIndicator 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WorkingDirectoryIndicator } from '@/components/chat/WorkingDirectoryIndicator';
import { useChatStore } from '@/lib/store/chat-store';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(),
}));

// Mock platform check
jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => true),
}));

describe('WorkingDirectoryIndicator', () => {
  const mockSetWorkingDirectory = jest.fn();
  const mockElectronAPI = {
    file: {
      selectDirectory: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (window as any).electronAPI = mockElectronAPI;

    // Default mock store
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      workingDirectory: null,
      setWorkingDirectory: mockSetWorkingDirectory,
      thinkingMode: 'coding',
    });
  });

  afterEach(() => {
    delete (window as any).electronAPI;
  });

  it('should not render in non-coding mode', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      workingDirectory: null,
      setWorkingDirectory: mockSetWorkingDirectory,
      thinkingMode: 'instant',
    });

    const { container } = render(<WorkingDirectoryIndicator />);

    expect(container.firstChild).toBeNull();
  });

  it('should render in coding mode', () => {
    render(<WorkingDirectoryIndicator />);

    expect(screen.getByText('작업 디렉토리:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /디렉토리 선택/ })).toBeInTheDocument();
  });

  it('should show select directory button when no directory is set', () => {
    render(<WorkingDirectoryIndicator />);

    const selectButton = screen.getByRole('button', { name: /디렉토리 선택/ });
    expect(selectButton).toBeInTheDocument();
    expect(selectButton).not.toBeDisabled();
  });

  it('should show directory path when set', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      workingDirectory: '/home/user/projects/my-app',
      setWorkingDirectory: mockSetWorkingDirectory,
      thinkingMode: 'coding',
    });

    render(<WorkingDirectoryIndicator />);

    expect(screen.getByText('.../projects/my-app')).toBeInTheDocument();
  });

  it('should show shortened path for 3 segments', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      workingDirectory: '/home/user',
      setWorkingDirectory: mockSetWorkingDirectory,
      thinkingMode: 'coding',
    });

    render(<WorkingDirectoryIndicator />);

    // /home/user has 3 segments (empty, home, user), so it shows last 2
    expect(screen.getByText('.../home/user')).toBeInTheDocument();
  });

  it('should show full path for 2 or fewer segments', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      workingDirectory: '/home',
      setWorkingDirectory: mockSetWorkingDirectory,
      thinkingMode: 'coding',
    });

    render(<WorkingDirectoryIndicator />);

    // /home has 2 segments (empty, home), so it shows the full path
    expect(screen.getByText('/home')).toBeInTheDocument();
  });

  it('should show clear button when directory is set', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      workingDirectory: '/home/user/project',
      setWorkingDirectory: mockSetWorkingDirectory,
      thinkingMode: 'coding',
    });

    render(<WorkingDirectoryIndicator />);

    const clearButton = screen.getByTitle('작업 디렉토리 제거');
    expect(clearButton).toBeInTheDocument();
  });

  it('should clear directory when clear button is clicked', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      workingDirectory: '/home/user/project',
      setWorkingDirectory: mockSetWorkingDirectory,
      thinkingMode: 'coding',
    });

    render(<WorkingDirectoryIndicator />);

    const clearButton = screen.getByTitle('작업 디렉토리 제거');
    fireEvent.click(clearButton);

    expect(mockSetWorkingDirectory).toHaveBeenCalledWith(null);
  });

  it('should select directory when button clicked', async () => {
    mockElectronAPI.file.selectDirectory.mockResolvedValue({
      success: true,
      data: '/new/directory',
    });

    render(<WorkingDirectoryIndicator />);

    const selectButton = screen.getByRole('button', { name: /디렉토리 선택/ });
    fireEvent.click(selectButton);

    await waitFor(() => {
      expect(mockElectronAPI.file.selectDirectory).toHaveBeenCalled();
      expect(mockSetWorkingDirectory).toHaveBeenCalledWith('/new/directory');
    });
  });

  it('should show selecting state while selecting', async () => {
    mockElectronAPI.file.selectDirectory.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: '/dir' }), 100))
    );

    render(<WorkingDirectoryIndicator />);

    const selectButton = screen.getByRole('button', { name: /디렉토리 선택/ });
    fireEvent.click(selectButton);

    expect(screen.getByText('선택 중...')).toBeInTheDocument();
    expect(selectButton).toBeDisabled();

    await waitFor(() => {
      expect(mockSetWorkingDirectory).toHaveBeenCalled();
    });
  });

  it('should not set directory if selection cancelled', async () => {
    mockElectronAPI.file.selectDirectory.mockResolvedValue({
      success: true,
      data: null,
    });

    render(<WorkingDirectoryIndicator />);

    const selectButton = screen.getByRole('button', { name: /디렉토리 선택/ });
    fireEvent.click(selectButton);

    await waitFor(() => {
      expect(mockElectronAPI.file.selectDirectory).toHaveBeenCalled();
      expect(mockSetWorkingDirectory).not.toHaveBeenCalled();
    });
  });

  it('should handle selection error', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockElectronAPI.file.selectDirectory.mockRejectedValue(new Error('Selection failed'));

    render(<WorkingDirectoryIndicator />);

    const selectButton = screen.getByRole('button', { name: /디렉토리 선택/ });
    fireEvent.click(selectButton);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('Failed to select directory:', expect.any(Error));
    });

    consoleError.mockRestore();
  });

  it('should allow changing directory by clicking path', async () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      workingDirectory: '/home/user/project',
      setWorkingDirectory: mockSetWorkingDirectory,
      thinkingMode: 'coding',
    });

    mockElectronAPI.file.selectDirectory.mockResolvedValue({
      success: true,
      data: '/new/project',
    });

    render(<WorkingDirectoryIndicator />);

    const pathElement = screen.getByText('.../user/project');
    fireEvent.click(pathElement);

    await waitFor(() => {
      expect(mockElectronAPI.file.selectDirectory).toHaveBeenCalled();
    });
  });

  it('should show full path as title', () => {
    const fullPath = '/home/user/very/long/project/path';
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      workingDirectory: fullPath,
      setWorkingDirectory: mockSetWorkingDirectory,
      thinkingMode: 'coding',
    });

    render(<WorkingDirectoryIndicator />);

    const pathElement = screen.getByTitle(fullPath);
    expect(pathElement).toBeInTheDocument();
  });

  it('should handle Windows paths', () => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      workingDirectory: 'C:\\Users\\user\\project',
      setWorkingDirectory: mockSetWorkingDirectory,
      thinkingMode: 'coding',
    });

    render(<WorkingDirectoryIndicator />);

    // Windows paths are split by \ and displayed as .../user/project
    expect(screen.getByText('.../user/project')).toBeInTheDocument();
  });

  it('should not select directory in non-Electron environment', async () => {
    // Disable Electron mode
    delete (window as any).electronAPI;
    const { isElectron: originalIsElectron } = require('@/lib/platform');
    require('@/lib/platform').isElectron = jest.fn(() => false);

    render(<WorkingDirectoryIndicator />);

    const selectButton = screen.getByRole('button', { name: /디렉토리 선택/ });
    fireEvent.click(selectButton);

    await waitFor(() => {
      // Should not call selectDirectory or setWorkingDirectory
      expect(mockSetWorkingDirectory).not.toHaveBeenCalled();
    });

    // Restore
    require('@/lib/platform').isElectron = originalIsElectron;
    (window as any).electronAPI = mockElectronAPI;
  });
});
