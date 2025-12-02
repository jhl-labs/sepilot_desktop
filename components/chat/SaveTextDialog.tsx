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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, BookOpen, CheckCircle2 } from 'lucide-react';

interface SaveTextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedText: string;
  onSave: (doc: { title: string; content: string; metadata: Record<string, any> }) => Promise<void>;
}

export function SaveTextDialog({ open, onOpenChange, selectedText, onSave }: SaveTextDialogProps) {
  const [step, setStep] = useState<'edit' | 'saving' | 'done'>('edit');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && selectedText) {
      // Set initial content from selected text
      setContent(selectedText);
      // Generate a simple title from first 50 chars
      const firstLine = selectedText.split('\n')[0];
      const suggestedTitle = firstLine.length > 50 ? `${firstLine.substring(0, 50)}...` : firstLine;
      setTitle(suggestedTitle || '선택된 텍스트');
      setError(null);
    }
  }, [open, selectedText]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      setError('제목과 내용을 모두 입력해주세요.');
      return;
    }

    setStep('saving');
    setError(null);

    try {
      await onSave({
        title: title.trim(),
        content: content.trim(),
        metadata: {
          source: 'selected_text',
          extractedAt: Date.now(),
          folderPath: folderPath.trim() || undefined,
        },
      });

      setStep('done');
      setTimeout(() => {
        onOpenChange(false);
        // Reset state
        setStep('edit');
        setTitle('');
        setContent('');
        setFolderPath('');
        setError(null);
      }, 1500);
    } catch (err: any) {
      console.error('Failed to save text:', err);
      setError(err.message || '지식 저장에 실패했습니다.');
      setStep('edit');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[90vw] !max-w-[800px] h-[75vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              선택한 텍스트를 지식으로 저장
            </div>
          </DialogTitle>
          <DialogDescription>
            선택한 텍스트를 RAG 문서로 저장하여 향후 대화에서 활용할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 overflow-y-auto">
          {step === 'edit' && (
            <>
              {error && (
                <div className="rounded-md bg-red-500/10 border border-red-500/20 p-4">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="text-title">제목</Label>
                <Input
                  id="text-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="지식 제목"
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="text-folder">폴더 경로 (선택)</Label>
                <Input
                  id="text-folder"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="예: 프로젝트/백엔드/API"
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">
                  슬래시(/)로 하위 폴더를 구분할 수 있습니다
                </p>
              </div>

              <div className="space-y-2 flex-1 flex flex-col">
                <Label htmlFor="text-content">내용</Label>
                <Textarea
                  id="text-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="저장할 텍스트 내용"
                  className="flex-1 min-h-[350px] font-mono text-sm resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  선택한 텍스트를 확인하고 필요시 수정할 수 있습니다
                </p>
              </div>
            </>
          )}

          {step === 'saving' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">지식 저장 중...</p>
              <p className="text-sm text-muted-foreground mt-2">
                RAG 문서 데이터베이스에 등록하고 있습니다
              </p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-lg font-medium text-green-600 dark:text-green-400">
                지식 저장 완료!
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                RAG 시스템에서 이 지식을 활용할 수 있습니다
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={step === 'saving' || step === 'done'}
          >
            취소
          </Button>
          {step === 'edit' && (
            <Button onClick={handleSave} disabled={!title.trim() || !content.trim()}>
              <BookOpen className="mr-2 h-4 w-4" />
              지식으로 저장
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
