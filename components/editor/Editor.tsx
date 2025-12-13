'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
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
    editorUseRagInAutocomplete,
    editorUseToolsInAutocomplete,
  } = useChatStore();

  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAutocompleting, setIsAutocompleting] = useState(false);
  const [processingAction, setProcessingAction] = useState<string>('');
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
        console.log('File saved successfully:', activeFile.path);

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
        console.log('File refreshed successfully:', activeFile.path);
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

  const handleEditorAction = useCallback(
    async (
      action: // 코드용 AI 액션
        | 'explain'
        | 'fix'
        | 'improve'
        | 'complete'
        | 'add-comments'
        | 'generate-tests'
        // 문서용 AI 액션
        | 'continue'
        | 'make-shorter'
        | 'make-longer'
        | 'simplify'
        | 'fix-grammar'
        | 'summarize'
        | 'translate',
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
        // 코드용 AI
        explain: '코드 설명',
        fix: '코드 수정',
        improve: '코드 개선',
        complete: '코드 완성',
        'add-comments': '주석 추가',
        'generate-tests': '테스트 생성',
        // 문서용 AI
        continue: '계속 작성',
        'make-shorter': '짧게 만들기',
        'make-longer': '길게 만들기',
        simplify: '단순화',
        'fix-grammar': '문법 수정',
        summarize: '요약',
        translate: '번역',
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
            useRag: editorUseRagInAutocomplete,
            useTools: editorUseToolsInAutocomplete,
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

    // === Basic Editing Actions (VSCode style) ===
    const formatDocumentAction = editor.addAction({
      id: 'format-document',
      label: 'Edit: Format Document',
      keybindings: [
        (window as any).monaco?.KeyMod.Shift |
          (window as any).monaco?.KeyMod.Alt |
          (window as any).monaco?.KeyCode.KeyF,
      ],
      contextMenuGroupId: 'editing',
      contextMenuOrder: 1,
      run: (ed) => {
        ed.getAction('editor.action.formatDocument')?.run();
      },
    });

    const formatSelectionAction = editor.addAction({
      id: 'format-selection',
      label: 'Edit: Format Selection',
      contextMenuGroupId: 'editing',
      contextMenuOrder: 2,
      run: (ed) => {
        ed.getAction('editor.action.formatSelection')?.run();
      },
    });

    const commentLineAction = editor.addAction({
      id: 'comment-line',
      label: 'Edit: Toggle Line Comment',
      keybindings: [(window as any).monaco?.KeyMod.CtrlCmd | (window as any).monaco?.KeyCode.Slash],
      contextMenuGroupId: 'editing',
      contextMenuOrder: 3,
      run: (ed) => {
        ed.getAction('editor.action.commentLine')?.run();
      },
    });

    const blockCommentAction = editor.addAction({
      id: 'block-comment',
      label: 'Edit: Toggle Block Comment',
      keybindings: [
        (window as any).monaco?.KeyMod.Shift |
          (window as any).monaco?.KeyMod.Alt |
          (window as any).monaco?.KeyCode.KeyA,
      ],
      contextMenuGroupId: 'editing',
      contextMenuOrder: 4,
      run: (ed) => {
        ed.getAction('editor.action.blockComment')?.run();
      },
    });

    const duplicateLineAction = editor.addAction({
      id: 'duplicate-line',
      label: 'Edit: Duplicate Line',
      keybindings: [
        (window as any).monaco?.KeyMod.Shift |
          (window as any).monaco?.KeyMod.Alt |
          (window as any).monaco?.KeyCode.DownArrow,
      ],
      contextMenuGroupId: 'editing',
      contextMenuOrder: 5,
      run: (ed) => {
        ed.getAction('editor.action.copyLinesDownAction')?.run();
      },
    });

    const deleteLineAction = editor.addAction({
      id: 'delete-line',
      label: 'Edit: Delete Line',
      keybindings: [
        (window as any).monaco?.KeyMod.CtrlCmd |
          (window as any).monaco?.KeyMod.Shift |
          (window as any).monaco?.KeyCode.KeyK,
      ],
      contextMenuGroupId: 'editing',
      contextMenuOrder: 6,
      run: (ed) => {
        ed.getAction('editor.action.deleteLines')?.run();
      },
    });

    const moveLineUpAction = editor.addAction({
      id: 'move-line-up',
      label: 'Edit: Move Line Up',
      keybindings: [(window as any).monaco?.KeyMod.Alt | (window as any).monaco?.KeyCode.UpArrow],
      contextMenuGroupId: 'editing',
      contextMenuOrder: 7,
      run: (ed) => {
        ed.getAction('editor.action.moveLinesUpAction')?.run();
      },
    });

    const moveLineDownAction = editor.addAction({
      id: 'move-line-down',
      label: 'Edit: Move Line Down',
      keybindings: [(window as any).monaco?.KeyMod.Alt | (window as any).monaco?.KeyCode.DownArrow],
      contextMenuGroupId: 'editing',
      contextMenuOrder: 8,
      run: (ed) => {
        ed.getAction('editor.action.moveLinesDownAction')?.run();
      },
    });

    // === Transform Actions ===
    const uppercaseAction = editor.addAction({
      id: 'transform-uppercase',
      label: 'Transform: UPPERCASE',
      contextMenuGroupId: 'transform',
      contextMenuOrder: 1,
      run: (ed) => {
        ed.getAction('editor.action.transformToUppercase')?.run();
      },
    });

    const lowercaseAction = editor.addAction({
      id: 'transform-lowercase',
      label: 'Transform: lowercase',
      contextMenuGroupId: 'transform',
      contextMenuOrder: 2,
      run: (ed) => {
        ed.getAction('editor.action.transformToLowercase')?.run();
      },
    });

    const titleCaseAction = editor.addAction({
      id: 'transform-titlecase',
      label: 'Transform: Title Case',
      contextMenuGroupId: 'transform',
      contextMenuOrder: 3,
      run: (ed) => {
        ed.getAction('editor.action.transformToTitlecase')?.run();
      },
    });

    const sortLinesAscAction = editor.addAction({
      id: 'sort-lines-asc',
      label: 'Transform: Sort Lines Ascending',
      contextMenuGroupId: 'transform',
      contextMenuOrder: 4,
      run: (ed) => {
        ed.getAction('editor.action.sortLinesAscending')?.run();
      },
    });

    const sortLinesDescAction = editor.addAction({
      id: 'sort-lines-desc',
      label: 'Transform: Sort Lines Descending',
      contextMenuGroupId: 'transform',
      contextMenuOrder: 5,
      run: (ed) => {
        ed.getAction('editor.action.sortLinesDescending')?.run();
      },
    });

    // === Folding Actions ===
    const foldAction = editor.addAction({
      id: 'fold',
      label: 'Fold: Fold Region',
      keybindings: [
        (window as any).monaco?.KeyMod.CtrlCmd |
          (window as any).monaco?.KeyMod.Shift |
          (window as any).monaco?.KeyCode.BracketLeft,
      ],
      contextMenuGroupId: 'folding',
      contextMenuOrder: 1,
      run: (ed) => {
        ed.getAction('editor.fold')?.run();
      },
    });

    const unfoldAction = editor.addAction({
      id: 'unfold',
      label: 'Fold: Unfold Region',
      keybindings: [
        (window as any).monaco?.KeyMod.CtrlCmd |
          (window as any).monaco?.KeyMod.Shift |
          (window as any).monaco?.KeyCode.BracketRight,
      ],
      contextMenuGroupId: 'folding',
      contextMenuOrder: 2,
      run: (ed) => {
        ed.getAction('editor.unfold')?.run();
      },
    });

    const foldAllAction = editor.addAction({
      id: 'fold-all',
      label: 'Fold: Fold All',
      keybindings: [
        (window as any).monaco?.KeyMod.CtrlCmd | (window as any).monaco?.KeyCode.KeyK,
        (window as any).monaco?.KeyMod.CtrlCmd | (window as any).monaco?.KeyCode.Digit0,
      ],
      contextMenuGroupId: 'folding',
      contextMenuOrder: 3,
      run: (ed) => {
        ed.getAction('editor.foldAll')?.run();
      },
    });

    const unfoldAllAction = editor.addAction({
      id: 'unfold-all',
      label: 'Fold: Unfold All',
      keybindings: [
        (window as any).monaco?.KeyMod.CtrlCmd | (window as any).monaco?.KeyCode.KeyK,
        (window as any).monaco?.KeyMod.CtrlCmd | (window as any).monaco?.KeyCode.KeyJ,
      ],
      contextMenuGroupId: 'folding',
      contextMenuOrder: 4,
      run: (ed) => {
        ed.getAction('editor.unfoldAll')?.run();
      },
    });

    // === Navigation Actions ===
    const goToLineAction = editor.addAction({
      id: 'go-to-line',
      label: 'Navigate: Go to Line...',
      keybindings: [(window as any).monaco?.KeyMod.CtrlCmd | (window as any).monaco?.KeyCode.KeyG],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: (ed) => {
        ed.getAction('editor.action.gotoLine')?.run();
      },
    });

    const goToDefinitionAction = editor.addAction({
      id: 'go-to-definition',
      label: 'Navigate: Go to Definition',
      keybindings: [(window as any).monaco?.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 2,
      run: (ed) => {
        ed.getAction('editor.action.revealDefinition')?.run();
      },
    });

    const peekDefinitionAction = editor.addAction({
      id: 'peek-definition',
      label: 'Navigate: Peek Definition',
      keybindings: [(window as any).monaco?.KeyMod.Alt | (window as any).monaco?.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 3,
      run: (ed) => {
        ed.getAction('editor.action.peekDefinition')?.run();
      },
    });

    const findReferencesAction = editor.addAction({
      id: 'find-references',
      label: 'Navigate: Find All References',
      keybindings: [(window as any).monaco?.KeyMod.Shift | (window as any).monaco?.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 4,
      run: (ed) => {
        ed.getAction('editor.action.goToReferences')?.run();
      },
    });

    // === Selection Actions ===
    const selectAllOccurrencesAction = editor.addAction({
      id: 'select-all-occurrences',
      label: 'Selection: Select All Occurrences',
      keybindings: [
        (window as any).monaco?.KeyMod.CtrlCmd |
          (window as any).monaco?.KeyMod.Shift |
          (window as any).monaco?.KeyCode.KeyL,
      ],
      contextMenuGroupId: 'selection',
      contextMenuOrder: 1,
      run: (ed) => {
        ed.getAction('editor.action.selectHighlights')?.run();
      },
    });

    const addCursorAboveAction = editor.addAction({
      id: 'add-cursor-above',
      label: 'Selection: Add Cursor Above',
      keybindings: [
        (window as any).monaco?.KeyMod.CtrlCmd |
          (window as any).monaco?.KeyMod.Alt |
          (window as any).monaco?.KeyCode.UpArrow,
      ],
      contextMenuGroupId: 'selection',
      contextMenuOrder: 2,
      run: (ed) => {
        ed.getAction('editor.action.insertCursorAbove')?.run();
      },
    });

    const addCursorBelowAction = editor.addAction({
      id: 'add-cursor-below',
      label: 'Selection: Add Cursor Below',
      keybindings: [
        (window as any).monaco?.KeyMod.CtrlCmd |
          (window as any).monaco?.KeyMod.Alt |
          (window as any).monaco?.KeyCode.DownArrow,
      ],
      contextMenuGroupId: 'selection',
      contextMenuOrder: 3,
      run: (ed) => {
        ed.getAction('editor.action.insertCursorBelow')?.run();
      },
    });

    const expandSelectionAction = editor.addAction({
      id: 'expand-selection',
      label: 'Selection: Expand Selection',
      keybindings: [
        (window as any).monaco?.KeyMod.Shift |
          (window as any).monaco?.KeyMod.Alt |
          (window as any).monaco?.KeyCode.RightArrow,
      ],
      contextMenuGroupId: 'selection',
      contextMenuOrder: 4,
      run: (ed) => {
        ed.getAction('editor.action.smartSelect.expand')?.run();
      },
    });

    const shrinkSelectionAction = editor.addAction({
      id: 'shrink-selection',
      label: 'Selection: Shrink Selection',
      keybindings: [
        (window as any).monaco?.KeyMod.Shift |
          (window as any).monaco?.KeyMod.Alt |
          (window as any).monaco?.KeyCode.LeftArrow,
      ],
      contextMenuGroupId: 'selection',
      contextMenuOrder: 5,
      run: (ed) => {
        ed.getAction('editor.action.smartSelect.shrink')?.run();
      },
    });

    // === Code AI Actions (코드용 AI) ===
    const explainAction = editor.addAction({
      id: 'code-ai-explain',
      label: 'Code AI: 코드 설명',
      contextMenuGroupId: 'code-ai',
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

    const fixAction = editor.addAction({
      id: 'code-ai-fix',
      label: 'Code AI: 버그 수정',
      contextMenuGroupId: 'code-ai',
      contextMenuOrder: 2,
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
      id: 'code-ai-improve',
      label: 'Code AI: 코드 개선',
      contextMenuGroupId: 'code-ai',
      contextMenuOrder: 3,
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
      id: 'code-ai-complete',
      label: 'Code AI: 코드 완성',
      contextMenuGroupId: 'code-ai',
      contextMenuOrder: 4,
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

    const addCommentsAction = editor.addAction({
      id: 'code-ai-add-comments',
      label: 'Code AI: 주석 추가',
      contextMenuGroupId: 'code-ai',
      contextMenuOrder: 5,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('add-comments', selectedText);
          }
        }
      },
    });

    const generateTestsAction = editor.addAction({
      id: 'code-ai-generate-tests',
      label: 'Code AI: 테스트 생성',
      contextMenuGroupId: 'code-ai',
      contextMenuOrder: 6,
      run: async (ed) => {
        const selection = ed.getSelection();
        if (selection && !selection.isEmpty()) {
          const selectedText = ed.getModel()?.getValueInRange(selection);
          if (selectedText) {
            await handleEditorAction('generate-tests', selectedText);
          }
        }
      },
    });

    // === Writing AI Actions (문서용 AI) ===
    const continueAction = editor.addAction({
      id: 'writing-ai-continue',
      label: 'Writing AI: 계속 작성',
      contextMenuGroupId: 'writing-ai',
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
      id: 'writing-ai-make-shorter',
      label: 'Writing AI: 짧게 만들기',
      contextMenuGroupId: 'writing-ai',
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
      id: 'writing-ai-make-longer',
      label: 'Writing AI: 길게 만들기',
      contextMenuGroupId: 'writing-ai',
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
      id: 'writing-ai-simplify',
      label: 'Writing AI: 단순화',
      contextMenuGroupId: 'writing-ai',
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
      id: 'writing-ai-fix-grammar',
      label: 'Writing AI: 문법/맞춤법 수정',
      contextMenuGroupId: 'writing-ai',
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

    const summarizeAction = editor.addAction({
      id: 'writing-ai-summarize',
      label: 'Writing AI: 요약',
      contextMenuGroupId: 'writing-ai',
      contextMenuOrder: 6,
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
      id: 'writing-ai-translate',
      label: 'Writing AI: 한국어로 번역',
      contextMenuGroupId: 'writing-ai',
      contextMenuOrder: 7,
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

    return () => {
      // Basic Editing Actions
      formatDocumentAction.dispose();
      formatSelectionAction.dispose();
      commentLineAction.dispose();
      blockCommentAction.dispose();
      duplicateLineAction.dispose();
      deleteLineAction.dispose();
      moveLineUpAction.dispose();
      moveLineDownAction.dispose();
      // Transform Actions
      uppercaseAction.dispose();
      lowercaseAction.dispose();
      titleCaseAction.dispose();
      sortLinesAscAction.dispose();
      sortLinesDescAction.dispose();
      // Folding Actions
      foldAction.dispose();
      unfoldAction.dispose();
      foldAllAction.dispose();
      unfoldAllAction.dispose();
      // Navigation Actions
      goToLineAction.dispose();
      goToDefinitionAction.dispose();
      peekDefinitionAction.dispose();
      findReferencesAction.dispose();
      // Selection Actions
      selectAllOccurrencesAction.dispose();
      addCursorAboveAction.dispose();
      addCursorBelowAction.dispose();
      expandSelectionAction.dispose();
      shrinkSelectionAction.dispose();
      // Code AI Actions
      explainAction.dispose();
      fixAction.dispose();
      improveAction.dispose();
      completeAction.dispose();
      addCommentsAction.dispose();
      generateTestsAction.dispose();
      // Writing AI Actions
      continueAction.dispose();
      makeShorterAction.dispose();
      makeLongerAction.dispose();
      simplifyAction.dispose();
      fixGrammarAction.dispose();
      summarizeAction.dispose();
      translateAction.dispose();
    };
  }, [editor, handleEditorAction]);

  // Handle clipboard image paste (Ctrl+V) - Only for Markdown files
  useEffect(() => {
    if (!editor || !isElectron() || !window.electronAPI) {
      return;
    }

    console.log('[Editor] Setting up paste handler');

    // Ctrl+V DOM 이벤트 리스너 사용 (Monaco 키 바인딩 대신)
    const handlePaste = async (e: ClipboardEvent) => {
      // Markdown 파일인지 확인
      const currentFile = openFiles.find((f) => f.path === activeFilePath);
      const currentIsMarkdown =
        currentFile &&
        (currentFile.language === 'markdown' ||
          currentFile.path.toLowerCase().endsWith('.md') ||
          currentFile.path.toLowerCase().endsWith('.mdx'));

      // Markdown이 아니거나 필요한 정보가 없으면 기본 동작
      if (!currentIsMarkdown || !currentFile || !workingDirectory) {
        return; // 기본 paste 동작 허용
      }

      // 에디터에 포커스가 없으면 무시
      if (!editor.hasTextFocus()) {
        return;
      }

      console.log('[Editor] Paste event in Markdown file');

      try {
        // Electron 클립보드에서 이미지 확인 및 저장 시도
        const result = await window.electronAPI.fs.saveClipboardImage(workingDirectory);

        if (result.success && result.data) {
          // 이미지가 있었음 - 기본 paste 동작 막고 이미지 삽입
          e.preventDefault();
          e.stopPropagation();

          const { filename } = result.data;
          console.log('[Editor] Image saved:', filename);

          // 상대 경로 계산 - working directory 기준
          const imagePath = path.join(workingDirectory, filename);

          console.log('[Editor] Path info:', {
            currentFile: currentFile.path,
            imagePath,
            workingDirectory,
          });

          // IPC로 working directory 기준 상대 경로 계산
          const relativePathResult = await window.electronAPI.fs.getRelativePath(
            workingDirectory,
            imagePath
          );

          let relativePath: string;
          if (relativePathResult.success && relativePathResult.data) {
            relativePath = relativePathResult.data;
            // Windows 백슬래시를 forward slash로 변환 (Markdown 표준)
            relativePath = relativePath.replace(/\\/g, '/');

            // working directory와 같은 위치면 단순히 파일명만 사용
            // 그렇지 않으면 ./ 접두사 추가
            if (relativePath === filename || relativePath === `./${filename}`) {
              relativePath = `./${filename}`;
            } else if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
              relativePath = `./${relativePath}`;
            }

            console.log('[Editor] Relative path (working dir based):', relativePath);
          } else {
            // Fallback: working directory에 있다고 가정
            relativePath = `./${filename}`;
            console.warn('[Editor] Failed to get relative path, using fallback:', relativePath);
          }

          const imageMarkdown = `![${filename}](${relativePath})`;

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

            const newPosition = {
              lineNumber: position.lineNumber,
              column: position.column + imageMarkdown.length,
            };
            editor.setPosition(newPosition);
            editor.focus();
            console.log('[Editor] Image markdown inserted');
          }
        } else {
          // 이미지가 없음 - 기본 paste 동작 허용
          console.log('[Editor] No image in clipboard, using default paste');
        }
      } catch (error) {
        console.error('[Editor] Error handling paste:', error);
        // 에러 발생 시 기본 paste 동작 허용
      }
    };

    // DOM 이벤트 리스너 등록
    const editorDomNode = editor.getDomNode();
    if (editorDomNode) {
      editorDomNode.addEventListener('paste', handlePaste);
      console.log('[Editor] Paste handler registered');
    }

    // 정리
    return () => {
      if (editorDomNode) {
        editorDomNode.removeEventListener('paste', handlePaste);
        console.log('[Editor] Paste handler removed');
      }
    };
  }, [editor, openFiles, activeFilePath, workingDirectory]);

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
            console.log('[Editor] File changed externally:', activeFile.path);
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
        console.log('[Editor] Drop ignored: no path, no name, or is directory');
        return;
      }

      // Check if file is already open
      const existingFile = openFiles.find((f) => f.path === filePath);
      if (existingFile) {
        setActiveFile(filePath);
        console.log('[Editor] File already open, switching to it:', filePath);
        return;
      }

      const { getLanguageFromFilename } = await import('@/lib/utils/file-language');
      const language = getLanguageFromFilename(fileName);

      // Check if it's an image file (images are loaded separately in the viewer)
      const imgExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
      const isImage = imgExtensions.some((ext) => filePath.toLowerCase().endsWith(ext));

      if (isImage) {
        // Image files don't need content - they're loaded as base64 in the viewer
        console.log('[Editor] Opening dropped image file:', filePath);
        openFile({
          path: filePath,
          filename: fileName,
          content: '',
          language,
        });
        return;
      }

      // Read and open the file
      console.log('[Editor] Opening dropped file:', filePath);
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
