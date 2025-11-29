'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type monaco from 'monaco-editor';
import { useChatStore } from '@/lib/store/chat-store';
import { Button } from '@/components/ui/button';
import { X, Save, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { isElectron } from '@/lib/platform';

// Load Editor component without SSR
// For now, we'll allow Monaco to use CDN in development
// In production, files are served via app:// protocol
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full">Loading editor...</div>,
});

export function CodeEditor() {
  const {
    openFiles,
    activeFilePath,
    setActiveFile,
    closeFile,
    updateFileContent,
    markFileDirty,
    clearInitialPosition,
  } = useChatStore();

  const { theme } = useTheme();
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);

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

  const handleEditorAction = useCallback(async (
    action: 'summarize' | 'translate' | 'complete' | 'explain' | 'fix' | 'improve',
    selectedText: string,
    targetLanguage?: string
  ) => {
    if (!window.electronAPI?.llm) {
      console.error('LLM API is not available. Please check your settings.');
      alert('LLM API is not available. Please check your settings.');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await window.electronAPI.llm.editorAction({
        action,
        text: selectedText,
        language: activeFile?.language,
        targetLanguage,
      });

      if (result.success && result.data) {
        // Insert or replace result in editor
        if (editor) {
          const selection = editor.getSelection();
          if (selection) {
            editor.executeEdits('', [
              {
                range: selection,
                text: result.data.result,
                forceMoveMarkers: true,
              },
            ]);
            console.log(`${action.charAt(0).toUpperCase() + action.slice(1)} completed successfully`);
          }
        }
      } else {
        console.error('Editor action failed:', result.error);
        alert(`Failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Editor action error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'An unexpected error occurred'}`);
    } finally {
      setIsProcessing(false);
    }
  }, [editor, activeFile?.language]);

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

  // Register inline completion provider for autocomplete
  useEffect(() => {
    if (!editor) return;

    // Get monaco instance from the editor
    const monacoInstance = (window as any).monaco;
    if (!monacoInstance) {
      console.warn('Monaco instance not available');
      return;
    }

    let debounceTimer: NodeJS.Timeout | null = null;
    const DEBOUNCE_MS = 300;

    // Register provider for ALL languages (not just current file's language)
    const provider = monacoInstance.languages.registerInlineCompletionsProvider(
      '*',  // All languages
      {
        provideInlineCompletions: async (model: any, position: any, context: any, token: any) => {
          // Return empty if autocomplete is not available
          if (!window.electronAPI?.llm?.editorAutocomplete) {
            return { items: [] };
          }

          // Debounce to avoid too many requests
          return new Promise((resolve) => {
            if (debounceTimer) {
              clearTimeout(debounceTimer);
            }

            debounceTimer = setTimeout(async () => {
              try {
                const code = model.getValue();
                const offset = model.getOffsetAt(position);
                const language = model.getLanguageId();

                // Get text before cursor for context
                const textBeforeCursor = code.substring(0, offset);
                const lines = textBeforeCursor.split('\n');
                const currentLine = lines[lines.length - 1];

                // Don't autocomplete if line is empty or just whitespace
                if (!currentLine.trim()) {
                  resolve({ items: [] });
                  return;
                }

                console.log('Requesting autocomplete for:', { language, offset, currentLine });

                const result = await window.electronAPI.llm.editorAutocomplete({
                  code,
                  cursorPosition: offset,
                  language,
                });

                if (result.success && result.data?.completion) {
                  const completion = result.data.completion.trim();

                  if (completion) {
                    console.log('Autocomplete suggestion:', completion);

                    resolve({
                      items: [
                        {
                          insertText: completion,
                          range: new monacoInstance.Range(
                            position.lineNumber,
                            position.column,
                            position.lineNumber,
                            position.column
                          ),
                          command: undefined,
                        },
                      ],
                    });
                    return;
                  }
                }
              } catch (error) {
                console.error('Autocomplete error:', error);
              }

              resolve({ items: [] });
            }, DEBOUNCE_MS);
          });
        },
        freeInlineCompletions: () => {},
      }
    );

    console.log('Inline completion provider registered for all languages');

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      provider.dispose();
      console.log('Inline completion provider disposed');
    };
  }, [editor]);

  // Register Monaco context menu actions
  useEffect(() => {
    if (!editor) return;

    // Register context menu actions
    const explainAction = editor.addAction({
      id: 'llm-explain',
      label: 'AI: Explain Code',
      contextMenuGroupId: 'llm',
      contextMenuOrder: 1,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('explain', selectedText);
          }
        }
      },
    });

    const summarizeAction = editor.addAction({
      id: 'llm-summarize',
      label: 'AI: Summarize',
      contextMenuGroupId: 'llm',
      contextMenuOrder: 2,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('summarize', selectedText);
          }
        }
      },
    });

    const translateAction = editor.addAction({
      id: 'llm-translate',
      label: 'AI: Translate to Korean',
      contextMenuGroupId: 'llm',
      contextMenuOrder: 3,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('translate', selectedText, 'Korean');
          }
        }
      },
    });

    const fixAction = editor.addAction({
      id: 'llm-fix',
      label: 'AI: Fix Code',
      contextMenuGroupId: 'llm',
      contextMenuOrder: 4,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('fix', selectedText);
          }
        }
      },
    });

    const improveAction = editor.addAction({
      id: 'llm-improve',
      label: 'AI: Improve Code',
      contextMenuGroupId: 'llm',
      contextMenuOrder: 5,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('improve', selectedText);
          }
        }
      },
    });

    const completeAction = editor.addAction({
      id: 'llm-complete',
      label: 'AI: Complete Code',
      contextMenuGroupId: 'llm',
      contextMenuOrder: 6,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('complete', selectedText);
          }
        }
      },
    });

    return () => {
      explainAction.dispose();
      summarizeAction.dispose();
      translateAction.dispose();
      fixAction.dispose();
      improveAction.dispose();
      completeAction.dispose();
    };
  }, [editor, handleEditorAction]);

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
            {isProcessing && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Processing...</span>
              </div>
            )}
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
          <MonacoEditor
            height="100%"
            language={activeFile.language || 'plaintext'}
            value={activeFile.content}
            onChange={handleEditorChange}
            onMount={(editor, monaco) => {
              setEditor(editor);
              // Store monaco instance globally for InlineCompletionProvider
              if (!((window as any).monaco)) {
                (window as any).monaco = monaco;
                console.log('Monaco instance stored globally');
              }
            }}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            options={{
              fontSize: 14,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              tabSize: 2,
              insertSpaces: true,
              // Enable inline suggestions (like GitHub Copilot)
              inlineSuggest: {
                enabled: true,
                mode: 'prefix',
              },
              // Quick suggestions configuration
              quickSuggestions: {
                other: true,
                comments: false,
                strings: false,
              },
              // Suggest configuration
              suggest: {
                preview: true,
                showInlineDetails: true,
              },
              // Accept suggestion on commit character
              acceptSuggestionOnCommitCharacter: true,
              // Accept suggestion on enter
              acceptSuggestionOnEnter: 'on',
              // Show suggestion delay
              quickSuggestionsDelay: 100,
            }}
          />
        </div>
      )}
    </div>
  );
}
