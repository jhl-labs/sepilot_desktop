'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type monaco from 'monaco-editor';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '@/lib/store/chat-store';
import { Button } from '@/components/ui/button';
import { Save, FileText, Loader2, Eye, Code, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isElectron } from '@/lib/platform';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { useFileSystem } from '@/hooks/use-file-system';

import { SingleFileEditor } from './SingleFileEditor';
import { logger } from '@/lib/utils/logger';
import { EditorTab } from './EditorTab';
import { EditorRuler } from './EditorRuler';

export function CodeEditor() {
  const { t } = useTranslation();
  const {
    openFiles,
    activeFilePath,
    setActiveFile,
    closeFile,
    closeOtherFiles,
    closeFilesToRight,
    closeSavedFiles,
    closeAllFiles,
    reorderFiles,
    updateFileContent,
    markFileDirty,
    clearInitialPosition,
    editorAppearanceConfig,
    workingDirectory,
    setActiveFileSelection,
  } = useChatStore();

  const [isSaving, setIsSaving] = useState(false);
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [monacoInstance, setMonacoInstance] = useState<typeof monaco | null>(null);

  const [previewMode, setPreviewMode] = useState<'editor' | 'preview' | 'split'>('editor');
  const [fileChangedExternally, setFileChangedExternally] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Tab drag and drop state
  const [draggedTabIndex, setDraggedTabIndex] = useState<number | null>(null);
  const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null);

  // File drop from file explorer state
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const lastMtimeRef = useRef<Map<string, number>>(new Map());
  const hasSavedFiles = useMemo(() => openFiles.some((f) => !f.isDirty), [openFiles]);

  // Markdown 파일인지 확인 (language가 'markdown'이거나 확장자가 .md, .mdx인 경우)
  const isMarkdownFile =
    activeFile &&
    (activeFile.language === 'markdown' ||
      activeFile.path.toLowerCase().endsWith('.md') ||
      activeFile.path.toLowerCase().endsWith('.mdx'));

  // 이미지 파일인지 확인
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const isImageFile =
    activeFile && imageExtensions.some((ext) => activeFile.path.toLowerCase().endsWith(ext));

  // 이미지 미리보기 상태
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  // 이미지 파일 로드
  useEffect(() => {
    if (!isImageFile || !activeFile || !isElectron() || !window.electronAPI) {
      setImageDataUrl(null);
      return;
    }

    const loadImage = async () => {
      setIsLoadingImage(true);
      try {
        const result = await window.electronAPI.fs.readImageAsBase64(activeFile.path);
        if (result.success && result.data) {
          setImageDataUrl(result.data);
        } else {
          console.error('[Editor] Failed to load image:', result.error);
          setImageDataUrl(null);
        }
      } catch (error) {
        console.error('[Editor] Error loading image:', error);
        setImageDataUrl(null);
      } finally {
        setIsLoadingImage(false);
      }
    };

    loadImage();
  }, [isImageFile, activeFile?.path]);

  const handleEditorChange = (value: string | undefined) => {
    if (activeFilePath && value !== undefined) {
      updateFileContent(activeFilePath, value);
    }
  };

  const handleSaveFile = async () => {
    if (!activeFile || !isElectron() || !window.electronAPI) {
      return;
    }

    setIsSaving(true);
    try {
      const result = await window.electronAPI.fs.writeFile(activeFile.path, activeFile.content);
      if (result.success) {
        markFileDirty(activeFile.path, false);
        logger.info('File saved successfully:', activeFile.path);

        // 저장 후 mtime 업데이트
        const statResult = await window.electronAPI.fs.getFileStat(activeFile.path);
        if (statResult.success && statResult.data) {
          lastMtimeRef.current.set(activeFile.path, statResult.data.mtime);
        }

        // 저장 후 변경 경고 숨김
        setFileChangedExternally(false);
      } else {
        console.error('Failed to save file:', result.error);
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshFile = async () => {
    if (!activeFile || !isElectron() || !window.electronAPI) {
      return;
    }

    setIsRefreshing(true);
    try {
      const result = await window.electronAPI.fs.readFile(activeFile.path);
      if (result.success && result.data !== undefined) {
        updateFileContent(activeFile.path, result.data);
        markFileDirty(activeFile.path, false);

        // mtime 업데이트
        const statResult = await window.electronAPI.fs.getFileStat(activeFile.path);
        if (statResult.success && statResult.data) {
          lastMtimeRef.current.set(activeFile.path, statResult.data.mtime);
        }

        setFileChangedExternally(false);
        logger.info('File refreshed successfully:', activeFile.path);
      } else {
        console.error('Failed to refresh file:', result.error);
        window.alert(t('editor.errors.cannotRefreshFile', { error: result.error }));
      }
    } catch (error) {
      console.error('Failed to refresh file:', error);
      window.alert(t('editor.errors.refreshError'));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCloseFile = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.stopPropagation();

      const fileToClose = openFiles.find((f) => f.path === path);
      if (fileToClose?.isDirty) {
        if (window.confirm(t('editor.confirmations.closeUnsavedFile'))) {
          closeFile(path);
        }
      } else {
        closeFile(path);
      }
    },
    [openFiles, closeFile, t]
  );

  // 파일 변경 감지 (5초마다 체크)
  useEffect(() => {
    if (!activeFile || !isElectron() || !window.electronAPI) {
      return;
    }

    // 초기 mtime 저장
    const initMtime = async () => {
      try {
        const statResult = await window.electronAPI.fs.getFileStat(activeFile.path);
        if (statResult.success && statResult.data) {
          lastMtimeRef.current.set(activeFile.path, statResult.data.mtime);
        }
      } catch (error) {
        console.error('[Editor] Error getting initial file stat:', error);
      }
    };

    if (!lastMtimeRef.current.has(activeFile.path)) {
      initMtime();
    }

    const interval = setInterval(async () => {
      try {
        const statResult = await window.electronAPI.fs.getFileStat(activeFile.path);
        if (statResult.success && statResult.data) {
          const lastMtime = lastMtimeRef.current.get(activeFile.path);
          const currentMtime = statResult.data.mtime;

          // mtime이 변경되었고, 파일이 dirty하지 않은 경우에만 알림
          // (dirty인 경우는 사용자가 편집 중이므로 알리지 않음)
          if (lastMtime && currentMtime > lastMtime && !activeFile.isDirty) {
            logger.info('[Editor] File changed externally:', activeFile.path);
            setFileChangedExternally(true);
            lastMtimeRef.current.set(activeFile.path, currentMtime);
          }
        }
      } catch (error) {
        // 파일이 삭제된 경우 등, 조용히 무시
        console.warn('[Editor] Error checking file stat:', error);
      }
    }, 5000); // 5초마다 체크

    return () => clearInterval(interval);
  }, [activeFile?.path, activeFile?.isDirty]);

  // Navigate to initialPosition when file is opened
  useEffect(() => {
    if (editor && activeFile?.initialPosition && activeFilePath) {
      const { lineNumber, column } = activeFile.initialPosition;

      // Set cursor position
      editor.setPosition({
        lineNumber,
        column: column || 1,
      });

      // Reveal line in center of editor
      editor.revealLineInCenter(lineNumber);

      // Focus editor
      editor.focus();

      // Clear initialPosition after navigation
      clearInitialPosition(activeFilePath);
    }
  }, [editor, activeFile?.path, activeFile?.initialPosition, activeFilePath, clearInitialPosition]);

  // Monaco editor selection change listener
  useEffect(() => {
    if (!editor || !monacoInstance) {
      return;
    }

    // Listen to cursor selection changes
    const disposable = editor.onDidChangeCursorSelection((e) => {
      const selection = e.selection;
      const model = editor.getModel();

      if (!model) {
        setActiveFileSelection(null);
        return;
      }

      // Check if there's a non-empty selection
      const hasSelection =
        !selection.isEmpty() &&
        (selection.startLineNumber !== selection.endLineNumber ||
          selection.startColumn !== selection.endColumn);

      if (hasSelection) {
        // Get selected text
        const selectedText = model.getValueInRange(selection);

        // Update store with selection info
        setActiveFileSelection({
          text: selectedText,
          range: {
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn,
          },
        });
      } else {
        // No selection - clear it
        setActiveFileSelection(null);
      }
    });

    // Cleanup listener on unmount
    return () => {
      disposable.dispose();
    };
  }, [editor, monacoInstance, setActiveFileSelection]);

  // File drop from file explorer - must be defined before early return
  const { openFile } = useChatStore();
  const { readFile } = useFileSystem();

  const handleEditorDragOver = useCallback((e: React.DragEvent) => {
    // Check if it's a file from file explorer (not a tab)
    const isFromFileExplorer = e.dataTransfer.types.includes('application/sepilot-path');

    if (isFromFileExplorer) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsFileDragOver(true);
    }
  }, []);

  const handleEditorDragLeave = useCallback((e: React.DragEvent) => {
    // Only hide if leaving the entire editor area
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsFileDragOver(false);
    }
  }, []);

  const handleEditorDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsFileDragOver(false);

      const filePath = e.dataTransfer.getData('application/sepilot-path');
      const fileName = e.dataTransfer.getData('application/sepilot-name');
      const isDirectory = e.dataTransfer.getData('application/sepilot-isdir') === 'true';

      if (!filePath || !fileName || isDirectory) {
        logger.info('[Editor] Drop ignored: no path, no name, or is directory');
        return;
      }

      // Check if file is already open
      const existingFile = openFiles.find((f) => f.path === filePath);
      if (existingFile) {
        setActiveFile(filePath);
        logger.info('[Editor] File already open, switching to it:', filePath);
        return;
      }

      const { getLanguageFromFilename } = await import('@/lib/utils/file-language');
      const language = getLanguageFromFilename(fileName);

      // Check if it's an image file (images are loaded separately in the viewer)
      const imgExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
      const isImage = imgExtensions.some((ext) => filePath.toLowerCase().endsWith(ext));

      if (isImage) {
        // Image files don't need content - they're loaded as base64 in the viewer
        logger.info('[Editor] Opening dropped image file:', filePath);
        openFile({
          path: filePath,
          filename: fileName,
          content: '',
          language,
        });
        return;
      }

      // Read and open the file
      logger.info('[Editor] Opening dropped file:', filePath);
      const content = await readFile(filePath);
      if (content !== null) {
        openFile({
          path: filePath,
          filename: fileName,
          content,
          language,
        });
      }
    },
    [openFiles, setActiveFile, readFile, openFile]
  );

  // Tab drag handlers - must be defined before early return
  const handleTabDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedTabIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleTabDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedTabIndex !== null && draggedTabIndex !== index) {
        setDragOverTabIndex(index);
      }
    },
    [draggedTabIndex]
  );

  const handleTabDragLeave = useCallback(() => {
    setDragOverTabIndex(null);
  }, []);

  const handleTabDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      if (draggedTabIndex !== null && draggedTabIndex !== toIndex) {
        reorderFiles(draggedTabIndex, toIndex);
      }
      setDraggedTabIndex(null);
      setDragOverTabIndex(null);
    },
    [draggedTabIndex, reorderFiles]
  );

  const handleTabDragEnd = useCallback(() => {
    setDraggedTabIndex(null);
    setDragOverTabIndex(null);
  }, []);

  // Early return for empty state - all hooks must be defined above this point
  if (openFiles.length === 0) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center text-muted-foreground relative',
          isFileDragOver && 'ring-2 ring-primary ring-inset bg-primary/5'
        )}
        onDragOver={handleEditorDragOver}
        onDragLeave={handleEditorDragLeave}
        onDrop={handleEditorDrop}
      >
        {isFileDragOver ? (
          <div className="text-center">
            <FileText className="mb-4 h-16 w-16 text-primary mx-auto" />
            <h2 className="mb-2 text-xl font-semibold text-primary">
              {t('editor.dropzone.dropFileHere')}
            </h2>
            <p className="text-center text-sm text-primary/80">
              {t('editor.dropzone.openDraggedFile')}
            </p>
          </div>
        ) : (
          <>
            <FileText className="mb-4 h-16 w-16 opacity-20" />
            <h2 className="mb-2 text-xl font-semibold">SEPilot Editor</h2>
            <p className="text-center text-sm">{t('editor.emptyState.selectOrDragFile')}</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col relative',
        isFileDragOver && 'ring-2 ring-primary ring-inset'
      )}
      onDragOver={handleEditorDragOver}
      onDragLeave={handleEditorDragLeave}
      onDrop={handleEditorDrop}
    >
      {/* File drop overlay */}
      {isFileDragOver && (
        <div className="absolute inset-0 bg-primary/10 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-background border-2 border-dashed border-primary rounded-lg p-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-2 text-primary" />
            <p className="text-lg font-medium text-primary">{t('editor.dropzone.dropToOpen')}</p>
          </div>
        </div>
      )}
      {/* File Tabs with Drag & Drop and Context Menu */}
      <div className="flex items-center border-b bg-muted/30 overflow-x-auto">
        {openFiles.map((file, index) => (
          <EditorTab
            key={file.path}
            file={file}
            isActive={activeFilePath === file.path}
            index={index}
            totalFiles={openFiles.length}
            hasSavedFiles={hasSavedFiles}
            isDragging={draggedTabIndex === index}
            isDragOver={dragOverTabIndex === index}
            onTabClick={setActiveFile}
            onTabClose={handleCloseFile}
            onCloseOthers={closeOtherFiles}
            onCloseToRight={closeFilesToRight}
            onCloseSaved={closeSavedFiles}
            onCloseAll={closeAllFiles}
            onDragStart={handleTabDragStart}
            onDragOver={handleTabDragOver}
            onDragLeave={handleTabDragLeave}
            onDrop={handleTabDrop}
            onDragEnd={handleTabDragEnd}
          />
        ))}
      </div>

      {/* Editor Actions */}
      {activeFile && (
        <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/20">
          <div className="text-xs text-muted-foreground truncate" title={activeFile.path}>
            {activeFile.path}
          </div>
          <div className="flex items-center gap-2">
            {activeFile.isDirty && (
              <span className="text-xs text-orange-500">{t('editor.status.unsavedChanges')}</span>
            )}
            {/* Markdown Preview Toggle Buttons */}
            {isMarkdownFile && (
              <div className="flex items-center gap-1 border-r pr-2 mr-2">
                <Button
                  onClick={() => setPreviewMode('editor')}
                  variant={previewMode === 'editor' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7"
                  title="Editor Only"
                >
                  <Code className="h-3.5 w-3.5" />
                </Button>
                <Button
                  onClick={() => setPreviewMode('split')}
                  variant={previewMode === 'split' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7"
                  title="Split View"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  <Code className="h-3.5 w-3.5" />
                </Button>
                <Button
                  onClick={() => setPreviewMode('preview')}
                  variant={previewMode === 'preview' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7"
                  title="Preview Only"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <Button
              onClick={handleRefreshFile}
              variant="ghost"
              size="sm"
              disabled={isRefreshing}
              className="h-7"
              title={t('editor.actions.refresh')}
            >
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1', isRefreshing && 'animate-spin')} />
              {isRefreshing ? t('editor.status.refreshing') : t('editor.actions.refresh')}
            </Button>
            <Button
              onClick={handleSaveFile}
              variant="ghost"
              size="sm"
              disabled={!activeFile.isDirty || isSaving}
              className="h-7"
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              {isSaving ? t('editor.status.saving') : t('editor.actions.save')}
            </Button>
          </div>
        </div>
      )}

      {/* 파일 변경 경고 배너 */}
      {fileChangedExternally && (
        <div className="flex items-center justify-between bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-yellow-800 dark:text-yellow-200">
              {t('editor.warnings.fileChangedExternally')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleRefreshFile}
              variant="default"
              size="sm"
              disabled={isRefreshing}
              className="h-7 bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1', isRefreshing && 'animate-spin')} />
              {t('editor.actions.refresh')}
            </Button>
            <Button
              onClick={() => setFileChangedExternally(false)}
              variant="ghost"
              size="sm"
              className="h-7"
            >
              {t('editor.actions.ignore')}
            </Button>
          </div>
        </div>
      )}

      {/* Monaco Editor, Markdown Preview, or Image Viewer */}
      {activeFile && (
        <div className="flex-1 overflow-hidden flex">
          {/* Image Viewer */}
          {isImageFile ? (
            <div className="w-full h-full flex items-center justify-center bg-muted/20 overflow-auto p-4">
              {isLoadingImage ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span>{t('editor.status.loadingImage')}</span>
                </div>
              ) : imageDataUrl ? (
                <div className="flex flex-col items-center gap-4 max-w-full max-h-full">
                  <img
                    src={imageDataUrl}
                    alt={activeFile.filename}
                    className="max-w-full max-h-[calc(100vh-200px)] object-contain rounded shadow-lg"
                    style={{ imageRendering: 'auto' }}
                  />
                  <div className="text-xs text-muted-foreground text-center">
                    {activeFile.filename}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <FileText className="h-16 w-16 opacity-20" />
                  <span>{t('editor.errors.cannotLoadImage')}</span>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Monaco Editor */}
              {(previewMode === 'editor' || previewMode === 'split') && (
                <div
                  className={cn(
                    'overflow-hidden flex flex-col',
                    previewMode === 'split' ? 'flex-1' : 'w-full'
                  )}
                >
                  <EditorRuler editor={editor} monaco={monacoInstance} />
                  <div className="flex-1 min-h-0">
                    <SingleFileEditor
                      content={activeFile.content}
                      language={activeFile.language || 'plaintext'}
                      filePath={activeFile.path}
                      theme={editorAppearanceConfig.theme}
                      onChange={handleEditorChange}
                      onSave={handleSaveFile}
                      onMount={(editor, _monaco) => {
                        setEditor(editor);
                        setMonacoInstance(_monaco);
                      }}
                      options={{
                        minimap: {
                          enabled: previewMode === 'split' ? false : editorAppearanceConfig.minimap,
                        },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        insertSpaces: true,
                        // Inline suggest config handled by SingleFileEditor defaults or merge?
                        // SingleFileEditor sets options locally.
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Markdown Preview */}
              {isMarkdownFile && (previewMode === 'preview' || previewMode === 'split') && (
                <div
                  className={cn(
                    'overflow-auto border-l',
                    previewMode === 'split' ? 'flex-1' : 'w-full'
                  )}
                >
                  <div className="p-6">
                    <MarkdownRenderer
                      content={activeFile.content}
                      currentFilePath={activeFile.path}
                      workingDirectory={workingDirectory || undefined}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
