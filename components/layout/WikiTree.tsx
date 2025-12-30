'use client';

import { useState, useEffect } from 'react';
import { FileText, ChevronRight, ChevronDown, Hash, ExternalLink } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { useFileSystem } from '@/hooks/use-file-system';
import { getLanguageFromFilename } from '@/lib/utils/file-language';
import { parseMarkdown, extractMarkdownTitle, buildHeadingHierarchy } from '@/lib/utils/markdown-parser';
import type { HeadingNode } from '@/lib/utils/markdown-parser';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from 'react-i18next';

interface WikiFileNode {
  path: string;
  filename: string;
  title: string;
  headings: HeadingNode[];
  linkCount: number;
}

export function WikiTree() {
  const { t } = useTranslation();
  const { workingDirectory, openFile, activeFilePath } = useChatStore();
  const { readFile } = useFileSystem();
  const [wikiFiles, setWikiFiles] = useState<WikiFileNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!workingDirectory) {
      setWikiFiles([]);
      return;
    }

    loadMarkdownFiles();
  }, [workingDirectory]);

  const loadMarkdownFiles = async () => {
    if (!workingDirectory || !window.electronAPI) {
      return;
    }

    setIsLoading(true);
    try {
      // Get all markdown files recursively
      const result = await window.electronAPI.fs.findFiles(workingDirectory, '**/*.md');

      if (!result.success || !result.data) {
        console.error('[WikiTree] Failed to find markdown files:', result.error);
        setWikiFiles([]);
        return;
      }

      const mdFiles = result.data;
      logger.info(`[WikiTree] Found ${mdFiles.length} markdown files`);

      // Parse each markdown file
      const parsedFiles: WikiFileNode[] = [];

      for (const filePath of mdFiles) {
        const content = await readFile(filePath);
        if (content === null) continue;

        const filename = filePath.split(/[\\/]/).pop() || filePath;
        const parsed = parseMarkdown(content);
        const title = extractMarkdownTitle(content, filename);
        const headingHierarchy = buildHeadingHierarchy(parsed.headings);

        parsedFiles.push({
          path: filePath,
          filename,
          title,
          headings: headingHierarchy,
          linkCount: parsed.links.length,
        });
      }

      // Sort by title
      parsedFiles.sort((a, b) => a.title.localeCompare(b.title));

      setWikiFiles(parsedFiles);
    } catch (error) {
      console.error('[WikiTree] Failed to load markdown files:', error);
      setWikiFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileClick = async (file: WikiFileNode) => {
    const content = await readFile(file.path);
    if (content !== null) {
      const language = getLanguageFromFilename(file.filename);
      openFile({
        path: file.path,
        filename: file.filename,
        content,
        language,
      });
    }
  };

  const toggleExpanded = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const renderHeadingNode = (node: HeadingNode, fileIsActive: boolean, depth: number = 0) => {
    const hasChildren = node.children.length > 0;

    return (
      <div key={`${node.heading.line}-${depth}`} style={{ marginLeft: `${depth * 12}px` }}>
        <div
          className={`flex items-center gap-1 py-0.5 text-xs cursor-pointer hover:bg-muted/50 rounded px-1 ${
            fileIsActive ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          <Hash className="h-3 w-3 shrink-0" />
          <span className="truncate">{node.heading.text}</span>
        </div>
        {hasChildren && node.children.map((child) => renderHeadingNode(child, fileIsActive, depth + 1))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        {t('wikiTree.loading')}
      </div>
    );
  }

  if (!workingDirectory) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <FileText className="mb-2 h-8 w-8 opacity-50" />
        <p className="text-sm">{t('wikiTree.selectDirectoryMessage')}</p>
      </div>
    );
  }

  if (wikiFiles.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        {t('wikiTree.noMarkdownFiles')}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {wikiFiles.map((file) => {
        const isExpanded = expandedFiles.has(file.path);
        const isActive = activeFilePath === file.path;
        const hasHeadings = file.headings.length > 0;

        return (
          <div key={file.path} className="select-none">
            {/* File Row */}
            <div
              className={`flex items-center gap-1 py-1 px-1 rounded cursor-pointer group ${
                isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
              }`}
              onClick={() => handleFileClick(file)}
            >
              {hasHeadings ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(file.path);
                  }}
                  className="shrink-0 p-0.5 hover:bg-muted rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              ) : (
                <div className="w-4" />
              )}

              <FileText className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />

              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className={`text-sm truncate ${isActive ? 'font-medium' : ''}`}>{file.title}</span>
                {file.linkCount > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0">
                    <ExternalLink className="h-3 w-3" />
                    {file.linkCount}
                  </span>
                )}
              </div>
            </div>

            {/* Headings Tree */}
            {isExpanded && hasHeadings && (
              <div className="ml-5 mt-0.5 space-y-0.5">
                {file.headings.map((headingNode) => renderHeadingNode(headingNode, isActive))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
