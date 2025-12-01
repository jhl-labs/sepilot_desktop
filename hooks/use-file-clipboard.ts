/**
 * File Clipboard Hook
 *
 * Provides file clipboard operations (copy, cut, paste) with:
 * - Store integration for clipboard state
 * - IPC calls for file operations
 * - Name conflict resolution (automatic renaming)
 * - Error handling
 */

import { useCallback } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { useFileSystem } from './use-file-system';
import path from 'path-browserify';

interface UseFileClipboardReturn {
  clipboard: { operation: 'copy' | 'cut'; paths: string[] } | null;
  copyFiles: (paths: string[]) => void;
  cutFiles: (paths: string[]) => void;
  pasteFiles: (destDir: string, onSuccess?: () => void) => Promise<void>;
  clearClipboard: () => void;
  canPaste: boolean;
}

export function useFileClipboard(): UseFileClipboardReturn {
  const { fileClipboard, copyFiles, cutFiles, clearFileClipboard } = useChatStore();
  const { isAvailable } = useFileSystem();

  const generateUniquePath = useCallback(
    async (targetPath: string): Promise<string> => {
      if (!isAvailable || !window.electronAPI) {
        return targetPath;
      }

      try {
        // Check if file/folder exists
        const result = await window.electronAPI.fs.readFile(targetPath);

        // If file doesn't exist, return original path
        if (!result.success && (result as any).code === 'ENOENT') {
          return targetPath;
        }

        // File exists, generate unique name
        const dir = path.dirname(targetPath);
        const ext = path.extname(targetPath);
        const basename = path.basename(targetPath, ext);

        let counter = 1;
        let newPath = targetPath;

        // Keep incrementing until we find a unique name
        while (true) {
          newPath = path.join(dir, `${basename}(${counter})${ext}`);
          const checkResult = await window.electronAPI.fs.readFile(newPath);

          if (!checkResult.success && (checkResult as any).code === 'ENOENT') {
            return newPath;
          }

          counter++;
        }
      } catch (error) {
        console.error('[FileClipboard] Error generating unique path:', error);
        return targetPath;
      }
    },
    [isAvailable]
  );

  const pasteFiles = useCallback(
    async (destDir: string, onSuccess?: () => void) => {
      if (!fileClipboard || !isAvailable || !window.electronAPI) {
        console.warn('[FileClipboard] Cannot paste: no clipboard or API unavailable');
        return;
      }

      const { operation, paths } = fileClipboard;

      try {
        for (const sourcePath of paths) {
          const filename = path.basename(sourcePath);
          let destPath = path.join(destDir, filename);

          // Check for name conflicts and generate unique name if needed
          destPath = await generateUniquePath(destPath);

          if (operation === 'copy') {
            // Copy operation
            const result = await window.electronAPI.fs.copy(sourcePath, destPath);
            if (!result.success) {
              throw new Error(result.error || 'Failed to copy');
            }
            console.log(`[FileClipboard] Copied: ${sourcePath} -> ${destPath}`);
          } else if (operation === 'cut') {
            // Move operation
            const result = await window.electronAPI.fs.move(sourcePath, destPath);
            if (!result.success) {
              throw new Error(result.error || 'Failed to move');
            }
            console.log(`[FileClipboard] Moved: ${sourcePath} -> ${destPath}`);
          }
        }

        // Clear clipboard after cut operation
        if (operation === 'cut') {
          clearFileClipboard();
        }

        // Call success callback
        if (onSuccess) {
          onSuccess();
        }

        console.log(`[FileClipboard] Paste completed: ${paths.length} items`);
      } catch (error: any) {
        console.error('[FileClipboard] Error pasting files:', error);
        window.alert(`파일 붙여넣기 실패: ${error.message}`);
      }
    },
    [fileClipboard, isAvailable, clearFileClipboard, generateUniquePath]
  );

  return {
    clipboard: fileClipboard,
    copyFiles,
    cutFiles,
    pasteFiles,
    clearClipboard: clearFileClipboard,
    canPaste: !!fileClipboard && fileClipboard.paths.length > 0,
  };
}
