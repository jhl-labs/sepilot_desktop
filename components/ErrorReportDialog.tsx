'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Send, X, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ErrorReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  error: Error;
  onConfirm: (additionalInfo?: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Error Report Confirmation Dialog
 * 에러 발생 시 사용자에게 리포트 여부를 확인하는 다이얼로그
 */
export function ErrorReportDialog({
  open,
  onOpenChange,
  error,
  onConfirm,
  onCancel,
}: ErrorReportDialogProps) {
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(additionalInfo || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setAdditionalInfo('');
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <DialogTitle>에러 리포트 전송</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            프로그램에서 에러가 발생했습니다. 개발팀에 에러 정보를 전송하여 문제 해결에 도움을
            주시겠습니까?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 에러 정보 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">에러 메시지</Label>
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm font-mono text-destructive break-words">
                {error.message || '알 수 없는 에러'}
              </p>
            </div>
          </div>

          {/* 스택 트레이스 (접을 수 있음) */}
          {error.stack && (
            <details className="space-y-2">
              <summary className="text-sm font-medium cursor-pointer hover:text-primary">
                기술적 세부 정보 보기
              </summary>
              <div className="rounded-lg bg-muted p-3 mt-2">
                <pre className="text-xs overflow-auto whitespace-pre-wrap break-words">
                  {error.stack}
                </pre>
              </div>
            </details>
          )}

          {/* 전송될 정보 안내 */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium mb-2">전송되는 정보:</p>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li>에러 메시지 및 스택 트레이스</li>
                <li>앱 버전 및 운영체제 정보</li>
                <li>에러 발생 시간</li>
              </ul>
              <p className="text-xs mt-2 text-muted-foreground">
                * API 키, 토큰, 개인정보는 자동으로 제거됩니다.
              </p>
            </AlertDescription>
          </Alert>

          {/* 추가 정보 입력 (선택사항) */}
          <div className="space-y-2">
            <Label htmlFor="additionalInfo" className="text-sm font-medium">
              추가 정보 (선택사항)
            </Label>
            <Textarea
              id="additionalInfo"
              placeholder="에러가 발생한 상황이나 재현 방법을 입력해주시면 큰 도움이 됩니다. (예: 설정 변경 중 에러 발생)"
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              className="min-h-[100px] resize-none"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              이 정보는 개발팀이 문제를 더 빠르게 해결하는데 도움이 됩니다.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="flex-1 sm:flex-none"
          >
            <X className="mr-2 h-4 w-4" />
            전송하지 않음
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting} className="flex-1 sm:flex-none">
            {isSubmitting ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                전송 중...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                에러 리포트 전송
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
