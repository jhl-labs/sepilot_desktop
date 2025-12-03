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
    editorUseRagInAutocomplete,
    editorUseToolsInAutocomplete,
  } = useChatStore();

  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAutocompleting, setIsAutocompleting] = useState(false);
  const [processingAction, setProcessingAction] = useState<string>('');
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

      if (!editor) {
        console.error('Editor instance is not available.');
        return;
      }

      // 액션 이름을 한글로 변환
      const actionNames: Record<string, string> = {
        summarize: '요약',
        translate: '번역',
        complete: '코드 완성',
        explain: '코드 설명',
        fix: '코드 수정',
        improve: '코드 개선',
        continue: '계속 작성',
        'make-shorter': '짧게 만들기',
        'make-longer': '길게 만들기',
        simplify: '단순화',
        'fix-grammar': '문법 수정',
        'change-tone-professional': '전문적 어조로 변경',
        'change-tone-casual': '캐주얼 어조로 변경',
        'change-tone-friendly': '친근한 어조로 변경',
        'find-action-items': '액션 아이템 찾기',
        'create-outline': '개요 작성',
      };

      setIsProcessing(true);
      setProcessingAction(actionNames[action] || action);
      try {
        const model = editor.getModel();
        const selection = editor.getSelection();

        if (!model || !selection) {
          console.error('No model or selection available');
          return;
        }

        // 전체 코드와 선택 영역의 위치 정보 수집
        const fullCode = model.getValue();
        const selectionStartOffset = model.getOffsetAt(selection.getStartPosition());
        const selectionEndOffset = model.getOffsetAt(selection.getEndPosition());

        // 선택 영역 앞뒤 컨텍스트 수집 (각각 최대 2000자)
        const textBefore = fullCode.substring(
          Math.max(0, selectionStartOffset - 2000),
          selectionStartOffset
        );
        const textAfter = fullCode.substring(
          selectionEndOffset,
          Math.min(fullCode.length, selectionEndOffset + 2000)
        );

        console.log('[EditorAction] Context collected:', {
          action,
          selectedTextLength: selectedText.length,
          contextBeforeLength: textBefore.length,
          contextAfterLength: textAfter.length,
          selectionStart: selection.getStartPosition(),
          selectionEnd: selection.getEndPosition(),
        });

        // 향상된 컨텍스트와 함께 액션 실행
        const result = await window.electronAPI.llm.editorAction({
          action,
          text: selectedText,
          language: activeFile?.language,
          targetLanguage,
          // 추가 컨텍스트 정보
          context: {
            before: textBefore,
            after: textAfter,
            fullCode: fullCode.length < 10000 ? fullCode : undefined, // 전체 코드가 작으면 포함
            filePath: activeFile?.path,
            lineStart: selection.startLineNumber,
            lineEnd: selection.endLineNumber,
          },
        });

        if (result.success && result.data) {
          // Insert or replace result in editor
          editor.executeEdits('', [
            {
              range: selection,
              text: result.data.result,
              forceMoveMarkers: true,
            },
          ]);
          console.log(`${action.charAt(0).toUpperCase() + action.slice(1)} completed successfully`);
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
        setProcessingAction('');
      }
    },
    [editor, activeFile?.language, activeFile?.path]
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

  // Register inline completion provider for autocomplete (triggered by Ctrl+.)
  useEffect(() => {
    if (!editor) {
      console.log('[Autocomplete] Editor not ready');
      return;
    }

    // Get monaco instance from the editor
    const monacoInstance = (window as any).monaco;
    if (!monacoInstance) {
      console.warn('[Autocomplete] Monaco instance not available');
      return;
    }

    let currentAbortController: AbortController | null = null;
    let lastRequestId = 0;
    let isRequestInProgress = false;
    let manualTriggerTime = 0; // 수동 트리거 시간 기록

    const REQUEST_TIMEOUT_MS = 10000; // 10초 타임아웃 (더 긴 컨텍스트 처리)
    const MANUAL_TRIGGER_TIMEOUT_MS = 500; // 수동 트리거 유효 시간

    // Ctrl+. 키보드 단축키로 수동 트리거
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        console.log('[Autocomplete] Manual trigger requested (Ctrl+.)');
        manualTriggerTime = Date.now();
        // Monaco의 inline suggestions를 수동으로 트리거
        editor.trigger('keyboard', 'editor.action.inlineSuggest.trigger', {});
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Create the provider object with all required methods
    const providerObject = {
      provideInlineCompletions: async (model: any, position: any, context: any, token: any) => {
        const now = Date.now();
        const isManualTrigger = now - manualTriggerTime < MANUAL_TRIGGER_TIMEOUT_MS;

        console.log('[Autocomplete] provideInlineCompletions called', {
          triggerKind: context?.triggerKind,
          isManualTrigger,
          timeSinceManualTrigger: now - manualTriggerTime,
        });

        // Return empty if autocomplete is not available
        if (!window.electronAPI?.llm?.editorAutocomplete) {
          console.warn('[Autocomplete] electronAPI.llm.editorAutocomplete not available');
          return { items: [] };
        }

        // Ctrl+.로 수동 트리거한 경우가 아니면 자동 완성 제공 안함
        if (!isManualTrigger) {
          return { items: [] };
        }

        // Monaco의 CancellationToken 체크
        if (token?.isCancellationRequested) {
          console.log('[Autocomplete] Token already cancelled');
          return { items: [] };
        }

        // 이전 요청 취소
        if (currentAbortController) {
          console.log('[Autocomplete] Aborting previous request');
          currentAbortController.abort();
          currentAbortController = null;
        }

        // 새로운 AbortController 생성
        const abortController = new AbortController();
        currentAbortController = abortController;
        const requestId = ++lastRequestId;

        // 이미 요청이 진행 중이면 이전 요청을 취소했으므로 계속 진행
        if (isRequestInProgress) {
          console.log('[Autocomplete] Previous request cancelled, starting new request');
        }

        try {
          const code = model.getValue();
          const offset = model.getOffsetAt(position);
          const language = model.getLanguageId();

          // Get enhanced context (Notion-style: before + after cursor)
          const textBeforeCursor = code.substring(0, offset);
          const textAfterCursor = code.substring(offset);

          // 앞쪽 컨텍스트: 최대 3000자 또는 50줄
          const linesBefore = textBeforeCursor.split('\n');
          const contextLinesBefore = linesBefore.slice(-50);
          const contextBefore = contextLinesBefore.join('\n').slice(-3000);

          // 뒤쪽 컨텍스트: 최대 1000자 또는 20줄
          const linesAfter = textAfterCursor.split('\n');
          const contextLinesAfter = linesAfter.slice(0, 20);
          const contextAfter = contextLinesAfter.join('\n').slice(0, 1000);

          // 현재 줄과 주변 줄 분석
          const currentLineNumber = position.lineNumber;
          const currentLine = linesBefore[linesBefore.length - 1];
          const previousLine = linesBefore.length > 1 ? linesBefore[linesBefore.length - 2] : '';
          const nextLine = linesAfter.length > 0 ? linesAfter[0] : '';

          console.log('[Autocomplete] Enhanced context:', {
            language,
            currentLine: currentLine.substring(0, 50),
            previousLine: previousLine.substring(0, 50),
            nextLine: nextLine.substring(0, 50),
            contextBeforeLength: contextBefore.length,
            contextAfterLength: contextAfter.length,
            lineNumber: currentLineNumber,
            column: position.column,
          });

          // 다시 한번 취소 체크
          if (token?.isCancellationRequested || abortController.signal.aborted) {
            console.log('[Autocomplete] Cancelled before API call');
            return { items: [] };
          }

          isRequestInProgress = true;
          setIsAutocompleting(true);
          console.log('[Autocomplete] Starting API request with enhanced context...');

          // 타임아웃과 함께 요청
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), REQUEST_TIMEOUT_MS);
          });

          // 향상된 컨텍스트와 함께 autocomplete 요청
          const requestPromise = window.electronAPI.llm.editorAutocomplete({
            code: `${contextBefore}<!CURSOR!>${contextAfter}`, // 커서 위치 표시
            cursorPosition: contextBefore.length,
            language,
            useRag: editorUseRagInAutocomplete,
            useTools: editorUseToolsInAutocomplete,
            // 추가 메타데이터
            metadata: {
              currentLine,
              previousLine,
              nextLine,
              lineNumber: currentLineNumber,
              hasContextBefore: contextBefore.length > 0,
              hasContextAfter: contextAfter.length > 0,
            },
          });

          const result = await Promise.race([requestPromise, timeoutPromise]);

          console.log('[Autocomplete] API response received:', {
            success: result.success,
            hasCompletion: !!result.data?.completion,
            error: result.error,
          });

          // 요청 완료 후 취소 체크
          if (
            token?.isCancellationRequested ||
            abortController.signal.aborted ||
            requestId !== lastRequestId
          ) {
            console.log('[Autocomplete] Cancelled after API call');
            return { items: [] };
          }

          if (result.success && result.data?.completion) {
            const completion = result.data.completion.trim();

            console.log('[Autocomplete] Completion text:', {
              length: completion.length,
              preview: completion.substring(0, 100),
            });

            if (completion) {
              console.log('[Autocomplete] Showing suggestion to user');
              return {
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
              };
            } else {
              console.log('[Autocomplete] Completion is empty after trim');
            }
          } else {
            console.warn('[Autocomplete] API call failed or no completion:', result.error);
          }
        } catch (error) {
          // 에러는 조용히 처리 (사용자 경험 방해 X)
          if (error instanceof Error && error.message !== 'Timeout') {
            console.error('[Autocomplete] Error:', error.message);
          } else if (error instanceof Error) {
            console.warn('[Autocomplete] Request timed out');
          }
        } finally {
          isRequestInProgress = false;
          setIsAutocompleting(false);
          if (currentAbortController === abortController) {
            currentAbortController = null;
          }
        }

        console.log('[Autocomplete] Returning empty result');
        return { items: [] };
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

    console.log('[Autocomplete] Provider registered for all languages (Ctrl+. to trigger)');
    console.log('[Autocomplete] Settings:', {
      useRag: editorUseRagInAutocomplete,
      useTools: editorUseToolsInAutocomplete,
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (currentAbortController) {
        currentAbortController.abort();
      }
      provider.dispose();
      console.log('[Autocomplete] Provider disposed');
    };
  }, [editor, editorUseRagInAutocomplete, editorUseToolsInAutocomplete]);

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
            {/* AI 작업 진행 상태 표시 */}
            {isProcessing && processingAction && (
              <div className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-1 rounded">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="font-medium">{processingAction} 중...</span>
              </div>
            )}
            {isAutocompleting && (
              <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950 px-2 py-1 rounded">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="font-medium">AI 자동완성 중...</span>
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
