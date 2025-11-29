/**
 * MarkdownRenderer 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';

// Mock CodeBlock component
jest.mock('@/components/markdown/CodeBlock', () => ({
  CodeBlock: ({ language, code }: { language: string; code: string }) => (
    <pre data-testid="code-block" data-language={language}>
      <code>{code}</code>
    </pre>
  ),
}));

// Mock MermaidDiagram component
jest.mock('@/components/markdown/MermaidDiagram', () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => (
    <div data-testid="mermaid-diagram">{chart}</div>
  ),
}));

// Mock PlotlyChart component
jest.mock('@/components/markdown/PlotlyChart', () => ({
  PlotlyChart: ({ data }: { data: string }) => (
    <div data-testid="plotly-chart">{data}</div>
  ),
}));

describe('MarkdownRenderer', () => {
  it('should render plain text', () => {
    render(<MarkdownRenderer content="Hello World" />);

    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('should render bold text', () => {
    render(<MarkdownRenderer content="This is **bold** text" />);

    const boldElement = screen.getByText('bold');
    expect(boldElement.tagName).toBe('STRONG');
  });

  it('should render italic text', () => {
    render(<MarkdownRenderer content="This is *italic* text" />);

    const italicElement = screen.getByText('italic');
    expect(italicElement.tagName).toBe('EM');
  });

  it('should render links', () => {
    render(<MarkdownRenderer content="[Google](https://google.com)" />);

    const link = screen.getByRole('link', { name: 'Google' });
    expect(link).toHaveAttribute('href', 'https://google.com');
  });

  it('should render headings', () => {
    const content = `# Heading 1

## Heading 2

### Heading 3`;
    render(<MarkdownRenderer content={content} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Heading 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Heading 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Heading 3' })).toBeInTheDocument();
  });

  it('should render lists', () => {
    const content = `- Item 1
- Item 2
- Item 3`;
    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();
  });

  it('should render numbered lists', () => {
    const content = `1. First
2. Second
3. Third`;
    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
  });

  it('should render code blocks', () => {
    const codeContent = ['```javascript', 'const x = 10;', '```'].join('\n');
    const { container } = render(<MarkdownRenderer content={codeContent} />);

    // Check that code is rendered with javascript language class
    const codeElement = container.querySelector('code.lang-javascript, code.language-javascript');
    expect(codeElement).toBeInTheDocument();
    expect(screen.getByText('const x = 10;')).toBeInTheDocument();
  });

  it('should render inline code', () => {
    render(<MarkdownRenderer content="This is `inline code` example" />);

    const codeElement = screen.getByText('inline code');
    expect(codeElement.tagName).toBe('CODE');
  });

  it('should render blockquotes', () => {
    render(<MarkdownRenderer content="> This is a quote" />);

    const quote = screen.getByText('This is a quote');
    expect(quote.parentElement?.tagName).toBe('BLOCKQUOTE');
  });

  it('should render tables', () => {
    const tableContent = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;

    render(<MarkdownRenderer content={tableContent} />);

    expect(screen.getByText('Header 1')).toBeInTheDocument();
    expect(screen.getByText('Header 2')).toBeInTheDocument();
    expect(screen.getByText('Cell 1')).toBeInTheDocument();
    expect(screen.getByText('Cell 2')).toBeInTheDocument();
  });

  it('should render horizontal rules', () => {
    const { container } = render(<MarkdownRenderer content="---" />);

    const hr = container.querySelector('hr');
    expect(hr).toBeInTheDocument();
  });

  it('should render mermaid diagrams', () => {
    const mermaidContent = ['```mermaid', 'graph TD', 'A-->B', '```'].join('\n');
    const { container } = render(<MarkdownRenderer content={mermaidContent} />);

    // Check that mermaid code is rendered
    const codeElement = container.querySelector('code.lang-mermaid, code.language-mermaid');
    expect(codeElement).toBeInTheDocument();
    expect(screen.getByText(/graph TD/)).toBeInTheDocument();
  });

  it('should render Plotly charts', () => {
    const plotlyContent = ['```plotly', '{"data": []}', '```'].join('\n');
    const { container } = render(<MarkdownRenderer content={plotlyContent} />);

    // Check that plotly code is rendered
    const codeElement = container.querySelector('code.lang-plotly, code.language-plotly');
    expect(codeElement).toBeInTheDocument();
    expect(screen.getByText(/data/)).toBeInTheDocument();
  });

  it('should handle mixed content', () => {
    const mixedContent = [
      '# Title',
      'This is **bold** and *italic*.',
      '- List item 1',
      '- List item 2',
      '',
      '```javascript',
      'const x = 10;',
      '```',
      '',
      '[Link](https://example.com)'
    ].join('\n');

    const { container } = render(<MarkdownRenderer content={mixedContent} />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.getByText('italic')).toBeInTheDocument();
    expect(screen.getByText('List item 1')).toBeInTheDocument();
    // Check code block is rendered
    const codeElement = container.querySelector('code.lang-javascript, code.language-javascript');
    expect(codeElement).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Link' })).toBeInTheDocument();
  });

  it('should handle empty content', () => {
    const { container } = render(<MarkdownRenderer content="" />);

    expect(container.firstChild).toBeInTheDocument();
  });

  it('should sanitize HTML', () => {
    render(<MarkdownRenderer content="<script>alert('XSS')</script>" />);

    // Script tags should be removed/sanitized
    expect(screen.queryByText("alert('XSS')")).not.toBeInTheDocument();
  });

  it('should render strikethrough', () => {
    render(<MarkdownRenderer content="This is ~~strikethrough~~ text" />);

    const strikeElement = screen.getByText('strikethrough');
    expect(strikeElement.tagName).toBe('DEL');
  });

  it('should render task lists', () => {
    const content = `- [x] Completed task
- [ ] Incomplete task`;
    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText('Completed task')).toBeInTheDocument();
    expect(screen.getByText('Incomplete task')).toBeInTheDocument();
  });

  it('should handle LaTeX math', () => {
    render(<MarkdownRenderer content="$x^2 + y^2 = z^2$" />);

    // Math content should be rendered (exact rendering depends on implementation)
    expect(screen.getByText(/x.*2.*\+.*y.*2.*=.*z.*2/)).toBeInTheDocument();
  });

  it('should handle nested lists', () => {
    const nestedList = `- Parent 1
  - Child 1
  - Child 2
- Parent 2`;

    render(<MarkdownRenderer content={nestedList} />);

    expect(screen.getByText('Parent 1')).toBeInTheDocument();
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Child 2')).toBeInTheDocument();
    expect(screen.getByText('Parent 2')).toBeInTheDocument();
  });

  it('should render images', () => {
    render(<MarkdownRenderer content="![Alt text](https://example.com/image.png)" />);

    const img = screen.getByAltText('Alt text');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/image.png');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <MarkdownRenderer content="Test" className="custom-class" />
    );

    const element = container.querySelector('.custom-class');
    expect(element).toBeInTheDocument();
  });

  it('should handle code blocks without language', () => {
    const codeContent = ['```', 'plain code', '```'].join('\n');
    render(<MarkdownRenderer content={codeContent} />);

    // Code without language should fall back to a plain pre tag
    expect(screen.getByText('plain code')).toBeInTheDocument();
  });

  it('should handle very long content', () => {
    const longContent = 'A'.repeat(10000);
    render(<MarkdownRenderer content={longContent} />);

    expect(screen.getByText(longContent)).toBeInTheDocument();
  });

  it('should handle special characters', () => {
    render(<MarkdownRenderer content="Special: &lt; &gt; &amp; &quot;" />);

    expect(screen.getByText(/Special:/)).toBeInTheDocument();
  });
});
