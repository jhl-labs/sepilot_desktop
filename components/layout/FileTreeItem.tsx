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

import { useState, useEffect } from 'react';
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
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const [children, setChildren] = useState(node.children);
  const [isDragOver, setIsDragOver] = useState(false);
  const { deleteItem, renameItem, readDirectory, isAvailable } = useFileSystem();
  const { copyFiles, cutFiles, pasteFiles } = useFileClipboard();
  const { workingDirectory, expandedFolderPaths, toggleExpandedFolder } = useChatStore();

  // Get expanded state from store
  const isExpanded = expandedFolderPaths.has(node.path);

  // Sync children state with node.children when it changes
  useEffect(() => {
    setChildren(node.children);
  }, [node.children]);

  // Auto-load children if folder is expanded but children not loaded yet
  useEffect(() => {
    if (node.isDirectory && isExpanded && !children && isAvailable) {
      console.log(`[FileTreeItem] Auto-loading expanded directory: ${node.path}`);
      readDirectory(node.path).then((loadedChildren) => {
        if (loadedChildren) {
          setChildren(loadedChildren);
        }
      });
    }
  }, [isExpanded, node.isDirectory, node.path, children, isAvailable, readDirectory]);

  const handleClick = async () => {
    if (node.isDirectory) {
      // Lazy load children if not loaded yet
      if (!children && isAvailable) {
        console.log(`[FileTreeItem] Lazy loading directory: ${node.path}`);
        const loadedChildren = await readDirectory(node.path);
        if (loadedChildren) {
          setChildren(loadedChildren);
          toggleExpandedFolder(node.path);
        }
      } else {
        // Toggle if children already loaded
        toggleExpandedFolder(node.path);
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

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    // Store the dragged item's path, name, and type in the dataTransfer
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.setData('application/sepilot-path', node.path);
    e.dataTransfer.setData('application/sepilot-name', node.name);
    e.dataTransfer.setData('application/sepilot-isdir', String(node.isDirectory));
    e.dataTransfer.effectAllowed = 'copyMove';
    console.log('[FileTreeItem] Drag started:', node.path);
  };

  const handleDragOver = (e: React.DragEvent) => {
    // Only allow drop on directories
    if (!node.isDirectory) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const draggedPath = e.dataTransfer.getData('application/sepilot-path');

    // Don't allow dropping on itself
    if (draggedPath === node.path) {
      return;
    }

    // Don't allow dropping a parent folder into its child
    // Normalize paths and check if node.path is inside draggedPath
    const normalizedNodePath = node.path.replace(/\\/g, '/');
    const normalizedDraggedPath = draggedPath.replace(/\\/g, '/');
    if (normalizedNodePath.startsWith(`${normalizedDraggedPath}/`)) {
      return;
    }

    // Determine operation based on modifier keys (Ctrl/Cmd for copy, default is move)
    const isCopy = e.ctrlKey || e.metaKey;
    e.dataTransfer.dropEffect = isCopy ? 'copy' : 'move';

    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!node.isDirectory || !isAvailable || !window.electronAPI) {
      console.warn('[FileTreeItem] Drop not allowed');
      return;
    }

    const draggedPath = e.dataTransfer.getData('application/sepilot-path');
    const draggedName = e.dataTransfer.getData('application/sepilot-name');

    if (!draggedPath || !draggedName) {
      console.warn('[FileTreeItem] No dragged path or name found');
      return;
    }

    // Don't allow dropping on itself
    if (draggedPath === node.path) {
      console.warn('[FileTreeItem] Cannot drop on itself');
      return;
    }

    // Don't allow dropping a parent folder into its child
    // Normalize paths and check if node.path is inside draggedPath
    const normalizedNodePath = node.path.replace(/\\/g, '/');
    const normalizedDraggedPath = draggedPath.replace(/\\/g, '/');
    if (normalizedNodePath.startsWith(`${normalizedDraggedPath}/`)) {
      console.warn('[FileTreeItem] Cannot drop parent into child');
      return;
    }

    // Use IPC to resolve the target path correctly (handles Windows/POSIX paths)
    const targetPathResult = await window.electronAPI.fs.resolvePath(node.path, draggedName);
    if (!targetPathResult.success || !targetPathResult.data) {
      console.error('[FileTreeItem] Failed to resolve target path:', targetPathResult.error);
      window.alert('대상 경로 생성 실패');
      return;
    }

    const targetPath = targetPathResult.data;
    const isCopy = e.ctrlKey || e.metaKey;
    console.log(
      `[FileTreeItem] Dropping: ${draggedPath} -> ${targetPath} (${isCopy ? 'copy' : 'move'})`
    );

    try {
      if (isCopy) {
        // Copy operation using duplicate then rename
        const duplicateResult = await window.electronAPI.fs.duplicate(draggedPath);
        if (duplicateResult.success && duplicateResult.data) {
          // Move the duplicated file to target location
          const success = await renameItem(duplicateResult.data, targetPath);
          if (success) {
            console.log('[FileTreeItem] Copied successfully');
            onRefresh();
          } else {
            // Clean up the duplicate if move failed
            await deleteItem(duplicateResult.data);
            window.alert('복사 실패');
          }
        } else {
          window.alert('복사 실패');
        }
      } else {
        // Move operation
        const success = await renameItem(draggedPath, targetPath);
        if (success) {
          console.log('[FileTreeItem] Moved successfully');
          onRefresh();
        } else {
          window.alert('이동 실패');
        }
      }
    } catch (error) {
      console.error('[FileTreeItem] Error during drop:', error);
      window.alert(isCopy ? '복사 실패' : '이동 실패');
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
            draggable
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'flex w-full items-center gap-1 px-2 py-1 text-sm hover:bg-accent rounded transition-colors text-left',
              isActive && 'bg-accent text-accent-foreground font-medium',
              isDragOver && node.isDirectory && 'bg-primary/20 ring-2 ring-primary'
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
