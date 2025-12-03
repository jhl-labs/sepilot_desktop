/**
 * File Tree Item Component
 *
 * Represents a single file or directory in the file tree.
 * Supports:
 * - Lazy loading of directory contents
 * - Context menu (rename, delete)
 * - Inline rename editing
 * - Keyboard shortcuts (Enter, Escape)
 */

'use client';

import { useState } from 'react';
import { Folder, FolderOpen, File, ChevronRight, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { useFileSystem } from '@/hooks/use-file-system';
import { useFileClipboard } from '@/hooks/use-file-clipboard';
import { useChatStore } from '@/lib/store/chat-store';
import { FileTreeContextMenu } from './FileTreeContextMenu';
import path from 'path-browserify';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

interface FileTreeItemProps {
  node: FileNode;
  level: number;
  isActive: boolean;
  onFileClick: (path: string, filename: string) => void;
  onRefresh: () => void;
  parentPath: string;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
}

export function FileTreeItem({
  node,
  level,
  isActive,
  onFileClick,
  onRefresh,
  onNewFile,
  onNewFolder,
}: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const [children, setChildren] = useState(node.children);
  const { deleteItem, renameItem, readDirectory, isAvailable } = useFileSystem();
  const { copyFiles, cutFiles, pasteFiles } = useFileClipboard();
  const { workingDirectory } = useChatStore();

  const handleClick = async () => {
    if (node.isDirectory) {
      // Lazy load children if not loaded yet
      if (!children && isAvailable) {
        console.log(`[FileTreeItem] Lazy loading directory: ${node.path}`);
        const loadedChildren = await readDirectory(node.path);
        if (loadedChildren) {
          setChildren(loadedChildren);
          setIsExpanded(true);
        }
      } else {
        // Toggle if children already loaded
        setIsExpanded(!isExpanded);
      }
    } else {
      onFileClick(node.path, node.name);
    }
  };

  const handleDelete = async () => {
    const itemType = node.isDirectory ? '폴더와 내용' : '파일';
    const confirmed = window.confirm(`"${node.name}" ${itemType}을(를) 삭제하시겠습니까?`);
    if (!confirmed) {
      console.log('[FileTreeItem] Delete cancelled by user');
      return;
    }

    console.log(`[FileTreeItem] Deleting: ${node.path}`);
    const success = await deleteItem(node.path);
    if (success) {
      onRefresh();
    } else {
      window.alert(`삭제 실패`);
    }
  };

  const handleRename = async () => {
    if (!newName || newName === node.name) {
      console.log('[FileTreeItem] Rename cancelled - no change or empty name');
      setIsRenaming(false);
      setNewName(node.name);
      return;
    }

    // 현재 파일/폴더의 부모 디렉토리 경로를 추출
    const currentDir = path.dirname(node.path);
    const newPath = path.join(currentDir, newName);
    console.log(`[FileTreeItem] Renaming: ${node.path} -> ${newPath}`);
    console.log(`[FileTreeItem] Current dir: ${currentDir}, New name: ${newName}`);
    const success = await renameItem(node.path, newPath);

    if (success) {
      setIsRenaming(false);
      onRefresh();
    } else {
      window.alert(`이름 변경 실패`);
      setNewName(node.name);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
      setNewName(node.name);
    }
  };

  const handleCopy = () => {
    copyFiles([node.path]);
    console.log('[FileTreeItem] Copied to clipboard:', node.path);
  };

  const handleCut = () => {
    cutFiles([node.path]);
    console.log('[FileTreeItem] Cut to clipboard:', node.path);
  };

  const handlePaste = async () => {
    if (!node.isDirectory) {
      console.warn('[FileTreeItem] Cannot paste into a file');
      return;
    }

    console.log('[FileTreeItem] Pasting into:', node.path);
    await pasteFiles(node.path, onRefresh);
  };

  const handleCopyPath = async () => {
    if (!isAvailable || !window.electronAPI) {
      console.warn('[FileTreeItem] API unavailable');
      return;
    }

    try {
      const result = await window.electronAPI.fs.getAbsolutePath(node.path);
      if (result.success && result.data) {
        const success = await copyToClipboard(result.data);
        if (success) {
          console.log('[FileTreeItem] Absolute path copied:', result.data);
        }
      }
    } catch (error) {
      console.error('[FileTreeItem] Error copying path:', error);
    }
  };

  const handleCopyRelativePath = async () => {
    if (!isAvailable || !window.electronAPI || !workingDirectory) {
      console.warn('[FileTreeItem] API unavailable or no working directory');
      return;
    }

    try {
      const result = await window.electronAPI.fs.getRelativePath(workingDirectory, node.path);
      if (result.success && result.data) {
        const success = await copyToClipboard(result.data);
        if (success) {
          console.log('[FileTreeItem] Relative path copied:', result.data);
        }
      }
    } catch (error) {
      console.error('[FileTreeItem] Error copying relative path:', error);
    }
  };

  const handleShowInFolder = async () => {
    if (!isAvailable || !window.electronAPI) {
      console.warn('[FileTreeItem] API unavailable');
      return;
    }

    try {
      const result = await window.electronAPI.fs.showInFolder(node.path);
      if (result.success) {
        console.log('[FileTreeItem] Showed in folder:', node.path);
      }
    } catch (error) {
      console.error('[FileTreeItem] Error showing in folder:', error);
    }
  };

  const handleOpenInTerminal = () => {
    // Get the directory path (if file, use parent directory)
    const dirPath = node.isDirectory ? node.path : path.dirname(node.path);

    // Set working directory and show terminal panel
    useChatStore.getState().setWorkingDirectory(dirPath);
    useChatStore.getState().setShowTerminalPanel(true);

    console.log('[FileTreeItem] Opening terminal in:', dirPath);
  };

  const handleDuplicate = async () => {
    if (!isAvailable || !window.electronAPI) {
      console.warn('[FileTreeItem] API unavailable');
      return;
    }

    try {
      const result = await window.electronAPI.fs.duplicate(node.path);
      if (result.success && result.data) {
        console.log('[FileTreeItem] Duplicated:', node.path, '->', result.data);
        onRefresh();
      }
    } catch (error) {
      console.error('[FileTreeItem] Error duplicating:', error);
      window.alert('복제 실패');
    }
  };

  return (
    <div>
      <FileTreeContextMenu
        filePath={node.path}
        isDirectory={node.isDirectory}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={node.isDirectory ? handlePaste : undefined}
        onRename={() => setIsRenaming(true)}
        onDelete={handleDelete}
        onNewFile={node.isDirectory ? () => onNewFile(node.path) : undefined}
        onNewFolder={node.isDirectory ? () => onNewFolder(node.path) : undefined}
        onCopyPath={handleCopyPath}
        onCopyRelativePath={handleCopyRelativePath}
        onShowInFolder={handleShowInFolder}
        onOpenInTerminal={handleOpenInTerminal}
        onDuplicate={handleDuplicate}
        onRefresh={onRefresh}
      >
        {isRenaming ? (
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
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
      </FileTreeContextMenu>

      {node.isDirectory && isExpanded && children && (
        <div>
          {children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              level={level + 1}
              isActive={isActive}
              onFileClick={onFileClick}
              onRefresh={onRefresh}
              parentPath={node.path}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
