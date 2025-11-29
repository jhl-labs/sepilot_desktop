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
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, Edit3, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { isElectron } from '@/lib/platform';
import { useFileSystem } from '@/hooks/use-file-system';
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
}

export function FileTreeItem({
  node,
  level,
  isActive,
  onFileClick,
  onRefresh,
  parentPath,
}: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const { deleteItem, renameItem, readDirectory } = useFileSystem();

  const handleClick = async () => {
    if (node.isDirectory) {
      setIsExpanded(!isExpanded);

      // Lazy load children if not loaded yet
      if (!node.children && isElectron() && window.electronAPI) {
        try {
          const children = await readDirectory(node.path);
          if (children) {
            node.children = children;
            setIsExpanded(true);
          }
        } catch (error) {
          console.error('[FileTreeItem] Failed to load directory:', error);
        }
      }
    } else {
      onFileClick(node.path, node.name);
    }
  };

  const handleDelete = async () => {
    const itemType = node.isDirectory ? '폴더와 내용' : '파일';
    const confirmed = confirm(`"${node.name}" ${itemType}을(를) 삭제하시겠습니까?`);
    if (!confirmed) {return;}

    const success = await deleteItem(node.path);
    if (success) {
      onRefresh();
    } else {
      alert(`삭제 실패`);
    }
  };

  const handleRename = async () => {
    if (!newName || newName === node.name) {
      setIsRenaming(false);
      setNewName(node.name);
      return;
    }

    const newPath = path.join(parentPath, newName);
    const success = await renameItem(node.path, newPath);

    if (success) {
      setIsRenaming(false);
      onRefresh();
    } else {
      alert(`이름 변경 실패`);
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

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
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
              isActive={!child.isDirectory && isActive && child.path === node.path}
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
