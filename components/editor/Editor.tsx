'use client';

import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useChatStore } from '@/lib/store/chat-store';
import { Button } from '@/components/ui/button';
import { X, Save, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { isElectron } from '@/lib/platform';

export function CodeEditor() {
  const {
    openFiles,
    activeFilePath,
    setActiveFile,
    closeFile,
    updateFileContent,
    markFileDirty,
  } = useChatStore();

  const { theme } = useTheme();
  const [isSaving, setIsSaving] = useState(false);

  const activeFile = openFiles.find((f) => f.path === activeFilePath);

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
        console.log('File saved successfully:', activeFile.path);
      } else {
        console.error('Failed to save file:', result.error);
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseFile = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const fileToClose = openFiles.find((f) => f.path === path);
    if (fileToClose?.isDirty) {
      if (confirm('파일에 저장되지 않은 변경사항이 있습니다. 닫으시겠습니까?')) {
        closeFile(path);
      }
    } else {
      closeFile(path);
    }
  };

  // Keyboard shortcut for saving (Ctrl+S or Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeFile?.isDirty) {
          handleSaveFile();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFile]);

  if (openFiles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <FileText className="mb-4 h-16 w-16 opacity-20" />
        <h2 className="mb-2 text-xl font-semibold">SEPilot Editor</h2>
        <p className="text-center text-sm">
          파일 탐색기에서 파일을 선택하세요
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* File Tabs */}
      <div className="flex items-center border-b bg-muted/30 overflow-x-auto">
        {openFiles.map((file) => (
          <button
            key={file.path}
            onClick={() => setActiveFile(file.path)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm border-r hover:bg-accent transition-colors shrink-0',
              activeFilePath === file.path && 'bg-background font-medium'
            )}
          >
            <span className="truncate max-w-[150px]" title={file.filename}>
              {file.filename}
            </span>
            {file.isDirty && <span className="text-xs text-orange-500">●</span>}
            <span
              onClick={(e) => handleCloseFile(file.path, e)}
              className="ml-1 hover:bg-muted rounded p-0.5 cursor-pointer"
              title="닫기"
            >
              <X className="h-3 w-3" />
            </span>
          </button>
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
              <span className="text-xs text-orange-500">Unsaved changes</span>
            )}
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

      {/* Monaco Editor */}
      {activeFile && (
        <div className="flex-1 overflow-hidden">
          <Editor
            height="100%"
            language={activeFile.language || 'plaintext'}
            value={activeFile.content}
            onChange={handleEditorChange}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            options={{
              fontSize: 14,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              tabSize: 2,
              insertSpaces: true,
            }}
          />
        </div>
      )}
    </div>
  );
}
