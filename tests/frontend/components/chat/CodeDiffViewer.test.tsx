/**
 * CodeDiffViewer 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CodeDiffViewer } from '@/components/chat/CodeDiffViewer';

describe('CodeDiffViewer', () => {
  const oldContent = 'line 1\nline 2\nline 3';
  const newContent = 'line 1\nmodified line 2\nline 3\nadded line 4';

  it('should render file path', () => {
    render(<CodeDiffViewer filePath="test.ts" oldContent={oldContent} newContent={newContent} />);

    expect(screen.getByText('test.ts')).toBeInTheDocument();
  });

  it('should show diff stats', () => {
    render(<CodeDiffViewer filePath="test.ts" oldContent={oldContent} newContent={newContent} />);

    // +1 added line, ~1 modified line
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('~1')).toBeInTheDocument();
  });

  it('should be expanded by default', () => {
    render(<CodeDiffViewer filePath="test.ts" oldContent={oldContent} newContent={newContent} />);

    expect(screen.getByText('line 1')).toBeInTheDocument();
    expect(screen.getByText('modified line 2')).toBeInTheDocument();
    expect(screen.getByText('line 3')).toBeInTheDocument();
    expect(screen.getByText('added line 4')).toBeInTheDocument();
  });

  it('should collapse when header is clicked', () => {
    render(<CodeDiffViewer filePath="test.ts" oldContent={oldContent} newContent={newContent} />);

    const header = screen.getByText('test.ts').closest('button');
    expect(header).toBeInTheDocument();

    fireEvent.click(header as HTMLElement);

    // Content should be hidden
    expect(screen.queryByText('line 1')).not.toBeInTheDocument();
    expect(screen.queryByText('modified line 2')).not.toBeInTheDocument();
  });

  it('should expand when header is clicked again', () => {
    render(<CodeDiffViewer filePath="test.ts" oldContent={oldContent} newContent={newContent} />);

    const header = screen.getByText('test.ts').closest('button');

    // Collapse
    fireEvent.click(header as HTMLElement);
    expect(screen.queryByText('line 1')).not.toBeInTheDocument();

    // Expand
    fireEvent.click(header as HTMLElement);
    expect(screen.getByText('line 1')).toBeInTheDocument();
  });

  it('should show all added lines', () => {
    const oldText = 'line 1';
    const newText = 'line 1\nline 2\nline 3';

    render(<CodeDiffViewer filePath="test.ts" oldContent={oldText} newContent={newText} />);

    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('should show all removed lines', () => {
    const oldText = 'line 1\nline 2\nline 3';
    const newText = 'line 1';

    render(<CodeDiffViewer filePath="test.ts" oldContent={oldText} newContent={newText} />);

    expect(screen.getByText('-2')).toBeInTheDocument();
  });

  it('should handle empty old content', () => {
    const newText = 'new line 1\nnew line 2';

    render(<CodeDiffViewer filePath="test.ts" oldContent="" newContent={newText} />);

    // Empty string becomes [""] when split, so 1 line will be modified and 1 added
    expect(screen.getByText('new line 1')).toBeInTheDocument();
    expect(screen.getByText('new line 2')).toBeInTheDocument();
  });

  it('should show unchanged lines without stats', () => {
    const sameContent = 'line 1\nline 2';

    render(<CodeDiffViewer filePath="test.ts" oldContent={sameContent} newContent={sameContent} />);

    // No stats should be shown
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/-/)).not.toBeInTheDocument();
    expect(screen.queryByText(/~/)).not.toBeInTheDocument();
  });

  it('should show accept button when onAccept is provided', () => {
    const onAccept = jest.fn();

    render(
      <CodeDiffViewer
        filePath="test.ts"
        oldContent={oldContent}
        newContent={newContent}
        onAccept={onAccept}
      />
    );

    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
  });

  it('should show reject button when onReject is provided', () => {
    const onReject = jest.fn();

    render(
      <CodeDiffViewer
        filePath="test.ts"
        oldContent={oldContent}
        newContent={newContent}
        onReject={onReject}
      />
    );

    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
  });

  it('should call onAccept when accept button is clicked', () => {
    const onAccept = jest.fn();

    render(
      <CodeDiffViewer
        filePath="test.ts"
        oldContent={oldContent}
        newContent={newContent}
        onAccept={onAccept}
      />
    );

    const acceptButton = screen.getByRole('button', { name: /accept/i });
    fireEvent.click(acceptButton);

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('should call onReject when reject button is clicked', () => {
    const onReject = jest.fn();

    render(
      <CodeDiffViewer
        filePath="test.ts"
        oldContent={oldContent}
        newContent={newContent}
        onReject={onReject}
      />
    );

    const rejectButton = screen.getByRole('button', { name: /reject/i });
    fireEvent.click(rejectButton);

    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('should not show action buttons when neither onAccept nor onReject is provided', () => {
    render(<CodeDiffViewer filePath="test.ts" oldContent={oldContent} newContent={newContent} />);

    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument();
  });

  it('should show both buttons when both handlers are provided', () => {
    const onAccept = jest.fn();
    const onReject = jest.fn();

    render(
      <CodeDiffViewer
        filePath="test.ts"
        oldContent={oldContent}
        newContent={newContent}
        onAccept={onAccept}
        onReject={onReject}
      />
    );

    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
  });

  it('should display line numbers', () => {
    const { container } = render(
      <CodeDiffViewer
        filePath="test.ts"
        oldContent="unique_a\nunique_b"
        newContent="unique_a\nunique_b"
      />
    );

    // Line numbers should be visible in the diff view
    const lineNumbers = container.querySelectorAll('.w-8.text-right');
    expect(lineNumbers.length).toBeGreaterThan(0);
  });

  it('should handle multi-line modified content', () => {
    const old = 'line 1\nline 2\nline 3\nline 4';
    const newer = 'modified 1\nmodified 2\nmodified 3\nmodified 4';

    render(<CodeDiffViewer filePath="test.ts" oldContent={old} newContent={newer} />);

    expect(screen.getByText('~4')).toBeInTheDocument();
  });
});
