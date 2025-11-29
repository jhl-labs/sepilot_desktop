/**
 * CodeDiffViewer 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CodeDiffViewer } from '@/components/chat/CodeDiffViewer';

describe('CodeDiffViewer', () => {
  const oldContent = `function hello() {
  console.log("Hello");
  return true;
}`;

  const newContent = `function hello() {
  console.log("Hello World");
  console.log("Updated");
  return true;
}`;

  it('should render file path', () => {
    render(
      <CodeDiffViewer filePath="src/test.ts" oldContent={oldContent} newContent={newContent} />
    );

    expect(screen.getByText('src/test.ts')).toBeInTheDocument();
  });

  it('should show diff statistics', () => {
    render(
      <CodeDiffViewer filePath="src/test.ts" oldContent={oldContent} newContent={newContent} />
    );

    // Should show modified and added lines
    const stats = screen.getAllByText(/[~+]\d+/);
    expect(stats.length).toBeGreaterThan(0);
  });

  it('should display modified lines', () => {
    render(
      <CodeDiffViewer filePath="src/test.ts" oldContent={oldContent} newContent={newContent} />
    );

    expect(screen.getByText('console.log("Hello World");')).toBeInTheDocument();
    expect(screen.getByText('console.log("Updated");')).toBeInTheDocument();
  });

  it('should toggle expand/collapse', () => {
    render(
      <CodeDiffViewer filePath="src/test.ts" oldContent={oldContent} newContent={newContent} />
    );

    // Initially expanded - content should be visible
    expect(screen.getByText('console.log("Hello World");')).toBeInTheDocument();

    // Click to collapse
    const header = screen.getByText('src/test.ts');
    fireEvent.click(header);

    // Content should be hidden
    expect(screen.queryByText('console.log("Hello World");')).not.toBeInTheDocument();

    // Click to expand again
    fireEvent.click(header);

    // Content should be visible again
    expect(screen.getByText('console.log("Hello World");')).toBeInTheDocument();
  });

  it('should render Accept and Reject buttons when callbacks provided', () => {
    const onAccept = jest.fn();
    const onReject = jest.fn();

    render(
      <CodeDiffViewer
        filePath="src/test.ts"
        oldContent={oldContent}
        newContent={newContent}
        onAccept={onAccept}
        onReject={onReject}
      />
    );

    expect(screen.getByText('Accept')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
  });

  it('should call onAccept when Accept button clicked', () => {
    const onAccept = jest.fn();
    const onReject = jest.fn();

    render(
      <CodeDiffViewer
        filePath="src/test.ts"
        oldContent={oldContent}
        newContent={newContent}
        onAccept={onAccept}
        onReject={onReject}
      />
    );

    const acceptButton = screen.getByText('Accept');
    fireEvent.click(acceptButton);

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('should call onReject when Reject button clicked', () => {
    const onAccept = jest.fn();
    const onReject = jest.fn();

    render(
      <CodeDiffViewer
        filePath="src/test.ts"
        oldContent={oldContent}
        newContent={newContent}
        onAccept={onAccept}
        onReject={onReject}
      />
    );

    const rejectButton = screen.getByText('Reject');
    fireEvent.click(rejectButton);

    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('should not render buttons when callbacks not provided', () => {
    render(
      <CodeDiffViewer filePath="src/test.ts" oldContent={oldContent} newContent={newContent} />
    );

    expect(screen.queryByText('Accept')).not.toBeInTheDocument();
    expect(screen.queryByText('Reject')).not.toBeInTheDocument();
  });

  it('should handle added lines only', () => {
    const oldContent = 'line1\nline2';
    const newContent = 'line1\nline2\nline3\nline4';

    render(
      <CodeDiffViewer filePath="src/test.ts" oldContent={oldContent} newContent={newContent} />
    );

    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('line3')).toBeInTheDocument();
    expect(screen.getByText('line4')).toBeInTheDocument();
  });

  it('should handle removed lines only', () => {
    const oldContent = 'line1\nline2\nline3\nline4';
    const newContent = 'line1\nline2';

    render(
      <CodeDiffViewer filePath="src/test.ts" oldContent={oldContent} newContent={newContent} />
    );

    expect(screen.getByText('-2')).toBeInTheDocument();
  });

  it('should handle identical content', () => {
    const content = 'line1\nline2\nline3';

    render(<CodeDiffViewer filePath="src/test.ts" oldContent={content} newContent={content} />);

    // No diff stats should be shown
    expect(screen.queryByText(/\+\d+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/-\d+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/~\d+/)).not.toBeInTheDocument();
  });

  it('should handle empty old content (new file)', () => {
    const newContent = 'line1\nline2\nline3';

    render(<CodeDiffViewer filePath="src/test.ts" oldContent="" newContent={newContent} />);

    // Should show added lines
    expect(screen.getByText(/\+\d+/)).toBeInTheDocument();
    expect(screen.getByText('line1')).toBeInTheDocument();
  });

  it('should handle empty new content (deleted file)', () => {
    const oldContent = 'line1\nline2\nline3';

    render(<CodeDiffViewer filePath="src/test.ts" oldContent={oldContent} newContent="" />);

    // Should show removed lines
    expect(screen.getByText(/-\d+/)).toBeInTheDocument();
  });

  it('should show line numbers', () => {
    const oldContent = 'line1';
    const newContent = 'line1\nline2';

    render(
      <CodeDiffViewer filePath="src/test.ts" oldContent={oldContent} newContent={newContent} />
    );

    // Line numbers should be visible
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should apply correct CSS classes for diff types', () => {
    const oldContent = 'old line';
    const newContent = 'new line';

    const { container } = render(
      <CodeDiffViewer filePath="src/test.ts" oldContent={oldContent} newContent={newContent} />
    );

    // Modified line should have orange color class
    const modifiedLine = container.querySelector('.text-orange-600');
    expect(modifiedLine).toBeInTheDocument();
  });
});
