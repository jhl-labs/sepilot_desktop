/**
 * File Tree Context Menu Component
 *
 * Centralized context menu for file tree items with:
 * - File/folder operations (copy, cut, paste, rename, delete)
 * - Path operations (copy path, copy relative path)
 * - File creation (new file, new folder)
 * - Keyboard shortcut display
 */

'use client';

import { ReactNode } from 'react';
import {
  Edit3,
  Trash2,
  FilePlus,
  FolderPlus,
  Copy,
  Scissors,
  ClipboardPaste,
  FileText,
  FolderOpen,
  Terminal,
  Files,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useFileClipboard } from '@/hooks/use-file-clipboard';

interface FileTreeContextMenuProps {
  children: ReactNode;
  filePath?: string; // Path for future use (e.g., visual feedback)
  isDirectory?: boolean;
  isRootContext?: boolean; // Empty space context (root directory)
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onCopyPath?: () => void;
  onCopyRelativePath?: () => void;
  onShowInFolder?: () => void;
  onOpenInTerminal?: () => void;
  onDuplicate?: () => void;
}

export function FileTreeContextMenu({
  children,
  filePath: _filePath, // Prefix with _ to indicate intentionally unused
  isDirectory = false,
  isRootContext = false,
  onCopy,
  onCut,
  onPaste,
  onRename,
  onDelete,
  onNewFile,
  onNewFolder,
  onCopyPath,
  onCopyRelativePath,
  onShowInFolder,
  onOpenInTerminal,
  onDuplicate,
}: FileTreeContextMenuProps) {
  const { canPaste } = useFileClipboard();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {/* Root context (empty space) - only creation and paste */}
        {isRootContext ? (
          <>
            {onNewFile && (
              <ContextMenuItem onClick={onNewFile}>
                <FilePlus className="mr-2 h-4 w-4" />새 파일
              </ContextMenuItem>
            )}
            {onNewFolder && (
              <ContextMenuItem onClick={onNewFolder}>
                <FolderPlus className="mr-2 h-4 w-4" />새 폴더
              </ContextMenuItem>
            )}
            {canPaste && onPaste && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={onPaste}>
                  <ClipboardPaste className="mr-2 h-4 w-4" />
                  붙여넣기
                  <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
                </ContextMenuItem>
              </>
            )}
          </>
        ) : (
          <>
            {/* Directory-specific options */}
            {isDirectory && (
              <>
                {onNewFile && (
                  <ContextMenuItem onClick={onNewFile}>
                    <FilePlus className="mr-2 h-4 w-4" />새 파일
                  </ContextMenuItem>
                )}
                {onNewFolder && (
                  <ContextMenuItem onClick={onNewFolder}>
                    <FolderPlus className="mr-2 h-4 w-4" />새 폴더
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
              </>
            )}

            {/* Clipboard operations */}
            {onCopy && (
              <ContextMenuItem onClick={onCopy}>
                <Copy className="mr-2 h-4 w-4" />
                복사
                <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
              </ContextMenuItem>
            )}
            {onCut && (
              <ContextMenuItem onClick={onCut}>
                <Scissors className="mr-2 h-4 w-4" />
                잘라내기
                <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
              </ContextMenuItem>
            )}
            {canPaste && onPaste && isDirectory && (
              <ContextMenuItem onClick={onPaste}>
                <ClipboardPaste className="mr-2 h-4 w-4" />
                붙여넣기
                <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
              </ContextMenuItem>
            )}

            {/* Path operations */}
            {(onCopyPath || onCopyRelativePath) && (
              <>
                <ContextMenuSeparator />
                {onCopyPath && (
                  <ContextMenuItem onClick={onCopyPath}>
                    <FileText className="mr-2 h-4 w-4" />
                    경로 복사
                    <ContextMenuShortcut>Shift+Alt+C</ContextMenuShortcut>
                  </ContextMenuItem>
                )}
                {onCopyRelativePath && (
                  <ContextMenuItem onClick={onCopyRelativePath}>
                    <FileText className="mr-2 h-4 w-4" />
                    상대 경로 복사
                  </ContextMenuItem>
                )}
              </>
            )}

            {/* System integration */}
            {(onShowInFolder || onOpenInTerminal || onDuplicate) && (
              <>
                <ContextMenuSeparator />
                {onShowInFolder && (
                  <ContextMenuItem onClick={onShowInFolder}>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    탐색기에서 열기
                  </ContextMenuItem>
                )}
                {onOpenInTerminal && (
                  <ContextMenuItem onClick={onOpenInTerminal}>
                    <Terminal className="mr-2 h-4 w-4" />
                    터미널에서 열기
                  </ContextMenuItem>
                )}
                {onDuplicate && (
                  <ContextMenuItem onClick={onDuplicate}>
                    <Files className="mr-2 h-4 w-4" />
                    복제
                  </ContextMenuItem>
                )}
              </>
            )}

            {/* Edit operations */}
            <ContextMenuSeparator />
            {onRename && (
              <ContextMenuItem onClick={onRename}>
                <Edit3 className="mr-2 h-4 w-4" />
                이름 변경
                <ContextMenuShortcut>F2</ContextMenuShortcut>
              </ContextMenuItem>
            )}
            {onDelete && (
              <ContextMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                삭제
                <ContextMenuShortcut>Del</ContextMenuShortcut>
              </ContextMenuItem>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
