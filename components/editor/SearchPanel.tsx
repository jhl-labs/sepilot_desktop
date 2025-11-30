'use client';

import { useState } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X, ChevronRight, ChevronDown, FileText } from 'lucide-react';
import { isElectron } from '@/lib/platform';

interface SearchMatch {
  line: number;
  column: number;
  text: string;
}

interface SearchResult {
  file: string;
  matches: SearchMatch[];
}

interface SearchResponse {
  query: string;
  totalFiles: number;
  totalMatches: number;
  results: SearchResult[];
}

export function SearchPanel() {
  const { workingDirectory, openFile } = useChatStore();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim() || !workingDirectory || !isElectron() || !window.electronAPI) {
      return;
    }

    setSearching(true);
    setError(null);
    try {
      const result = await window.electronAPI.fs.searchFiles(query, workingDirectory, {
        caseSensitive,
        wholeWord,
        useRegex,
      });

      if (result.success && result.data) {
        setResults(result.data);
        setError(null);
        // 자동으로 모든 파일 펼치기
        const allFiles = new Set(result.data.results.map((r) => r.file));
        setExpandedFiles(allFiles);
      } else {
        console.error('[SearchPanel] Search failed:', result.error);
        setError(result.error || 'Search failed');
        setResults(null);
      }
    } catch (error) {
      console.error('[SearchPanel] Error searching:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const toggleFileExpanded = (filePath: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(filePath)) {
      newExpanded.delete(filePath);
    } else {
      newExpanded.add(filePath);
    }
    setExpandedFiles(newExpanded);
  };

  const handleMatchClick = async (filePath: string, match: SearchMatch) => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    try {
      // 파일 읽기
      const fileResult = await window.electronAPI.fs.readFile(filePath);
      if (fileResult.success && fileResult.data) {
        // 파일 열기
        const filename = filePath.split(/[\\/]/).pop() || filePath;
        const ext = filename.split('.').pop() || '';
        const language = getLanguageFromExtension(ext);

        openFile({
          path: filePath,
          filename,
          content: fileResult.data,
          language,
          initialPosition: {
            lineNumber: match.line,
            column: match.column,
          },
        });

        console.log(`[SearchPanel] Opened file at line ${match.line}, column ${match.column}`);
      }
    } catch (error) {
      console.error('[SearchPanel] Error opening file:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearResults = () => {
    setResults(null);
    setQuery('');
  };

  if (!workingDirectory) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-muted-foreground">
        <Search className="mb-2 h-12 w-12 opacity-20" />
        <p className="text-center text-sm font-medium">작업 디렉토리를 먼저 설정하세요</p>
        <p className="mt-2 text-center text-xs">
          Files 탭에서 폴더 아이콘을 클릭하여
          <br />
          작업 디렉토리를 선택하세요
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search Input */}
      <div className="space-y-3 border-b p-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type="text"
              placeholder="검색어 입력..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pr-8"
            />
            {query && (
              <button
                onClick={clearResults}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button onClick={handleSearch} disabled={!query.trim() || searching} size="sm">
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {/* Options */}
        <div className="flex gap-2 text-xs">
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="h-3 w-3"
            />
            <span>Aa</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              checked={wholeWord}
              onChange={(e) => setWholeWord(e.target.checked)}
              className="h-3 w-3"
            />
            <span>단어</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              checked={useRegex}
              onChange={(e) => setUseRegex(e.target.checked)}
              className="h-3 w-3"
            />
            <span>.*</span>
          </label>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searching && (
          <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
            검색 중...
          </div>
        )}

        {error && !searching && (
          <div className="m-2 rounded border border-destructive bg-destructive/10 p-3">
            <p className="text-sm font-medium text-destructive">검색 실패</p>
            <p className="mt-1 text-xs text-destructive/80">{error}</p>
          </div>
        )}

        {results && !searching && !error && (
          <div className="p-2">
            <div className="mb-2 text-xs text-muted-foreground">
              {results.totalFiles}개 파일에서 {results.totalMatches}개 결과 발견
            </div>

            {results.results.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                검색 결과가 없습니다
              </div>
            )}

            {results.results.map((result) => {
              const isExpanded = expandedFiles.has(result.file);
              const filename = result.file.split(/[\\/]/).pop() || result.file;

              return (
                <div key={result.file} className="mb-2">
                  {/* File Header */}
                  <button
                    onClick={() => toggleFileExpanded(result.file)}
                    className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm hover:bg-accent"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    )}
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium" title={result.file}>
                      {filename}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {result.matches.length}
                    </span>
                  </button>

                  {/* Matches */}
                  {isExpanded && (
                    <div className="ml-6 mt-1 space-y-1">
                      {result.matches.map((match, idx) => (
                        <button
                          key={`${result.file}-${match.line}-${idx}`}
                          onClick={() => handleMatchClick(result.file, match)}
                          className="flex w-full items-start gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent"
                        >
                          <span className="shrink-0 text-muted-foreground">{match.line}:</span>
                          <span className="flex-1 truncate font-mono" title={match.text}>
                            {match.text}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// 파일 확장자에서 Monaco 언어 결정
function getLanguageFromExtension(ext: string): string {
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    h: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    sql: 'sql',
  };

  return languageMap[ext.toLowerCase()] || 'plaintext';
}
