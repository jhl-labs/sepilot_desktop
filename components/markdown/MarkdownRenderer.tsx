'use client';

import Markdown from 'markdown-to-jsx';
import { CodeBlock } from './CodeBlock';
import { MermaidDiagram } from './MermaidDiagram';
import { PlotlyChart } from './PlotlyChart';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
  referencedDocuments?: Array<{
    id: string;
    title: string;
    source: string;
    content: string;
  }>;
  onSourceClick?: (doc: { id: string; title: string; source: string; content: string }) => void;
}

// Helper function to extract text content from React children
function getTextContent(children: any): string {
  if (typeof children === 'string') {
    return children;
  }
  if (typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(getTextContent).join('');
  }
  if (children && typeof children === 'object') {
    if ('props' in children && children.props) {
      if ('children' in children.props) {
        return getTextContent(children.props.children);
      }
    }
  }
  return '';
}

// Custom Pre component to handle code blocks
function CustomPreComponent({ children, isStreaming, ...props }: { children: any; isStreaming?: boolean }) {
  // Check if this is a code block with language
  if (children && typeof children === 'object' && 'props' in (children as any)) {
    const { className, children: code } = (children as any).props || {};

    // Extract language from className (e.g., "lang-javascript" -> "javascript")
    if (className && className.startsWith('lang-')) {
      const language = className.replace('lang-', '');
      const codeText = getTextContent(code);

      // Handle mermaid diagrams - but not during streaming to avoid parse errors
      if (language === 'mermaid') {
        if (isStreaming) {
          // During streaming, show as code block to avoid incomplete diagram parse errors
          return <CodeBlock language={language} code={codeText} />;
        }
        return <MermaidDiagram chart={codeText} />;
      }

      // Handle plotly charts - but not during streaming to avoid parse errors
      if (language === 'plotly') {
        if (isStreaming) {
          // During streaming, show as code block to avoid incomplete JSON parse errors
          return <CodeBlock language="json" code={codeText} />;
        }
        return <PlotlyChart data={codeText} />;
      }

      // Handle regular code blocks
      return <CodeBlock language={language} code={codeText} />;
    }
  }

  // Fallback for plain pre blocks
  return <pre {...props}>{children}</pre>;
}

// Custom inline code component
function CustomCode({ children, ...props }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm" {...props}>
      {children}
    </code>
  );
}


export function MarkdownRenderer({
  content,
  className,
  isStreaming = false,
  referencedDocuments = [],
  onSourceClick
}: MarkdownRendererProps) {
  // Create a wrapped component that includes isStreaming
  const CustomPre = (props: any) => <CustomPreComponent {...props} isStreaming={isStreaming} />;

  // Custom link component
  const CustomLink = ({ href, children, ...props }: any) => {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-4 hover:text-primary/80"
        {...props}
      >
        {children}
      </a>
    );
  };

  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <Markdown
        options={{
          overrides: {
            pre: {
              component: CustomPre,
            },
            code: {
              component: CustomCode,
            },
            a: {
              component: CustomLink,
            },
            blockquote: {
              props: {
                className: 'border-l-4 border-primary/30 pl-4 italic text-muted-foreground my-4',
              },
            },
            h1: {
              props: {
                className: 'text-2xl font-semibold mt-6 mb-4 scroll-m-20',
              },
            },
            h2: {
              props: {
                className: 'text-xl font-semibold mt-5 mb-3 scroll-m-20',
              },
            },
            h3: {
              props: {
                className: 'text-lg font-semibold mt-4 mb-2 scroll-m-20',
              },
            },
            h4: {
              props: {
                className: 'text-base font-semibold mt-3 mb-2 scroll-m-20',
              },
            },
            h5: {
              props: {
                className: 'text-sm font-semibold mt-2 mb-1 scroll-m-20',
              },
            },
            h6: {
              props: {
                className: 'text-xs font-semibold mt-2 mb-1 scroll-m-20',
              },
            },
            p: {
              props: {
                className: 'leading-7 [&:not(:first-child)]:mt-3',
              },
            },
            ul: {
              props: {
                className: 'my-3 ml-6 list-disc [&>li]:mt-1',
              },
            },
            ol: {
              props: {
                className: 'my-3 ml-6 list-decimal [&>li]:mt-1',
              },
            },
            table: {
              props: {
                className: 'w-full border-collapse border border-border my-4',
              },
            },
            th: {
              props: {
                className: 'border border-border bg-muted px-4 py-2 text-left font-semibold',
              },
            },
            td: {
              props: {
                className: 'border border-border px-4 py-2',
              },
            },
            hr: {
              props: {
                className: 'my-8 border-border',
              },
            },
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
