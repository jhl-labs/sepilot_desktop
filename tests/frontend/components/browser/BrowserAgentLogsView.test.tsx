/**
 * BrowserAgentLogsView 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { BrowserAgentLogsView } from '@/extensions/browser/components/BrowserAgentLogsView';
import { useExtensionStore } from '@sepilot/extension-sdk/store';
import type { BrowserAgentLogEntry } from '@/extensions/browser/types';

const mockUseExtensionStore = useExtensionStore as jest.Mock;

describe('BrowserAgentLogsView', () => {
  const mockClearBrowserAgentLogs = jest.fn();
  const mockSetBrowserViewMode = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty State', () => {
    beforeEach(() => {
      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });
    });

    it('should render empty state when no logs', () => {
      render(<BrowserAgentLogsView />);

      // i18n keys are displayed as-is in tests
      expect(screen.getByText('browser.agentLogs.emptyMessage')).toBeInTheDocument();
      expect(screen.getByText('browser.agentLogs.emptyHint')).toBeInTheDocument();
    });

    it('should render empty state icon', () => {
      const { container } = render(<BrowserAgentLogsView />);

      const icons = container.querySelectorAll('svg');
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe('Header', () => {
    beforeEach(() => {
      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });
    });

    it('should render header title', () => {
      render(<BrowserAgentLogsView />);

      expect(screen.getByText('browser.agentLogs.title')).toBeInTheDocument();
    });

    it('should render back button', () => {
      const { container } = render(<BrowserAgentLogsView />);

      // Back button is the first button in the header
      const backButton = container.querySelector('button');
      expect(backButton).toBeInTheDocument();
    });

    it('should call setBrowserViewMode when back button clicked', async () => {
      const user = userEvent.setup();
      const { container } = render(<BrowserAgentLogsView />);

      // Back button is the first button in the header
      const backButton = container.querySelector('button');
      await user.click(backButton as HTMLElement);

      expect(mockSetBrowserViewMode).toHaveBeenCalledWith('chat');
    });

    it('should render clear button', () => {
      render(<BrowserAgentLogsView />);

      const clearButton = screen.getByTitle('browser.agentLogs.clearAll');
      expect(clearButton).toBeInTheDocument();
    });

    it('should call clearBrowserAgentLogs when clear button clicked', async () => {
      const user = userEvent.setup();
      render(<BrowserAgentLogsView />);

      const clearButton = screen.getByTitle('browser.agentLogs.clearAll');
      await user.click(clearButton);

      expect(mockClearBrowserAgentLogs).toHaveBeenCalledTimes(1);
    });
  });

  describe('Running State', () => {
    it('should show running indicator when agent is running', () => {
      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [],
        browserAgentIsRunning: true,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      render(<BrowserAgentLogsView />);

      expect(screen.getByText('browser.agentLogs.running')).toBeInTheDocument();
    });

    it('should not show running indicator when agent is not running', () => {
      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      render(<BrowserAgentLogsView />);

      expect(screen.queryByText('browser.agentLogs.running')).not.toBeInTheDocument();
    });

    it('should show pulse animation when running', () => {
      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [],
        browserAgentIsRunning: true,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      const { container } = render(<BrowserAgentLogsView />);

      const pulseElement = container.querySelector('.animate-pulse');
      expect(pulseElement).toBeInTheDocument();
    });
  });

  describe('Log Entries', () => {
    const mockLogs: BrowserAgentLogEntry[] = [
      {
        id: 'log-1',
        timestamp: Date.now(),
        phase: 'thinking',
        level: 'thinking',
        message: 'Analyzing the page',
        details: {
          reasoning: 'Looking for the submit button',
          iteration: 1,
          maxIterations: 5,
        },
      },
      {
        id: 'log-2',
        timestamp: Date.now(),
        phase: 'tool_call',
        level: 'info',
        message: 'Calling tool',
        details: {
          toolName: 'click_element',
          toolArgs: { selector: 'button[type="submit"]' },
        },
      },
      {
        id: 'log-3',
        timestamp: Date.now(),
        phase: 'tool_result',
        level: 'success',
        message: 'Tool executed successfully',
        details: {
          toolResult: 'Button clicked successfully',
        },
      },
    ];

    beforeEach(() => {
      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: mockLogs,
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });
    });

    it('should render all log entries', () => {
      render(<BrowserAgentLogsView />);

      expect(screen.getByText('Analyzing the page')).toBeInTheDocument();
      expect(screen.getByText('Calling tool')).toBeInTheDocument();
      expect(screen.getByText('Tool executed successfully')).toBeInTheDocument();
    });

    it('should display phase labels', () => {
      render(<BrowserAgentLogsView />);

      expect(screen.getByText('browser.agentLogs.phase.thinking')).toBeInTheDocument();
      expect(screen.getByText('browser.agentLogs.phase.toolCall')).toBeInTheDocument();
      expect(screen.getByText('browser.agentLogs.phase.toolResult')).toBeInTheDocument();
    });

    it('should display iteration info when available', () => {
      render(<BrowserAgentLogsView />);

      expect(screen.getByText('[1/5]')).toBeInTheDocument();
    });

    it('should display reasoning when available', () => {
      render(<BrowserAgentLogsView />);

      expect(screen.getByText(/Looking for the submit button/)).toBeInTheDocument();
    });

    it('should display tool name when available', () => {
      render(<BrowserAgentLogsView />);

      expect(screen.getByText('click_element')).toBeInTheDocument();
    });

    it('should display tool result when available', () => {
      render(<BrowserAgentLogsView />);

      expect(screen.getByText('Button clicked successfully')).toBeInTheDocument();
    });

    it('should display timestamps', () => {
      const { container } = render(<BrowserAgentLogsView />);

      const timestamps = container.querySelectorAll('.text-\\[10px\\]');
      expect(timestamps.length).toBeGreaterThan(0);
    });
  });

  describe('Log Entry Details', () => {
    it('should display tool error when present', () => {
      const errorLog: BrowserAgentLogEntry = {
        id: 'log-error',
        timestamp: Date.now(),
        phase: 'error',
        level: 'error',
        message: 'Tool execution failed',
        details: {
          toolError: 'Element not found',
        },
      };

      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [errorLog],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      render(<BrowserAgentLogsView />);

      expect(screen.getByText('Element not found')).toBeInTheDocument();
      expect(screen.getByText('browser.agentLogs.error')).toBeInTheDocument();
    });

    it('should display decision when present', () => {
      const decisionLog: BrowserAgentLogEntry = {
        id: 'log-decision',
        timestamp: Date.now(),
        phase: 'decision',
        level: 'info',
        message: 'Making decision',
        details: {
          decision: 'continue',
          nextAction: 'Scroll down to find more elements',
        },
      };

      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [decisionLog],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      render(<BrowserAgentLogsView />);

      expect(screen.getByText('browser.agentLogs.continue')).toBeInTheDocument();
      expect(screen.getByText(/Scroll down to find more elements/)).toBeInTheDocument();
    });

    it('should truncate long tool results', () => {
      const longResult = 'x'.repeat(1500);
      const longLog: BrowserAgentLogEntry = {
        id: 'log-long',
        timestamp: Date.now(),
        phase: 'tool_result',
        level: 'success',
        message: 'Long result',
        details: {
          toolResult: longResult,
        },
      };

      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [longLog],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      const { container } = render(<BrowserAgentLogsView />);

      const resultPre = container.querySelector('pre');
      expect(resultPre?.textContent).toContain('...');
    });

    it('should display completion phase', () => {
      const completionLog: BrowserAgentLogEntry = {
        id: 'log-complete',
        timestamp: Date.now(),
        phase: 'completion',
        level: 'success',
        message: 'Task completed',
      };

      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [completionLog],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      render(<BrowserAgentLogsView />);

      expect(screen.getByText('browser.agentLogs.phase.completion')).toBeInTheDocument();
    });
  });

  describe('Color Coding', () => {
    it('should apply correct color for info level', () => {
      const infoLog: BrowserAgentLogEntry = {
        id: 'log-info',
        timestamp: Date.now(),
        phase: 'thinking',
        level: 'info',
        message: 'Info message',
      };

      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [infoLog],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      const { container } = render(<BrowserAgentLogsView />);

      const logEntry = container.querySelector('.border-l-blue-500');
      expect(logEntry).toBeInTheDocument();
    });

    it('should apply correct color for success level', () => {
      const successLog: BrowserAgentLogEntry = {
        id: 'log-success',
        timestamp: Date.now(),
        phase: 'completion',
        level: 'success',
        message: 'Success message',
      };

      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [successLog],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      const { container } = render(<BrowserAgentLogsView />);

      const logEntry = container.querySelector('.border-l-green-500');
      expect(logEntry).toBeInTheDocument();
    });

    it('should apply correct color for error level', () => {
      const errorLog: BrowserAgentLogEntry = {
        id: 'log-error',
        timestamp: Date.now(),
        phase: 'error',
        level: 'error',
        message: 'Error message',
      };

      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [errorLog],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      const { container } = render(<BrowserAgentLogsView />);

      const logEntry = container.querySelector('.border-l-red-500');
      expect(logEntry).toBeInTheDocument();
    });
  });

  describe('Auto Scroll', () => {
    it('should have scrollable container', () => {
      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      const { container } = render(<BrowserAgentLogsView />);

      const scrollContainer = container.querySelector('.overflow-y-auto');
      expect(scrollContainer).toBeInTheDocument();
    });
  });

  describe('Default Cases', () => {
    it('should handle unknown log level with default styles', () => {
      const unknownLevelLog: BrowserAgentLogEntry = {
        id: 'unknown-1',
        timestamp: Date.now(),
        level: 'unknown' as any, // Unknown level
        phase: 'thinking',
        message: 'Unknown level log',
      };

      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [unknownLevelLog],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      const { container } = render(<BrowserAgentLogsView />);

      const logEntry = container.querySelector('.border-l-gray-500');
      expect(logEntry).toBeInTheDocument();
    });

    it('should handle unknown phase with default label', () => {
      const unknownPhaseLog: BrowserAgentLogEntry = {
        id: 'unknown-2',
        timestamp: Date.now(),
        level: 'info',
        phase: 'unknown' as any, // Unknown phase
        message: 'Unknown phase log',
      };

      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [unknownPhaseLog],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      render(<BrowserAgentLogsView />);

      expect(screen.getByText('browser.agentLogs.phase.log')).toBeInTheDocument();
    });

    it('should handle default icon for unknown level', () => {
      const defaultIconLog: BrowserAgentLogEntry = {
        id: 'default-icon-1',
        timestamp: Date.now(),
        level: 'unknown' as any,
        phase: 'thinking',
        message: 'Default icon test',
      };

      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [defaultIconLog],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      const { container } = render(<BrowserAgentLogsView />);

      // Default icon is AlertCircle - check for SVG element
      const svgIcons = container.querySelectorAll('svg');
      expect(svgIcons.length).toBeGreaterThan(0);
    });

    it('should handle warning level with yellow border', () => {
      const warningLog: BrowserAgentLogEntry = {
        id: 'warning-1',
        timestamp: Date.now(),
        level: 'warning',
        phase: 'thinking',
        message: 'Warning message',
      };

      mockUseExtensionStore.mockReturnValue({
        browserAgentLogs: [warningLog],
        browserAgentIsRunning: false,
        clearBrowserAgentLogs: mockClearBrowserAgentLogs,
        setBrowserViewMode: mockSetBrowserViewMode,
      });

      const { container } = render(<BrowserAgentLogsView />);

      const logEntry = container.querySelector('.border-l-yellow-500');
      expect(logEntry).toBeInTheDocument();
    });
  });
});
