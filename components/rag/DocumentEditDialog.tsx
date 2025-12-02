'use client';

import { useState, useEffect, useRef } from 'react';
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { VectorDocument } from '@/lib/vectordb/types';
import {
  Loader2,
  Sparkles,
  Languages,
  Maximize2,
  Minimize2,
  Wand2,
  CheckCircle2,
  ShieldCheck,
  MessageSquare,
} from 'lucide-react';

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
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [customPromptOpen, setCustomPromptOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (document) {
      setTitle(document.metadata?.title || '');
      setSource(document.metadata?.source || '');
      setFolderPath(document.metadata?.folderPath || '');
      setContent(document.content || '');
    }
  }, [document]);

  const handleTextSelect = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    setSelectedText(selected);
  };

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

  const executeAIAction = async (action: AIAction, customPromptText?: string) => {
    const targetText = selectedText || content;
    if (!targetText.trim()) {
      setMessage({ type: 'error', text: '처리할 텍스트가 없습니다.' });
      return;
    }

    setIsProcessing(true);
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

      // 선택된 텍스트가 있으면 선택 영역만 교체, 없으면 전체 교체
      if (selectedText && textareaRef.current) {
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newContent = content.substring(0, start) + processedText + content.substring(end);
        setContent(newContent);
      } else {
        setContent(processedText);
      }

      setMessage({
        type: 'success',
        text: `${getActionLabel(action)} 작업이 완료되었습니다!`,
      });
      setSelectedText('');
    } catch (error: any) {
      console.error('AI action error:', error);
      setMessage({ type: 'error', text: error.message || 'AI 작업에 실패했습니다.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
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
      await onSave({
        id: document.id,
        content: content.trim(),
        metadata: {
          ...document.metadata,
          title: title.trim() || '제목 없음',
          source: source.trim() || 'manual',
          folderPath: folderPath.trim() || undefined,
          updatedAt: Date.now(),
        },
      });

      setMessage({ type: 'success', text: '문서가 성공적으로 수정되었습니다!' });

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
              {selectedText && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" />
                  {selectedText.length}자 선택됨
                </div>
              )}
            </div>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <Textarea
                  ref={textareaRef}
                  id="edit-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onSelect={handleTextSelect}
                  placeholder="문서 내용을 입력하세요... (우클릭하여 AI 작업 실행)"
                  className="flex-1 min-h-[400px] font-mono text-sm resize-none"
                  disabled={isSaving || isProcessing}
                />
              </ContextMenuTrigger>
              <ContextMenuContent className="w-64">
                <ContextMenuItem onClick={() => executeAIAction('refine')} disabled={isProcessing}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  <div className="flex-1">
                    <div className="font-medium">내용 정제</div>
                    <div className="text-xs text-muted-foreground">핵심 내용만 추출</div>
                  </div>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => executeAIAction('expand')} disabled={isProcessing}>
                  <Maximize2 className="mr-2 h-4 w-4" />
                  <div className="flex-1">
                    <div className="font-medium">내용 확장</div>
                    <div className="text-xs text-muted-foreground">더 자세하게 작성</div>
                  </div>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => executeAIAction('shorten')} disabled={isProcessing}>
                  <Minimize2 className="mr-2 h-4 w-4" />
                  <div className="flex-1">
                    <div className="font-medium">내용 축약</div>
                    <div className="text-xs text-muted-foreground">간결하게 요약</div>
                  </div>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => executeAIAction('verify')} disabled={isProcessing}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  <div className="flex-1">
                    <div className="font-medium">내용 검증</div>
                    <div className="text-xs text-muted-foreground">사실 관계 확인</div>
                  </div>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => setCustomPromptOpen(true)} disabled={isProcessing}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  <div className="flex-1">
                    <div className="font-medium">프롬프트를 통한 요청</div>
                    <div className="text-xs text-muted-foreground">커스텀 명령 입력</div>
                  </div>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => executeAIAction('improve')} disabled={isProcessing}>
                  <Wand2 className="mr-2 h-4 w-4" />
                  <div className="flex-1">
                    <div className="font-medium">품질 개선</div>
                    <div className="text-xs text-muted-foreground">가독성과 문법 개선</div>
                  </div>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuSub>
                  <ContextMenuSubTrigger disabled={isProcessing}>
                    <Languages className="mr-2 h-4 w-4" />
                    번역
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    <ContextMenuItem
                      onClick={() => executeAIAction('translate-ko')}
                      disabled={isProcessing}
                    >
                      한국어로
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => executeAIAction('translate-en')}
                      disabled={isProcessing}
                    >
                      영어로
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => executeAIAction('translate-ja')}
                      disabled={isProcessing}
                    >
                      일본어로
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
              </ContextMenuContent>
            </ContextMenu>
            <p className="text-xs text-muted-foreground">
              텍스트를 선택하고 우클릭하여 선택 영역에만 AI 작업 적용, 선택 없이 우클릭하면 전체
              문서에 적용
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
            disabled={isSaving || isProcessing}
          >
            취소
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isProcessing}>
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
            {selectedText && (
              <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 text-sm text-blue-600 dark:text-blue-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{selectedText.length}자의 선택된 텍스트에 적용됩니다</span>
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
