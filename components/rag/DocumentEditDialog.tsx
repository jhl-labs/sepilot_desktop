'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type monaco from 'monaco-editor';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { VectorDocument } from '@/lib/vectordb/types';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

// Load Monaco Editor component without SSR
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  ),
});

interface DocumentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: VectorDocument | null;
  onSave: (doc: { id: string; content: string; metadata: Record<string, any> }) => Promise<void>;
}

type AIAction =
  | 'refine'
  | 'translate-ko'
  | 'translate-en'
  | 'translate-ja'
  | 'expand'
  | 'shorten'
  | 'improve'
  | 'verify'
  | 'custom';

export function DocumentEditDialog({
  open,
  onOpenChange,
  document,
  onSave,
}: DocumentEditDialogProps) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [customPromptOpen, setCustomPromptOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [processingAction, setProcessingAction] = useState<string>('');

  useEffect(() => {
    if (document) {
      setTitle(document.metadata?.title || '');
      setSource(document.metadata?.source || '');
      setFolderPath(document.metadata?.folderPath || '');
      setContent(document.content || '');
    }
  }, [document]);

  const getAIPrompt = (action: AIAction, text: string, customPromptText?: string): string => {
    const prompts: Record<AIAction, string> = {
      refine: `다음 텍스트를 정제하여 핵심 내용만 추출하고, 불필요한 내용은 제거하세요. 마크다운 형식으로 깔끔하게 작성하세요:\n\n${text}`,
      'translate-ko': `다음 텍스트를 한국어로 자연스럽게 번역하세요:\n\n${text}`,
      'translate-en': `다음 텍스트를 영어로 자연스럽게 번역하세요:\n\n${text}`,
      'translate-ja': `다음 텍스트를 일본어로 자연스럽게 번역하세요:\n\n${text}`,
      expand: `다음 텍스트의 내용을 더 자세하고 풍부하게 확장하세요. 추가 설명과 예시를 포함하세요:\n\n${text}`,
      shorten: `다음 텍스트를 핵심 내용만 남기고 간결하게 요약하세요:\n\n${text}`,
      improve: `다음 텍스트의 가독성과 품질을 개선하세요. 문법, 표현, 구조를 개선하고 더 명확하게 작성하세요:\n\n${text}`,
      verify: `다음 텍스트의 내용을 검증하고, 사실 관계가 틀리거나 논리적으로 모순되는 부분이 있는지 분석하세요. 문제가 있다면 지적하고, 없다면 "검증 완료: 문제 없음"이라고 답변하세요:\n\n${text}`,
      custom: customPromptText ? `${customPromptText}\n\n텍스트:\n${text}` : text,
    };
    return prompts[action];
  };

  const getActionLabel = (action: AIAction): string => {
    const labels: Record<AIAction, string> = {
      refine: '정제',
      'translate-ko': '한국어로 번역',
      'translate-en': '영어로 번역',
      'translate-ja': '일본어로 번역',
      expand: '내용 확장',
      shorten: '내용 축소',
      improve: '품질 개선',
      verify: '내용 검증',
      custom: '커스텀 프롬프트',
    };
    return labels[action];
  };

  const executeAIAction = useCallback(
    async (action: AIAction, customPromptText?: string) => {
      if (!editor) {
        setMessage({ type: 'error', text: 'Editor가 준비되지 않았습니다.' });
        return;
      }

      const model = editor.getModel();
      const selection = editor.getSelection();

      if (!model) {
        setMessage({ type: 'error', text: 'Editor model이 없습니다.' });
        return;
      }

      // 선택된 텍스트가 있으면 선택 영역, 없으면 전체 문서
      const targetText =
        selection && !selection.isEmpty() ? model.getValueInRange(selection) : model.getValue();

      if (!targetText.trim()) {
        setMessage({ type: 'error', text: '처리할 텍스트가 없습니다.' });
        return;
      }

      setIsProcessing(true);
      setProcessingAction(getActionLabel(action));
      setMessage(null);

      try {
        const result = await window.electronAPI.llm.chat([
          {
            id: 'system',
            role: 'system',
            content: '당신은 문서 편집과 개선을 돕는 전문 AI 어시스턴트입니다.',
            created_at: Date.now(),
          },
          {
            id: 'user',
            role: 'user',
            content: getAIPrompt(action, targetText, customPromptText),
            created_at: Date.now(),
          },
        ]);

        if (!result.success || !result.data) {
          throw new Error(result.error || 'AI 작업에 실패했습니다.');
        }

        const processedText = result.data.content;

        // Monaco Editor에서 텍스트 교체
        if (selection && !selection.isEmpty()) {
          // 선택 영역만 교체
          editor.executeEdits('ai-action', [
            {
              range: selection,
              text: processedText,
              forceMoveMarkers: true,
            },
          ]);
        } else {
          // 전체 문서 교체
          const fullRange = model.getFullModelRange();
          editor.executeEdits('ai-action', [
            {
              range: fullRange,
              text: processedText,
              forceMoveMarkers: true,
            },
          ]);
        }

        setMessage({
          type: 'success',
          text: `${getActionLabel(action)} 작업이 완료되었습니다!`,
        });
      } catch (error: any) {
        console.error('AI action error:', error);
        setMessage({ type: 'error', text: error.message || 'AI 작업에 실패했습니다.' });
      } finally {
        setIsProcessing(false);
        setProcessingAction('');
      }
    },
    [editor]
  );

  // Register Monaco context menu actions
  useEffect(() => {
    if (!editor) {
      return;
    }

    const refineAction = editor.addAction({
      id: 'doc-refine',
      label: 'AI: 내용 정제',
      contextMenuGroupId: 'ai-docs',
      contextMenuOrder: 1,
      run: () => executeAIAction('refine'),
    });

    const expandAction = editor.addAction({
      id: 'doc-expand',
      label: 'AI: 내용 확장',
      contextMenuGroupId: 'ai-docs',
      contextMenuOrder: 2,
      run: () => executeAIAction('expand'),
    });

    const shortenAction = editor.addAction({
      id: 'doc-shorten',
      label: 'AI: 내용 축약',
      contextMenuGroupId: 'ai-docs',
      contextMenuOrder: 3,
      run: () => executeAIAction('shorten'),
    });

    const verifyAction = editor.addAction({
      id: 'doc-verify',
      label: 'AI: 내용 검증',
      contextMenuGroupId: 'ai-docs',
      contextMenuOrder: 4,
      run: () => executeAIAction('verify'),
    });

    const improveAction = editor.addAction({
      id: 'doc-improve',
      label: 'AI: 품질 개선',
      contextMenuGroupId: 'ai-docs',
      contextMenuOrder: 5,
      run: () => executeAIAction('improve'),
    });

    const translateKoAction = editor.addAction({
      id: 'doc-translate-ko',
      label: 'AI: 한국어로 번역',
      contextMenuGroupId: 'ai-docs',
      contextMenuOrder: 6,
      run: () => executeAIAction('translate-ko'),
    });

    const translateEnAction = editor.addAction({
      id: 'doc-translate-en',
      label: 'AI: 영어로 번역',
      contextMenuGroupId: 'ai-docs',
      contextMenuOrder: 7,
      run: () => executeAIAction('translate-en'),
    });

    const translateJaAction = editor.addAction({
      id: 'doc-translate-ja',
      label: 'AI: 일본어로 번역',
      contextMenuGroupId: 'ai-docs',
      contextMenuOrder: 8,
      run: () => executeAIAction('translate-ja'),
    });

    const customAction = editor.addAction({
      id: 'doc-custom',
      label: 'AI: 커스텀 프롬프트',
      contextMenuGroupId: 'ai-docs',
      contextMenuOrder: 9,
      run: () => setCustomPromptOpen(true),
    });

    return () => {
      refineAction.dispose();
      expandAction.dispose();
      shortenAction.dispose();
      verifyAction.dispose();
      improveAction.dispose();
      translateKoAction.dispose();
      translateEnAction.dispose();
      translateJaAction.dispose();
      customAction.dispose();
    };
  }, [editor, executeAIAction]);

  const handleSave = async (pushToGitHub: boolean = false) => {
    if (!content.trim()) {
      setMessage({ type: 'error', text: '문서 내용을 입력해주세요.' });
      return;
    }

    if (!document) {
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const updatedMetadata: Record<string, any> = {
        ...document.metadata,
        title: title.trim() || '제목 없음',
        source: source.trim() || 'manual',
        folderPath: folderPath.trim() || undefined,
        updatedAt: Date.now(),
      };

      // Team Docs인 경우 modifiedLocally 플래그 설정
      if (document.metadata?.docGroup === 'team' && !pushToGitHub) {
        updatedMetadata.modifiedLocally = true;
      }

      // 로컬 저장
      await onSave({
        id: document.id,
        content: content.trim(),
        metadata: updatedMetadata,
      });

      // GitHub Push 처리
      if (pushToGitHub && document.metadata?.docGroup === 'team') {
        // teamDocsId 검증
        if (!document.metadata.teamDocsId) {
          setMessage({
            type: 'error',
            text: 'Team Docs ID가 누락되었습니다. 이 문서는 Team Docs 동기화 대상이 아닙니다.',
          });
          return;
        }

        setIsPushing(true);

        try {
          // githubPath 생성: title이 변경되었을 수 있으므로 현재 title 기준으로 재생성
          const newTitle = title.trim() || '제목 없음';
          const newFolderPath = folderPath.trim();
          let githubPath = document.metadata.githubPath;

          // title이 변경되었거나 folderPath가 변경된 경우 githubPath 재생성
          const oldTitle = document.metadata.title;
          const oldFolderPath = document.metadata.folderPath;
          if (newTitle !== oldTitle || newFolderPath !== oldFolderPath) {
            githubPath = newFolderPath ? `${newFolderPath}/${newTitle}.md` : `${newTitle}.md`;
          }

          const result = await window.electronAPI.teamDocs.pushDocument({
            teamDocsId: document.metadata.teamDocsId,
            githubPath: githubPath,
            oldGithubPath: document.metadata.githubPath, // 파일명 변경 감지용
            title: newTitle,
            content: content.trim(),
            metadata: {
              folderPath: newFolderPath || undefined,
              source: source.trim() || 'manual',
            },
            sha: document.metadata.githubSha,
            commitMessage: `Update ${newTitle} from SEPilot`,
          });

          if (!result.success) {
            if (result.error === 'CONFLICT') {
              setMessage({
                type: 'error',
                text: '문서 충돌 감지! GitHub에 다른 사용자의 변경사항이 있습니다. 먼저 동기화(Pull)해주세요.',
              });
            } else {
              throw new Error(result.error || 'Push 실패');
            }
            return;
          }

          setMessage({ type: 'success', text: '문서가 GitHub에 성공적으로 업로드되었습니다!' });
        } catch (error: any) {
          console.error('Push error:', error);
          setMessage({ type: 'error', text: error.message || 'GitHub Push에 실패했습니다.' });
          return;
        } finally {
          setIsPushing(false);
        }
      } else {
        setMessage({ type: 'success', text: '문서가 성공적으로 수정되었습니다!' });
      }

      setTimeout(() => {
        onOpenChange(false);
      }, 1000);
    } catch (error: any) {
      console.error('Edit error:', error);
      setMessage({ type: 'error', text: error.message || '문서 수정에 실패했습니다.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[90vw] !max-w-[1400px] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>문서 편집</DialogTitle>
          <DialogDescription>문서의 내용과 메타데이터를 수정합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 overflow-y-auto">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title">제목</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="문서 제목"
              disabled={isSaving}
            />
          </div>

          {/* Source */}
          <div className="space-y-2">
            <Label htmlFor="edit-source">출처</Label>
            <Input
              id="edit-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="예: Wikipedia, 내부 문서"
              disabled={isSaving}
            />
          </div>

          {/* Folder Path */}
          <div className="space-y-2">
            <Label htmlFor="edit-folder">폴더 경로 (선택)</Label>
            <Input
              id="edit-folder"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="예: 프로젝트/백엔드/API"
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              슬래시(/)로 하위 폴더를 구분할 수 있습니다
            </p>
          </div>

          {/* Content */}
          <div className="space-y-2 flex-1 flex flex-col">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-content">문서 내용</Label>
              {isProcessing && processingAction && (
                <div className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-1 rounded">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="font-medium">{processingAction} 중...</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-[400px] border rounded-md overflow-hidden">
              <MonacoEditor
                height="100%"
                language="markdown"
                value={content}
                onChange={(value) => setContent(value || '')}
                onMount={(editorInstance) => {
                  setEditor(editorInstance);
                  // Store monaco instance globally if needed
                  if (!(window as any).monaco) {
                    (window as any).monaco = (window as any).monaco || {};
                  }
                }}
                theme="vs-dark"
                options={{
                  fontSize: 14,
                  fontFamily: 'monospace',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  lineNumbers: 'on',
                  readOnly: isSaving || isProcessing,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              텍스트를 선택하고 우클릭하여 AI 작업 실행 (선택 없이 우클릭하면 전체 문서에 적용)
            </p>
          </div>

          {/* Message */}
          {message && (
            <div
              className={`rounded-md px-3 py-2 text-sm ${
                message.type === 'success'
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving || isProcessing || isPushing}
          >
            취소
          </Button>

          {/* Team Docs인 경우 Save & Push 버튼 표시 */}
          {document?.metadata?.docGroup === 'team' ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleSave(false)}
                disabled={isSaving || isProcessing || isPushing}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  '로컬 저장'
                )}
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-block">
                      <Button
                        onClick={() => handleSave(true)}
                        disabled={
                          isSaving || isProcessing || isPushing || !document?.metadata?.teamDocsId
                        }
                      >
                        {isPushing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Push 중...
                          </>
                        ) : isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            저장 중...
                          </>
                        ) : (
                          <>
                            {!document?.metadata?.teamDocsId && (
                              <AlertCircle className="mr-2 h-4 w-4" />
                            )}
                            저장 & Push
                          </>
                        )}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {!document?.metadata?.teamDocsId && (
                    <TooltipContent>
                      <p>Team Docs ID가 없어 GitHub Push를 할 수 없습니다.</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        이 문서는 Team Docs에서 가져온 문서가 아닙니다.
                      </p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </>
          ) : (
            /* Personal Docs는 저장만 */
            <Button onClick={() => handleSave(false)} disabled={isSaving || isProcessing}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  AI 작업 중...
                </>
              ) : (
                '저장'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Custom Prompt Dialog */}
      <Dialog open={customPromptOpen} onOpenChange={setCustomPromptOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>커스텀 프롬프트 입력</DialogTitle>
            <DialogDescription>
              텍스트에 적용할 작업을 자유롭게 입력하세요. 선택된 텍스트 또는 전체 문서에 적용됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="custom-prompt">프롬프트</Label>
              <Textarea
                id="custom-prompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="예: 이 텍스트를 bullet point 형식으로 재구성해주세요"
                className="min-h-[150px] resize-none"
              />
            </div>
            {editor && editor.getSelection() && !editor.getSelection()!.isEmpty() && (
              <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 text-sm text-blue-600 dark:text-blue-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {editor.getModel()?.getValueInRange(editor.getSelection()!).length || 0}자의
                    선택된 텍스트에 적용됩니다
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCustomPromptOpen(false);
                setCustomPrompt('');
              }}
            >
              취소
            </Button>
            <Button
              onClick={async () => {
                if (!customPrompt.trim()) {
                  setMessage({ type: 'error', text: '프롬프트를 입력해주세요.' });
                  return;
                }
                setCustomPromptOpen(false);
                await executeAIAction('custom', customPrompt.trim());
                setCustomPrompt('');
              }}
              disabled={!customPrompt.trim()}
            >
              실행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
