'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Loader2 } from 'lucide-react';

interface DocumentUploaderProps {
  onUpload: (documents: { content: string; metadata: Record<string, any> }[]) => Promise<void>;
  disabled?: boolean;
}

export function DocumentUploader({ onUpload, disabled = false }: DocumentUploaderProps) {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleUpload = async () => {
    if (!content.trim()) {
      setMessage({ type: 'error', text: '문서 내용을 입력해주세요.' });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    try {
      await onUpload([
        {
          content: content.trim(),
          metadata: {
            title: title.trim() || '제목 없음',
            source: source.trim() || 'manual',
            uploadedAt: Date.now(),
          },
        },
      ]);

      setMessage({ type: 'success', text: '문서가 성공적으로 업로드되었습니다!' });

      // 입력 필드 초기화
      setContent('');
      setTitle('');
      setSource('');
    } catch (error: any) {
      console.error('Upload error:', error);
      setMessage({ type: 'error', text: error.message || '문서 업로드에 실패했습니다.' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <FileText className="h-5 w-5" />
        <h3>문서 업로드</h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="doc-title">제목 (선택)</Label>
          <Input
            id="doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="문서 제목"
            disabled={isUploading || disabled}
          />
        </div>

        {/* Source */}
        <div className="space-y-2">
          <Label htmlFor="doc-source">출처 (선택)</Label>
          <Input
            id="doc-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="예: Wikipedia, 내부 문서"
            disabled={isUploading || disabled}
          />
        </div>

        {/* Content */}
        <div className="space-y-2">
          <Label htmlFor="doc-content">문서 내용</Label>
          <Textarea
            id="doc-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="업로드할 문서 내용을 입력하세요..."
            className="min-h-[200px]"
            disabled={isUploading || disabled}
          />
        </div>

        {/* Info */}
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          <p>
            • 문서는 자동으로 청킹되고 임베딩되어 Vector DB에 저장됩니다.
          </p>
          <p>• RAG 채팅 모드에서 이 문서를 기반으로 답변을 생성합니다.</p>
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

        {/* Upload Button */}
        <Button onClick={handleUpload} disabled={isUploading || disabled} className="w-full">
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              업로드 중...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              업로드
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
