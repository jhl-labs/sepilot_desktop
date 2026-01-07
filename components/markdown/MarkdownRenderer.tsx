'use client';

import React, { ReactNode } from 'react';
import Markdown from 'markdown-to-jsx';
import { CodeBlock } from './CodeBlock';
import { MermaidDiagram } from './MermaidDiagram';
import { PlotlyChart } from './PlotlyChart';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { logger } from '@/lib/utils/logger';
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
  /** Optional: Path to the current markdown file (for resolving relative image paths) */
  currentFilePath?: string;
  /** Optional: Working directory path (base path for resolving relative image paths) */
  workingDirectory?: string;
}

// Helper function to extract text content from React children
function getTextContent(children: ReactNode): string {
  if (typeof children === 'string') {
    return children;
  }
  if (typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(getTextContent).join('');
  }
  if (children && typeof children === 'object' && 'props' in children) {
    const element = children as React.ReactElement;
    if (element.props && typeof element.props === 'object' && 'children' in element.props) {
      return getTextContent(element.props.children as ReactNode);
    }
  }
  return '';
}

interface CustomPreComponentProps {
  children: ReactNode;
  isStreaming?: boolean;
}

// Custom Pre component to handle code blocks
function CustomPreComponent({
  children,
  isStreaming,
  ...props
}: CustomPreComponentProps & React.HTMLAttributes<HTMLPreElement>) {
  // Check if this is a code block with language
  if (children && typeof children === 'object' && 'props' in children) {
    const childElement = children as React.ReactElement;
    const props = childElement.props as { className?: string; children?: ReactNode };
    const { className, children: code } = props;

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
        return (
          <ErrorBoundary fallback={<CodeBlock language="mermaid" code={codeText} />}>
            <MermaidDiagram chart={codeText} />
          </ErrorBoundary>
        );
      }

      // Handle plotly charts - but not during streaming to avoid parse errors
      if (language === 'plotly') {
        if (isStreaming) {
          // During streaming, show as code block to avoid incomplete JSON parse errors
          return <CodeBlock language="json" code={codeText} />;
        }
        return (
          <ErrorBoundary fallback={<CodeBlock language="json" code={codeText} />}>
            <PlotlyChart data={codeText} />
          </ErrorBoundary>
        );
      }

      // Handle json blocks - check if they are plotly charts
      if (language === 'json') {
        if (isStreaming) {
          return <CodeBlock language="json" code={codeText} />;
        }
        // Try to detect if this JSON is a Plotly figure
        if (isLikelyPlotlyJSON(codeText)) {
          return (
            <ErrorBoundary fallback={<CodeBlock language="json" code={codeText} />}>
              <PlotlyChart data={codeText} />
            </ErrorBoundary>
          );
        }
        return <CodeBlock language="json" code={codeText} />;
      }

      // Handle regular code blocks
      return <CodeBlock language={language} code={codeText} />;
    }
  }

  // Fallback for plain pre blocks
  return <pre {...props}>{children}</pre>;
}

