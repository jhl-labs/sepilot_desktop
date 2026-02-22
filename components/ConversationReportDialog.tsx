'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
  const userMessageCount = messages.filter((m: any) => m.role === 'user').length;
  const assistantMessageCount = messages.filter((m: any) => m.role === 'assistant').length;
  const hasToolCalls = messages.some((m) => m.tool_calls && m.tool_calls.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-500" />
            <DialogTitle>{t('chat.report.title')}</DialogTitle>
          </div>
          <DialogDescription>{t('chat.report.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 대화 정보 */}
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <h4 className="text-sm font-medium">{t('chat.report.conversationInfo')}</h4>
            <div className="text-xs space-y-1 text-muted-foreground">
              <p>• {t('chat.report.totalMessages', { count: messageCount })}</p>
              <p>• {t('chat.report.userMessages', { count: userMessageCount })}</p>
              <p>• {t('chat.report.aiResponses', { count: assistantMessageCount })}</p>
              {hasToolCalls && <p>• {t('chat.report.toolUsage')}</p>}
              {conversationId && (
                <p className="font-mono text-[10px]">
                  • {t('chat.report.conversationId', { id: conversationId })}
                </p>
              )}
            </div>
          </div>

          {/* 문제점 입력 (필수) */}
          <div className="space-y-2">
            <Label htmlFor="issue" className="text-sm font-medium">
              {t('chat.report.issueLabel')} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="issue"
              placeholder={t('chat.report.issuePlaceholder')}
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
              {t('chat.report.additionalInfoLabel')}
            </Label>
            <Textarea
              id="additionalInfo"
              placeholder={t('chat.report.additionalInfoPlaceholder')}
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
              <p className="font-medium mb-2">{t('chat.report.sendingInfo')}</p>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li>{t('chat.report.sendingInfoItems.conversationHistory')}</li>
                <li>{t('chat.report.sendingInfoItems.conversationId')}</li>
                <li>{t('chat.report.sendingInfoItems.appInfo')}</li>
                <li>{t('chat.report.sendingInfoItems.modelInfo')}</li>
              </ul>
              <p className="text-xs mt-2 text-muted-foreground">{t('chat.report.privacyNote')}</p>
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
            {t('chat.report.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || !issue.trim()}
            className="flex-1 sm:flex-none"
          >
            {isSubmitting ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t('chat.report.sending')}
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {t('chat.report.send')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
