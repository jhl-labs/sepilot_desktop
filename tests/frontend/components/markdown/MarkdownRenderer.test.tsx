/**
 * MarkdownRenderer 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';

// Mock child components
jest.mock('@/components/markdown/CodeBlock', () => ({
  CodeBlock: ({ language, code }: { language: string; code: string }) => (
    <div data-testid="code-block" data-language={language}>
      {code}
    </div>
  ),
}));

jest.mock('@/components/markdown/MermaidDiagram', () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => (
    <div data-testid="mermaid-diagram">{chart}</div>
  ),
}));

jest.mock('@/components/markdown/PlotlyChart', () => ({
  PlotlyChart: ({ data }: { data: string }) => (
    <div data-testid="plotly-chart">{data}</div>
  ),
}));

describe('MarkdownRenderer', () => {
  it('should render plain text content', () => {
    render(<MarkdownRenderer content="Hello, World!" />);

    expect(screen.getByText('Hello, World!')).toBeInTheDocument();
  });

  it('should render markdown headings', () => {
    const content = `# Heading 1
## Heading 2
### Heading 3`;

    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText('Heading 1')).toBeInTheDocument();
    expect(screen.getByText('Heading 2')).toBeInTheDocument();
    expect(screen.getByText('Heading 3')).toBeInTheDocument();
  });

  it('should render markdown lists', () => {
    const content = `- Item 1
- Item 2
- Item 3`;

    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();
  });

  it('should render ordered lists', () => {
    const content = `1. First
2. Second
3. Third`;

    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
  });

  it('should render blockquotes', () => {
    const content = '> This is a quote';

    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText('This is a quote')).toBeInTheDocument();
  });

  it('should render links with target blank', () => {
    const content = '[OpenAI](https://openai.com)';

    render(<MarkdownRenderer content={content} />);

    const link = screen.getByText('OpenAI');
    expect(link).toHaveAttribute('href', 'https://openai.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('should render inline code', () => {
    const content = 'Use `console.log()` for debugging';

    const { container } = render(<MarkdownRenderer content={content} />);

    const inlineCode = container.querySelector('code');
    expect(inlineCode).toBeInTheDocument();
    expect(inlineCode).toHaveTextContent('console.log()');
  });

  it('should render code blocks with language class', () => {
    const content = '```javascript\nconst x = 10;\n```';

    const { container } = render(<MarkdownRenderer content={content} />);

    const codeBlock = container.querySelector('code.lang-javascript');
    expect(codeBlock).toBeInTheDocument();
    expect(codeBlock).toHaveTextContent('const x = 10;');
  });

  it('should render mermaid code blocks with language class', () => {
    const content = '```mermaid\ngraph TD;\n    A-->B;\n```';

    const { container } = render(<MarkdownRenderer content={content} isStreaming={false} />);

    const codeBlock = container.querySelector('code.lang-mermaid');
    expect(codeBlock).toBeInTheDocument();
    expect(codeBlock).toHaveTextContent('graph TD;');
  });

  it('should render plotly code blocks with language class', () => {
    const plotlyData = '{"data": [{"x": [1, 2, 3], "y": [2, 4, 6], "type": "scatter"}]}';
    const content = '```plotly\n' + plotlyData + '\n```';

    const { container } = render(<MarkdownRenderer content={content} isStreaming={false} />);

    const codeBlock = container.querySelector('code.lang-plotly');
    expect(codeBlock).toBeInTheDocument();
  });

  it('should render tables', () => {
    const content = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;

    const { container } = render(<MarkdownRenderer content={content} />);

    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    expect(table).toHaveClass('w-full', 'border-collapse');

    expect(screen.getByText('Header 1')).toBeInTheDocument();
    expect(screen.getByText('Header 2')).toBeInTheDocument();
    expect(screen.getByText('Cell 1')).toBeInTheDocument();
    expect(screen.getByText('Cell 2')).toBeInTheDocument();
  });

  it('should render paragraphs', () => {
    const content = `First paragraph.

Second paragraph.`;

    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText('First paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument();
  });

  it('should render horizontal rules', () => {
    const content = `Before

---

After`;

    const { container } = render(<MarkdownRenderer content={content} />);

    const hr = container.querySelector('hr');
    expect(hr).toBeInTheDocument();
    expect(hr).toHaveClass('my-8', 'border-border');
  });

  it('should apply custom className', () => {
    const { container } = render(<MarkdownRenderer content="Test" className="custom-class" />);

    const wrapper = container.querySelector('.custom-class');
    expect(wrapper).toBeInTheDocument();
  });

  it('should render complex nested content', () => {
    const content = `# Title

This is a paragraph with **bold** and *italic* text.

- List item 1
- List item 2

\`\`\`javascript
const code = "test";
\`\`\``;

    const { container } = render(<MarkdownRenderer content={content} />);

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('List item 1')).toBeInTheDocument();

    const codeBlock = container.querySelector('code.lang-javascript');
    expect(codeBlock).toHaveTextContent('const code = "test";');
  });

  it('should render bold text', () => {
    const content = 'This is **bold** text';

    const { container } = render(<MarkdownRenderer content={content} />);

    const bold = container.querySelector('strong');
    expect(bold).toBeInTheDocument();
    expect(bold).toHaveTextContent('bold');
  });

  it('should render italic text', () => {
    const content = 'This is *italic* text';

    const { container } = render(<MarkdownRenderer content={content} />);

    const italic = container.querySelector('em');
    expect(italic).toBeInTheDocument();
    expect(italic).toHaveTextContent('italic');
  });

  it('should render strikethrough text', () => {
    const content = 'This is ~~strikethrough~~ text';

    const { container } = render(<MarkdownRenderer content={content} />);

    const del = container.querySelector('del');
    expect(del).toBeInTheDocument();
    expect(del).toHaveTextContent('strikethrough');
  });

  it('should handle empty content gracefully', () => {
    const { container } = render(<MarkdownRenderer content="" />);

    expect(container.querySelector('.prose')).toBeInTheDocument();
  });

  it('should render Python code blocks', () => {
    const content = '```python\ndef hello():\n    print("Hello")\n```';

    const { container } = render(<MarkdownRenderer content={content} />);

    const codeBlock = container.querySelector('code.lang-python');
    expect(codeBlock).toBeInTheDocument();
    expect(codeBlock).toHaveTextContent('def hello():');
  });

  it('should render TypeScript code blocks', () => {
    const content = '```typescript\nconst greeting: string = "Hello";\n```';

    const { container } = render(<MarkdownRenderer content={content} />);

    const codeBlock = container.querySelector('code.lang-typescript');
    expect(codeBlock).toBeInTheDocument();
    expect(codeBlock).toHaveTextContent('const greeting: string = "Hello";');
  });

  it('should render all heading levels', () => {
    const content = `# H1
## H2
### H3
#### H4
##### H5
###### H6`;

    const { container } = render(<MarkdownRenderer content={content} />);

    expect(container.querySelector('h1')).toHaveTextContent('H1');
    expect(container.querySelector('h2')).toHaveTextContent('H2');
    expect(container.querySelector('h3')).toHaveTextContent('H3');
    expect(container.querySelector('h4')).toHaveTextContent('H4');
    expect(container.querySelector('h5')).toHaveTextContent('H5');
    expect(container.querySelector('h6')).toHaveTextContent('H6');
  });

  it('should render plain pre blocks without language', () => {
    const content = '```\nplain code\n```';

    const { container } = render(<MarkdownRenderer content={content} />);

    const pre = container.querySelector('pre');
    expect(pre).toBeInTheDocument();
  });
});
