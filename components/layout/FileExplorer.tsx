'use client';

import { useState, useEffect } from 'react';
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';
import { cn } from '@/lib/utils';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

interface FileTreeItemProps {
  node: FileNode;
  level: number;
  onFileClick: (path: string, filename: string) => void;
}

function FileTreeItem({ node, level, onFileClick }: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { activeFilePath } = useChatStore();

  const handleClick = async () => {
    if (node.isDirectory) {
      setIsExpanded(!isExpanded);

      // Lazy load children if not loaded yet
      if (!node.children && isElectron() && window.electronAPI) {
        try {
          const result = await window.electronAPI.fs.readDirectory(node.path);
          if (result.success && result.data) {
            node.children = result.data;
            setIsExpanded(true);
          }
        } catch (error) {
          console.error('Failed to load directory:', error);
        }
      }
    } else {
      onFileClick(node.path, node.name);
    }
  };

  const isActive = !node.isDirectory && activeFilePath === node.path;

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'flex w-full items-center gap-1 px-2 py-1 text-sm hover:bg-accent rounded transition-colors text-left',
          isActive && 'bg-accent text-accent-foreground font-medium'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {node.isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-blue-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <File className="h-4 w-4 shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              level={level + 1}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer() {
  const { workingDirectory, setWorkingDirectory, openFile } = useChatStore();
  const [fileTree, setFileTree] = useState<FileNode[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load file tree when working directory changes
  useEffect(() => {
    if (!workingDirectory) {
      setFileTree(null);
      return;
    }

    loadFileTree(workingDirectory);
  }, [workingDirectory]);

  const loadFileTree = async (dirPath: string) => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await window.electronAPI.fs.readDirectory(dirPath);
      if (result.success && result.data) {
        setFileTree(result.data);
      }
    } catch (error) {
      console.error('Failed to load file tree:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDirectory = async () => {
    if (!isElectron() || !window.electronAPI) {
      console.warn('Directory selection is only available in Electron');
      return;
    }

    try {
      const result = await window.electronAPI.file.selectDirectory();
      if (result.success && result.data) {
        setWorkingDirectory(result.data);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleFileClick = async (path: string, filename: string) => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    try {
      const result = await window.electronAPI.fs.readFile(path);
      if (result.success && result.data) {
        // Determine language from file extension
        const ext = filename.split('.').pop()?.toLowerCase();
        const languageMap: Record<string, string> = {
          ts: 'typescript',
          tsx: 'typescript',
          js: 'javascript',
          jsx: 'javascript',
          json: 'json',
          md: 'markdown',
          css: 'css',
          html: 'html',
          py: 'python',
          java: 'java',
          c: 'c',
          cpp: 'cpp',
          h: 'c',
          sh: 'shell',
          txt: 'plaintext',
        };

        const language = ext ? languageMap[ext] || 'plaintext' : 'plaintext';

        openFile({
          path,
          filename,
          content: result.data,
          language,
        });
      }
    } catch (error) {
      console.error('Failed to read file:', error);
    }
  };

  return (
    <>
      {/* Working Directory Selection */}
      <div className="border-b px-3 py-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Working Directory
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSelectDirectory}
              title="디렉토리 선택"
              className="h-7 w-7"
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
          </div>
          {workingDirectory ? (
            <div className="text-xs text-muted-foreground break-all bg-muted/50 rounded px-2 py-1.5">
              {workingDirectory}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">
              디렉토리를 선택하세요
            </div>
          )}
        </div>
      </div>

      {/* File Tree */}
      <ScrollArea className="flex-1 px-2 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            로딩 중...
          </div>
        ) : !workingDirectory ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Folder className="mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">디렉토리를 선택하세요</p>
            <p className="mt-1 text-xs">파일 탐색을 시작합니다</p>
          </div>
        ) : fileTree && fileTree.length > 0 ? (
          <div className="space-y-0.5">
            {fileTree.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                level={0}
                onFileClick={handleFileClick}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            빈 디렉토리
          </div>
        )}
      </ScrollArea>
    </>
  );
}
