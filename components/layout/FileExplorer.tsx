'use client';

import { useState, useEffect } from 'react';
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, FolderPlus, FilePlus, Trash2, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';
import { cn } from '@/lib/utils';
import path from 'path-browserify';

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
  onRefresh: () => void;
  parentPath: string;
}

function FileTreeItem({ node, level, onFileClick, onRefresh, parentPath }: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
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

  const handleDelete = async () => {
    if (!isElectron() || !window.electronAPI) {return;}

    const confirmed = confirm(
      `"${node.name}"${node.isDirectory ? ' 폴더와 내용' : ''}을(를) 삭제하시겠습니까?`
    );
    if (!confirmed) {return;}

    try {
      const result = await window.electronAPI.fs.delete(node.path);
      if (result.success) {
        onRefresh();
      } else {
        alert(`삭제 실패: ${result.error}`);
      }
    } catch (error: any) {
      alert(`삭제 실패: ${error.message}`);
    }
  };

  const handleRename = async () => {
    if (!newName || newName === node.name) {
      setIsRenaming(false);
      return;
    }

    if (!isElectron() || !window.electronAPI) {return;}

    try {
      const newPath = path.join(parentPath, newName);
      const result = await window.electronAPI.fs.rename(node.path, newPath);
      if (result.success) {
        setIsRenaming(false);
        onRefresh();
      } else {
        alert(`이름 변경 실패: ${result.error}`);
      }
    } catch (error: any) {
      alert(`이름 변경 실패: ${error.message}`);
    }
  };

  const isActive = !node.isDirectory && activeFilePath === node.path;

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {isRenaming ? (
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {handleRename();}
                if (e.key === 'Escape') {
                  setIsRenaming(false);
                  setNewName(node.name);
                }
              }}
              className="h-auto px-2 py-1 text-sm"
              style={{ marginLeft: `${level * 12 + 8}px` }}
              autoFocus
            />
          ) : (
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
          )}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setIsRenaming(true)}>
            <Edit3 className="mr-2 h-4 w-4" />
            이름 변경
          </ContextMenuItem>
          <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            삭제
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              level={level + 1}
              onFileClick={onFileClick}
              onRefresh={onRefresh}
              parentPath={node.path}
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
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newItemName, setNewItemName] = useState('');

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

  const handleCreateFile = async () => {
    if (!newItemName || !workingDirectory || !isElectron() || !window.electronAPI) {
      return;
    }

    try {
      const filePath = path.join(workingDirectory, newItemName);
      const result = await window.electronAPI.fs.createFile(filePath, '');
      if (result.success) {
        setShowNewFileDialog(false);
        setNewItemName('');
        loadFileTree(workingDirectory);
      } else {
        alert(`파일 생성 실패: ${result.error}`);
      }
    } catch (error: any) {
      alert(`파일 생성 실패: ${error.message}`);
    }
  };

  const handleCreateFolder = async () => {
    if (!newItemName || !workingDirectory || !isElectron() || !window.electronAPI) {
      return;
    }

    try {
      const dirPath = path.join(workingDirectory, newItemName);
      const result = await window.electronAPI.fs.createDirectory(dirPath);
      if (result.success) {
        setShowNewFolderDialog(false);
        setNewItemName('');
        loadFileTree(workingDirectory);
      } else {
        alert(`폴더 생성 실패: ${result.error}`);
      }
    } catch (error: any) {
      alert(`폴더 생성 실패: ${error.message}`);
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
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowNewFileDialog(true)}
                title="새 파일"
                className="h-7 w-7"
                disabled={!workingDirectory}
              >
                <FilePlus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowNewFolderDialog(true)}
                title="새 폴더"
                className="h-7 w-7"
                disabled={!workingDirectory}
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSelectDirectory}
                title="디렉토리 선택"
                className="h-7 w-7"
              >
                <Folder className="h-4 w-4" />
              </Button>
            </div>
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
                onRefresh={() => loadFileTree(workingDirectory!)}
                parentPath={workingDirectory!}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            빈 디렉토리
          </div>
        )}
      </ScrollArea>

      {/* New File Dialog */}
      <Dialog open={showNewFileDialog} onOpenChange={setShowNewFileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 파일 생성</DialogTitle>
            <DialogDescription>
              파일 이름을 입력하세요 (확장자 포함)
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {handleCreateFile();}
            }}
            placeholder="예: example.txt"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFileDialog(false)}>
              취소
            </Button>
            <Button onClick={handleCreateFile}>생성</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 폴더 생성</DialogTitle>
            <DialogDescription>
              폴더 이름을 입력하세요
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {handleCreateFolder();}
            }}
            placeholder="예: my-folder"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>
              취소
            </Button>
            <Button onClick={handleCreateFolder}>생성</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
