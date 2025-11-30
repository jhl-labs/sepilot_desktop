/**
 * BrowserAgentLog 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserAgentLog } from '@/components/browser/BrowserAgentLog';
import { useChatStore } from '@/lib/store/chat-store';
import type { BrowserAgentLogEntry } from '@/types/browser-agent';

// Mock chat store
jest.mock('@/lib/store/chat-store');

describe('BrowserAgentLog', () => {
  const mockSetShowBrowserAgentLogs = jest.fn();
  const mockClearBrowserAgentLogs = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useChatStore as unknown as jest.Mock).mockReturnValue({
      browserAgentLogs: [],
      browserAgentIsRunning: false,
      showBrowserAgentLogs: false,
      setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
      clearBrowserAgentLogs: mockClearBrowserAgentLogs,
    });
  });

  describe('Collapsed State', () => {
    it('should render collapsed button when showBrowserAgentLogs is false', () => {
      render(<BrowserAgentLog />);

      expect(screen.getByText('Agent 로그')).toBeInTheDocument();
      expect(screen.getByText('0개')).toBeInTheDocument();
    });

    it('should expand when collapsed button is clicked', () => {
      render(<BrowserAgentLog />);

      const expandButton = screen.getByText('Agent 로그').closest('button');
      fireEvent.click(expandButton!);

      expect(mockSetShowBrowserAgentLogs).toHaveBeenCalledWith(true);
    });

    it('should show running indicator when agent is running in collapsed state', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [],
        browserAgentIsRunning: true,
        showBrowserAgentLogs: false,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      const { container } = render(<BrowserAgentLog />);

      const runningIndicator = container.querySelector('.animate-pulse');
      expect(runningIndicator).toBeInTheDocument();
    });

    it('should display log count in collapsed state', () => {
      const mockLogs: BrowserAgentLogEntry[] = [
        {
          id: '1',
          timestamp: Date.now(),
          phase: 'thinking',
          level: 'info',
          message: 'Test log 1',
        },
        {
          id: '2',
          timestamp: Date.now(),
          phase: 'tool_call',
          level: 'info',
          message: 'Test log 2',
        },
      ];

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: mockLogs,
        browserAgentIsRunning: false,
        showBrowserAgentLogs: false,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      render(<BrowserAgentLog />);

      expect(screen.getByText('2개')).toBeInTheDocument();
    });
  });

  describe('Expanded State', () => {
    beforeEach(() => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });
    });

    it('should render expanded panel when showBrowserAgentLogs is true', () => {
      render(<BrowserAgentLog />);

      expect(screen.getByText('Agent 실행 로그')).toBeInTheDocument();
    });

    it('should show running indicator when agent is running in expanded state', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [],
        browserAgentIsRunning: true,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      render(<BrowserAgentLog />);

      expect(screen.getByText('실행 중')).toBeInTheDocument();
    });

    it('should show empty message when no logs', () => {
      render(<BrowserAgentLog />);

      expect(screen.getByText('Agent 실행 로그가 여기에 표시됩니다')).toBeInTheDocument();
    });

    it('should collapse when collapse button is clicked', () => {
      render(<BrowserAgentLog />);

      const collapseButton = screen.getByTitle('축소');
      fireEvent.click(collapseButton);

      expect(mockSetShowBrowserAgentLogs).toHaveBeenCalledWith(false);
    });

    it('should clear logs when clear button is clicked', () => {
      render(<BrowserAgentLog />);

      const clearButton = screen.getByTitle('로그 지우기');
      fireEvent.click(clearButton);

      expect(mockClearBrowserAgentLogs).toHaveBeenCalled();
    });
  });

  describe('Log Entries - Thinking Phase', () => {
    it('should render thinking log entry', () => {
      const mockLog: BrowserAgentLogEntry = {
        id: '1',
        timestamp: Date.now(),
        phase: 'thinking',
        level: 'thinking',
        message: '사용자 요청 분석 중',
        details: {
          reasoning: '페이지 내용을 먼저 확인해야 함',
          iteration: 1,
          maxIterations: 5,
        },
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      render(<BrowserAgentLog />);

      expect(screen.getByText('🧠 사고 중')).toBeInTheDocument();
      expect(screen.getByText('사용자 요청 분석 중')).toBeInTheDocument();
      expect(screen.getByText('[1/5]')).toBeInTheDocument();
      expect(screen.getByText('💭 페이지 내용을 먼저 확인해야 함')).toBeInTheDocument();
    });
  });

  describe('Log Entries - Tool Call Phase', () => {
    it('should render tool call log entry', () => {
      const mockLog: BrowserAgentLogEntry = {
        id: '2',
        timestamp: Date.now(),
        phase: 'tool_call',
        level: 'info',
        message: 'get_page_content 도구 호출',
        details: {
          toolName: 'get_page_content',
          toolArgs: { selector: 'body' },
        },
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      render(<BrowserAgentLog />);

      expect(screen.getByText('🔧 도구 호출')).toBeInTheDocument();
      expect(screen.getByText('get_page_content 도구 호출')).toBeInTheDocument();
      expect(screen.getByText('get_page_content')).toBeInTheDocument();
    });
  });

  describe('Log Entries - Tool Result Phase', () => {
    it('should render tool result log entry', () => {
      const mockLog: BrowserAgentLogEntry = {
        id: '3',
        timestamp: Date.now(),
        phase: 'tool_result',
        level: 'success',
        message: '페이지 내용 가져오기 성공',
        details: {
          toolResult: '페이지 제목: Example Page\n내용: Hello World',
        },
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      render(<BrowserAgentLog />);

      expect(screen.getByText('✅ 도구 결과')).toBeInTheDocument();
      expect(screen.getByText('페이지 내용 가져오기 성공')).toBeInTheDocument();
      expect(screen.getByText('결과')).toBeInTheDocument();
    });

    it('should truncate long tool results', () => {
      const longResult = 'A'.repeat(600);
      const mockLog: BrowserAgentLogEntry = {
        id: '4',
        timestamp: Date.now(),
        phase: 'tool_result',
        level: 'success',
        message: '긴 결과',
        details: {
          toolResult: longResult,
        },
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      const { container } = render(<BrowserAgentLog />);

      const resultPre = container.querySelector('pre');
      expect(resultPre?.textContent).toContain('...');
    });
  });

  describe('Log Entries - Tool Error', () => {
    it('should render tool error log entry', () => {
      const mockLog: BrowserAgentLogEntry = {
        id: '5',
        timestamp: Date.now(),
        phase: 'error',
        level: 'error',
        message: '도구 실행 실패',
        details: {
          toolError: 'Network timeout',
        },
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      render(<BrowserAgentLog />);

      expect(screen.getByText('❌ 오류')).toBeInTheDocument();
      expect(screen.getByText('도구 실행 실패')).toBeInTheDocument();
      expect(screen.getByText('오류')).toBeInTheDocument();
      expect(screen.getByText('Network timeout')).toBeInTheDocument();
    });
  });

  describe('Log Entries - Decision Phase', () => {
    it('should render decision log entry with continue decision', () => {
      const mockLog: BrowserAgentLogEntry = {
        id: '6',
        timestamp: Date.now(),
        phase: 'decision',
        level: 'info',
        message: '다음 작업 결정',
        details: {
          decision: 'continue',
          nextAction: 'click_element',
        },
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      render(<BrowserAgentLog />);

      expect(screen.getByText('⚡ 결정')).toBeInTheDocument();
      expect(screen.getByText('다음 작업 결정')).toBeInTheDocument();
      expect(screen.getByText('계속 진행')).toBeInTheDocument();
      expect(screen.getByText('→ click_element')).toBeInTheDocument();
    });

    it('should render decision log entry with finish decision', () => {
      const mockLog: BrowserAgentLogEntry = {
        id: '7',
        timestamp: Date.now(),
        phase: 'decision',
        level: 'info',
        message: '작업 완료 결정',
        details: {
          decision: 'finish',
        },
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      render(<BrowserAgentLog />);

      expect(screen.getByText('⚡ 결정')).toBeInTheDocument();
      expect(screen.getByText('완료')).toBeInTheDocument();
    });
  });

  describe('Log Entries - Completion Phase', () => {
    it('should render completion log entry', () => {
      const mockLog: BrowserAgentLogEntry = {
        id: '8',
        timestamp: Date.now(),
        phase: 'completion',
        level: 'success',
        message: '작업이 성공적으로 완료되었습니다',
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      render(<BrowserAgentLog />);

      expect(screen.getByText('🎉 완료')).toBeInTheDocument();
      expect(screen.getByText('작업이 성공적으로 완료되었습니다')).toBeInTheDocument();
    });
  });

  describe('Log Entry Styling', () => {
    it('should apply correct border color for info level', () => {
      const mockLog: BrowserAgentLogEntry = {
        id: '9',
        timestamp: Date.now(),
        phase: 'thinking',
        level: 'info',
        message: 'Info message',
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      const { container } = render(<BrowserAgentLog />);

      const logEntry = container.querySelector('.border-l-blue-500');
      expect(logEntry).toBeInTheDocument();
    });

    it('should apply correct border color for success level', () => {
      const mockLog: BrowserAgentLogEntry = {
        id: '10',
        timestamp: Date.now(),
        phase: 'completion',
        level: 'success',
        message: 'Success message',
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      const { container } = render(<BrowserAgentLog />);

      const logEntry = container.querySelector('.border-l-green-500');
      expect(logEntry).toBeInTheDocument();
    });

    it('should apply correct border color for warning level', () => {
      const mockLog: BrowserAgentLogEntry = {
        id: '11',
        timestamp: Date.now(),
        phase: 'thinking',
        level: 'warning',
        message: 'Warning message',
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      const { container } = render(<BrowserAgentLog />);

      const logEntry = container.querySelector('.border-l-yellow-500');
      expect(logEntry).toBeInTheDocument();
    });

    it('should apply correct border color for error level', () => {
      const mockLog: BrowserAgentLogEntry = {
        id: '12',
        timestamp: Date.now(),
        phase: 'error',
        level: 'error',
        message: 'Error message',
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      const { container } = render(<BrowserAgentLog />);

      const logEntry = container.querySelector('.border-l-red-500');
      expect(logEntry).toBeInTheDocument();
    });

    it('should apply correct border color for thinking level', () => {
      const mockLog: BrowserAgentLogEntry = {
        id: '13',
        timestamp: Date.now(),
        phase: 'thinking',
        level: 'thinking',
        message: 'Thinking message',
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      const { container } = render(<BrowserAgentLog />);

      const logEntry = container.querySelector('.border-l-purple-500');
      expect(logEntry).toBeInTheDocument();
    });
  });

  describe('Multiple Log Entries', () => {
    it('should render multiple log entries', () => {
      const mockLogs: BrowserAgentLogEntry[] = [
        {
          id: '1',
          timestamp: Date.now(),
          phase: 'thinking',
          level: 'thinking',
          message: 'First log',
        },
        {
          id: '2',
          timestamp: Date.now(),
          phase: 'tool_call',
          level: 'info',
          message: 'Second log',
        },
        {
          id: '3',
          timestamp: Date.now(),
          phase: 'completion',
          level: 'success',
          message: 'Third log',
        },
      ];

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: mockLogs,
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      render(<BrowserAgentLog />);

      expect(screen.getByText('First log')).toBeInTheDocument();
      expect(screen.getByText('Second log')).toBeInTheDocument();
      expect(screen.getByText('Third log')).toBeInTheDocument();
    });
  });

  describe('Default Cases Coverage', () => {
    it('should handle unknown phase with default icon and label', () => {
      const mockLog = {
        id: '14',
        timestamp: Date.now(),
        phase: 'unknown_phase' as any,
        level: 'info',
        message: 'Unknown phase message',
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      render(<BrowserAgentLog />);

      expect(screen.getByText('📝 로그')).toBeInTheDocument();
      expect(screen.getByText('Unknown phase message')).toBeInTheDocument();
    });

    it('should handle unknown level with default color', () => {
      const mockLog = {
        id: '15',
        timestamp: Date.now(),
        phase: 'thinking',
        level: 'unknown_level' as any,
        message: 'Unknown level message',
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      const { container } = render(<BrowserAgentLog />);

      const logEntry = container.querySelector('.border-l-gray-500');
      expect(logEntry).toBeInTheDocument();
    });

    it('should handle unknown phase icon with default AlertCircle', () => {
      const mockLog = {
        id: '16',
        timestamp: Date.now(),
        phase: 'invalid_phase' as any,
        level: 'info',
        message: 'Invalid phase',
      };

      (useChatStore as unknown as jest.Mock).mockReturnValue({
        browserAgentLogs: [mockLog],
        browserAgentIsRunning: false,
        showBrowserAgentLogs: true,
        setShowBrowserAgentLogs: mockSetShowBrowserAgentLogs,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
      });

      const { container } = render(<BrowserAgentLog />);

      // Default icon should be rendered (AlertCircle with gray color)
      const iconContainer = container.querySelector('.text-gray-600');
      expect(iconContainer).toBeInTheDocument();
    });
  });
});
