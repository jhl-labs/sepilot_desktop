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
import type { Message } from '@/types';

interface ConversationReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: Message[];
  conversationId?: string;
  onConfirm: (issue: string, additionalInfo?: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Conversation Report Dialog
 * 전체 대화 내용을 GitHub Issue로 리포트하는 다이얼로그
 */
export function ConversationReportDialog({
  open,
  onOpenChange,
  messages,
  conversationId,
  onConfirm,
  onCancel,
}: ConversationReportDialogProps) {
  const [issue, setIssue] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!issue.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(issue, additionalInfo || undefined);
      // 성공 후 초기화
      setIssue('');
      setAdditionalInfo('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setIssue('');
    setAdditionalInfo('');
    onCancel();
  };

  // 대화 요약 정보
  const messageCount = messages.length;
  const userMessageCount = messages.filter((m) => m.role === 'user').length;
  const assistantMessageCount = messages.filter((m) => m.role === 'assistant').length;
  const hasToolCalls = messages.some((m) => m.tool_calls && m.tool_calls.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-500" />
            <DialogTitle>대화 내용 리포트</DialogTitle>
          </div>
          <DialogDescription>
            AI 응답이나 Agent 동작에 문제가 있나요? 전체 대화 내용을 개발팀에 전송하여 개선에 도움을
            주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 대화 정보 */}
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <h4 className="text-sm font-medium">대화 정보</h4>
            <div className="text-xs space-y-1 text-muted-foreground">
              <p>• 총 메시지: {messageCount}개</p>
              <p>• 사용자 메시지: {userMessageCount}개</p>
              <p>• AI 응답: {assistantMessageCount}개</p>
              {hasToolCalls && <p>• Tool 사용: 있음</p>}
              {conversationId && <p className="font-mono text-[10px]">• ID: {conversationId}</p>}
            </div>
          </div>

          {/* 문제점 입력 (필수) */}
          <div className="space-y-2">
            <Label htmlFor="issue" className="text-sm font-medium">
              어떤 문제가 있었나요? <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="issue"
              placeholder="예시:
- AI가 잘못된 정보를 제공했습니다
- Agent가 예상과 다르게 동작했습니다
- Tool 실행 결과가 이상합니다
- 응답이 너무 느립니다"
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              className="min-h-[120px] resize-none"
              disabled={isSubmitting}
              required
            />
          </div>

          {/* 추가 정보 입력 (선택사항) */}
          <div className="space-y-2">
            <Label htmlFor="additionalInfo" className="text-sm font-medium">
              추가 정보 (선택사항)
            </Label>
            <Textarea
              id="additionalInfo"
              placeholder="문제 재현 방법, 기대했던 동작, 추가 설명 등을 입력해주세요"
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              className="min-h-[80px] resize-none"
              disabled={isSubmitting}
            />
          </div>

          {/* 전송될 정보 안내 */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium mb-2">전송되는 정보:</p>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li>전체 대화 내역 (메시지, 응답, Tool 호출 등)</li>
                <li>대화 ID 및 타임스탬프</li>
                <li>앱 버전 및 운영체제 정보</li>
                <li>사용된 모델 정보 (설정된 경우)</li>
              </ul>
              <p className="text-xs mt-2 text-muted-foreground">
                * API 키, 토큰, 개인정보는 자동으로 제거됩니다.
              </p>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="flex-1 sm:flex-none"
          >
            <X className="mr-2 h-4 w-4" />
            취소
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || !issue.trim()}
            className="flex-1 sm:flex-none"
          >
            {isSubmitting ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                전송 중...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                리포트 전송
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
