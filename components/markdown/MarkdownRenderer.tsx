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
function CustomPreComponent({
  children,
  isStreaming,
  ...props
}: {
  children: any;
  isStreaming?: boolean;
}) {
  // Check if this is a code block with language
  if (children && typeof children === 'object' && 'props' in (children as any)) {
    const { className, children: code } = (children as any).props || {};

    // Extract language from className
    // className can be: "language-mermaid", "lang-mermaid", or "language-mermaid lang-mermaid"
    let language = '';
    if (className) {
      // Split by space and find the first class that starts with "language-" or "lang-"
      const classes = className.split(' ');
      for (const cls of classes) {
        if (cls.startsWith('language-')) {
          language = cls.replace('language-', '');
          break;
        } else if (cls.startsWith('lang-')) {
          language = cls.replace('lang-', '');
          break;
        }
      }
    }

    if (language) {
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
}: MarkdownRendererProps) {
  // Create a wrapped component that includes isStreaming
  const CustomPre = (props: any) => <CustomPreComponent {...props} isStreaming={isStreaming} />;

  // Custom link component with URI error handling
  const CustomLink = ({ href, children, ...props }: any) => {
    // Validate and sanitize href to prevent URI malformed errors
    let safeHref = '#';

    try {
      // Try to construct URL to validate
      if (href && typeof href === 'string') {
        // If it's a relative URL or anchor, keep as is
        if (href.startsWith('#') || href.startsWith('/')) {
          safeHref = href;
        } else if (href.startsWith('http://') || href.startsWith('https://')) {
          // Validate absolute URLs
          try {
            new URL(href);
            safeHref = href;
          } catch {
            // If URL construction fails, try to encode it
            try {
              safeHref = encodeURI(href);
            } catch {
              // If encoding also fails, use placeholder
              console.warn('[MarkdownRenderer] Cannot encode URL:', href);
              safeHref = '#invalid-url';
            }
          }
        } else {
          // For other cases, encode special characters
          try {
            safeHref = encodeURI(href);
          } catch (encodeError) {
            // If encoding fails, escape manually
            console.warn('[MarkdownRenderer] Cannot encode URL:', href, encodeError);
            safeHref = href.replace(/[^\w\s\-._~:/?#[\]@!$&'()*+,;=]/g, '');
          }
        }
      }
    } catch (error) {
      // Final fallback
      console.error('[MarkdownRenderer] URL processing failed:', href, error);
      safeHref = '#error';
    }

    // Extra safety: wrap the entire return in try-catch
    try {
      return (
        <a
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4 hover:text-primary/80"
          {...props}
        >
          {children}
        </a>
      );
    } catch (renderError) {
      // If even rendering fails, return plain text
      console.error('[MarkdownRenderer] Link render failed:', renderError);
      return <span className="text-primary">{children}</span>;
    }
  };

  // Sanitize markdown content to prevent URI malformed errors
  const sanitizeMarkdownContent = (rawContent: string): string => {
    try {
      // Replace problematic URLs in markdown links [text](url) format
      return rawContent.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
        try {
          // Validate the URL
          if (url.startsWith('#') || url.startsWith('/')) {
            return match; // Keep relative URLs as-is
          }

          if (url.startsWith('http://') || url.startsWith('https://')) {
            try {
              new URL(url);
              return match; // Valid URL, keep as-is
            } catch {
              // Invalid URL, try to encode it
              try {
                const encoded = encodeURI(url);
                return `[${text}](${encoded})`;
              } catch {
                // If encoding fails, use placeholder
                return `[${text}](#invalid-url)`;
              }
            }
          }

          // For other URLs, try to encode
          try {
            const encoded = encodeURI(url);
            return `[${text}](${encoded})`;
          } catch {
            // If encoding fails, remove special chars
            const sanitized = url.replace(/[^\w\s\-._~:/?#[\]@!$&'()*+,;=%]/g, '');
            return `[${text}](${sanitized || '#'})`;
          }
        } catch {
          // If all fails, return text only
          return text;
        }
      });
    } catch (error) {
      console.error('[MarkdownRenderer] Content sanitization failed:', error);
      return rawContent; // Return original if sanitization fails
    }
  };

  // Render markdown content
  const renderMarkdownContent = () => {
    try {
      // Sanitize content before rendering
      const sanitizedContent = sanitizeMarkdownContent(content);

      return (
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
          {sanitizedContent}
        </Markdown>
      );
    } catch (error) {
      // Catch any rendering errors (including URI malformed)
      const errorMessage = error instanceof Error ? error.message : 'Unknown rendering error';
      console.error('[MarkdownRenderer] Rendering error:', error);

      return (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">마크다운 렌더링 오류</p>
          <p className="mt-1 text-xs text-muted-foreground">{errorMessage}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium">원본 내용 보기</summary>
            <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs max-h-60">
              {content}
            </pre>
          </details>
        </div>
      );
    }
  };

  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      {renderMarkdownContent()}
    </div>
  );
}
