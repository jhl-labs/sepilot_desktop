import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
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

// Mock dompurify
jest.mock('dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: jest.fn((html: string) => html),
  },
}));

// Mock clipboard utility
jest.mock('@/lib/utils/clipboard', () => ({
  copyToClipboard: jest.fn(() => Promise.resolve(true)),
}));

// Mock logger
jest.mock('@/lib/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import mermaid from 'mermaid';

describe('MermaidDiagram Strategy', () => {
  const mockRender = mermaid.render as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });
  });

  it('should use SYNTAX REPAIR strategy for first auto-fix attempt', async () => {
    // Arrange: mermaid.render always fails
    mockRender.mockRejectedValue(new Error('Rendering Failed'));

    const chatMock = jest
      .fn()
      .mockResolvedValueOnce({ success: true, data: { content: 'Fix 1' } })
      .mockResolvedValueOnce({ success: true, data: { content: 'Fix 2' } });

    const mockElectronAPI = {
      llm: { chat: chatMock },
    };
    (window as any).electronAPI = mockElectronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(true);

    // Act
    render(<MermaidDiagram chart="Initial Broken Chart" />);

    // Assert - Wait for first chat call (SYNTAX REPAIR strategy)
    await waitFor(
      () => {
        expect(chatMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 10000 }
    );

    const attempt1Args = chatMock.mock.calls[0][0][0].content;
    expect(attempt1Args).toContain('STRATEGY: SYNTAX REPAIR');

    // Wait for second render attempt (with Fix 1) and second chat call
    await waitFor(
      () => {
        expect(chatMock).toHaveBeenCalledTimes(2);
      },
      { timeout: 10000 }
    );

    const attempt2Args = chatMock.mock.calls[1][0][0].content;
    expect(attempt2Args).toContain('STRATEGY: SIMPLIFICATION');

    // Cleanup
    delete (window as any).electronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(false);
  }, 20000);
});
