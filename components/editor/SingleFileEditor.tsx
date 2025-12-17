'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import { logger } from '@/lib/utils/logger';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';

// Configure Monaco to use local files from public/monaco/vs
loader.config({
  paths: {
    vs: '/monaco/vs',
  },
});

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full">Loading editor...</div>,
});

export interface SingleFileEditorProps {
  content: string;
  language: string;
  filePath?: string;
  onChange?: (value: string | undefined) => void;
  onSave?: () => void;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => void;
  theme?: string;
  workingDirectory?: string;
}

export function SingleFileEditor({
  content,
  language,
  filePath,
  onChange,
  onSave,
  options,
  onMount,
  theme = 'vs-dark',
  workingDirectory: propWorkingDirectory,
}: SingleFileEditorProps) {
  const {
    editorAppearanceConfig,
    workingDirectory: storeWorkingDirectory,
    editorUseRagInAutocomplete,
    editorUseToolsInAutocomplete,
  } = useChatStore();

  const workingDirectory = propWorkingDirectory || storeWorkingDirectory;

  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [monacoInstance, setMonacoInstance] = useState<typeof monaco | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState<string>('');

  // Editor Actions Logic
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

        logger.info('[EditorAction] Context collected:', {
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
          language: language,
          targetLanguage,
          // 추가 컨텍스트 정보
          context: {
            before: textBefore,
            after: textAfter,
            fullCode: fullCode.length < 10000 ? fullCode : undefined, // 전체 코드가 작으면 포함
            filePath: filePath,
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
          logger.info(`${action.charAt(0).toUpperCase() + action.slice(1)} completed successfully`);
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
    [editor, language, filePath, editorUseRagInAutocomplete, editorUseToolsInAutocomplete]
  );

  // Register inline completion provider for autocomplete (triggered by Ctrl+.)
  useEffect(() => {
    if (!editor || !monacoInstance) {
      logger.info('[Autocomplete] Editor or Monaco instance not ready');
      return;
    }

    let currentAbortController: AbortController | null = null;
    let lastRequestId = 0;
    let isRequestInProgress = false;
    let manualTriggerTime = 0; // 수동 트리거 시간 기록

    const REQUEST_TIMEOUT_MS = 10000; // 10초 타임아웃
    const MANUAL_TRIGGER_TIMEOUT_MS = 500; // 수동 트리거 유효 시간

    // Ctrl+. 키보드 단축키로 수동 트리거
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        logger.info('[Autocomplete] Manual trigger requested (Ctrl+.)');
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

        logger.info('[Autocomplete] provideInlineCompletions called', {
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
          logger.info('[Autocomplete] Token already cancelled');
          return { items: [] };
        }

        // 이전 요청 취소
        if (currentAbortController) {
          logger.info('[Autocomplete] Aborting previous request');
          currentAbortController.abort();
          currentAbortController = null;
        }

        // 새로운 AbortController 생성
        const abortController = new AbortController();
        currentAbortController = abortController;
        const requestId = ++lastRequestId;

        // 이미 요청이 진행 중이면 이전 요청을 취소했으므로 계속 진행
        if (isRequestInProgress) {
          logger.info('[Autocomplete] Previous request cancelled, starting new request');
        }

        try {
          const code = model.getValue();
          const offset = model.getOffsetAt(position);
          const currentLanguage = model.getLanguageId();

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

          logger.info('[Autocomplete] Enhanced context:', {
            language: currentLanguage,
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
            logger.info('[Autocomplete] Cancelled before API call');
            return { items: [] };
          }

          isRequestInProgress = true;
          logger.info('[Autocomplete] Starting API request with enhanced context...');

          // 타임아웃과 함께 요청
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), REQUEST_TIMEOUT_MS);
          });

          // 향상된 컨텍스트와 함께 autocomplete 요청
          const requestPromise = window.electronAPI.llm.editorAutocomplete({
            code: `${contextBefore}<!CURSOR!>${contextAfter}`,
            cursorPosition: contextBefore.length,
            language: currentLanguage,
            useRag: editorUseRagInAutocomplete,
            useTools: editorUseToolsInAutocomplete,
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

          logger.info('[Autocomplete] API response received:', {
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
            logger.info('[Autocomplete] Cancelled after API call');
            return { items: [] };
          }

          if (result.success && result.data?.completion) {
            const completion = result.data.completion.trim();

            if (completion) {
              logger.info('[Autocomplete] Showing suggestion to user');
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
            }
          }
        } catch (error) {
          if (error instanceof Error && error.message !== 'Timeout') {
            console.error('[Autocomplete] Error:', error.message);
          }
        } finally {
          isRequestInProgress = false;
          if (currentAbortController === abortController) {
            currentAbortController = null;
          }
        }

        return { items: [] };
      },
      freeInlineCompletions: (_completions: any) => {},
      handleItemDidShow: (_completions: any, _item: any) => {},
      disposeInlineCompletions: (_completions: any) => {},
    };

    // Register provider for ALL languages
    const provider = monacoInstance.languages.registerInlineCompletionsProvider(
      '*',
      providerObject
    );

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (currentAbortController) {
        currentAbortController.abort();
      }
      provider.dispose();
    };
  }, [editor, monacoInstance, editorUseRagInAutocomplete, editorUseToolsInAutocomplete]);

  // Register Monaco context menu actions
  useEffect(() => {
    if (!editor || !monacoInstance) {
      return;
    }

    // === Basic Editing Actions (Top Level) ===
    editor.addAction({
      id: 'format-document',
      label: 'Format Document',
      keybindings: [
        monacoInstance.KeyMod.Shift | monacoInstance.KeyMod.Alt | monacoInstance.KeyCode.KeyF,
      ],
      contextMenuGroupId: '1_editing',
      contextMenuOrder: 1,
      run: (ed) => ed.getAction('editor.action.formatDocument')?.run(),
    });

    editor.addAction({
      id: 'comment-line',
      label: 'Toggle Comment',
      keybindings: [monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Slash],
      contextMenuGroupId: '1_editing',
      contextMenuOrder: 2,
      run: (ed) => ed.getAction('editor.action.commentLine')?.run(),
    });

    // === AI Writing Actions (Submenu - Higher Priority) ===
    // Note: Chord keybindings disabled to prevent interference with normal typing
    // Users should use context menu instead
    const aiWritingActions = [
      {
        id: 'ai-continue',
        label: 'Continue Writing',
        action: 'continue',
        keybindings: undefined,
      },
      {
        id: 'ai-shorten',
        label: 'Make Shorter',
        action: 'make-shorter',
        keybindings: undefined,
      },
      {
        id: 'ai-longer',
        label: 'Make Longer',
        action: 'make-longer',
        keybindings: undefined,
      },
      { id: 'ai-simplify', label: 'Simplify', action: 'simplify' },
      {
        id: 'ai-grammar',
        label: 'Fix Grammar',
        action: 'fix-grammar',
        keybindings: undefined,
      },
      {
        id: 'ai-summarize',
        label: 'Summarize',
        action: 'summarize',
        keybindings: undefined,
      },
    ];

    aiWritingActions.forEach((item, index) => {
      editor.addAction({
        id: item.id,
        label: item.label,
        keybindings: item.keybindings,
        contextMenuGroupId: '2_ai_writing',
        contextMenuOrder: index + 1,
        run: async (ed) => {
          const selection = ed.getSelection();
          if (selection && !selection.isEmpty()) {
            const selectedText = ed.getModel()?.getValueInRange(selection) || '';
            await handleEditorAction(item.action as any, selectedText);
          }
        },
      });
    });

    // === AI Code Actions (Submenu) ===
    // Note: Chord keybindings disabled to prevent interference with normal typing
    // Users should use context menu instead
    const aiCodeActions = [
      {
        id: 'ai-explain',
        label: 'Explain Code',
        action: 'explain',
        keybindings: undefined,
      },
      {
        id: 'ai-fix',
        label: 'Fix Code',
        action: 'fix',
        keybindings: undefined,
      },
      {
        id: 'ai-improve',
        label: 'Improve Code',
        action: 'improve',
        keybindings: undefined,
      },
      {
        id: 'ai-complete',
        label: 'Complete Code',
        action: 'complete',
        keybindings: undefined,
      },
      {
        id: 'ai-comments',
        label: 'Add Comments',
        action: 'add-comments',
        keybindings: undefined,
      },
      {
        id: 'ai-tests',
        label: 'Generate Tests',
        action: 'generate-tests',
        keybindings: undefined,
      },
    ];

    aiCodeActions.forEach((item, index) => {
      editor.addAction({
        id: item.id,
        label: item.label,
        keybindings: item.keybindings,
        contextMenuGroupId: '3_ai_code',
        contextMenuOrder: index + 1,
        run: async (ed) => {
          const selection = ed.getSelection();
          if (selection && !selection.isEmpty()) {
            const selectedText = ed.getModel()?.getValueInRange(selection) || '';
            await handleEditorAction(item.action as any, selectedText);
          }
        },
      });
    });

    // === AI Translate Actions (Submenu) ===
    ['English', 'Korean', 'Japanese', 'Chinese'].forEach((lang, index) => {
      editor.addAction({
        id: `ai-translate-${lang.toLowerCase()}`,
        label: `Translate to ${lang}`,
        contextMenuGroupId: '4_ai_translate',
        contextMenuOrder: index + 1,
        run: async (ed) => {
          const selection = ed.getSelection();
          if (selection && !selection.isEmpty()) {
            const selectedText = ed.getModel()?.getValueInRange(selection) || '';
            await handleEditorAction('translate', selectedText, lang);
          }
        },
      });
    });

    // === Advanced Actions (Submenu - Only Essential Editing) ===
    editor.addAction({
      id: 'format-selection',
      label: 'Format Selection',
      keybindings: [
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyK,
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyF,
      ],
      contextMenuGroupId: '9_advanced',
      contextMenuOrder: 1,
      run: (ed) => ed.getAction('editor.action.formatSelection')?.run(),
    });

    editor.addAction({
      id: 'duplicate-line',
      label: 'Duplicate Line',
      keybindings: [
        monacoInstance.KeyMod.Shift | monacoInstance.KeyMod.Alt | monacoInstance.KeyCode.DownArrow,
      ],
      contextMenuGroupId: '9_advanced',
      contextMenuOrder: 2,
      run: (ed) => ed.getAction('editor.action.copyLinesDownAction')?.run(),
    });

    editor.addAction({
      id: 'delete-line',
      label: 'Delete Line',
      keybindings: [
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyK,
      ],
      contextMenuGroupId: '9_advanced',
      contextMenuOrder: 3,
      run: (ed) => ed.getAction('editor.action.deleteLines')?.run(),
    });

    editor.addAction({
      id: 'select-all-occurrences',
      label: 'Select All Occurrences',
      keybindings: [
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyL,
      ],
      contextMenuGroupId: '9_advanced',
      contextMenuOrder: 4,
      run: (ed) => ed.getAction('editor.action.selectHighlights')?.run(),
    });
  }, [editor, monacoInstance, handleEditorAction]);

  // Handle Save Keyboard Shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        if (onSave) {
          e.preventDefault();
          onSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSave]);

  // Handle Image Paste (Markdown)
  useEffect(() => {
    if (!editor || !isElectron() || !window.electronAPI) {
      return undefined;
    }

    // Check if markdown
    const isMarkdown =
      language === 'markdown' ||
      (filePath && (filePath.endsWith('.md') || filePath.endsWith('.mdx')));
    if (!isMarkdown || !workingDirectory) {
      return;
    }

    const handlePaste = async (e: ClipboardEvent) => {
      if (!editor.hasTextFocus()) {
        return;
      }

      try {
        const result = await window.electronAPI.fs.saveClipboardImage(workingDirectory);
        if (result.success && result.data) {
          e.preventDefault();
          e.stopPropagation();
          const { filename } = result.data;
          const imageMarkdown = `![${filename}](./${filename})`;

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
          }
        }
      } catch (error) {
        console.error('Paste error', error);
      }
    };

    const domNode = editor.getDomNode();
    if (domNode) {
      domNode.addEventListener('paste', handlePaste);
      return () => domNode.removeEventListener('paste', handlePaste);
    }
    return undefined;
  }, [editor, language, workingDirectory, filePath]);

  return (
    <div className="w-full h-full relative group">
      <MonacoEditor
        height="100%"
        language={language}
        theme={theme}
        value={content}
        onChange={onChange}
        onMount={(ed, m) => {
          setEditor(ed);
          setMonacoInstance(m);
          if (onMount) {
            onMount(ed, m);
          }

          // Update options from store
          ed.updateOptions({
            fontSize: editorAppearanceConfig.fontSize,
            fontFamily: editorAppearanceConfig.fontFamily,
            minimap: { enabled: editorAppearanceConfig.minimap },
            wordWrap: editorAppearanceConfig.wordWrap,
            tabSize: editorAppearanceConfig.tabSize,
            lineNumbers: editorAppearanceConfig.lineNumbers,
            ...options,
          });
        }}
        options={{
          automaticLayout: true,
          padding: { top: 16, bottom: 16 },
          ...options,
        }}
      />

      {isProcessing && (
        <div className="absolute top-2 right-4 z-50 bg-background/80 backdrop-blur border rounded-full px-3 py-1 flex items-center gap-2 text-primary shadow-lg animate-in slide-in-from-top-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-medium">{processingAction || 'AI 처리 중...'}</span>
        </div>
      )}
    </div>
  );
}
