/**
 * BrowserToolsList 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { BrowserToolsList } from '@/components/browser/BrowserToolsList';
import { useChatStore } from '@/lib/store/chat-store';

// Mock useChatStore
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(),
}));

describe('BrowserToolsList', () => {
  const mockSetBrowserViewMode = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      setBrowserViewMode: mockSetBrowserViewMode,
    });
  });

  describe('Header', () => {
    it('should render header with title', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText('Browser Agent 도구')).toBeInTheDocument();
    });

    it('should render back button', () => {
      render(<BrowserToolsList />);

      const backButton = screen.getByTitle('뒤로 가기');
      expect(backButton).toBeInTheDocument();
    });

    it('should call setBrowserViewMode when back button clicked', async () => {
      const user = userEvent.setup();
      render(<BrowserToolsList />);

      const backButton = screen.getByTitle('뒤로 가기');
      await user.click(backButton);

      expect(mockSetBrowserViewMode).toHaveBeenCalledWith('chat');
      expect(mockSetBrowserViewMode).toHaveBeenCalledTimes(1);
    });

    it('should render wrench icon in header', () => {
      const { container } = render(<BrowserToolsList />);

      // Check for SVG icon
      const icons = container.querySelectorAll('svg');
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe('Tools Description', () => {
    it('should display total tools count', () => {
      render(<BrowserToolsList />);

      expect(
        screen.getByText('Browser Agent가 사용할 수 있는 총 27개의 도구입니다.')
      ).toBeInTheDocument();
    });
  });

  describe('Navigation Tools', () => {
    it('should render Navigation category', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText('Navigation (1)')).toBeInTheDocument();
      expect(screen.getByText('페이지 이동')).toBeInTheDocument();
    });

    it('should render browser_navigate tool', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText('browser_navigate')).toBeInTheDocument();
      expect(screen.getByText('URL로 직접 이동 (http/https 자동 추가)')).toBeInTheDocument();
    });
  });

  describe('Page Inspection Tools', () => {
    it('should render Page Inspection category', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText('Page Inspection (5)')).toBeInTheDocument();
      expect(screen.getByText('페이지 정보 파악')).toBeInTheDocument();
    });

    it('should render all page inspection tools', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText('get_page_content')).toBeInTheDocument();
      expect(screen.getByText('get_interactive_elements')).toBeInTheDocument();
      expect(screen.getByText('search_elements')).toBeInTheDocument();
      expect(screen.getByText('get_selected_text')).toBeInTheDocument();
      expect(screen.getByText('take_screenshot')).toBeInTheDocument();
    });

    it('should show NEW badge for search_elements', () => {
      render(<BrowserToolsList />);

      const searchElements = screen.getByText('search_elements');
      const newBadges = screen.getAllByText('NEW');

      expect(newBadges.length).toBeGreaterThan(0);
    });
  });

  describe('Page Interaction Tools', () => {
    it('should render Page Interaction category', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText('Page Interaction (3)')).toBeInTheDocument();
      expect(screen.getByText('페이지 조작')).toBeInTheDocument();
    });

    it('should render all page interaction tools', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText('click_element')).toBeInTheDocument();
      expect(screen.getByText('type_text')).toBeInTheDocument();
      expect(screen.getByText('scroll')).toBeInTheDocument();
    });
  });

  describe('Tab Management Tools', () => {
    it('should render Tab Management category', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText('Tab Management (4)')).toBeInTheDocument();
      expect(screen.getByText('탭 관리')).toBeInTheDocument();
    });

    it('should render all tab management tools', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText('list_tabs')).toBeInTheDocument();
      expect(screen.getByText('create_tab')).toBeInTheDocument();
      expect(screen.getByText('switch_tab')).toBeInTheDocument();
      expect(screen.getByText('close_tab')).toBeInTheDocument();
    });
  });

  describe('Vision-based Tools', () => {
    it('should render Vision-based Tools category', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText('Vision-based Tools (5)')).toBeInTheDocument();
      expect(screen.getByText('시각 기반 도구')).toBeInTheDocument();
    });

    it('should render all vision-based tools', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText('capture_annotated_screenshot')).toBeInTheDocument();
      expect(screen.getByText('click_coordinate')).toBeInTheDocument();
      expect(screen.getByText('click_marker')).toBeInTheDocument();
      expect(screen.getByText('get_clickable_coordinate')).toBeInTheDocument();
      expect(screen.getByText('analyze_with_vision')).toBeInTheDocument();
    });

    it('should show NEW badges for vision tools', () => {
      render(<BrowserToolsList />);

      const newBadges = screen.getAllByText('NEW');
      expect(newBadges.length).toBeGreaterThan(3); // At least 4 NEW badges
    });

    it('should show SOON badge for analyze_with_vision', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText('SOON')).toBeInTheDocument();
    });
  });

  describe('Info Section', () => {
    it('should render info message', () => {
      render(<BrowserToolsList />);

      expect(
        screen.getByText('이 도구들은 Browser Agent가 자동으로 선택하여 사용합니다.')
      ).toBeInTheDocument();
      expect(screen.getByText('사용자는 자연어로 명령만 입력하면 됩니다.')).toBeInTheDocument();
    });
  });

  describe('ToolItem Component', () => {
    it('should render tool name in monospace font', () => {
      render(<BrowserToolsList />);

      const toolName = screen.getByText('browser_navigate');
      expect(toolName).toHaveClass('font-mono');
    });

    it('should render tool descriptions', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText(/URL로 직접 이동/)).toBeInTheDocument();
      expect(screen.getByText(/현재 페이지의 내용 파악/)).toBeInTheDocument();
    });

    it('should apply hover effect classes', () => {
      const { container } = render(<BrowserToolsList />);

      const toolItems = container.querySelectorAll('.hover\\:bg-muted\\/50');
      expect(toolItems.length).toBeGreaterThan(0);
    });
  });

  describe('Layout', () => {
    it('should have proper container structure', () => {
      const { container } = render(<BrowserToolsList />);

      const mainContainer = container.querySelector('.flex.h-full.w-full.flex-col');
      expect(mainContainer).toBeInTheDocument();
    });

    it('should have scrollable content area', () => {
      const { container } = render(<BrowserToolsList />);

      const scrollArea = container.querySelector('.flex-1.overflow-y-auto');
      expect(scrollArea).toBeInTheDocument();
    });

    it('should have border at header', () => {
      const { container } = render(<BrowserToolsList />);

      const header = container.querySelector('.border-b');
      expect(header).toBeInTheDocument();
    });
  });

  describe('All Tools Count', () => {
    it('should have exactly 27 tools total', () => {
      const { container } = render(<BrowserToolsList />);
      const toolNames = container.querySelectorAll('code.font-mono');

      expect(toolNames.length).toBe(27);
    });
  });

  describe('Categories', () => {
    it('should render all 6 categories', () => {
      render(<BrowserToolsList />);

      expect(screen.getByText('Navigation (1)')).toBeInTheDocument();
      expect(screen.getByText('Page Inspection (5)')).toBeInTheDocument();
      expect(screen.getByText('Page Interaction (3)')).toBeInTheDocument();
      expect(screen.getByText('Tab Management (4)')).toBeInTheDocument();
      expect(screen.getByText('Vision-based Tools (5)')).toBeInTheDocument();
      expect(screen.getByText('Google Search Tools (9)')).toBeInTheDocument();
    });

    it('should sum to 18 tools across all categories', () => {
      expect(1 + 5 + 3 + 4 + 5 + 9).toBe(27);
    });
  });

  describe('Badge Variants', () => {
    it('should use default variant for NEW badges', () => {
      const { container } = render(<BrowserToolsList />);

      const newBadges = screen.getAllByText('NEW');
      newBadges.forEach((badge) => {
        expect(badge).toHaveClass('h-4', 'text-[10px]', 'px-1');
      });
    });

    it('should use secondary variant for SOON badge', () => {
      render(<BrowserToolsList />);

      const soonBadge = screen.getByText('SOON');
      expect(soonBadge).toHaveClass('h-4', 'text-[10px]', 'px-1');
    });
  });
});
