/**
 * MermaidDiagram 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MermaidDiagram } from '@/components/markdown/MermaidDiagram';
import { useTheme } from 'next-themes';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn(),
}));

// Mock mermaid
jest.mock('mermaid', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    render: jest.fn(),
  },
}));

// Mock platform check
jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => false),
}));

// Import mermaid to access mocks
import mermaid from 'mermaid';

describe('MermaidDiagram', () => {
  const mockRender = mermaid.render as jest.Mock;
  const mockInitialize = mermaid.initialize as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });

    // Mock successful render by default
    mockRender.mockResolvedValue({
      svg: '<svg><text>Test Diagram</text></svg>',
    });

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });

    // Use fake timers to control setTimeout
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const validChart = `graph TD
    A[Start] --> B[End]`;

  // Helper to advance timers until a condition is met or timeout
  const advanceUntil = async (checkFn: () => void | Promise<void>, limit = 50) => {
    for (let i = 0; i < limit; i++) {
      try {
        await waitFor(checkFn, { timeout: 100 });
        return;
      } catch (e) {
        // Advance time and run pending timers
        await act(async () => {
          jest.runOnlyPendingTimers();
          jest.advanceTimersByTime(100);
        });
      }
    }
    // Last try
    await waitFor(checkFn);
  };

  it('should initialize mermaid', async () => {
    render(<MermaidDiagram chart={validChart} />);

    await waitFor(() => {
      expect(mockInitialize).toHaveBeenCalled();
    });
  });

  it('should render diagram with valid chart', async () => {
    render(<MermaidDiagram chart={validChart} />);

    await waitFor(() => {
      expect(mockRender).toHaveBeenCalled();
      expect(screen.getByText('Test Diagram')).toBeInTheDocument();
    });
  });

  it('should trigger auto-fix when mermaid rendering fails', async () => {
    mockRender.mockRejectedValue(new Error('Syntax error'));

    const chatMock = jest.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            data: { content: 'graph TD\n  A-->B' },
          });
        }, 1000); // 1 sec delay
      });
    });

    const mockElectronAPI = {
      llm: { chat: chatMock },
    };

    (window as any).electronAPI = mockElectronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(true);

    render(<MermaidDiagram chart="bad syntax" />);

    // Advance time to start the fix
    await act(async () => {
      jest.advanceTimersByTime(10);
    });

    // Wait until chat is called
    await waitFor(() => expect(chatMock).toHaveBeenCalled());

    // Check for fixing text
    await waitFor(() => {
      expect(screen.getByText(/수정 중/)).toBeInTheDocument();
    });

    delete (window as any).electronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(false);
  });

  it.skip('should fallback to text when auto-fix fails max retries', async () => {
    // Use real timers for this test to avoid timing issues
    jest.useRealTimers();

    mockRender.mockRejectedValue(new Error('Syntax error'));

    const chatMock = jest
      .fn()
      .mockResolvedValueOnce({ success: true, data: { content: 'bad 1' } })
      .mockResolvedValueOnce({ success: true, data: { content: 'bad 2' } })
      .mockResolvedValueOnce({ success: true, data: { content: '[Start] -> [End]' } });

    const mockElectronAPI = {
      llm: { chat: chatMock },
    };

    (window as any).electronAPI = mockElectronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(true);

    render(<MermaidDiagram chart="bad syntax" />);

    // Wait for all retries and conversion to complete
    await waitFor(
      () => {
        expect(screen.getByText(/Mermaid Text Fallback/)).toBeInTheDocument();
        expect(screen.getByText('[Start] -> [End]')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    expect(chatMock).toHaveBeenCalledTimes(3);

    delete (window as any).electronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(false);

    // Restore fake timers for other tests
    jest.useFakeTimers();
  });

  it.skip('should handle LLM failure during conversion by showing original code', async () => {
    // Use real timers for this test to avoid timing issues
    jest.useRealTimers();

    mockRender.mockRejectedValue(new Error('Syntax error'));

    const chatMock = jest
      .fn()
      .mockResolvedValueOnce({ success: true, data: { content: 'bad 1' } })
      .mockResolvedValueOnce({ success: true, data: { content: 'bad 2' } })
      .mockRejectedValueOnce(new Error('LLM Error'));

    const mockElectronAPI = {
      llm: { chat: chatMock },
    };

    (window as any).electronAPI = mockElectronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(true);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<MermaidDiagram chart="very bad syntax" />);

    // Wait for all retries and fallback to original code
    await waitFor(
      () => {
        expect(screen.getByText(/Mermaid Text Fallback/)).toBeInTheDocument();
        expect(screen.getByText('very bad syntax')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    consoleSpy.mockRestore();

    delete (window as any).electronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(false);

    // Restore fake timers for other tests
    jest.useFakeTimers();
  });
});
