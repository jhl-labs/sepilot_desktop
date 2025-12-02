'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type monaco from 'monaco-editor';
import { useChatStore } from '@/lib/store/chat-store';
import { Button } from '@/components/ui/button';
import { X, Save, FileText, Loader2, Eye, Code } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isElectron } from '@/lib/platform';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import path from 'path-browserify';

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
    editorAppearanceConfig,
    workingDirectory,
  } = useChatStore();

  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [previewMode, setPreviewMode] = useState<'editor' | 'preview' | 'split'>('editor');

  const activeFile = openFiles.find((f) => f.path === activeFilePath);

  // Markdown 파일인지 확인 (language가 'markdown'이거나 확장자가 .md, .mdx인 경우)
  const isMarkdownFile =
    activeFile &&
    (activeFile.language === 'markdown' ||
      activeFile.path.toLowerCase().endsWith('.md') ||
      activeFile.path.toLowerCase().endsWith('.mdx'));

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

  const handleEditorAction = useCallback(
    async (
      action:
        | 'summarize'
        | 'translate'
        | 'complete'
        | 'explain'
        | 'fix'
        | 'improve'
        | 'continue'
        | 'make-shorter'
        | 'make-longer'
        | 'simplify'
        | 'fix-grammar'
        | 'change-tone-professional'
        | 'change-tone-casual'
        | 'change-tone-friendly'
        | 'find-action-items'
        | 'create-outline',
      selectedText: string,
      targetLanguage?: string
    ) => {
      if (!window.electronAPI?.llm) {
        console.error('LLM API is not available. Please check your settings.');
        window.alert('LLM API is not available. Please check your settings.');
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
              console.log(
                `${action.charAt(0).toUpperCase() + action.slice(1)} completed successfully`
              );
            }
          }
        } else {
          console.error('Editor action failed:', result.error);
          window.alert(`Failed: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('Editor action error:', error);
        window.alert(
          `Error: ${error instanceof Error ? error.message : 'An unexpected error occurred'}`
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [editor, activeFile?.language]
  );

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
    if (!editor) {
      return;
    }

    // Get monaco instance from the editor
    const monacoInstance = (window as any).monaco;
    if (!monacoInstance) {
      console.warn('Monaco instance not available');
      return;
    }

    let debounceTimer: NodeJS.Timeout | null = null;
    let currentAbortController: AbortController | null = null;
    let lastRequestId = 0;
    let isRequestInProgress = false;

    const DEBOUNCE_MS = 300;
    const REQUEST_TIMEOUT_MS = 5000; // 5초 타임아웃

    // Create the provider object with all required methods
    const providerObject = {
      provideInlineCompletions: async (model: any, position: any, _context: any, token: any) => {
        // Return empty if autocomplete is not available
        if (!window.electronAPI?.llm?.editorAutocomplete) {
          return { items: [] };
        }

        // Monaco의 CancellationToken 체크
        if (token?.isCancellationRequested) {
          return { items: [] };
        }

        // 이전 요청 취소
        if (currentAbortController) {
          currentAbortController.abort();
          currentAbortController = null;
        }

        // 새로운 AbortController 생성
        const abortController = new AbortController();
        currentAbortController = abortController;
        const requestId = ++lastRequestId;

        // Debounce to avoid too many requests
        return new Promise((resolve) => {
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }

          debounceTimer = setTimeout(async () => {
            // 토큰 취소 체크
            if (token?.isCancellationRequested || abortController.signal.aborted) {
              resolve({ items: [] });
              return;
            }

            // 이미 요청이 진행 중이면 스킵
            if (isRequestInProgress) {
              resolve({ items: [] });
              return;
            }

            try {
              const code = model.getValue();
              const offset = model.getOffsetAt(position);
              const language = model.getLanguageId();

              // Get text before cursor for context
              const textBeforeCursor = code.substring(0, offset);
              const lines = textBeforeCursor.split('\n');
              const currentLine = lines[lines.length - 1];
              const previousLine = lines.length > 1 ? lines[lines.length - 2] : '';

              // Don't autocomplete only if there are 2+ consecutive empty lines
              // (current line is empty AND previous line is also empty)
              if (!currentLine.trim() && !previousLine.trim()) {
                resolve({ items: [] });
                return;
              }

              // 다시 한번 취소 체크
              if (token?.isCancellationRequested || abortController.signal.aborted) {
                resolve({ items: [] });
                return;
              }

              isRequestInProgress = true;

              // 타임아웃과 함께 요청
              const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Timeout')), REQUEST_TIMEOUT_MS);
              });

              const requestPromise = window.electronAPI.llm.editorAutocomplete({
                code,
                cursorPosition: offset,
                language,
              });

              const result = await Promise.race([requestPromise, timeoutPromise]);

              // 요청 완료 후 취소 체크
              if (
                token?.isCancellationRequested ||
                abortController.signal.aborted ||
                requestId !== lastRequestId
              ) {
                resolve({ items: [] });
                return;
              }

              if (result.success && result.data?.completion) {
                const completion = result.data.completion.trim();

                if (completion) {
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
              // 에러는 조용히 처리 (사용자 경험 방해 X)
              if (error instanceof Error && error.message !== 'Timeout') {
                console.error('[Autocomplete] Error:', error.message);
              }
            } finally {
              isRequestInProgress = false;
              if (currentAbortController === abortController) {
                currentAbortController = null;
              }
            }

            resolve({ items: [] });
          }, DEBOUNCE_MS);
        });
      },
      freeInlineCompletions: (_completions: any) => {
        // Clean up resources if needed
      },
      handleItemDidShow: (_completions: any, _item: any) => {
        // Optional: Called when an item is shown
      },
      disposeInlineCompletions: (_completions: any) => {
        // Dispose inline completions
      },
    };

    // Register provider for ALL languages (not just current file's language)
    const provider = monacoInstance.languages.registerInlineCompletionsProvider(
      '*', // All languages
      providerObject
    );

    console.log('Inline completion provider registered for all languages');

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (currentAbortController) {
        currentAbortController.abort();
      }
      provider.dispose();
      console.log('Inline completion provider disposed');
    };
  }, [editor]);

  // Register Monaco context menu actions
  useEffect(() => {
    if (!editor) {
      return;
    }

    // === Writing Tools (Notion style) ===
    const continueAction = editor.addAction({
      id: 'llm-continue',
      label: 'Writing: Continue writing',
      contextMenuGroupId: 'writing',
      contextMenuOrder: 1,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('continue', selectedText);
          }
        }
      },
    });

    const makeShorterAction = editor.addAction({
      id: 'llm-make-shorter',
      label: 'Writing: Make shorter',
      contextMenuGroupId: 'writing',
      contextMenuOrder: 2,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('make-shorter', selectedText);
          }
        }
      },
    });

    const makeLongerAction = editor.addAction({
      id: 'llm-make-longer',
      label: 'Writing: Make longer',
      contextMenuGroupId: 'writing',
      contextMenuOrder: 3,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('make-longer', selectedText);
          }
        }
      },
    });

    const simplifyAction = editor.addAction({
      id: 'llm-simplify',
      label: 'Writing: Simplify',
      contextMenuGroupId: 'writing',
      contextMenuOrder: 4,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('simplify', selectedText);
          }
        }
      },
    });

    const fixGrammarAction = editor.addAction({
      id: 'llm-fix-grammar',
      label: 'Writing: Fix spelling & grammar',
      contextMenuGroupId: 'writing',
      contextMenuOrder: 5,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('fix-grammar', selectedText);
          }
        }
      },
    });

    const toneProfessionalAction = editor.addAction({
      id: 'llm-tone-professional',
      label: 'Writing: Change tone → Professional',
      contextMenuGroupId: 'writing',
      contextMenuOrder: 6,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('change-tone-professional', selectedText);
          }
        }
      },
    });

    const toneCasualAction = editor.addAction({
      id: 'llm-tone-casual',
      label: 'Writing: Change tone → Casual',
      contextMenuGroupId: 'writing',
      contextMenuOrder: 7,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('change-tone-casual', selectedText);
          }
        }
      },
    });

    const toneFriendlyAction = editor.addAction({
      id: 'llm-tone-friendly',
      label: 'Writing: Change tone → Friendly',
      contextMenuGroupId: 'writing',
      contextMenuOrder: 8,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('change-tone-friendly', selectedText);
          }
        }
      },
    });

    const findActionItemsAction = editor.addAction({
      id: 'llm-find-action-items',
      label: 'Writing: Find action items',
      contextMenuGroupId: 'writing',
      contextMenuOrder: 9,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('find-action-items', selectedText);
          }
        }
      },
    });

    const createOutlineAction = editor.addAction({
      id: 'llm-create-outline',
      label: 'Writing: Create outline',
      contextMenuGroupId: 'writing',
      contextMenuOrder: 10,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('create-outline', selectedText);
          }
        }
      },
    });

    // === AI Actions ===
    const summarizeAction = editor.addAction({
      id: 'llm-summarize',
      label: 'AI: Summarize',
      contextMenuGroupId: 'ai',
      contextMenuOrder: 1,
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
      contextMenuGroupId: 'ai',
      contextMenuOrder: 2,
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

    const explainAction = editor.addAction({
      id: 'llm-explain',
      label: 'AI: Explain Code',
      contextMenuGroupId: 'ai',
      contextMenuOrder: 3,
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

    const fixAction = editor.addAction({
      id: 'llm-fix',
      label: 'AI: Fix Code',
      contextMenuGroupId: 'ai',
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
      contextMenuGroupId: 'ai',
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
      contextMenuGroupId: 'ai',
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
      // Writing Tools
      continueAction.dispose();
      makeShorterAction.dispose();
      makeLongerAction.dispose();
      simplifyAction.dispose();
      fixGrammarAction.dispose();
      toneProfessionalAction.dispose();
      toneCasualAction.dispose();
      toneFriendlyAction.dispose();
      findActionItemsAction.dispose();
      createOutlineAction.dispose();
      // AI Actions
      summarizeAction.dispose();
      translateAction.dispose();
      explainAction.dispose();
      fixAction.dispose();
      improveAction.dispose();
      completeAction.dispose();
    };
  }, [editor, handleEditorAction]);

  // Handle clipboard image paste (Ctrl+V)
  useEffect(() => {
    if (!editor || !isElectron() || !window.electronAPI) {
      return;
    }

    const handlePaste = async (e: ClipboardEvent) => {
      // Markdown 파일에서만 이미지 붙여넣기 지원
      if (!isMarkdownFile || !activeFile || !workingDirectory) {
        return;
      }

      try {
        // Electron 클립보드에 이미지가 있는지 먼저 확인
        // (웹 ClipboardEvent는 Electron 네이티브 클립보드와 다를 수 있음)
        const result = await window.electronAPI.fs.saveClipboardImage(workingDirectory);

        if (result.success && result.data) {
          // 클립보드에 이미지가 있었음 - 기본 paste 동작 방지
          e.preventDefault();
          e.stopPropagation();

          const { filename } = result.data;

          // 파일이 위치한 디렉토리 기준으로 이미지의 상대 경로 계산
          const fileDir = path.dirname(activeFile.path);
          const relativePath = path.relative(fileDir, path.join(workingDirectory, filename));

          // Markdown 이미지 문법으로 삽입
          const imageMarkdown = `![${filename}](${relativePath})`;

          // 현재 커서 위치에 삽입
          const position = editor.getPosition();
          if (position) {
            editor.executeEdits('paste-image', [
              {
                range: new (window as any).monaco.Range(
                  position.lineNumber,
                  position.column,
                  position.lineNumber,
                  position.column
                ),
                text: imageMarkdown,
                forceMoveMarkers: true,
              },
            ]);

            // 커서를 삽입된 텍스트 끝으로 이동
            const newPosition = {
              lineNumber: position.lineNumber,
              column: position.column + imageMarkdown.length,
            };
            editor.setPosition(newPosition);
            editor.focus();
          }
        }
      } catch (error) {
        console.error('[Editor] Error handling clipboard image:', error);
        // 에러 발생 시에도 기본 paste 동작 허용
      }
    };

    // DOM 요소에 이벤트 리스너 추가
    const editorDomNode = editor.getDomNode();
    if (editorDomNode) {
      // capture phase에서 이벤트를 먼저 잡음
      editorDomNode.addEventListener('paste', handlePaste, true);

      return () => {
        editorDomNode.removeEventListener('paste', handlePaste, true);
      };
    }

    return undefined;
  }, [editor, isMarkdownFile, activeFile, workingDirectory]);

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

  // Update editor options when appearance config changes
  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.updateOptions({
      fontSize: editorAppearanceConfig.fontSize,
      fontFamily: editorAppearanceConfig.fontFamily,
      minimap: {
        enabled: previewMode === 'split' ? false : editorAppearanceConfig.minimap,
      },
      wordWrap: editorAppearanceConfig.wordWrap,
      tabSize: editorAppearanceConfig.tabSize,
      lineNumbers: editorAppearanceConfig.lineNumbers,
    });
  }, [editor, editorAppearanceConfig, previewMode]);

  if (openFiles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <FileText className="mb-4 h-16 w-16 opacity-20" />
        <h2 className="mb-2 text-xl font-semibold">SEPilot Editor</h2>
        <p className="text-center text-sm">파일 탐색기에서 파일을 선택하세요</p>
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

      {/* Monaco Editor and/or Markdown Preview */}
      {activeFile && (
        <div className="flex-1 overflow-hidden flex">
          {/* Monaco Editor */}
          {(previewMode === 'editor' || previewMode === 'split') && (
            <div className={cn('overflow-hidden', previewMode === 'split' ? 'flex-1' : 'w-full')}>
              <MonacoEditor
                height="100%"
                language={activeFile.language || 'plaintext'}
                value={activeFile.content}
                onChange={handleEditorChange}
                onMount={(editor, monaco) => {
                  setEditor(editor);
                  // Store monaco instance globally for InlineCompletionProvider
                  if (!(window as any).monaco) {
                    (window as any).monaco = monaco;
                    console.log('Monaco instance stored globally');
                  }
                }}
                theme={editorAppearanceConfig.theme}
                options={{
                  fontSize: editorAppearanceConfig.fontSize,
                  fontFamily: editorAppearanceConfig.fontFamily,
                  minimap: {
                    enabled: previewMode === 'split' ? false : editorAppearanceConfig.minimap,
                  },
                  scrollBeyondLastLine: false,
                  wordWrap: editorAppearanceConfig.wordWrap,
                  automaticLayout: true,
                  tabSize: editorAppearanceConfig.tabSize,
                  insertSpaces: true,
                  lineNumbers: editorAppearanceConfig.lineNumbers,
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

          {/* Markdown Preview */}
          {isMarkdownFile && (previewMode === 'preview' || previewMode === 'split') && (
            <div
              className={cn(
                'overflow-auto border-l',
                previewMode === 'split' ? 'flex-1' : 'w-full'
              )}
            >
              <div className="p-6">
                <MarkdownRenderer content={activeFile.content} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
