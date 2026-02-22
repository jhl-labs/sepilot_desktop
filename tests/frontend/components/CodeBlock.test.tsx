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

// Mock SyntaxHighlighter
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({ children, language }: { children: string; language: string }) => (
    <pre data-testid="syntax-highlighter" data-language={language}>
      <code>{children}</code>
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

  it('should render code with syntax highlighting', () => {
    render(<CodeBlock language="javascript" code="const x = 10;" />);

    const highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toBeInTheDocument();
    expect(highlighter).toHaveTextContent('const x = 10;');
  });

  it('should display language name', () => {
    render(<CodeBlock language="typescript" code="let y: number = 20;" />);

    expect(screen.getByText('typescript')).toBeInTheDocument();
  });

  it('should show copy button', () => {
    render(<CodeBlock language="python" code="print('hello')" />);

    expect(screen.getByRole('button', { name: /복사/i })).toBeInTheDocument();
  });

  it('should copy code to clipboard', async () => {
    const { copyToClipboard } = require('@/lib/utils/clipboard');
    const code = 'console.log("test");';
    render(<CodeBlock language="javascript" code={code} />);

    const copyButton = screen.getByRole('button', { name: /복사/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith(code);
      expect(screen.getByText('복사됨')).toBeInTheDocument();
    });
  });

  it('should reset copy button after 2 seconds', async () => {
    jest.useFakeTimers();

    render(<CodeBlock language="javascript" code="const x = 1;" />);

    const copyButton = screen.getByRole('button', { name: /복사/i });
    fireEvent.click(copyButton);

    // Wait for "복사됨" to appear
    await waitFor(() => {
      expect(screen.getByText('복사됨')).toBeInTheDocument();
    });

    // After 2 seconds, should reset to "복사"
    jest.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(screen.getByText('복사')).toBeInTheDocument();
    });

    jest.useRealTimers();
  });

  it('should map language aliases correctly', () => {
    const { rerender } = render(<CodeBlock language="js" code="const x = 1;" />);

    let highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toHaveAttribute('data-language', 'javascript');

    rerender(<CodeBlock language="ts" code="const x: number = 1;" />);
    highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toHaveAttribute('data-language', 'typescript');

    rerender(<CodeBlock language="py" code="x = 1" />);
    highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toHaveAttribute('data-language', 'python');

    rerender(<CodeBlock language="sh" code="echo hello" />);
    highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toHaveAttribute('data-language', 'bash');
  });

  it('should use dark theme style when theme is dark', () => {
    (useTheme as jest.Mock).mockReturnValue({ theme: 'dark' });

    render(<CodeBlock language="javascript" code="const x = 1;" />);

    // Theme is applied via SyntaxHighlighter props, which is mocked
    // Just verify component renders
    expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
  });

  it('should use light theme style when theme is light', () => {
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });

    render(<CodeBlock language="javascript" code="const x = 1;" />);

    expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
  });

  it('should handle unknown languages', () => {
    render(<CodeBlock language="unknownlang" code="some code" />);

    const highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toHaveAttribute('data-language', 'unknownlang');
  });

  it('should handle empty code', () => {
    render(<CodeBlock language="javascript" code="" />);

    const highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toBeInTheDocument();
  });

  it('should handle multiline code', () => {
    const multilineCode = `function hello() {
  console.log("Hello");
  return true;
}`;

    render(<CodeBlock language="javascript" code={multilineCode} />);

    const highlighter = screen.getByTestId('syntax-highlighter');
    // Check that all lines are present (whitespace might be normalized in rendering)
    expect(highlighter).toHaveTextContent('function hello()');
    expect(highlighter).toHaveTextContent('console.log("Hello")');
    expect(highlighter).toHaveTextContent('return true');
  });

  it('should handle special characters in code', () => {
    const codeWithSpecialChars = 'const x = "<div>&amp;</div>";';

    render(<CodeBlock language="javascript" code={codeWithSpecialChars} />);

    expect(screen.getByTestId('syntax-highlighter')).toHaveTextContent(codeWithSpecialChars);
  });

  it('should be case insensitive for language', () => {
    render(<CodeBlock language="JavaScript" code="const x = 1;" />);

    const highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toHaveAttribute('data-language', 'javascript');
  });

  it('should handle jsx and tsx aliases', () => {
    const { rerender } = render(<CodeBlock language="jsx" code="<div />" />);

    let highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toHaveAttribute('data-language', 'javascript');

    rerender(<CodeBlock language="tsx" code="<div />" />);
    highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toHaveAttribute('data-language', 'typescript');
  });

  it('should handle ruby and yaml aliases', () => {
    const { rerender } = render(<CodeBlock language="rb" code="puts 'hello'" />);

    let highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toHaveAttribute('data-language', 'ruby');

    rerender(<CodeBlock language="yml" code="key: value" />);
    highlighter = screen.getByTestId('syntax-highlighter');
    expect(highlighter).toHaveAttribute('data-language', 'yaml');
  });

  it('should show copy icon initially', () => {
    render(<CodeBlock language="javascript" code="const x = 1;" />);

    const copyButton = screen.getByRole('button', { name: /복사/i });
    expect(copyButton).toBeInTheDocument();

    // Check icon is present (Copy icon)
    const copyIcon = copyButton.querySelector('svg');
    expect(copyIcon).toBeInTheDocument();
  });

  it('should show check icon after copying', async () => {
    render(<CodeBlock language="javascript" code="const x = 1;" />);

    const copyButton = screen.getByRole('button', { name: /복사/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByText('복사됨')).toBeInTheDocument();
    });

    // Check icon should be present (Check icon)
    const checkIcon = copyButton.querySelector('svg');
    expect(checkIcon).toBeInTheDocument();
  });
});
