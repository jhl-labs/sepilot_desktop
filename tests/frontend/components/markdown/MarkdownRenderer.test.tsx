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
      <span>{language}</span>
      <code>{code}</code>
    </div>
  ),
}));

jest.mock('@/components/markdown/MermaidDiagram', () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => (
    <div data-testid="mermaid-diagram">{chart}</div>
  ),
}));

jest.mock('@/components/markdown/PlotlyChart', () => ({
  PlotlyChart: ({ data }: { data: string }) => <div data-testid="plotly-chart">{data}</div>,
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

    // CodeBlock component renders with language label, not as code.lang-*
    expect(screen.getByText('javascript')).toBeInTheDocument();
    expect(screen.getByText('const x = 10;')).toBeInTheDocument();
  });

  it('should render mermaid code blocks with language class', () => {
    const content = '```mermaid\ngraph TD;\n    A-->B;\n```';

    const { container } = render(<MarkdownRenderer content={content} isStreaming={false} />);

    // When not streaming, mermaid is rendered as MermaidDiagram component
    expect(screen.getByTestId('mermaid-diagram')).toBeInTheDocument();
  });

  it('should render plotly code blocks with language class', () => {
    const plotlyData = '{"data": [{"x": [1, 2, 3], "y": [2, 4, 6], "type": "scatter"}]}';
    const content = '```plotly\n' + plotlyData + '\n```';

    const { container } = render(<MarkdownRenderer content={content} isStreaming={false} />);

    // When not streaming, plotly is rendered as PlotlyChart component
    expect(screen.getByTestId('plotly-chart')).toBeInTheDocument();
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
    expect(screen.getByText('javascript')).toBeInTheDocument();
    expect(screen.getByText('const code = "test";')).toBeInTheDocument();
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

    expect(screen.getByText('python')).toBeInTheDocument();
    expect(screen.getByText(/def hello\(\):/)).toBeInTheDocument();
  });

  it('should render TypeScript code blocks', () => {
    const content = '```typescript\nconst greeting: string = "Hello";\n```';

    const { container } = render(<MarkdownRenderer content={content} />);

    expect(screen.getByText('typescript')).toBeInTheDocument();
    expect(screen.getByText('const greeting: string = "Hello";')).toBeInTheDocument();
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

  describe('Streaming mode', () => {
    it('should accept isStreaming prop', () => {
      const content = 'Test content';

      const { container: container1 } = render(
        <MarkdownRenderer content={content} isStreaming={true} />
      );
      const { container: container2 } = render(
        <MarkdownRenderer content={content} isStreaming={false} />
      );

      // Both should render the content
      expect(container1.textContent).toContain('Test content');
      expect(container2.textContent).toContain('Test content');
    });

    it('should render code blocks with isStreaming=true', () => {
      const content = '```javascript\nconst x = 10;\n```';

      const { container } = render(<MarkdownRenderer content={content} isStreaming={true} />);

      expect(screen.getByText('javascript')).toBeInTheDocument();
      expect(screen.getByText('const x = 10;')).toBeInTheDocument();
    });

    it('should render code blocks with isStreaming=false', () => {
      const content = '```javascript\nconst y = 20;\n```';

      const { container } = render(<MarkdownRenderer content={content} isStreaming={false} />);

      expect(screen.getByText('javascript')).toBeInTheDocument();
      expect(screen.getByText('const y = 20;')).toBeInTheDocument();
    });
  });

  describe('Code block edge cases', () => {
    it('should handle code blocks with multiple languages', () => {
      const content = `\`\`\`javascript
const x = 10;
\`\`\`

\`\`\`python
def hello():
    print("Hello")
\`\`\``;

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('javascript')).toBeInTheDocument();
      expect(screen.getByText('python')).toBeInTheDocument();
      expect(screen.getByText('const x = 10;')).toBeInTheDocument();
    });

    it('should handle code blocks with special characters', () => {
      const content = '```bash\necho "Hello $USER"\n```';

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('bash')).toBeInTheDocument();
      expect(screen.getByText('echo "Hello $USER"')).toBeInTheDocument();
    });

    it('should handle empty code blocks', () => {
      const content = '```javascript\n\n```';

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('javascript')).toBeInTheDocument();
    });
  });

  describe('HTML elements styling', () => {
    it('should apply correct styles to h4', () => {
      const content = '#### Heading 4';

      const { container } = render(<MarkdownRenderer content={content} />);

      const h4 = container.querySelector('h4');
      expect(h4).toBeInTheDocument();
      expect(h4).toHaveClass('text-base', 'font-semibold', 'mt-3', 'mb-2', 'scroll-m-20');
    });

    it('should apply correct styles to h5', () => {
      const content = '##### Heading 5';

      const { container } = render(<MarkdownRenderer content={content} />);

      const h5 = container.querySelector('h5');
      expect(h5).toBeInTheDocument();
      expect(h5).toHaveClass('text-sm', 'font-semibold', 'mt-2', 'mb-1', 'scroll-m-20');
    });

    it('should apply correct styles to h6', () => {
      const content = '###### Heading 6';

      const { container } = render(<MarkdownRenderer content={content} />);

      const h6 = container.querySelector('h6');
      expect(h6).toBeInTheDocument();
      expect(h6).toHaveClass('text-xs', 'font-semibold', 'mt-2', 'mb-1', 'scroll-m-20');
    });

    it('should apply correct styles to unordered lists', () => {
      const content = `- Item 1
- Item 2`;

      const { container } = render(<MarkdownRenderer content={content} />);

      const ul = container.querySelector('ul');
      expect(ul).toBeInTheDocument();
      expect(ul).toHaveClass('my-3', 'ml-6', 'list-disc');
    });

    it('should apply correct styles to ordered lists', () => {
      const content = `1. First
2. Second`;

      const { container } = render(<MarkdownRenderer content={content} />);

      const ol = container.querySelector('ol');
      expect(ol).toBeInTheDocument();
      expect(ol).toHaveClass('my-3', 'ml-6', 'list-decimal');
    });

    it('should apply correct styles to table headers', () => {
      const content = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;

      const { container } = render(<MarkdownRenderer content={content} />);

      const th = container.querySelector('th');
      expect(th).toBeInTheDocument();
      expect(th).toHaveClass(
        'border',
        'border-border',
        'bg-muted',
        'px-4',
        'py-2',
        'text-left',
        'font-semibold'
      );
    });

    it('should apply correct styles to table cells', () => {
      const content = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;

      const { container } = render(<MarkdownRenderer content={content} />);

      const td = container.querySelector('td');
      expect(td).toBeInTheDocument();
      expect(td).toHaveClass('border', 'border-border', 'px-4', 'py-2');
    });

    it('should apply correct styles to blockquotes', () => {
      const content = '> This is a quote';

      const { container } = render(<MarkdownRenderer content={content} />);

      const blockquote = container.querySelector('blockquote');
      expect(blockquote).toBeInTheDocument();
      expect(blockquote).toHaveClass(
        'border-l-4',
        'border-primary/30',
        'pl-4',
        'italic',
        'text-muted-foreground',
        'my-4'
      );
    });

    it('should apply correct styles to paragraphs', () => {
      const content = `First paragraph.

Second paragraph.`;

      const { container } = render(<MarkdownRenderer content={content} />);

      const paragraphs = container.querySelectorAll('p');
      expect(paragraphs.length).toBeGreaterThan(0);
      expect(paragraphs[0]).toHaveClass('leading-7');
    });

    it('should render inline code element', () => {
      const content = 'Use `inline code` here';

      const { container } = render(<MarkdownRenderer content={content} />);

      const code = container.querySelector('code');
      expect(code).toBeInTheDocument();
      expect(code).toHaveTextContent('inline code');
    });
  });

  describe('Content extraction', () => {
    it('should handle code blocks with numeric content', () => {
      const content = '```javascript\n12345\n```';

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('javascript')).toBeInTheDocument();
      expect(screen.getByText('12345')).toBeInTheDocument();
    });

    it('should handle nested code content', () => {
      const content = '```json\n{"key": "value", "nested": {"deep": "data"}}\n```';

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('json')).toBeInTheDocument();
      expect(screen.getByText(/{"key": "value"/)).toBeInTheDocument();
    });
  });

  describe('Mixed markdown content', () => {
    it('should handle markdown with multiple element types', () => {
      const content = `# Title

This is a paragraph with **bold**, *italic*, and \`code\`.

> A quote

- List item 1
- List item 2

\`\`\`javascript
const x = 10;
\`\`\`

[A link](https://example.com)

| Col 1 | Col 2 |
|-------|-------|
| A     | B     |

---`;

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(container.querySelector('h1')).toHaveTextContent('Title');
      expect(container.querySelector('strong')).toHaveTextContent('bold');
      expect(container.querySelector('em')).toHaveTextContent('italic');
      expect(container.querySelector('blockquote')).toBeInTheDocument();
      expect(container.querySelector('ul')).toBeInTheDocument();
      expect(screen.getByText('javascript')).toBeInTheDocument();
      expect(container.querySelector('a')).toHaveAttribute('href', 'https://example.com');
      expect(container.querySelector('table')).toBeInTheDocument();
      expect(container.querySelector('hr')).toBeInTheDocument();
    });

    it('should handle consecutive code blocks', () => {
      const content = `\`\`\`javascript
const x = 10;
\`\`\`

\`\`\`typescript
const y: number = 20;
\`\`\`

\`\`\`python
z = 30
\`\`\``;

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('javascript')).toBeInTheDocument();
      expect(screen.getByText('typescript')).toBeInTheDocument();
      expect(screen.getByText('python')).toBeInTheDocument();
    });
  });

  describe('Different code block languages', () => {
    it('should render SQL code blocks', () => {
      const content = '```sql\nSELECT * FROM users;\n```';

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('sql')).toBeInTheDocument();
      expect(screen.getByText('SELECT * FROM users;')).toBeInTheDocument();
    });

    it('should render CSS code blocks', () => {
      const content = '```css\n.class { color: red; }\n```';

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('css')).toBeInTheDocument();
    });

    it('should render HTML code blocks', () => {
      const content = '```html\n<div>Hello</div>\n```';

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('html')).toBeInTheDocument();
    });

    it('should render Go code blocks', () => {
      const content = '```go\nfunc main() {}\n```';

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('go')).toBeInTheDocument();
    });

    it('should render Rust code blocks', () => {
      const content = '```rust\nfn main() {}\n```';

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('rust')).toBeInTheDocument();
    });

    it('should render Java code blocks', () => {
      const content = '```java\npublic class Main {}\n```';

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('java')).toBeInTheDocument();
    });

    it('should render C++ code blocks', () => {
      const content = '```cpp\nint main() { return 0; }\n```';

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('cpp')).toBeInTheDocument();
    });
  });

  describe('getTextContent Helper', () => {
    it('should extract text from number children', () => {
      const content = 'Number: `123`';

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(container.textContent).toContain('123');
    });

    it('should extract text from array children', () => {
      const content = '- Item 1\n- Item 2\n- Item 3';

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
      expect(screen.getByText('Item 3')).toBeInTheDocument();
    });

    it('should extract text from nested object children', () => {
      const content = '**Bold text** and *italic text*';

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText(/Bold text/)).toBeInTheDocument();
      expect(screen.getByText(/italic text/)).toBeInTheDocument();
    });

    it('should handle empty or null children gracefully', () => {
      const content = '';

      const { container } = render(<MarkdownRenderer content={content} />);

      expect(container).toBeInTheDocument();
    });
  });

  describe('Streaming mode special cases', () => {
    it('should render mermaid as CodeBlock when isStreaming=true', () => {
      const content = '```mermaid\ngraph TD\n  A-->B\n```';

      render(<MarkdownRenderer content={content} isStreaming={true} />);

      // Should show as code block, not render as diagram
      expect(screen.getByText('mermaid')).toBeInTheDocument();
      expect(screen.getByText(/graph TD/)).toBeInTheDocument();
    });

    it('should render plotly as CodeBlock when isStreaming=true', () => {
      const content = '```plotly\n{"data": []}\n```';

      render(<MarkdownRenderer content={content} isStreaming={true} />);

      // Should show as JSON code block, not render as chart
      expect(screen.getByText('json')).toBeInTheDocument();
      expect(screen.getByText(/"data":/)).toBeInTheDocument();
    });

    it('should handle lang- prefix in className', () => {
      // This tests the lang- prefix handling in line 60-62
      const content = '```python\nprint("hello")\n```';

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('python')).toBeInTheDocument();
      expect(screen.getByText('print("hello")')).toBeInTheDocument();
    });
  });

  describe('getTextContent edge cases with complex code blocks', () => {
    it('should handle code blocks with React element children containing numbers', () => {
      // Test case that would trigger number type in getTextContent (line 28-29)
      // Markdown parsers can produce numeric children
      const content = '```javascript\n42\n```';

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('javascript')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('should handle code blocks with multiple nested spans (array children)', () => {
      // Test case to trigger array children path (line 31-32)
      // Complex markdown inside code blocks
      const content = '```bash\necho "line1"\necho "line2"\necho "line3"\n```';

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('bash')).toBeInTheDocument();
      // Check that multiline content is rendered
      expect(screen.getByText(/echo "line1"/)).toBeInTheDocument();
    });

    it('should handle code blocks with deeply nested React elements', () => {
      // Test case for object with props path (line 34-37)
      // Markdown-to-jsx can create nested structures
      const content = '```typescript\ninterface User {\n  name: string;\n  age: number;\n}\n```';

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('typescript')).toBeInTheDocument();
      expect(screen.getByText(/interface User/)).toBeInTheDocument();
    });

    it('should handle empty code blocks gracefully', () => {
      // Test empty return case (line 41)
      const content = '```python\n\n```';

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('python')).toBeInTheDocument();
      // Empty code block should still render
      const codeBlock = screen.getByTestId('code-block');
      expect(codeBlock).toBeInTheDocument();
    });

    it('should handle code blocks with only spaces', () => {
      // Another case for empty string return
      const content = '```ruby\n   \n```';

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('ruby')).toBeInTheDocument();
    });

    it('should extract text from complex nested markdown in code', () => {
      // Test the full path: object → props → children → recursive call
      const content =
        '```json\n{\n  "key": "value",\n  "nested": {\n    "deep": "data"\n  }\n}\n```';

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('json')).toBeInTheDocument();
      expect(screen.getByText(/nested/)).toBeInTheDocument();
    });

    it('should handle mermaid with complex graph syntax', () => {
      // Test mermaid rendering with non-streaming (line 76)
      const content = '```mermaid\ngraph LR\n  A[Start] --> B[Process]\n  B --> C[End]\n```';

      render(<MarkdownRenderer content={content} isStreaming={false} />);

      expect(screen.getByTestId('mermaid-diagram')).toBeInTheDocument();
    });

    it('should handle plotly with complex data', () => {
      // Test plotly rendering with non-streaming (line 85)
      const plotlyData = JSON.stringify({
        data: [
          {
            x: [1, 2, 3, 4],
            y: [10, 15, 13, 17],
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Sales',
          },
        ],
        layout: {
          title: 'Sales Data',
        },
      });

      const content = '```plotly\n' + plotlyData + '\n```';

      render(<MarkdownRenderer content={content} isStreaming={false} />);

      expect(screen.getByTestId('plotly-chart')).toBeInTheDocument();
    });

    it('should handle code with mixed array and string children', () => {
      // Comprehensive test for getTextContent with various types
      const content =
        '```javascript\nconst arr = [1, 2, 3];\nconst sum = arr.reduce((a, b) => a + b, 0);\nconsole.log(sum);\n```';

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('javascript')).toBeInTheDocument();
      expect(screen.getByText(/const arr/)).toBeInTheDocument();
      expect(screen.getByText(/reduce/)).toBeInTheDocument();
    });

    it('should handle code blocks with special markdown characters', () => {
      // Test edge case with characters that markdown might parse
      const content = '```markdown\n# This is a heading\n**Bold** and *italic*\n```';

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('markdown')).toBeInTheDocument();
      expect(screen.getByText(/# This is a heading/)).toBeInTheDocument();
    });
  });
});
