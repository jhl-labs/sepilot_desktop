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

import { useState, useEffect, useRef } from 'react';
import { Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useChatStore } from '@/lib/store/chat-store';
import { useFileSystem } from '@/hooks/use-file-system';
import { getLanguageFromFilename } from '@/lib/utils/file-language';
import { FileTreeItem, type FileNode } from './FileTreeItem';
import { isElectron } from '@/lib/platform';
import path from 'path-browserify';

export function FileExplorer() {
  const { workingDirectory, setWorkingDirectory, openFile, activeFilePath, loadWorkingDirectory } =
    useChatStore();
  const [fileTree, setFileTree] = useState<FileNode[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showNewItemDialog, setShowNewItemDialog] = useState(false);
  const [newItemType, setNewItemType] = useState<'file' | 'folder'>('file');
  const [newItemParentPath, setNewItemParentPath] = useState<string>('');
  const [newItemName, setNewItemName] = useState('');
  const { readDirectory, readFile, createFile, createDirectory } = useFileSystem();

  // Ref for dialog input
  const newItemInputRef = useRef<HTMLInputElement>(null);

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

  // Focus input when new item dialog opens
  useEffect(() => {
    if (showNewItemDialog) {
      // Use setTimeout to wait for Dialog animation to complete
      const timer = setTimeout(() => {
        newItemInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [showNewItemDialog]);

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

  const handleCreateItem = async () => {
    if (!newItemName || !newItemParentPath) {
      console.warn('[FileExplorer] Cannot create item - missing name or parent path');
      return;
    }

    const itemPath = path.join(newItemParentPath, newItemName);
    console.log(`[FileExplorer] Creating ${newItemType}: ${itemPath}`);

    const success =
      newItemType === 'file' ? await createFile(itemPath, '') : await createDirectory(itemPath);

    if (success) {
      setShowNewItemDialog(false);
      setNewItemName('');
      if (workingDirectory) {
        loadFileTree(workingDirectory);
      }
    } else {
      window.alert(`${newItemType === 'file' ? '파일' : '폴더'} 생성 실패`);
    }
  };

  const openNewItemDialog = (type: 'file' | 'folder', parentPath: string) => {
    setNewItemType(type);
    setNewItemParentPath(parentPath);
    setNewItemName('');
    setShowNewItemDialog(true);
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
          {workingDirectory ? (
            <div className="text-xs text-muted-foreground break-all bg-muted/50 rounded px-2 py-1.5">
              {workingDirectory}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">디렉토리를 선택하세요</div>
          )}
        </div>
      </div>

      {/* File Tree */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex-1 overflow-y-auto px-2 py-2">
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
                    onNewFile={(parentPath) => openNewItemDialog('file', parentPath)}
                    onNewFolder={(parentPath) => openNewItemDialog('folder', parentPath)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                빈 디렉토리
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        {workingDirectory && (
          <ContextMenuContent>
            <ContextMenuItem onClick={() => openNewItemDialog('file', workingDirectory)}>
              새 파일
            </ContextMenuItem>
            <ContextMenuItem onClick={() => openNewItemDialog('folder', workingDirectory)}>
              새 폴더
            </ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>

      {/* New Item Dialog */}
      <Dialog open={showNewItemDialog} onOpenChange={setShowNewItemDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 {newItemType === 'file' ? '파일' : '폴더'} 생성</DialogTitle>
            <DialogDescription>
              {newItemType === 'file'
                ? '파일 이름을 입력하세요 (확장자 포함)'
                : '폴더 이름을 입력하세요'}
            </DialogDescription>
          </DialogHeader>
          <Input
            ref={newItemInputRef}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateItem();
              }
            }}
            placeholder={newItemType === 'file' ? '예: example.txt' : '예: my-folder'}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewItemDialog(false)}>
              취소
            </Button>
            <Button onClick={handleCreateItem}>생성</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
