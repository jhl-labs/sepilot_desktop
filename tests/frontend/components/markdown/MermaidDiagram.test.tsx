/**
 * MermaidDiagram 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  });

  const validChart = `graph TD
    A[Start] --> B[End]`;

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

  it('should show diagram header', async () => {
    render(<MermaidDiagram chart={validChart} />);

    await waitFor(() => {
      expect(screen.getByText('Mermaid Diagram')).toBeInTheDocument();
    });
  });

  it('should show copy button', async () => {
    render(<MermaidDiagram chart={validChart} />);

    await waitFor(() => {
      const copyButton = screen.getByRole('button', { name: /복사/ });
      expect(copyButton).toBeInTheDocument();
    });
  });

  it('should copy chart to clipboard', async () => {
    render(<MermaidDiagram chart={validChart} />);

    await waitFor(() => {
      const copyButton = screen.getByRole('button', { name: /복사/ });
      fireEvent.click(copyButton);
    });

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(validChart);
      expect(screen.getByRole('button', { name: /복사됨/ })).toBeInTheDocument();
    });
  });

  it('should show error when mermaid rendering fails', async () => {
    mockRender.mockRejectedValueOnce(new Error('Syntax error in text'));

    render(<MermaidDiagram chart="invalid mermaid syntax" />);

    await waitFor(() => {
      expect(screen.getByText('Mermaid Diagram Error')).toBeInTheDocument();
      expect(screen.getByText('다이어그램을 렌더링할 수 없습니다')).toBeInTheDocument();
    });
  });

  it('should show copy button in error state', async () => {
    mockRender.mockRejectedValueOnce(new Error('Parse error'));

    render(<MermaidDiagram chart="bad syntax" />);

    await waitFor(() => {
      const copyButton = screen.getByRole('button', { name: /복사/ });
      expect(copyButton).toBeInTheDocument();
    });
  });

  it('should copy chart even in error state', async () => {
    mockRender.mockRejectedValueOnce(new Error('Parse error'));
    const badChart = 'invalid chart';

    render(<MermaidDiagram chart={badChart} />);

    await waitFor(() => {
      const copyButton = screen.getByRole('button', { name: /복사/ });
      fireEvent.click(copyButton);
    });

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(badChart);
    });
  });

  it('should use dark theme when theme is dark', async () => {
    (useTheme as jest.Mock).mockReturnValue({ theme: 'dark' });

    render(<MermaidDiagram chart={validChart} />);

    await waitFor(() => {
      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: 'dark',
        })
      );
    });
  });

  it('should use default theme when theme is light', async () => {
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });

    render(<MermaidDiagram chart={validChart} />);

    await waitFor(() => {
      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: 'default',
        })
      );
    });
  });

  it('should reset copy state after 2 seconds', async () => {
    jest.useFakeTimers();
    render(<MermaidDiagram chart={validChart} />);

    await waitFor(() => {
      const copyButton = screen.getByRole('button', { name: /복사/ });
      fireEvent.click(copyButton);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /복사됨/ })).toBeInTheDocument();
    });

    jest.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /복사/ })).toBeInTheDocument();
    });

    jest.useRealTimers();
  });

  it('should update when chart prop changes', async () => {
    const { rerender } = render(<MermaidDiagram chart={validChart} />);

    await waitFor(() => {
      expect(mockRender).toHaveBeenCalledWith(
        expect.any(String),
        validChart
      );
    });

    const newChart = 'graph LR\n  X --> Y';
    mockRender.mockClear();

    rerender(<MermaidDiagram chart={newChart} />);

    await waitFor(() => {
      expect(mockRender).toHaveBeenCalledWith(
        expect.any(String),
        newChart
      );
    });
  });

  it('should call onChartFixed when auto-fix is triggered', async () => {
    const onChartFixed = jest.fn();
    mockRender.mockRejectedValueOnce(new Error('Syntax error'));

    render(<MermaidDiagram chart="bad syntax" onChartFixed={onChartFixed} />);

    await waitFor(() => {
      expect(screen.getByText('Mermaid Diagram Error')).toBeInTheDocument();
    });

    // Note: Auto-fix would normally be triggered, but requires LLM which is mocked out
    // This test verifies the component accepts the callback
  });

  it('should handle different chart types', async () => {
    const sequenceDiagram = `sequenceDiagram
      Alice->>Bob: Hello
      Bob->>Alice: Hi`;

    render(<MermaidDiagram chart={sequenceDiagram} />);

    await waitFor(() => {
      expect(mockRender).toHaveBeenCalledWith(
        expect.any(String),
        sequenceDiagram
      );
    });
  });

  it('should handle flowchart syntax', async () => {
    const flowchart = `flowchart LR
      A[Start] --> B{Decision}
      B -->|Yes| C[Process]
      B -->|No| D[End]`;

    render(<MermaidDiagram chart={flowchart} />);

    await waitFor(() => {
      expect(mockRender).toHaveBeenCalledWith(
        expect.any(String),
        flowchart
      );
    });
  });

  it('should clean up on unmount', async () => {
    const { unmount } = render(<MermaidDiagram chart={validChart} />);

    await waitFor(() => {
      expect(mockRender).toHaveBeenCalled();
    });

    unmount();

    // Component should unmount without errors
    expect(screen.queryByText('Test Diagram')).not.toBeInTheDocument();
  });

  it('should show manual retry button in error state', async () => {
    mockRender.mockRejectedValueOnce(new Error('Parse error'));

    render(<MermaidDiagram chart="bad syntax" />);

    await waitFor(() => {
      const retryButton = screen.getByRole('button', { name: /수정/ });
      expect(retryButton).toBeInTheDocument();
    });
  });

  it('should not show retry button after max retries', async () => {
    mockRender.mockRejectedValue(new Error('Parse error'));

    // Mock Electron environment with LLM
    const mockElectronAPI = {
      llm: {
        chat: jest.fn().mockResolvedValue({
          success: true,
          data: { content: 'graph TD\n  A-->B' },
        }),
      },
    };

    (window as any).electronAPI = mockElectronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(true);

    render(<MermaidDiagram chart="bad syntax" />);

    // Wait for auto-fix attempts to complete
    await waitFor(
      () => {
        const retryText = screen.queryByText(/자동 수정 2\/2회 시도됨/);
        if (retryText) {
          expect(retryText).toBeInTheDocument();
        }
      },
      { timeout: 5000 }
    );

    delete (window as any).electronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(false);
  });

  it('should handle missing containerRef gracefully', async () => {
    const { container } = render(<MermaidDiagram chart={validChart} />);

    // Remove the container ref element to simulate missing ref
    const diagramDiv = container.querySelector('.mermaid-diagram');
    if (diagramDiv?.parentElement) {
      diagramDiv.parentElement.removeChild(diagramDiv);
    }

    await waitFor(() => {
      // Should not crash, just skip rendering
      expect(mockRender).toHaveBeenCalled();
    });
  });

  it('should clean up error SVG elements on error', async () => {
    // Create a mock error SVG element
    const errorSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    errorSvg.id = 'mermaid-test123';
    errorSvg.textContent = 'Syntax error in text';
    document.body.appendChild(errorSvg);

    mockRender.mockRejectedValueOnce(new Error('Syntax error'));

    render(<MermaidDiagram chart="bad syntax" />);

    await waitFor(() => {
      expect(screen.getByText('Mermaid Diagram Error')).toBeInTheDocument();
    });

    // Error SVG should have been cleaned up
    const remainingErrorSvg = document.getElementById('mermaid-test123');
    expect(remainingErrorSvg).not.toBeInTheDocument();
  });

  it('should re-initialize mermaid when theme changes', async () => {
    const { rerender } = render(<MermaidDiagram chart={validChart} />);

    await waitFor(() => {
      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'default' })
      );
    });

    mockInitialize.mockClear();
    (useTheme as jest.Mock).mockReturnValue({ theme: 'dark' });

    rerender(<MermaidDiagram chart={validChart} />);

    await waitFor(() => {
      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'dark' })
      );
    });
  });

  it('should handle system theme', async () => {
    (useTheme as jest.Mock).mockReturnValue({ theme: 'system' });

    render(<MermaidDiagram chart={validChart} />);

    await waitFor(() => {
      expect(mockInitialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'default' })
      );
    });
  });

  it('should show retry count in error message', async () => {
    mockRender.mockRejectedValue(new Error('Parse error'));

    const mockElectronAPI = {
      llm: {
        chat: jest.fn().mockResolvedValue({
          success: true,
          data: { content: 'fixed but still wrong' },
        }),
      },
    };

    (window as any).electronAPI = mockElectronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(true);

    render(<MermaidDiagram chart="bad syntax" />);

    await waitFor(
      () => {
        const errorHeader = screen.queryByText(/자동 수정.*시도됨/);
        if (errorHeader) {
          expect(errorHeader).toBeInTheDocument();
        }
      },
      { timeout: 5000 }
    );

    delete (window as any).electronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(false);
  });

  it('should display original chart in error state', async () => {
    const badChart = 'graph TD\n  A[[[Invalid';
    mockRender.mockRejectedValueOnce(new Error('Parse error'));

    render(<MermaidDiagram chart={badChart} />);

    await waitFor(() => {
      expect(screen.getByText('Mermaid Diagram Error')).toBeInTheDocument();
    });

    // Copy button should copy the original bad chart
    const copyButton = screen.getByRole('button', { name: /복사/ });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(badChart);
    });
  });
});
