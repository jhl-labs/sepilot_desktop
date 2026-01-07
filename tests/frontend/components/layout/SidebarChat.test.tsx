/**
 * SidebarChat 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SidebarChat } from '@/components/layout/SidebarChat';
import { enableElectronMode, disableElectronMode, mockElectronAPI } from '../../../setup';
import { useChatStore } from '@/lib/store/chat-store';

// Mock chat store
jest.mock('@/lib/store/chat-store');

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

jest.mock('@/components/chat/ChatChatArea', () => ({
  ChatChatArea: () => <div data-testid="chat-chat-area">Chat Chat Area</div>,
}));

jest.mock('@/components/rag/DocumentList', () => ({
  DocumentList: () => <div data-testid="document-list">Document List</div>,
}));

jest.mock('@/components/persona/PersonaDialog', () => ({
  PersonaDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div data-testid="persona-dialog" data-open={open} onClick={() => onOpenChange(false)}>
      Persona Dialog
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

    // Default mock: chatViewMode = 'history'
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      chatViewMode: 'history',
    });
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

    it('should render Gallery button', () => {
      render(<SidebarChat />);

      expect(screen.getByTitle('이미지 갤러리')).toBeInTheDocument();
    });

    it('should render Settings button', () => {
      render(<SidebarChat />);

      expect(screen.getByTitle('설정')).toBeInTheDocument();
    });
  });

  describe('Button Click Handlers', () => {
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

    it('should call onConversationClick when ChatHistory is clicked', () => {
      render(<SidebarChat onConversationClick={mockOnConversationClick} />);

      const chatHistory = screen.getByTestId('chat-history');
      fireEvent.click(chatHistory);

      expect(mockOnConversationClick).toHaveBeenCalled();
    });

    it('should not crash when handlers are not provided', () => {
      render(<SidebarChat />);

      expect(() => {
        fireEvent.click(screen.getByTitle('이미지 갤러리'));
        fireEvent.click(screen.getByTitle('설정'));
      }).not.toThrow();
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

    it('should open persona dialog when persona button is clicked', async () => {
      render(<SidebarChat onSettingsClick={mockOnSettingsClick} />);

      const personaButton = screen.getByTitle('페르소나 관리');
      fireEvent.click(personaButton);

      await waitFor(() => {
        expect(screen.getByText('Persona Dialog')).toBeInTheDocument();
      });
    });
  });
});
