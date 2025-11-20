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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { VectorDocument } from '@/lib/vectordb/types';
import { Loader2 } from 'lucide-react';

interface DocumentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: VectorDocument | null;
  onSave: (doc: { id: string; content: string; metadata: Record<string, any> }) => Promise<void>;
}

export function DocumentEditDialog({
  open,
  onOpenChange,
  document,
  onSave,
}: DocumentEditDialogProps) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (document) {
      setTitle(document.metadata?.title || '');
      setSource(document.metadata?.source || '');
      setContent(document.content || '');
    }
  }, [document]);

  const handleSave = async () => {
    if (!content.trim()) {
      setMessage({ type: 'error', text: '문서 내용을 입력해주세요.' });
      return;
    }

    if (!document) return;

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

          {/* Content */}
          <div className="space-y-2 flex-1 flex flex-col">
            <Label htmlFor="edit-content">문서 내용</Label>
            <Textarea
              id="edit-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="문서 내용을 입력하세요..."
              className="flex-1 min-h-[400px] font-mono text-sm resize-none"
              disabled={isSaving}
            />
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                저장 중...
              </>
            ) : (
              '저장'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
