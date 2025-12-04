'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles } from 'lucide-react';

interface RefinementPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPrompt: string;
  content: string;
  onConfirm: (prompt: string) => Promise<void>;
}

export function RefinementPromptDialog({
  open,
  onOpenChange,
  defaultPrompt,
  content,
  onConfirm,
}: RefinementPromptDialogProps) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (open) {
      setPrompt(defaultPrompt);
    }
  }, [open, defaultPrompt]);

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirm(prompt);
      onOpenChange(false);
    } catch (error) {
      console.error('Refinement error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetToDefault = () => {
    setPrompt(defaultPrompt);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[90vw] !max-w-[800px] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              LLM 문서 정제 프롬프트
            </div>
          </DialogTitle>
          <DialogDescription>
            문서 정제에 사용할 프롬프트를 확인하고 수정할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 overflow-y-auto">
          {/* System Prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="refine-prompt">시스템 프롬프트</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToDefault}
                disabled={isProcessing}
                className="h-7 text-xs"
              >
                기본값으로 복원
              </Button>
            </div>
            <Textarea
              id="refine-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="정제 프롬프트를 입력하세요..."
              className="min-h-[200px] font-mono text-sm resize-none"
              disabled={isProcessing}
            />
            <p className="text-xs text-muted-foreground">
              이 프롬프트는 LLM에게 문서를 어떻게 정제할지 지시합니다.
            </p>
          </div>

          {/* Document Preview */}
          <div className="space-y-2">
            <Label>문서 내용 미리보기</Label>
            <div className="rounded-md border bg-muted/30 p-3 max-h-[200px] overflow-y-auto">
              <p className="text-xs font-mono text-muted-foreground whitespace-pre-wrap line-clamp-[10]">
                {content}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              총 {content.length}자 (약 {Math.ceil(content.length / 4)} 토큰)
            </p>
          </div>

          {/* Info */}
          <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3">
            <p className="text-xs text-blue-600 dark:text-blue-400">
              <strong>팁:</strong> 프롬프트를 수정하여 정제 방식을 커스터마이즈할 수 있습니다. 예:
              &quot;한국어로 번역하고 정제&quot;, &quot;전문 용어는 유지하면서 정제&quot;,
              &quot;핵심 키워드만 추출&quot; 등
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing || !prompt.trim()}>
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                정제 중...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                정제 시작
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
