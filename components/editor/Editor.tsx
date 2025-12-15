'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type monaco from 'monaco-editor';
import { useChatStore } from '@/lib/store/chat-store';
import { Button } from '@/components/ui/button';
import {
  X,
  Save,
  FileText,
  Loader2,
  Eye,
  Code,
  RefreshCw,
  AlertCircle,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isElectron } from '@/lib/platform';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { EditorTabContextMenu } from './EditorTabContextMenu';
import { useFileSystem } from '@/hooks/use-file-system';

import { SingleFileEditor } from './SingleFileEditor';
import { logger } from '@/lib/utils/logger';

export function CodeEditor() {
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
  } = useChatStore();

  const [isSaving, setIsSaving] = useState(false);
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);

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
        window.alert(`파일을 새로고침할 수 없습니다: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to refresh file:', error);
      window.alert('파일을 새로고침하는 중 오류가 발생했습니다.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCloseFile = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const fileToClose = openFiles.find((f) => f.path === path);
    if (fileToClose?.isDirty) {
      if (window.confirm('파일에 저장되지 않은 변경사항이 있습니다. 닫으시겠습니까?')) {
        closeFile(path);
      }
    } else {
      closeFile(path);
    }
  };

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
            <h2 className="mb-2 text-xl font-semibold text-primary">파일을 여기에 드롭</h2>
            <p className="text-center text-sm text-primary/80">드래그한 파일을 에디터에서 엽니다</p>
          </div>
        ) : (
          <>
            <FileText className="mb-4 h-16 w-16 opacity-20" />
            <h2 className="mb-2 text-xl font-semibold">SEPilot Editor</h2>
            <p className="text-center text-sm">파일 탐색기에서 파일을 선택하거나 드래그하세요</p>
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
            <p className="text-lg font-medium text-primary">파일을 여기에 드롭하여 열기</p>
          </div>
        </div>
      )}
      {/* File Tabs with Drag & Drop and Context Menu */}
      <div className="flex items-center border-b bg-muted/30 overflow-x-auto">
        {openFiles.map((file, index) => (
          <EditorTabContextMenu
            key={file.path}
            filePath={file.path}
            filename={file.filename}
            isDirty={file.isDirty}
            onClose={() => {
              if (file.isDirty) {
                if (window.confirm('파일에 저장되지 않은 변경사항이 있습니다. 닫으시겠습니까?')) {
                  closeFile(file.path);
                }
              } else {
                closeFile(file.path);
              }
            }}
            onCloseOthers={openFiles.length > 1 ? () => closeOtherFiles(file.path) : undefined}
            onCloseToRight={
              index < openFiles.length - 1 ? () => closeFilesToRight(file.path) : undefined
            }
            onCloseSaved={openFiles.some((f) => !f.isDirty) ? closeSavedFiles : undefined}
            onCloseAll={openFiles.length > 0 ? closeAllFiles : undefined}
          >
            <div
              draggable
              onDragStart={(e) => handleTabDragStart(e, index)}
              onDragOver={(e) => handleTabDragOver(e, index)}
              onDragLeave={handleTabDragLeave}
              onDrop={(e) => handleTabDrop(e, index)}
              onDragEnd={handleTabDragEnd}
              onClick={() => setActiveFile(file.path)}
              className={cn(
                'group flex items-center gap-1 px-3 py-2 text-sm border-r hover:bg-accent transition-colors shrink-0 cursor-pointer select-none',
                activeFilePath === file.path && 'bg-background font-medium',
                draggedTabIndex === index && 'opacity-50',
                dragOverTabIndex === index && 'border-l-2 border-l-primary'
              )}
            >
              {/* Drag handle - visible on hover */}
              <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-50 cursor-grab shrink-0" />
              <span className="truncate max-w-[130px]" title={file.filename}>
                {file.filename}
              </span>
              {file.isDirty && <span className="text-xs text-orange-500">●</span>}
              <span
                onClick={(e) => handleCloseFile(file.path, e)}
                className="ml-1 hover:bg-muted rounded p-0.5 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                title="닫기"
              >
                <X className="h-3 w-3" />
              </span>
            </div>
          </EditorTabContextMenu>
        ))}
      </div>

      {/* Editor Actions */}
      {activeFile && (
        <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/20">
          <div className="text-xs text-muted-foreground truncate" title={activeFile.path}>
            {activeFile.path}
          </div>
          <div className="flex items-center gap-2">
            {activeFile.isDirty && <span className="text-xs text-orange-500">Unsaved changes</span>}
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
              title="새로고침 (Refresh)"
            >
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1', isRefreshing && 'animate-spin')} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button
              onClick={handleSaveFile}
              variant="ghost"
              size="sm"
              disabled={!activeFile.isDirty || isSaving}
              className="h-7"
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              {isSaving ? 'Saving...' : 'Save (Ctrl+S)'}
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
              이 파일이 외부에서 수정되었습니다. 새로고침하시겠습니까?
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
              새로고침
            </Button>
            <Button
              onClick={() => setFileChangedExternally(false)}
              variant="ghost"
              size="sm"
              className="h-7"
            >
              무시
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
                  <span>이미지 로딩 중...</span>
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
                  <span>이미지를 불러올 수 없습니다</span>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Monaco Editor */}
              {(previewMode === 'editor' || previewMode === 'split') && (
                <div
                  className={cn('overflow-hidden', previewMode === 'split' ? 'flex-1' : 'w-full')}
                >
                  <SingleFileEditor
                    content={activeFile.content}
                    language={activeFile.language || 'plaintext'}
                    filePath={activeFile.path}
                    theme={editorAppearanceConfig.theme}
                    onChange={handleEditorChange}
                    onSave={handleSaveFile}
                    onMount={(editor, _monaco) => {
                      setEditor(editor);
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
