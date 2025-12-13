'use client';

import { logger } from '@/lib/utils/logger';
/**
 * Editor Tab Context Menu Component
 *
 * VSCode-style context menu for editor tabs with:
 * - Close operations (close, close others, close all, close saved, close to right)
 * - Path operations (copy path, copy relative path, copy filename)
 * - System integration (reveal in explorer)
 * - Split view options (future)
 */

import { ReactNode, useCallback } from 'react';
import {
  X,
  XCircle,
  FileText,
  FileCode,
  FolderOpen,
  Copy,
  Pin,
  PinOff,
  ArrowRightToLine,
  Trash2,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '@/components/ui/context-menu';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';

interface EditorTabContextMenuProps {
  children: ReactNode;
  filePath: string;
  filename: string;
  isDirty: boolean;
  isPinned?: boolean;
  onClose: () => void;
  onCloseOthers?: () => void;
  onCloseAll?: () => void;
  onCloseSaved?: () => void;
  onCloseToRight?: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
}

export function EditorTabContextMenu({
  children,
  filePath,
  filename,
  isDirty,
  isPinned = false,
  onClose,
  onCloseOthers,
  onCloseAll,
  onCloseSaved,
  onCloseToRight,
  onPin,
  onUnpin,
}: EditorTabContextMenuProps) {
  const { workingDirectory } = useChatStore();

  // Copy absolute path
  const handleCopyPath = useCallback(async () => {
    const success = await copyToClipboard(filePath);
    if (success) {
      logger.info('[EditorTabContextMenu] Absolute path copied:', filePath);
    }
  }, [filePath]);

  // Copy relative path
  const handleCopyRelativePath = useCallback(async () => {
    if (!isElectron() || !window.electronAPI || !workingDirectory) {
      // Fallback: just copy the filename
      await copyToClipboard(filename);
      return;
    }

    try {
      const result = await window.electronAPI.fs.getRelativePath(workingDirectory, filePath);
      if (result.success && result.data) {
        const success = await copyToClipboard(result.data);
        if (success) {
          logger.info('[EditorTabContextMenu] Relative path copied:', result.data);
        }
      }
    } catch (error) {
      console.error('[EditorTabContextMenu] Error copying relative path:', error);
    }
  }, [filePath, filename, workingDirectory]);

  // Copy filename only
  const handleCopyFilename = useCallback(async () => {
    const success = await copyToClipboard(filename);
    if (success) {
      logger.info('[EditorTabContextMenu] Filename copied:', filename);
    }
  }, [filename]);

  // Reveal in system explorer
  const handleRevealInExplorer = useCallback(async () => {
    if (!isElectron() || !window.electronAPI) {
      console.warn('[EditorTabContextMenu] API unavailable');
      return;
    }

    try {
      const result = await window.electronAPI.fs.showInFolder(filePath);
      if (result.success) {
        logger.info('[EditorTabContextMenu] Revealed in explorer:', filePath);
      }
    } catch (error) {
      console.error('[EditorTabContextMenu] Error revealing in explorer:', error);
    }
  }, [filePath]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Close operations */}
        <ContextMenuItem onClick={onClose}>
          <X className="mr-2 h-4 w-4" />
          닫기
          <ContextMenuShortcut>Ctrl+W</ContextMenuShortcut>
        </ContextMenuItem>
        {onCloseOthers && (
          <ContextMenuItem onClick={onCloseOthers}>
            <XCircle className="mr-2 h-4 w-4" />
            다른 탭 모두 닫기
          </ContextMenuItem>
        )}
        {onCloseToRight && (
          <ContextMenuItem onClick={onCloseToRight}>
            <ArrowRightToLine className="mr-2 h-4 w-4" />
            오른쪽 탭 모두 닫기
          </ContextMenuItem>
        )}
        {onCloseSaved && (
          <ContextMenuItem onClick={onCloseSaved}>
            <Trash2 className="mr-2 h-4 w-4" />
            저장된 탭 모두 닫기
          </ContextMenuItem>
        )}
        {onCloseAll && (
          <ContextMenuItem onClick={onCloseAll}>
            <XCircle className="mr-2 h-4 w-4" />
            모든 탭 닫기
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        {/* Pin/Unpin - Future feature */}
        {isPinned
          ? onUnpin && (
              <ContextMenuItem onClick={onUnpin}>
                <PinOff className="mr-2 h-4 w-4" />
                고정 해제
              </ContextMenuItem>
            )
          : onPin && (
              <ContextMenuItem onClick={onPin}>
                <Pin className="mr-2 h-4 w-4" />탭 고정
              </ContextMenuItem>
            )}

        <ContextMenuSeparator />

        {/* Path operations */}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Copy className="mr-2 h-4 w-4" />
            경로 복사
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={handleCopyPath}>
              <FileCode className="mr-2 h-4 w-4" />
              절대 경로 복사
              <ContextMenuShortcut>Shift+Alt+C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyRelativePath}>
              <FileText className="mr-2 h-4 w-4" />
              상대 경로 복사
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyFilename}>
              <FileText className="mr-2 h-4 w-4" />
              파일 이름 복사
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {/* System integration */}
        <ContextMenuItem onClick={handleRevealInExplorer}>
          <FolderOpen className="mr-2 h-4 w-4" />
          탐색기에서 열기
        </ContextMenuItem>

        {/* Status indicator */}
        {isDirty && (
          <>
            <ContextMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-orange-500 flex items-center gap-1">
              <span className="text-orange-500">●</span>
              저장되지 않은 변경사항 있음
            </div>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
