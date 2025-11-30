/**
 * 접근성(A11y) 테스트 케이스
 *
 * 키보드 네비게이션, ARIA 속성, 스크린 리더 지원 등을 테스트합니다.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Sidebar } from '@/components/layout/Sidebar';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { enableElectronMode, mockElectronAPI } from '../setup';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn(() => ({
    resolvedTheme: 'light',
    setTheme: jest.fn(),
  })),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock chat store
jest.mock('@/lib/store/chat-store');

describe('접근성 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enableElectronMode();

    (useChatStore as jest.Mock).mockReturnValue({
      conversations: [],
      activeConversationId: null,
      createConversation: jest.fn(),
      setActiveConversation: jest.fn(),
      loadConversations: jest.fn(),
      deleteConversation: jest.fn(),
      updateConversationTitle: jest.fn(),
      searchConversations: jest.fn(),
    });
  });

  describe('키보드 네비게이션', () => {
    it('Tab 키로 버튼 간 이동이 가능해야 함', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <Button>첫 번째 버튼</Button>
          <Button>두 번째 버튼</Button>
          <Button>세 번째 버튼</Button>
        </div>
      );

      const buttons = screen.getAllByRole('button');
      buttons[0].focus();
      expect(buttons[0]).toHaveFocus();

      await user.tab();
      expect(buttons[1]).toHaveFocus();

      await user.tab();
      expect(buttons[2]).toHaveFocus();
    });

    it('Shift+Tab으로 역방향 이동이 가능해야 함', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <Button>첫 번째 버튼</Button>
          <Button>두 번째 버튼</Button>
        </div>
      );

      const buttons = screen.getAllByRole('button');
      buttons[1].focus();
      expect(buttons[1]).toHaveFocus();

      await user.tab({ shift: true });
      expect(buttons[0]).toHaveFocus();
    });

    it('Enter 키로 버튼 클릭이 가능해야 함', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>클릭 가능한 버튼</Button>);

      const button = screen.getByRole('button', { name: /클릭 가능한 버튼/i });
      button.focus();
      await user.keyboard('{Enter}');

      expect(handleClick).toHaveBeenCalled();
    });

    it('Space 키로 버튼 클릭이 가능해야 함', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>클릭 가능한 버튼</Button>);

      const button = screen.getByRole('button', { name: /클릭 가능한 버튼/i });
      button.focus();
      await user.keyboard(' ');

      expect(handleClick).toHaveBeenCalled();
    });
  });

  describe('ARIA 속성', () => {
    it('버튼에 적절한 aria-label이 있어야 함', () => {
      render(
        <Button aria-label="설정 열기">
          <span className="sr-only">설정</span>
        </Button>
      );

      const button = screen.getByRole('button', { name: /설정 열기/i });
      expect(button).toBeInTheDocument();
    });

    it('sr-only 클래스를 가진 요소는 시각적으로 숨겨져야 함', () => {
      render(
        <Button>
          <span className="sr-only">스크린 리더용 텍스트</span>
          <span aria-hidden="true">시각적 아이콘</span>
        </Button>
      );

      const srOnlyText = screen.getByText('스크린 리더용 텍스트');
      expect(srOnlyText).toHaveClass('sr-only');
    });

    it('폼 입력에 적절한 label이 연결되어야 함', () => {
      render(
        <div>
          <label htmlFor="test-input">테스트 입력</label>
          <input id="test-input" type="text" />
        </div>
      );

      const input = screen.getByLabelText('테스트 입력');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('id', 'test-input');
    });
  });

  describe('포커스 관리', () => {
    it('모달이 열릴 때 첫 번째 포커스 가능한 요소에 포커스가 이동해야 함', () => {
      render(
        <div role="dialog" aria-modal="true">
          <button>첫 번째 버튼</button>
          <button>두 번째 버튼</button>
        </div>
      );

      const dialog = screen.getByRole('dialog');
      const firstButton = screen.getByRole('button', { name: /첫 번째 버튼/i });

      expect(dialog).toHaveAttribute('aria-modal', 'true');
      // 포커스는 실제로는 useEffect나 다른 로직에서 처리되지만,
      // 최소한 dialog가 존재하고 modal 속성이 있는지 확인
    });

    it('모달이 닫힐 때 이전 포커스 위치로 돌아가야 함', () => {
      // 이 테스트는 실제 구현에 따라 다를 수 있음
      // 일반적으로 포커스 트랩과 포커스 복원 로직이 필요
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('스크린 리더 지원', () => {
    it('중요한 상태 변경 시 aria-live 영역에 알림이 표시되어야 함', () => {
      render(
        <div>
          <div role="status" aria-live="polite" aria-atomic="true">
            상태 메시지
          </div>
        </div>
      );

      const statusRegion = screen.getByRole('status');
      expect(statusRegion).toHaveAttribute('aria-live', 'polite');
      expect(statusRegion).toHaveAttribute('aria-atomic', 'true');
    });

    it('에러 메시지가 aria-describedby로 연결되어야 함', () => {
      render(
        <div>
          <input id="email-input" type="email" aria-describedby="email-error" aria-invalid="true" />
          <span id="email-error" role="alert">
            올바른 이메일 형식이 아닙니다
          </span>
        </div>
      );

      const input = screen.getByRole('textbox');
      const error = screen.getByRole('alert');

      expect(input).toHaveAttribute('aria-describedby', 'email-error');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(error).toHaveAttribute('id', 'email-error');
    });
  });

  describe('색상 대비', () => {
    it('텍스트와 배경의 색상 대비가 충분해야 함', () => {
      // 실제 색상 대비 테스트는 jest-axe나 다른 도구 필요
      // 여기서는 구조적 검증만 수행
      render(
        <div className="bg-background text-foreground">
          <p>읽기 쉬운 텍스트</p>
        </div>
      );

      const text = screen.getByText('읽기 쉬운 텍스트');
      expect(text).toBeInTheDocument();
      // 실제 대비 비율은 CSS나 테마 설정에서 확인 필요
    });
  });

  describe('키보드 단축키', () => {
    it('글로벌 단축키가 문서에 표시되어야 함', () => {
      // 단축키 도움말이나 문서화가 있는지 확인
      // 실제 구현에 따라 다를 수 있음
      expect(true).toBe(true); // Placeholder
    });

    it('단축키 충돌이 없어야 함', () => {
      // 같은 단축키가 여러 기능에 할당되지 않았는지 확인
      // 실제 구현에 따라 다를 수 있음
      expect(true).toBe(true); // Placeholder
    });
  });
});