// Helper to detect if a JSON string is likely a Plotly figure
function isLikelyPlotlyJSON(jsonString: string): boolean {
  try {
    const trimmed = jsonString.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      return false;
    }

    const parsed = JSON.parse(trimmed);

    // Must be an object
    if (!parsed || typeof parsed !== 'object') {
      return false;
    }

    // Must have 'data' array (required by PlotlyChart component)
    if (!Array.isArray(parsed.data)) {
      return false;
    }

    // Additional heuristics to avoid false positives with generic API responses
    // 1. If data has items, check for common Plotly trace keys
    if (parsed.data.length > 0) {
      const firstTrace = parsed.data[0];
      if (typeof firstTrace !== 'object' || firstTrace === null) {
        return false;
      }

      // Keys that strongly suggest a Plotly trace
      const plotlyKeys = [
        'type',
        'x',
        'y',
        'z',
        'values',
        'labels',
        'mode',
        'marker',
        'line',
        'textinfo',
        'hoverinfo',
        'transforms',
      ];

      const hasPlotlyKey = plotlyKeys.some((key) => key in firstTrace);

      // If no specific plotly key is found, checking if 'layout' exists is a good secondary check
      if (!hasPlotlyKey && !('layout' in parsed)) {
        return false;
      }
    } else {
      // If data is empty array, it must have 'layout' to be considered a chart
      if (!('layout' in parsed) || typeof parsed.layout !== 'object') {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
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
  currentFilePath,
  workingDirectory,
}: MarkdownRendererProps) {
  // Create a wrapped component that includes isStreaming
  const CustomPre = (props: React.HTMLAttributes<HTMLPreElement> & { children: ReactNode }) => (
    <CustomPreComponent {...props} isStreaming={isStreaming} />
  );

  // Custom image component for local file support
  const CustomImage = ({
    src,
    alt,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { src?: string; alt?: string }) => {
    const [imageSrc, setImageSrc] = React.useState<string>(src || '');
    const [isLoading, setIsLoading] = React.useState(false);

    React.useEffect(() => {
      // 이미 URL이거나 data URI면 그대로 사용
      if (
        !src ||
        typeof src !== 'string' ||
        src.startsWith('http://') ||
        src.startsWith('https://') ||
        src.startsWith('data:')
      ) {
        setImageSrc(src || '');
        return;
      }

      // 상대 경로인 경우 절대 경로로 변환하여 파일 읽기
      const loadLocalImage = async () => {
        try {
          setIsLoading(true);

          // Electron 환경인지 확인
          if (typeof window === 'undefined' || !window.electronAPI) {
            console.warn('[MarkdownRenderer] Not in Electron environment');
            setImageSrc(src);
            return;
          }

          logger.info('[MarkdownRenderer] Loading local image:', {
            src,
            currentFilePath,
            workingDirectory,
          });

          // 절대 경로 계산 - working directory 기준으로 해석
          // 이미지 경로는 working directory 기준 상대 경로이므로,
          // working directory를 base로 사용
          let absolutePath: string;

          const basePath = workingDirectory || currentFilePath;

          if (basePath) {
            // IPC로 절대 경로 계산
            const resolveResult = await window.electronAPI.fs.resolvePath(basePath, src);

            if (resolveResult.success && resolveResult.data) {
              absolutePath = resolveResult.data;
              logger.info('[MarkdownRenderer] Resolved path from IPC:', {
                basePath,
                src,
                absolutePath,
              });
            } else {
              console.error('[MarkdownRenderer] Failed to resolve path:', resolveResult.error);
              setImageSrc(src); // Fallback
              return;
            }
          } else {
            // basePath가 없으면 그냥 src를 절대 경로로 간주
            absolutePath = src;
            console.warn('[MarkdownRenderer] No base path, using src as absolute:', src);
          }

          // IPC를 통해 이미지를 base64로 읽기
          const result = await window.electronAPI.fs.readImageAsBase64(absolutePath);

          if (result.success && result.data) {
            // 이미 data URL 형식으로 반환됨
            setImageSrc(result.data);
            logger.info('[MarkdownRenderer] Image loaded successfully');
          } else {
            console.error('[MarkdownRenderer] Failed to load image:', result.error);
            setImageSrc(src); // Fallback to original src
          }
        } catch (error) {
          console.error('[MarkdownRenderer] Error loading local image:', error);
          setImageSrc(src); // Fallback to original src
        } finally {
          setIsLoading(false);
        }
      };

      loadLocalImage();
    }, [src, currentFilePath, workingDirectory]);

    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-32 bg-muted rounded-lg my-4">
          <span className="text-sm text-muted-foreground">이미지 로딩 중...</span>
        </div>
      );
    }

    return (
      <img
        src={imageSrc}
        alt={alt || ''}
        className="max-w-full h-auto rounded-lg my-4"
        onError={(e) => {
          console.error('[MarkdownRenderer] Image load error:', imageSrc);
          // Show alt text or placeholder on error
          (e.target as HTMLImageElement).style.display = 'none';
        }}
        {...props}
      />
    );
  };

  // Custom link component with URI error handling
  const CustomLink = ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string; children?: ReactNode }) => {
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
      // NOTE: Global percent encoding replacement was removed because:
      // 1. disableParsingRawHTML: true already prevents markdown-to-jsx's HTML attribute parser bug
      // 2. The global replacement was breaking normal percent signs in text (e.g., "30%" -> "30%25")
      // URL-specific encoding is still handled below for markdown links only.
      let result = rawContent;

      // Additional processing for markdown links [text](url) format
      result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
        try {
          // Trim whitespace
          url = url.trim();

          // Validate the URL
          if (url.startsWith('#') || url.startsWith('/')) {
            return match; // Keep relative URLs as-is
          }

          // Fix malformed percent encoding (e.g., lonely % or invalid sequences)
          const fixPercentEncoding = (str: string): string => {
            try {
              // First, try to decode to see if it's already encoded
              decodeURIComponent(str);
              return str; // Already properly encoded
            } catch {
              // Has encoding issues, need to fix
              // Replace invalid % sequences
              // %XX where XX is not valid hex -> %25XX (encode the %)
              return str.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
            }
          };

          if (url.startsWith('http://') || url.startsWith('https://')) {
            try {
              // Fix percent encoding first
              const fixedUrl = fixPercentEncoding(url);
              new URL(fixedUrl);
              return `[${text}](${fixedUrl})`; // Valid URL with fixed encoding
            } catch {
              // Invalid URL, try to safely encode it
              try {
                // Remove existing broken encoding
                const cleanUrl = url.replace(/%[0-9A-Fa-f]{0,2}/g, '');
                // Then encode properly
                const encoded = encodeURI(cleanUrl);
                return `[${text}](${encoded})`;
              } catch {
                // If encoding fails, use placeholder
                console.warn('[MarkdownRenderer] Cannot fix URL:', url);
                return `[${text}](#invalid-url)`;
              }
            }
          }

          // For other URLs, try to encode
          try {
            const fixedUrl = fixPercentEncoding(url);
            const encoded = encodeURI(fixedUrl);
            return `[${text}](${encoded})`;
          } catch {
            // If encoding fails, remove special chars
            const sanitized = url.replace(/[^\w\s\-._~:/?#[\]@!$&'()*+,;=]/g, '');
            return `[${text}](${sanitized || '#'})`;
          }
        } catch (error) {
          // If all fails, return text only
          console.warn('[MarkdownRenderer] URL processing failed:', url, error);
          return text;
        }
      });

      return result;
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
            // CRITICAL: Disable raw HTML parsing to prevent markdown-to-jsx's
            // HTML attribute parser from calling decodeURIComponent without try-catch
            // This is a known bug in markdown-to-jsx that causes URI malformed errors
            disableParsingRawHTML: true,
            overrides: {
              pre: {
                component: CustomPre,
              },
              code: {
                component: CustomCode,
              },
              img: {
                component: CustomImage,
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
    <div className={cn('prose prose-sm dark:prose-invert max-w-none text-sm', className)}>
      {renderMarkdownContent()}
    </div>
  );
}
