'use client';

import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '@/components/ui/button';
import { Check, Copy } from 'lucide-react';
import { useTheme } from 'next-themes';

interface CodeBlockProps {
  language: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Map common language aliases
  const languageMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    sh: 'bash',
    yml: 'yaml',
  };

  const normalizedLanguage = languageMap[language.toLowerCase()] || language.toLowerCase();

  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border bg-muted">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">{language}</span>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 gap-1 px-2">
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              <span className="text-xs">복사됨</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span className="text-xs">복사</span>
            </>
          )}
        </Button>
      </div>

      {/* Code with Syntax Highlighting */}
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={normalizedLanguage}
          style={theme === 'dark' ? oneDark : oneLight}
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: 'transparent',
            fontSize: '0.875rem',
          }}
          wrapLongLines={false}
          showLineNumbers={false}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
