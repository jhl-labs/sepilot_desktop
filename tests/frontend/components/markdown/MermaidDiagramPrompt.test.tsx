/**
 * MermaidDiagram Prompt Content Test
 * Verifies that the correct repair strategies are sent to the LLM
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
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

// Import mermaid to access mocks
import mermaid from 'mermaid';

describe('MermaidDiagram Recovery Prompts', () => {
  const mockRender = mermaid.render as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });
  });

  it('should use SYNTAX REPAIR strategy for first attempt', async () => {
    mockRender.mockRejectedValue(new Error('Syntax error'));

    const chatMock = jest.fn().mockResolvedValue({
      success: true,
      data: { content: 'graph TD\n  A-->B' },
    });

    const mockElectronAPI = {
      llm: { chat: chatMock },
    };

    (window as any).electronAPI = mockElectronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(true);

    render(<MermaidDiagram chart="broken chart" />);

    // Wait until chat is called
    await waitFor(() => expect(chatMock).toHaveBeenCalled(), { timeout: 10000 });

    // Check the prompt content for the first attempt
    const firstCallArgs = chatMock.mock.calls[0];
    const messages = firstCallArgs[0];
    const prompt = messages[0].content;

    expect(prompt).toContain('STRATEGY: SYNTAX REPAIR');
    expect(prompt).toContain('Check for unescaped special characters');
    expect(prompt).toContain('BROKEN CODE:');
    expect(prompt).toContain('broken chart');

    delete (window as any).electronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(false);
  }, 15000);

  it('should use SIMPLIFICATION strategy for second attempt', async () => {
    mockRender.mockRejectedValue(new Error('Syntax error'));

    const chatMock = jest
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: { content: 'still broken' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { content: 'simplified graph' },
      });

    const mockElectronAPI = {
      llm: { chat: chatMock },
    };

    (window as any).electronAPI = mockElectronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(true);

    render(<MermaidDiagram chart="very broken chart" />);

    // Wait for second chat call
    await waitFor(() => expect(chatMock).toHaveBeenCalledTimes(2), { timeout: 10000 });

    // Check the prompt content for the SECOND attempt
    const secondCallArgs = chatMock.mock.calls[1];
    const messages = secondCallArgs[0];
    const prompt = messages[0].content;

    expect(prompt).toContain('STRATEGY: SIMPLIFICATION');
    expect(prompt).toContain('Previous fix attempts that FAILED');
    expect(prompt).toContain('still broken');
    expect(prompt).toContain('SIMPLIFY the diagram');

    delete (window as any).electronAPI;
    (require('@/lib/platform').isElectron as jest.Mock).mockReturnValue(false);
  }, 20000);
});
