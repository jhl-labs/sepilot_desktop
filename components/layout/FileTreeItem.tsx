/**
 * File Tree Item Component
 *
 * Represents a single file or directory in the file tree.
 * Supports:
 * - Lazy loading of directory contents
 * - Context menu (rename, delete)
 * - Inline rename editing
 * - Keyboard shortcuts (Enter, Escape)
 * - Performance optimized with React.memo and useCallback
 */

'use client';

import { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { Folder, FolderOpen, File, ChevronRight, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { useFileSystem } from '@/hooks/use-file-system';
import { useFileClipboard } from '@/hooks/use-file-clipboard';
import { useChatStore } from '@/lib/store/chat-store';
import { FileTreeContextMenu } from './FileTreeContextMenu';

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

// Memoized FileTreeItem component for better performance
export const FileTreeItem = memo(function FileTreeItem({
  node,
  level,
  isActive,
  onFileClick,
  onRefresh,
  parentPath,
  onNewFile,
  onNewFolder,
}: FileTreeItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const [children, setChildren] = useState(node.children);
  const [isDragOver, setIsDragOver] = useState(false);
  const { deleteItem, renameItem, readDirectory, isAvailable } = useFileSystem();
  const { copyFiles, cutFiles, pasteFiles } = useFileClipboard();

  // Use selective store subscription for better performance
  const workingDirectory = useChatStore((state) => state.workingDirectory);
  const expandedFolderPaths = useChatStore((state) => state.expandedFolderPaths);
  const toggleExpandedFolder = useChatStore((state) => state.toggleExpandedFolder);

  // Get expanded state from store - memoize to prevent unnecessary re-renders
  const isExpanded = useMemo(
    () => expandedFolderPaths.has(node.path),
    [expandedFolderPaths, node.path]
  );

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

  const handleClick = useCallback(async () => {
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
  }, [
    node.isDirectory,
    node.path,
    node.name,
    children,
    isAvailable,
    readDirectory,
    toggleExpandedFolder,
    onFileClick,
  ]);

  const handleDelete = useCallback(async () => {
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
  }, [node.isDirectory, node.name, node.path, deleteItem, onRefresh]);

  const handleRename = useCallback(async () => {
    if (!newName || newName.trim() === '' || newName === node.name) {
      console.log('[FileTreeItem] Rename cancelled - no change or empty name');
      setIsRenaming(false);
      setNewName(node.name);
      return;
    }

    if (!isAvailable || !window.electronAPI) {
      console.warn('[FileTreeItem] API unavailable');
      setIsRenaming(false);
      setNewName(node.name);
      return;
    }

    // Use IPC to resolve the new path correctly (handles Windows/POSIX paths)
    const newPathResult = await window.electronAPI.fs.resolvePath(parentPath, newName.trim());
    if (!newPathResult.success || !newPathResult.data) {
      console.error('[FileTreeItem] Failed to resolve new path:', newPathResult.error);
      window.alert(`이름 변경 실패: 새 경로 생성 실패`);
      setIsRenaming(false);
      setNewName(node.name);
      return;
    }

    const newPath = newPathResult.data;
    console.log(`[FileTreeItem] Renaming: ${node.path} -> ${newPath}`);
    const success = await renameItem(node.path, newPath);

    if (success) {
      setIsRenaming(false);
      onRefresh();
    } else {
      window.alert(`이름 변경 실패`);
      setNewName(node.name);
    }
  }, [newName, node.name, node.path, isAvailable, parentPath, renameItem, onRefresh]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleRename();
      } else if (e.key === 'Escape') {
        setIsRenaming(false);
        setNewName(node.name);
      }
    },
    [handleRename, node.name]
  );

  const handleCopy = useCallback(() => {
    copyFiles([node.path]);
    console.log('[FileTreeItem] Copied to clipboard:', node.path);
  }, [copyFiles, node.path]);

  const handleCut = useCallback(() => {
    cutFiles([node.path]);
    console.log('[FileTreeItem] Cut to clipboard:', node.path);
  }, [cutFiles, node.path]);

  const handlePaste = useCallback(async () => {
    if (!node.isDirectory) {
      console.warn('[FileTreeItem] Cannot paste into a file');
      return;
    }

    console.log('[FileTreeItem] Pasting into:', node.path);
    await pasteFiles(node.path, onRefresh);
  }, [node.isDirectory, node.path, pasteFiles, onRefresh]);

  const handleCopyPath = useCallback(async () => {
    // node.path is already an absolute path from the file system
    const success = await copyToClipboard(node.path);
    if (success) {
      console.log('[FileTreeItem] Absolute path copied:', node.path);
    } else {
      console.error('[FileTreeItem] Failed to copy path to clipboard');
    }
  }, [node.path]);

  const handleCopyRelativePath = useCallback(async () => {
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
  }, [isAvailable, workingDirectory, node.path]);

  const handleShowInFolder = useCallback(async () => {
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
  }, [isAvailable, node.path]);

  const handleOpenInTerminal = useCallback(() => {
    // Get the directory path (if file, use parent directory)
    const dirPath = node.isDirectory ? node.path : parentPath;

    // Set working directory and show terminal panel
    useChatStore.getState().setWorkingDirectory(dirPath);
    useChatStore.getState().setShowTerminalPanel(true);

    console.log('[FileTreeItem] Opening terminal in:', dirPath);
  }, [node.isDirectory, node.path, parentPath]);

  const handleDuplicate = useCallback(async () => {
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
  }, [isAvailable, node.path, onRefresh]);

  // Copy file/folder name to clipboard
  const handleCopyFileName = useCallback(async () => {
    const success = await copyToClipboard(node.name);
    if (success) {
      console.log('[FileTreeItem] File name copied:', node.name);
    } else {
      console.error('[FileTreeItem] Failed to copy file name');
    }
  }, [node.name]);

  // Open file with default system application
  const handleOpenWith = useCallback(async () => {
    if (!isAvailable || !window.electronAPI) {
      console.warn('[FileTreeItem] API unavailable');
      return;
    }

    try {
      const result = await window.electronAPI.fs.openWithDefaultApp(node.path);
      if (result.success) {
        console.log('[FileTreeItem] Opened with default app:', node.path);
      } else {
        console.error('[FileTreeItem] Failed to open with default app:', result.error);
        window.alert('기본 앱으로 열기 실패');
      }
    } catch (error) {
      console.error('[FileTreeItem] Error opening with default app:', error);
      window.alert('기본 앱으로 열기 실패');
    }
  }, [isAvailable, node.path]);

  // Find in folder - opens search panel with folder scope
  const handleFindInFolder = useCallback(() => {
    // TODO: Implement setSearchScope in ChatStore for folder-scoped search
    useChatStore.getState().setActiveEditorTab?.('search');
    console.log('[FileTreeItem] Find in folder:', node.path);
  }, [node.path]);

  // Collapse all children folders
  const handleCollapseAll = useCallback(() => {
    const store = useChatStore.getState();
    const expandedPaths = store.expandedFolderPaths;

    // Find all expanded paths that start with this folder's path
    const pathsToCollapse = Array.from(expandedPaths).filter(
      (p) => p === node.path || p.startsWith(`${node.path}/`) || p.startsWith(`${node.path}\\`)
    );

    // Collapse all matching paths
    pathsToCollapse.forEach((p) => {
      if (expandedPaths.has(p)) {
        store.toggleExpandedFolder(p);
      }
    });

    console.log('[FileTreeItem] Collapsed all children:', pathsToCollapse.length, 'folders');
  }, [node.path]);

  // Drag & Drop Handlers - memoized for performance
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.stopPropagation();
      // Store the dragged item's path, name, and type in the dataTransfer
      e.dataTransfer.setData('text/plain', node.path);
      e.dataTransfer.setData('application/sepilot-path', node.path);
      e.dataTransfer.setData('application/sepilot-name', node.name);
      e.dataTransfer.setData('application/sepilot-isdir', String(node.isDirectory));
      e.dataTransfer.effectAllowed = 'copyMove';
      console.log('[FileTreeItem] Drag started:', node.path);
    },
    [node.path, node.name, node.isDirectory]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
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
    },
    [node.isDirectory, node.path]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
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
    },
    [node.isDirectory, node.path, isAvailable, renameItem, deleteItem, onRefresh]
  );

  return (
    <div>
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
          onCopyFileName={handleCopyFileName}
          onShowInFolder={handleShowInFolder}
          onOpenInTerminal={handleOpenInTerminal}
          onOpenWith={!node.isDirectory ? handleOpenWith : undefined}
          onDuplicate={handleDuplicate}
          onRefresh={onRefresh}
          onFindInFolder={node.isDirectory ? handleFindInFolder : undefined}
          onCollapseAll={node.isDirectory ? handleCollapseAll : undefined}
        >
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
        </FileTreeContextMenu>
      )}

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
});

// Display name for debugging
FileTreeItem.displayName = 'FileTreeItem';
