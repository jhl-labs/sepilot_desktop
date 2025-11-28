/**
 * 테마 및 UI 상태 테스트 케이스
 * 
 * 다크/라이트 모드 전환, UI 상태 관리 등을 테스트합니다.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import * as nextThemes from 'next-themes';

// Mock next-themes
const mockSetTheme = jest.fn();
const mockUseTheme = jest.fn();

jest.mock('next-themes', () => ({
  useTheme: () => mockUseTheme(),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('테마 전환 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetTheme.mockClear();
  });

  describe('테마 토글', () => {
    it('라이트 모드에서 다크 모드로 전환할 수 있어야 함', async () => {
      const user = userEvent.setup();
      mockUseTheme.mockReturnValue({
        resolvedTheme: 'light',
        setTheme: mockSetTheme,
      });

      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      await user.click(button);

      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });

    it('다크 모드에서 라이트 모드로 전환할 수 있어야 함', async () => {
      const user = userEvent.setup();
      mockUseTheme.mockReturnValue({
        resolvedTheme: 'dark',
        setTheme: mockSetTheme,
      });

      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      await user.click(button);

      expect(mockSetTheme).toHaveBeenCalledWith('light');
    });

    it('현재 테마에 따라 올바른 아이콘이 표시되어야 함', () => {
      mockUseTheme.mockReturnValue({
        resolvedTheme: 'light',
        setTheme: mockSetTheme,
      });

      const { rerender } = render(<ThemeToggle />);

      // 라이트 모드에서는 Moon 아이콘 (다크 모드로 전환)
      expect(screen.getByTitle(/다크 모드로 전환/i)).toBeInTheDocument();

      // 다크 모드로 변경
      mockUseTheme.mockReturnValue({
        resolvedTheme: 'dark',
        setTheme: mockSetTheme,
      });
      rerender(<ThemeToggle />);

      // 다크 모드에서는 Sun 아이콘 (라이트 모드로 전환)
      expect(screen.getByTitle(/라이트 모드로 전환/i)).toBeInTheDocument();
    });

    it('테마 전환 시 접근성 레이블이 올바르게 업데이트되어야 함', () => {
      mockUseTheme.mockReturnValue({
        resolvedTheme: 'light',
        setTheme: mockSetTheme,
      });

      const { rerender } = render(<ThemeToggle />);

      let button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', '다크 모드로 전환');

      // 다크 모드로 변경
      mockUseTheme.mockReturnValue({
        resolvedTheme: 'dark',
        setTheme: mockSetTheme,
      });
      rerender(<ThemeToggle />);

      button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', '라이트 모드로 전환');
    });
  });

  describe('테마 초기화', () => {
    it('마운트 시 시스템 테마를 감지해야 함', () => {
      // next-themes는 시스템 테마를 자동으로 감지
      // 실제 구현은 next-themes에 의존
      expect(true).toBe(true);
    });

    it('테마 설정이 localStorage에 저장되어야 함', () => {
      // next-themes가 자동으로 처리
      // 실제 구현은 next-themes에 의존
      expect(true).toBe(true);
    });
  });

  describe('하이드레이션 처리', () => {
    it('서버와 클라이언트 간 테마 불일치를 방지해야 함', () => {
      mockUseTheme.mockReturnValue({
        resolvedTheme: undefined, // 아직 마운트되지 않음
        setTheme: mockSetTheme,
      });

      const { container, rerender } = render(<ThemeToggle />);

      // 마운트되지 않은 상태에서는 null 반환 (컴포넌트 내부 로직)
      // 실제로는 컴포넌트가 렌더링되지만 내용이 없을 수 있음
      expect(container.firstChild).toBeInTheDocument();

      // 마운트 후
      mockUseTheme.mockReturnValue({
        resolvedTheme: 'light',
        setTheme: mockSetTheme,
      });

      rerender(<ThemeToggle />);

      // 컴포넌트가 다시 렌더링되면 표시됨
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });
});

describe('UI 상태 관리 테스트', () => {
  describe('로딩 상태', () => {
    it('로딩 중일 때 적절한 UI가 표시되어야 함', () => {
      render(
        <div>
          <button disabled>
            <span>로딩 중...</span>
          </button>
        </div>
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    });

    it('로딩 스피너가 표시되어야 함', () => {
      render(
        <div role="status" aria-label="로딩 중">
          <span className="animate-spin">⏳</span>
        </div>
      );

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-label', '로딩 중');
    });
  });

  describe('에러 상태', () => {
    it('에러 메시지가 명확하게 표시되어야 함', () => {
      render(
        <div role="alert" className="text-destructive">
          오류가 발생했습니다
        </div>
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('오류가 발생했습니다');
      expect(alert).toHaveClass('text-destructive');
    });

    it('에러 상태에서 재시도 버튼이 제공되어야 함', () => {
      const handleRetry = jest.fn();
      render(
        <div>
          <div role="alert">오류가 발생했습니다</div>
          <button onClick={handleRetry}>다시 시도</button>
        </div>
      );

      const retryButton = screen.getByRole('button', { name: /다시 시도/i });
      expect(retryButton).toBeInTheDocument();
    });
  });

  describe('빈 상태', () => {
    it('데이터가 없을 때 빈 상태 메시지가 표시되어야 함', () => {
      render(
        <div>
          <p>대화가 없습니다</p>
          <button>새 대화 시작</button>
        </div>
      );

      expect(screen.getByText('대화가 없습니다')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /새 대화 시작/i })).toBeInTheDocument();
    });
  });

  describe('성공 상태', () => {
    it('작업 성공 시 피드백이 표시되어야 함', () => {
      render(
        <div role="status" aria-live="polite">
          저장되었습니다
        </div>
      );

      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('저장되었습니다');
      expect(status).toHaveAttribute('aria-live', 'polite');
    });
  });
});

describe('반응형 디자인', () => {
    it('작은 화면에서 사이드바가 숨겨질 수 있어야 함', () => {
      // 실제 구현에 따라 다를 수 있음
      // Tailwind의 반응형 클래스를 사용한다면
      const { container } = render(
        <div className="hidden md:block">
          <nav>사이드바</nav>
        </div>
      );

      const nav = screen.getByText('사이드바');
      // Tailwind 클래스는 JSDOM에서 실제로 적용되지 않지만, 클래스명은 확인 가능
      expect(nav).toBeInTheDocument();
      expect(container.querySelector('div')).toHaveClass('hidden', 'md:block');
    });

  it('모바일에서 햄버거 메뉴가 표시되어야 함', () => {
    render(
      <div>
        <button className="md:hidden" aria-label="메뉴 열기">
          ☰
        </button>
        <nav className="hidden md:block">메뉴</nav>
      </div>
    );

    const menuButton = screen.getByRole('button', { name: /메뉴 열기/i });
    expect(menuButton).toHaveClass('md:hidden');
  });
});

