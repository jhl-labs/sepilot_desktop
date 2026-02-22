'use client';

import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { Button } from '@/components/ui/button';
import { Check, Copy, Play, Save } from 'lucide-react';
import { useTheme } from 'next-themes';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { isElectron } from '@/lib/platform';
import { toast } from 'sonner';

interface CodeBlockProps {
  language: string;
  code: string;
  onRun?: () => void;
}

export function CodeBlock({ language, code, onRun }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const { theme } = useTheme();

  const handleCopy = async () => {
    const success = await copyToClipboard(code);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = async () => {
    if (!isElectron() || !window.electronAPI) {
      toast.error('Electron 환경에서만 파일을 저장할 수 있습니다.');
      return;
    }

    try {
      const defaultFilename = `snippet.${language || 'txt'}`;
      const result = await window.electronAPI.invoke('file:save-as', code, defaultFilename);
      
      if (result.success && result.data) {
        setSaved(true);
        toast.success(`파일이 저장되었습니다: ${result.data}`);
        setTimeout(() => setSaved(false), 2000);
      } else if (result.error) {
        toast.error(`파일 저장 실패: ${result.error}`);
      }
    } catch (error) {
      console.error('[CodeBlock] Save failed:', error);
      toast.error('파일 저장 중 오류가 발생했습니다.');
    }
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
        <div className="flex items-center gap-1">
          {onRun && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRun}
              className="h-7 gap-1 px-2 hover:bg-green-500/10 hover:text-green-600"
            >
              <Play className="h-3 w-3" />
              <span className="text-xs">Run</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            className="h-7 gap-1 px-2 hover:bg-primary/10 hover:text-primary"
            title="파일로 저장"
          >
            {saved ? (
              <>
                <Check className="h-3 w-3" />
                <span className="text-xs font-medium">저장됨</span>
              </>
            ) : (
              <>
                <Save className="h-3 w-3" />
                <span className="text-xs font-medium">저장</span>
              </>
            )}
          </Button>
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
            fontSize: '0.75rem',
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
