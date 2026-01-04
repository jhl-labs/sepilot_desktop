'use client';

import { logger } from '@/lib/utils/logger';
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

import { useState, useEffect, useRef, useCallback } from 'react';
import { Folder, FolderMinus, FolderOpen, RefreshCw, FileText, FolderTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
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
import { useFileClipboard } from '@/hooks/use-file-clipboard';
import { getLanguageFromFilename } from '@/lib/utils/file-language';
import { FileTreeItem, type FileNode } from './FileTreeItem';
import { FileTreeContextMenu } from './FileTreeContextMenu';
import { WikiTree } from '@/components/layout/WikiTree';
import { isElectron } from '@/lib/platform';
import { useTranslation } from 'react-i18next';
import { OverflowToolbar } from '@/components/ui/overflow-toolbar';

export function FileExplorer() {
  const { t } = useTranslation();
  const {
    workingDirectory,
    setWorkingDirectory,
    openFile,
    activeFilePath,
    loadWorkingDirectory,
    fileTreeRefreshTrigger,
    refreshFileTree,
    expandedFolderPaths,
    clearExpandedFolders,
    addExpandedFolders,
    editorViewMode,
    setEditorViewMode,
  } = useChatStore();
  const [fileTree, setFileTree] = useState<FileNode[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showNewItemDialog, setShowNewItemDialog] = useState(false);
  const [newItemType, setNewItemType] = useState<'file' | 'folder'>('file');
  const [newItemParentPath, setNewItemParentPath] = useState<string>('');
  const [newItemName, setNewItemName] = useState('');
  const { readDirectory, readFile, createFile, createDirectory } = useFileSystem();
  const { pasteFiles } = useFileClipboard();

  // Ref for dialog input
  const newItemInputRef = useRef<HTMLInputElement>(null);

  // Restore saved working directory on mount
  useEffect(() => {
    loadWorkingDirectory();
  }, [loadWorkingDirectory]);

  // Load file tree when working directory changes or refresh is triggered
  useEffect(() => {
    if (!workingDirectory) {
      setFileTree(null);
      return;
    }

    loadFileTree(workingDirectory);
  }, [workingDirectory, fileTreeRefreshTrigger]);

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
    logger.info(`[FileExplorer] Loading file tree: ${dirPath}`);
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
        logger.info(`[FileExplorer] Directory selected: ${result.data}`);
        setWorkingDirectory(result.data);
      }
    } catch (error) {
      console.error('[FileExplorer] Failed to select directory:', error);
    }
  };

  const handleFileClick = async (filePath: string, filename: string) => {
    logger.info(`[FileExplorer] Opening file: ${filePath}`);

    // 이미지 파일인지 확인 (이미지는 별도 뷰어로 표시되므로 content 불필요)
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
    const isImageFile = imageExtensions.some((ext) => filePath.toLowerCase().endsWith(ext));

    const language = getLanguageFromFilename(filename);

    if (isImageFile) {
      // 이미지 파일은 content를 읽지 않음 (Editor에서 별도로 이미지로 로드)
      logger.info(`[FileExplorer] Opening image file: ${filePath}`);
      openFile({
        path: filePath,
        filename,
        content: '', // 이미지는 content 불필요
        language,
      });
      return;
    }

    const content = await readFile(filePath);
    if (content !== null) {
      logger.info(`[FileExplorer] File loaded with language: ${language}`);

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
    if (!newItemName || !newItemName.trim() || !newItemParentPath) {
      console.warn('[FileExplorer] Cannot create item - missing name or parent path');
      return;
    }

    if (!isElectron() || !window.electronAPI) {
      console.warn('[FileExplorer] API unavailable');
      return;
    }

    // Use IPC to resolve the item path correctly (handles Windows/POSIX paths)
    const itemPathResult = await window.electronAPI.fs.resolvePath(
      newItemParentPath,
      newItemName.trim()
    );
    if (!itemPathResult.success || !itemPathResult.data) {
      console.error('[FileExplorer] Failed to resolve item path:', itemPathResult.error);
      window.alert(
        t('fileExplorer.createFailedPathError', { type: t(`fileExplorer.${newItemType}`) })
      );
      return;
    }

    const itemPath = itemPathResult.data;
    logger.info(`[FileExplorer] Creating ${newItemType}: ${itemPath}`);

    const success =
      newItemType === 'file' ? await createFile(itemPath, '') : await createDirectory(itemPath);

    if (success) {
      setShowNewItemDialog(false);
      setNewItemName('');
      if (workingDirectory) {
        loadFileTree(workingDirectory);
      }
    } else {
      window.alert(t('fileExplorer.createFailed', { type: t(`fileExplorer.${newItemType}`) }));
    }
  };

  const openNewItemDialog = (type: 'file' | 'folder', parentPath: string) => {
    setNewItemType(type);
    setNewItemParentPath(parentPath);
    setNewItemName('');
    setShowNewItemDialog(true);
  };

  const handlePasteInRoot = async () => {
    if (!workingDirectory) {
      console.warn('[FileExplorer] No working directory set');
      return;
    }

    logger.info('[FileExplorer] Pasting into root:', workingDirectory);
    await pasteFiles(workingDirectory, () => loadFileTree(workingDirectory));
  };

  // Collapse all expanded folders
  const handleCollapseAll = useCallback(() => {
    clearExpandedFolders();
    logger.info('[FileExplorer] Collapsed all folders');
  }, [clearExpandedFolders]);

  // Expand all folders recursively
  const handleExpandAll = useCallback(async () => {
    if (!workingDirectory) {
      return;
    }

    logger.info('[FileExplorer] Expanding all folders...');

    // Recursive function to get all folder paths
    const getAllFolderPaths = async (dirPath: string): Promise<string[]> => {
      const paths: string[] = [];
      try {
        const nodes = await readDirectory(dirPath);
        if (!nodes) {
          return [];
        }

        for (const node of nodes) {
          if (node.isDirectory) {
            paths.push(node.path);
            const subPaths = await getAllFolderPaths(node.path);
            paths.push(...subPaths);
          }
        }
      } catch (err) {
        console.error(`[FileExplorer] Error reading directory ${dirPath}:`, err);
      }
      return paths;
    };

    try {
      const allPaths = await getAllFolderPaths(workingDirectory);
      if (allPaths.length > 0) {
        addExpandedFolders(allPaths);
        logger.info(`[FileExplorer] Expanded ${allPaths.length} folders`);
      }
    } catch (error) {
      console.error('[FileExplorer] Failed to expand all folders:', error);
    }
  }, [workingDirectory, readDirectory, addExpandedFolders]);

  return (
    <div className="flex h-full flex-col">
      {/* Working Directory Selection */}
      <div className="shrink-0 border-b px-3 py-3">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase">
            Working Directory
          </span>
          <TooltipProvider delayDuration={200}>
            <div className="flex-1 min-w-0">
              <OverflowToolbar className="gap-0.5 justify-start w-full" itemWidth={30}>
                {/* Files/Wiki Toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={editorViewMode === 'files' ? 'default' : 'ghost'}
                      size="icon"
                      onClick={() => setEditorViewMode('files')}
                      className="h-7 w-7"
                    >
                      <FolderTree className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{t('fileExplorer.filesView')}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={editorViewMode === 'wiki' ? 'default' : 'ghost'}
                      size="icon"
                      onClick={() => setEditorViewMode('wiki')}
                      className="h-7 w-7"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{t('fileExplorer.wikiView')}</p>
                  </TooltipContent>
                </Tooltip>

                {/* Divider */}
                <div className="h-4 w-px bg-border mx-1 shrink-0" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleSelectDirectory}
                      className="h-7 w-7"
                      title={t('fileExplorer.selectDirectory')}
                    >
                      <Folder className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{t('fileExplorer.selectDirectory')}</p>
                  </TooltipContent>
                </Tooltip>

                {workingDirectory && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleExpandAll}
                          className="h-7 w-7"
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>{t('fileExplorer.expandAll')}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleCollapseAll}
                          disabled={expandedFolderPaths.size === 0}
                          className="h-7 w-7"
                        >
                          <FolderMinus className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>{t('fileExplorer.collapseAll')}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={refreshFileTree}
                          className="h-7 w-7"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>{t('fileExplorer.refreshShortcut')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
              </OverflowToolbar>
            </div>
          </TooltipProvider>
          {workingDirectory ? (
            <div className="text-xs text-muted-foreground break-all bg-muted/50 rounded px-2 py-1.5">
              {workingDirectory}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">
              {t('fileExplorer.selectDirectoryHint')}
            </div>
          )}
        </div>
      </div>

      {/* File Tree or Wiki Tree */}
      {editorViewMode === 'wiki' ? (
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <WikiTree />
        </div>
      ) : (
        <FileTreeContextMenu
          isRootContext
          onNewFile={
            workingDirectory ? () => openNewItemDialog('file', workingDirectory) : undefined
          }
          onNewFolder={
            workingDirectory ? () => openNewItemDialog('folder', workingDirectory) : undefined
          }
          onPaste={workingDirectory ? handlePasteInRoot : undefined}
          onRefresh={refreshFileTree}
        >
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                {t('fileExplorer.loading')}
              </div>
            ) : !workingDirectory ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Folder className="mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">{t('fileExplorer.selectDirectoryMessage')}</p>
                <p className="mt-1 text-xs">{t('fileExplorer.selectDirectoryDescription')}</p>
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
                    onRefresh={refreshFileTree}
                    parentPath={workingDirectory!}
                    onNewFile={(parentPath) => openNewItemDialog('file', parentPath)}
                    onNewFolder={(parentPath) => openNewItemDialog('folder', parentPath)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                {t('fileExplorer.emptyDirectory')}
              </div>
            )}
          </div>
        </FileTreeContextMenu>
      )}

      {/* New Item Dialog */}
      <Dialog open={showNewItemDialog} onOpenChange={setShowNewItemDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('fileExplorer.createNewItem', { type: t(`fileExplorer.${newItemType}`) })}
            </DialogTitle>
            <DialogDescription>
              {newItemType === 'file'
                ? t('fileExplorer.enterFileName')
                : t('fileExplorer.enterFolderName')}
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
            placeholder={
              newItemType === 'file'
                ? t('fileExplorer.fileNameExample')
                : t('fileExplorer.folderNameExample')
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewItemDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateItem}>{t('common.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
