/**
 * CodeBlock 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CodeBlock } from '@/components/markdown/CodeBlock';
import { useTheme } from 'next-themes';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn(),
}));

// Mock react-syntax-highlighter
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({ children, language }: { children: string; language: string }) => (
    <pre data-testid="syntax-highlighter" data-language={language}>
      {children}
    </pre>
  ),
}));

jest.mock('react-syntax-highlighter/dist/cjs/styles/prism', () => ({
  oneDark: {},
  oneLight: {},
}));

// Mock clipboard utility
jest.mock('@/lib/utils/clipboard', () => ({
  copyToClipboard: jest.fn(() => Promise.resolve(true)),
}));

// Mock platform check
jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => false),
}));

// Mock sonner
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CodeBlock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });
  });

  it('should render code block with language label', () => {
    render(<CodeBlock language="javascript" code="console.log('Hello');" />);

    expect(screen.getByText('javascript')).toBeInTheDocument();
    expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
  });

  it('should display the code content', () => {
    const code = "const foo = 'bar';";
    render(<CodeBlock language="typescript" code={code} />);

    expect(screen.getByText(code)).toBeInTheDocument();
  });

  it('should show copy button', () => {
    render(<CodeBlock language="python" code="print('Hello')" />);

    const copyButton = screen.getByRole('button', { name: /복사/ });
    expect(copyButton).toBeInTheDocument();
  });

  it('should copy code to clipboard', async () => {
    const { copyToClipboard } = require('@/lib/utils/clipboard');
    const code = 'function test() { return true; }';
    render(<CodeBlock language="javascript" code={code} />);

    const copyButton = screen.getByRole('button', { name: /복사/ });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith(code);
      expect(screen.getByRole('button', { name: /복사됨/ })).toBeInTheDocument();
    });
  });

  it('should reset copy state after 2 seconds', async () => {
    jest.useFakeTimers();
    const code = 'test code';
    render(<CodeBlock language="python" code={code} />);

    const copyButton = screen.getByRole('button', { name: /복사/ });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /복사됨/ })).toBeInTheDocument();
    });

    jest.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /복사/ })).toBeInTheDocument();
    });

    jest.useRealTimers();
  });

  it('should normalize language aliases', () => {
    const { container } = render(<CodeBlock language="js" code="console.log('test');" />);

    // The component should normalize 'js' to 'javascript'
    const highlighter = container.querySelector('[data-language="javascript"]');
    expect(highlighter).toBeInTheDocument();
  });

  it('should handle typescript alias', () => {
    const { container } = render(<CodeBlock language="ts" code="const x: string = 'test';" />);

    const highlighter = container.querySelector('[data-language="typescript"]');
    expect(highlighter).toBeInTheDocument();
  });

  it('should use dark theme when theme is dark', () => {
    (useTheme as jest.Mock).mockReturnValue({ theme: 'dark' });

    render(<CodeBlock language="javascript" code="const x = 1;" />);

    // Component should render successfully with dark theme
    expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
  });

  it('should use light theme when theme is light', () => {
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });

    render(<CodeBlock language="javascript" code="const x = 1;" />);

    // Component should render successfully with light theme
    expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
  });

  it('should handle empty code', () => {
    render(<CodeBlock language="javascript" code="" />);

    const highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toBeInTheDocument();
    expect(highlighter).toHaveTextContent('');
  });

  it('should handle multiline code', () => {
    const multilineCode = `function hello() {
  console.log('Hello');
  return true;
}`;

    render(<CodeBlock language="javascript" code={multilineCode} />);

    const highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toBeInTheDocument();
    expect(highlighter).toHaveTextContent('function hello()');
    expect(highlighter).toHaveTextContent('console.log');
  });

  it('should display language name in header', () => {
    render(<CodeBlock language="Python" code="print('test')" />);

    // Language name should be displayed as-is (not normalized in the header)
    expect(screen.getByText('Python')).toBeInTheDocument();
  });
});
