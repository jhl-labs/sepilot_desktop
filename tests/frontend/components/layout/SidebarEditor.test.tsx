/**
 * SidebarEditor 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SidebarEditor } from '@/components/layout/SidebarEditor';
import { useChatStore } from '@/lib/store/chat-store';
import { enableElectronMode, disableElectronMode, mockElectronAPI } from '../../../setup';

// Mock chat store
jest.mock('@/lib/store/chat-store');

// Mock child components
jest.mock('@/components/layout/FileExplorer', () => ({
  FileExplorer: () => <div data-testid="file-explorer">File Explorer</div>,
}));

jest.mock('@/components/editor/SearchPanel', () => ({
  SearchPanel: () => <div data-testid="search-panel">Search Panel</div>,
}));

jest.mock('@/components/theme/ThemeToggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme Toggle</button>,
}));

jest.mock('@/components/editor/EditorChatContainer', () => ({
  EditorChatContainer: () => <div data-testid="editor-chat-container">Editor Chat</div>,
}));

describe('SidebarEditor', () => {
  const mockOnSettingsClick = jest.fn();
  const mockSetShowTerminalPanel = jest.fn();
  const mockClearEditorChat = jest.fn();
  const baseStore = () => ({
    editorViewMode: 'files',
    setEditorViewMode: jest.fn(),
    showTerminalPanel: false,
    setShowTerminalPanel: mockSetShowTerminalPanel,
    workingDirectory: '/home/user/project',
    editorUseRagInAutocomplete: false,
    setEditorUseRagInAutocomplete: jest.fn(),
    editorUseToolsInAutocomplete: true,
    setEditorUseToolsInAutocomplete: jest.fn(),
    pendingToolApproval: null,
    clearPendingToolApproval: jest.fn(),
    setAlwaysApproveToolsForSession: jest.fn(),
    setAppMode: jest.fn(),
    clearEditorChat: jest.fn(),
  });
  let storeState: ReturnType<typeof baseStore>;
  const setStore = (overrides: Partial<ReturnType<typeof baseStore>> = {}) => {
    storeState = baseStore();
    Object.assign(storeState, overrides);
    (useChatStore as unknown as jest.Mock).mockImplementation(() => storeState);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClearEditorChat.mockReset();
    setStore();
  });

  afterEach(() => {
    disableElectronMode();
  });

  describe('Content Area Rendering', () => {
    it('should render FileExplorer when editorViewMode is files', () => {
      render(<SidebarEditor />);

      expect(screen.getByTestId('file-explorer')).toBeInTheDocument();
      expect(screen.queryByTestId('search-panel')).not.toBeInTheDocument();
    });

    it('should render SearchPanel when editorViewMode is search', () => {
      setStore({
        editorViewMode: 'search',
      });

      render(<SidebarEditor />);

      expect(screen.getByTestId('search-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('file-explorer')).not.toBeInTheDocument();
    });
  });

  describe('Footer Buttons', () => {
    it('should render theme toggle', () => {
      render(<SidebarEditor />);

      expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    });

    it('should render terminal button', () => {
      render(<SidebarEditor />);

      expect(screen.getByTitle('터미널 열기')).toBeInTheDocument();
    });

    it('should render settings button', () => {
      render(<SidebarEditor />);

      expect(screen.getByTitle('설정')).toBeInTheDocument();
    });
  });

  describe('Terminal Panel Toggle', () => {
    it('should toggle terminal panel when button clicked', () => {
      render(<SidebarEditor />);

      const terminalButton = screen.getByTitle('터미널 열기');
      fireEvent.click(terminalButton);

      expect(mockSetShowTerminalPanel).toHaveBeenCalledWith(true);
    });

    it('should show "터미널 숨기기" when terminal is open', () => {
      setStore({
        showTerminalPanel: true,
      });

      render(<SidebarEditor />);

      expect(screen.getByTitle('터미널 숨기기')).toBeInTheDocument();
    });

    it('should close terminal when button clicked while open', () => {
      setStore({
        showTerminalPanel: true,
      });

      render(<SidebarEditor />);

      const terminalButton = screen.getByTitle('터미널 숨기기');
      fireEvent.click(terminalButton);

      expect(mockSetShowTerminalPanel).toHaveBeenCalledWith(false);
    });

    it('should disable terminal button when workingDirectory is not set', () => {
      setStore({
        workingDirectory: null,
      });

      render(<SidebarEditor />);

      const terminalButton = screen.getByTitle('Working Directory를 먼저 설정해주세요');
      expect(terminalButton).toBeDisabled();
    });

    it('should not toggle terminal when button is disabled', () => {
      setStore({
        workingDirectory: null,
      });

      render(<SidebarEditor />);

      const terminalButton = screen.getByTitle('Working Directory를 먼저 설정해주세요');
      fireEvent.click(terminalButton);

      expect(mockSetShowTerminalPanel).not.toHaveBeenCalled();
    });

    it('should apply bg-accent class when terminal is open', () => {
      setStore({
        showTerminalPanel: true,
      });

      const { container } = render(<SidebarEditor />);

      const terminalButton = screen.getByTitle('터미널 숨기기');
      expect(terminalButton).toHaveClass('bg-accent');
    });
  });

  describe('Settings Button', () => {
    it.skip('should call onSettingsClick when settings button clicked', () => {
      render(<SidebarEditor onSettingsClick={mockOnSettingsClick} />);

      const settingsButton = screen.getByTitle('설정');
      fireEvent.click(settingsButton);

      expect(mockOnSettingsClick).toHaveBeenCalled();
    });

    it.skip('should hide BrowserView before opening settings in Electron', async () => {
      enableElectronMode();

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      (mockElectronAPI.browserView.hideAll as jest.Mock).mockResolvedValue(undefined);

      render(<SidebarEditor onSettingsClick={mockOnSettingsClick} />);

      const settingsButton = screen.getByTitle('설정');
      fireEvent.click(settingsButton);

      await waitFor(() => {
        expect(mockElectronAPI.browserView.hideAll).toHaveBeenCalled();
        expect(mockOnSettingsClick).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[SidebarEditor] BrowserView hidden before opening Settings'
        );
      });

      consoleSpy.mockRestore();
    });

    it.skip('should handle BrowserView.hideAll error gracefully', async () => {
      enableElectronMode();

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockElectronAPI.browserView.hideAll as jest.Mock).mockRejectedValue(
        new Error('Hide failed')
      );

      render(<SidebarEditor onSettingsClick={mockOnSettingsClick} />);

      const settingsButton = screen.getByTitle('설정');
      fireEvent.click(settingsButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[SidebarEditor] Failed to hide BrowserView:',
          expect.any(Error)
        );
      });

      // Should still call onSettingsClick even if hideAll fails
      expect(mockOnSettingsClick).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it.skip('should not call hideAll in non-Electron environment', () => {
      disableElectronMode();

      render(<SidebarEditor onSettingsClick={mockOnSettingsClick} />);

      const settingsButton = screen.getByTitle('설정');
      fireEvent.click(settingsButton);

      expect(mockElectronAPI.browserView.hideAll).not.toHaveBeenCalled();
      expect(mockOnSettingsClick).toHaveBeenCalled();
    });

    it('should not crash when onSettingsClick is not provided', () => {
      render(<SidebarEditor />);

      const settingsButton = screen.getByTitle('설정');

      expect(() => {
        fireEvent.click(settingsButton);
      }).not.toThrow();
    });
  });

  describe('AI Assistant Button', () => {
    it('should switch to chat mode when not in chat mode', () => {
      const mockSetEditorViewMode = jest.fn();
      setStore({
        setEditorViewMode: mockSetEditorViewMode,
      });

      render(<SidebarEditor />);

      const aiButton = screen.getByTitle('AI 코딩 어시스턴트');
      fireEvent.click(aiButton);

      expect(mockSetEditorViewMode).toHaveBeenCalledWith('chat');
    });

    it('should show confirmation dialog when in chat mode', () => {
      global.confirm = jest.fn(() => true);
      const mockSetEditorViewMode = jest.fn();

      setStore({
        editorViewMode: 'chat',
        setEditorViewMode: mockSetEditorViewMode,
        clearEditorChat: mockClearEditorChat,
      });

      render(<SidebarEditor />);

      const newChatButton = screen.getByTitle('새 대화');
      fireEvent.click(newChatButton);

      expect(global.confirm).toHaveBeenCalledWith('현재 대화 내역을 모두 삭제하시겠습니까?');
      expect(mockClearEditorChat).toHaveBeenCalled();
      expect(mockSetEditorViewMode).toHaveBeenCalledWith('chat');
    });

    it('should not clear chat when user cancels confirmation', () => {
      global.confirm = jest.fn(() => false);
      const mockSetEditorViewMode = jest.fn();

      setStore({
        editorViewMode: 'chat',
        setEditorViewMode: mockSetEditorViewMode,
        clearEditorChat: mockClearEditorChat,
      });

      render(<SidebarEditor />);

      const newChatButton = screen.getByTitle('새 대화');
      fireEvent.click(newChatButton);

      expect(global.confirm).toHaveBeenCalled();
      expect(mockClearEditorChat).not.toHaveBeenCalled();
      expect(mockSetEditorViewMode).not.toHaveBeenCalled();
    });
  });
});
