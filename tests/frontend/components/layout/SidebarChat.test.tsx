/**
 * SidebarChat 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SidebarChat } from '@/components/layout/SidebarChat';
import { enableElectronMode, disableElectronMode, mockElectronAPI } from '../../../setup';

// Mock child components
jest.mock('@/components/theme/ThemeToggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme Toggle</button>,
}));

jest.mock('@/components/layout/ChatHistory', () => ({
  ChatHistory: ({ onConversationClick }: { onConversationClick?: () => void }) => (
    <div data-testid="chat-history" onClick={onConversationClick}>
      Chat History
    </div>
  ),
}));

describe('SidebarChat', () => {
  const mockOnDocumentsClick = jest.fn();
  const mockOnGalleryClick = jest.fn();
  const mockOnConversationClick = jest.fn();
  const mockOnSettingsClick = jest.fn();
  const mockOnEditorChatClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    disableElectronMode();
  });

  describe('Component Rendering', () => {
    it('should render ChatHistory component', () => {
      render(<SidebarChat />);

      expect(screen.getByTestId('chat-history')).toBeInTheDocument();
    });

    it('should render ThemeToggle', () => {
      render(<SidebarChat />);

      expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    });

    it('should render Documents button', () => {
      render(<SidebarChat />);

      expect(screen.getByTitle('문서 관리')).toBeInTheDocument();
    });

    it('should render Gallery button', () => {
      render(<SidebarChat />);

      expect(screen.getByTitle('이미지 갤러리')).toBeInTheDocument();
    });

    it('should render Settings button', () => {
      render(<SidebarChat />);

      expect(screen.getByTitle('설정')).toBeInTheDocument();
    });

    it('should not render Editor Chat button by default', () => {
      render(<SidebarChat />);

      expect(screen.queryByTitle('Editor Chat (AI 도우미)')).not.toBeInTheDocument();
    });

    it('should render Editor Chat button when showEditorChat is true', () => {
      render(<SidebarChat showEditorChat={true} />);

      expect(screen.getByTitle('Editor Chat (AI 도우미)')).toBeInTheDocument();
    });
  });

  describe('Button Click Handlers', () => {
    it('should call onDocumentsClick when Documents button is clicked', () => {
      render(<SidebarChat onDocumentsClick={mockOnDocumentsClick} />);

      const documentsButton = screen.getByTitle('문서 관리');
      fireEvent.click(documentsButton);

      expect(mockOnDocumentsClick).toHaveBeenCalled();
    });

    it('should call onGalleryClick when Gallery button is clicked', () => {
      render(<SidebarChat onGalleryClick={mockOnGalleryClick} />);

      const galleryButton = screen.getByTitle('이미지 갤러리');
      fireEvent.click(galleryButton);

      expect(mockOnGalleryClick).toHaveBeenCalled();
    });

    it('should call onSettingsClick when Settings button is clicked', () => {
      render(<SidebarChat onSettingsClick={mockOnSettingsClick} />);

      const settingsButton = screen.getByTitle('설정');
      fireEvent.click(settingsButton);

      expect(mockOnSettingsClick).toHaveBeenCalled();
    });

    it('should call onEditorChatClick when Editor Chat button is clicked', () => {
      render(
        <SidebarChat showEditorChat={true} onEditorChatClick={mockOnEditorChatClick} />
      );

      const editorChatButton = screen.getByTitle('Editor Chat (AI 도우미)');
      fireEvent.click(editorChatButton);

      expect(mockOnEditorChatClick).toHaveBeenCalled();
    });

    it('should call onConversationClick when ChatHistory is clicked', () => {
      render(<SidebarChat onConversationClick={mockOnConversationClick} />);

      const chatHistory = screen.getByTestId('chat-history');
      fireEvent.click(chatHistory);

      expect(mockOnConversationClick).toHaveBeenCalled();
    });

    it('should not crash when handlers are not provided', () => {
      render(<SidebarChat />);

      expect(() => {
        fireEvent.click(screen.getByTitle('문서 관리'));
        fireEvent.click(screen.getByTitle('이미지 갤러리'));
        fireEvent.click(screen.getByTitle('설정'));
      }).not.toThrow();
    });
  });

  describe('BrowserView Hiding - Documents Button', () => {
    beforeEach(() => {
      enableElectronMode();
    });

    it('should hide BrowserView before opening Documents in Electron', async () => {
      (mockElectronAPI.browserView.hideAll as jest.Mock).mockResolvedValue(undefined);

      render(<SidebarChat onDocumentsClick={mockOnDocumentsClick} />);

      const documentsButton = screen.getByTitle('문서 관리');
      fireEvent.click(documentsButton);

      await waitFor(() => {
        expect(mockElectronAPI.browserView.hideAll).toHaveBeenCalled();
        expect(mockOnDocumentsClick).toHaveBeenCalled();
      });
    });

    it('should handle BrowserView.hideAll error gracefully for Documents', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockElectronAPI.browserView.hideAll as jest.Mock).mockRejectedValue(
        new Error('Hide failed')
      );

      render(<SidebarChat onDocumentsClick={mockOnDocumentsClick} />);

      const documentsButton = screen.getByTitle('문서 관리');
      fireEvent.click(documentsButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[SidebarChat] Failed to hide BrowserView:',
          expect.any(Error)
        );
      });

      // Should still call onDocumentsClick even if hideAll fails
      expect(mockOnDocumentsClick).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should not call hideAll in non-Electron environment for Documents', () => {
      disableElectronMode();

      render(<SidebarChat onDocumentsClick={mockOnDocumentsClick} />);

      const documentsButton = screen.getByTitle('문서 관리');
      fireEvent.click(documentsButton);

      expect(mockElectronAPI.browserView.hideAll).not.toHaveBeenCalled();
      expect(mockOnDocumentsClick).toHaveBeenCalled();
    });

    it('should log when Documents button is clicked', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      render(<SidebarChat onDocumentsClick={mockOnDocumentsClick} />);

      const documentsButton = screen.getByTitle('문서 관리');
      fireEvent.click(documentsButton);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[SidebarChat] Documents button clicked - hiding BrowserView'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('BrowserView Hiding - Gallery Button', () => {
    beforeEach(() => {
      enableElectronMode();
    });

    it('should hide BrowserView before opening Gallery in Electron', async () => {
      (mockElectronAPI.browserView.hideAll as jest.Mock).mockResolvedValue(undefined);

      render(<SidebarChat onGalleryClick={mockOnGalleryClick} />);

      const galleryButton = screen.getByTitle('이미지 갤러리');
      fireEvent.click(galleryButton);

      await waitFor(() => {
        expect(mockElectronAPI.browserView.hideAll).toHaveBeenCalled();
        expect(mockOnGalleryClick).toHaveBeenCalled();
      });
    });

    it('should handle BrowserView.hideAll error gracefully for Gallery', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockElectronAPI.browserView.hideAll as jest.Mock).mockRejectedValue(
        new Error('Hide failed')
      );

      render(<SidebarChat onGalleryClick={mockOnGalleryClick} />);

      const galleryButton = screen.getByTitle('이미지 갤러리');
      fireEvent.click(galleryButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[SidebarChat] Failed to hide BrowserView:',
          expect.any(Error)
        );
      });

      expect(mockOnGalleryClick).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should not call hideAll in non-Electron environment for Gallery', () => {
      disableElectronMode();

      render(<SidebarChat onGalleryClick={mockOnGalleryClick} />);

      const galleryButton = screen.getByTitle('이미지 갤러리');
      fireEvent.click(galleryButton);

      expect(mockElectronAPI.browserView.hideAll).not.toHaveBeenCalled();
      expect(mockOnGalleryClick).toHaveBeenCalled();
    });

    it('should log when Gallery button is clicked', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      render(<SidebarChat onGalleryClick={mockOnGalleryClick} />);

      const galleryButton = screen.getByTitle('이미지 갤러리');
      fireEvent.click(galleryButton);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[SidebarChat] Gallery button clicked - hiding BrowserView'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('BrowserView Hiding - Settings Button', () => {
    beforeEach(() => {
      enableElectronMode();
    });

    it('should hide BrowserView before opening Settings in Electron', async () => {
      (mockElectronAPI.browserView.hideAll as jest.Mock).mockResolvedValue(undefined);

      render(<SidebarChat onSettingsClick={mockOnSettingsClick} />);

      const settingsButton = screen.getByTitle('설정');
      fireEvent.click(settingsButton);

      await waitFor(() => {
        expect(mockElectronAPI.browserView.hideAll).toHaveBeenCalled();
        expect(mockOnSettingsClick).toHaveBeenCalled();
      });
    });

    it('should handle BrowserView.hideAll error gracefully for Settings', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (mockElectronAPI.browserView.hideAll as jest.Mock).mockRejectedValue(
        new Error('Hide failed')
      );

      render(<SidebarChat onSettingsClick={mockOnSettingsClick} />);

      const settingsButton = screen.getByTitle('설정');
      fireEvent.click(settingsButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[SidebarChat] Failed to hide BrowserView:',
          expect.any(Error)
        );
      });

      expect(mockOnSettingsClick).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should not call hideAll in non-Electron environment for Settings', () => {
      disableElectronMode();

      render(<SidebarChat onSettingsClick={mockOnSettingsClick} />);

      const settingsButton = screen.getByTitle('설정');
      fireEvent.click(settingsButton);

      expect(mockElectronAPI.browserView.hideAll).not.toHaveBeenCalled();
      expect(mockOnSettingsClick).toHaveBeenCalled();
    });

    it('should log when Settings button is clicked', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      render(<SidebarChat onSettingsClick={mockOnSettingsClick} />);

      const settingsButton = screen.getByTitle('설정');
      fireEvent.click(settingsButton);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[SidebarChat] Settings button clicked - hiding BrowserView'
      );

      consoleSpy.mockRestore();
    });
  });
});
