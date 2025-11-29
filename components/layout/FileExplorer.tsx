/**
 * File Explorer Component
 *
 * Main file explorer UI for Editor mode with:
 * - Directory selection
 * - File tree browsing with lazy loading
 * - File/folder creation via toolbar
 * - Context menu actions (rename, delete)
 * - File opening in Monaco Editor
 */

'use client';

import { useState, useEffect } from 'react';
import { Folder, FolderPlus, FilePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useChatStore } from '@/lib/store/chat-store';
import { useFileSystem } from '@/hooks/use-file-system';
import { getLanguageFromFilename } from '@/lib/utils/file-language';
import { FileTreeItem, type FileNode } from './FileTreeItem';
import { isElectron } from '@/lib/platform';
import path from 'path-browserify';

export function FileExplorer() {
  const { workingDirectory, setWorkingDirectory, openFile, activeFilePath, loadWorkingDirectory } = useChatStore();
  const [fileTree, setFileTree] = useState<FileNode[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const { readDirectory, readFile, createFile, createDirectory } = useFileSystem();

  // Restore saved working directory on mount
  useEffect(() => {
    loadWorkingDirectory();
  }, [loadWorkingDirectory]);

  // Load file tree when working directory changes
  useEffect(() => {
    if (!workingDirectory) {
      setFileTree(null);
      return;
    }

    loadFileTree(workingDirectory);
  }, [workingDirectory]);

  const loadFileTree = async (dirPath: string) => {
    console.log(`[FileExplorer] Loading file tree: ${dirPath}`);
    setIsLoading(true);
    try {
      const data = await readDirectory(dirPath);
      if (data) {
        setFileTree(data);
      }
    } catch (error) {
      console.error('[FileExplorer] Failed to load file tree:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDirectory = async () => {
    if (!isElectron() || !window.electronAPI) {
      console.warn('[FileExplorer] Directory selection is only available in Electron');
      return;
    }

    try {
      const result = await window.electronAPI.file.selectDirectory();
      if (result.success && result.data) {
        console.log(`[FileExplorer] Directory selected: ${result.data}`);
        setWorkingDirectory(result.data);
      }
    } catch (error) {
      console.error('[FileExplorer] Failed to select directory:', error);
    }
  };

  const handleFileClick = async (filePath: string, filename: string) => {
    console.log(`[FileExplorer] Opening file: ${filePath}`);
    const content = await readFile(filePath);
    if (content !== null) {
      const language = getLanguageFromFilename(filename);
      console.log(`[FileExplorer] File loaded with language: ${language}`);

      openFile({
        path: filePath,
        filename,
        content,
        language,
      });
    } else {
      console.error('[FileExplorer] Failed to read file');
    }
  };

  const handleCreateFile = async () => {
    if (!newItemName || !workingDirectory) {
      console.warn('[FileExplorer] Cannot create file - missing name or working directory');
      return;
    }

    const filePath = path.join(workingDirectory, newItemName);
    console.log(`[FileExplorer] Creating file: ${filePath}`);
    const success = await createFile(filePath, '');

    if (success) {
      setShowNewFileDialog(false);
      setNewItemName('');
      loadFileTree(workingDirectory);
    } else {
      alert(`파일 생성 실패`);
    }
  };

  const handleCreateFolder = async () => {
    if (!newItemName || !workingDirectory) {
      console.warn('[FileExplorer] Cannot create folder - missing name or working directory');
      return;
    }

    const dirPath = path.join(workingDirectory, newItemName);
    console.log(`[FileExplorer] Creating folder: ${dirPath}`);
    const success = await createDirectory(dirPath);

    if (success) {
      setShowNewFolderDialog(false);
      setNewItemName('');
      loadFileTree(workingDirectory);
    } else {
      alert(`폴더 생성 실패`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Working Directory Selection */}
      <div className="shrink-0 border-b px-3 py-3">
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
                isActive={activeFilePath === node.path}
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
    </div>
  );
}
