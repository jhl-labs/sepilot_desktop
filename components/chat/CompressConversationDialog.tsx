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
import { Loader2, FileArchive, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { Conversation, Message } from '@/types';

import { logger } from '@/lib/utils/logger';
interface CompressConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation | null;
  messages: Message[];
  onCompress: (compressedMessages: Message[]) => Promise<void>;
}

export function CompressConversationDialog({
  open,
  onOpenChange,
  conversation,
  messages,
  onCompress,
}: CompressConversationDialogProps) {
  const [step, setStep] = useState<'analyzing' | 'review' | 'compressing' | 'done'>('analyzing');
  const [compressedMessages, setCompressedMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState({
    originalCount: 0,
    compressedCount: 0,
    reductionPercent: 0,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && conversation && messages.length > 0) {
      analyzeAndCompress();
    }
  }, [open, conversation, messages]);

  const analyzeAndCompress = async () => {
    setStep('analyzing');
    setError(null);

    try {
      // 대화 내용을 텍스트로 변환
      const conversationText = messages
        .filter((msg) => msg.role !== 'system')
        .map(
          (msg, idx) => `[${idx + 1}] ${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
        )
        .join('\n\n');

      // LLM에게 대화 압축 요청
      const result = await window.electronAPI.llm.chat([
        {
          id: 'system',
          role: 'system',
          content: `당신은 대화 내용을 압축하여 핵심만 남기는 전문가입니다.

다음 기준에 따라 대화를 압축하세요:
1. **핵심 정보 유지**: 중요한 결정사항, 결론, 주요 논의 내용은 반드시 보존
2. **반복 제거**: 중복되거나 반복되는 내용은 하나로 통합
3. **불필요한 대화 제거**: 인사말, 감사 표현, 일상적인 상호작용 등 제거
4. **컨텍스트 보존**: 대화의 흐름과 맥락이 이해 가능하도록 유지
5. **순서 유지**: 대화의 시간적 순서를 반드시 준수 (User -> Assistant -> User -> Assistant ...)
6. **간결성**: 가능한 한 짧고 명확하게 작성

출력 형식:
각 압축된 메시지를 다음 형식으로 작성하세요:

[ROLE: user/assistant]
[CONTENT: 압축된 내용]
---

예시:
[ROLE: user]
[CONTENT: React에서 useEffect 의존성 배열에 대해 질문]
---
[ROLE: assistant]
[CONTENT: useEffect 의존성 배열은 effect가 재실행될 조건을 지정. 빈 배열은 마운트 시 한 번만 실행. 의존성 누락 시 stale closure 문제 발생 가능]
---

중요: 대화의 핵심 가치를 유지하면서 최대한 압축하세요. 일반적으로 원본 대화의 30-50% 수준으로 압축하는 것이 적절합니다.`,
          created_at: Date.now(),
        },
        {
          id: 'user',
          role: 'user',
          content: `다음 대화를 압축해주세요:\n\n${conversationText}`,
          created_at: Date.now(),
        },
      ]);

      if (!result.success || !result.data) {
        throw new Error(result.error || '대화 압축에 실패했습니다.');
      }

      const compressedText = result.data.content;

      logger.info('[CompressDialog] Raw LLM response:', compressedText);

      // 압축된 메시지 파싱
      const messageBlocks = compressedText.split('---').filter((block) => block.trim());
      const parsedMessages: Message[] = [];

      logger.info('[CompressDialog] Message blocks:', messageBlocks.length);

      const baseTime = Date.now();

      for (const block of messageBlocks) {
        const roleMatch = block.match(/\[ROLE:\s*(user|assistant)\]/i);
        const contentMatch = block.match(/\[CONTENT:\s*(.+)\s*\]/s);

        logger.info('[CompressDialog] Block:', {
          hasRole: !!roleMatch,
          hasContent: !!contentMatch,
          role: roleMatch?.[1],
          contentLength: contentMatch?.[1]?.length,
        });

        if (roleMatch && contentMatch) {
          const role = roleMatch[1].toLowerCase() as 'user' | 'assistant';
          const content = contentMatch[1].trim();

          // Ensure strict chronological order with incremental timestamps
          // This prevents message swapping issues in the UI
          const timestamp = baseTime + parsedMessages.length * 100;

          parsedMessages.push({
            id: `compressed_${timestamp}_${parsedMessages.length}`,
            role,
            content,
            conversation_id: conversation!.id,
            created_at: timestamp,
          });
        } else {
          console.warn('[CompressDialog] Failed to parse block:', block);
        }
      }

      logger.info('[CompressDialog] Parsed messages:', parsedMessages.length);

      if (parsedMessages.length === 0) {
        throw new Error('압축된 메시지를 파싱하는데 실패했습니다.');
      }

      setCompressedMessages(parsedMessages);
      setStats({
        originalCount: messages.length,
        compressedCount: parsedMessages.length,
        reductionPercent: Math.round(
          ((messages.length - parsedMessages.length) / messages.length) * 100
        ),
      });
      setStep('review');
    } catch (err: any) {
      console.error('Failed to compress conversation:', err);
      setError(err.message || '대화 압축에 실패했습니다.');
      setStep('review');
    }
  };

  const handleCompress = async () => {
    if (compressedMessages.length === 0) {
      setError('압축된 메시지가 없습니다.');
      return;
    }

    setStep('compressing');
    setError(null);

    try {
      await onCompress(compressedMessages);

      setStep('done');
      setTimeout(() => {
        onOpenChange(false);
        // Reset state
        setStep('analyzing');
        setCompressedMessages([]);
        setStats({ originalCount: 0, compressedCount: 0, reductionPercent: 0 });
        setError(null);
      }, 1500);
    } catch (err: any) {
      console.error('Failed to save compressed conversation:', err);
      setError(err.message || '압축된 대화 저장에 실패했습니다.');
      setStep('review');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[90vw] !max-w-[800px] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <FileArchive className="h-5 w-5 text-primary" />
              대화 압축
            </div>
          </DialogTitle>
          <DialogDescription>
            LLM이 대화 내용을 분석하여 핵심만 남기고 압축합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 overflow-y-auto">
          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">대화 내용 분석 중...</p>
              <p className="text-sm text-muted-foreground mt-2">
                LLM이 핵심 내용을 추출하고 있습니다
              </p>
            </div>
          )}

          {step === 'review' && (
            <>
              {error && (
                <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-600 dark:text-yellow-400">압축 실패</p>
                      <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {!error && (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-md border bg-card p-4">
                      <p className="text-xs text-muted-foreground mb-1">원본 메시지</p>
                      <p className="text-2xl font-bold">{stats.originalCount}개</p>
                    </div>
                    <div className="rounded-md border bg-card p-4">
                      <p className="text-xs text-muted-foreground mb-1">압축 후</p>
                      <p className="text-2xl font-bold text-primary">{stats.compressedCount}개</p>
                    </div>
                    <div className="rounded-md border bg-card p-4">
                      <p className="text-xs text-muted-foreground mb-1">감소율</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {stats.reductionPercent}%
                      </p>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">압축된 메시지 미리보기:</p>
                    <div className="rounded-md border bg-muted/30 p-4 max-h-[400px] overflow-y-auto space-y-3">
                      {compressedMessages.map((msg, idx) => (
                        <div key={idx} className="text-sm">
                          <span className="font-semibold">
                            {msg.role === 'user' ? '사용자' : '어시스턴트'}:
                          </span>{' '}
                          <span className="text-muted-foreground">{msg.content}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        <strong>안내:</strong> 압축된 대화는 원본 대화를 대체합니다. 압축 전 중요한
                        내용이 있다면 먼저 &quot;대화 복제&quot;를 통해 백업하세요.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {step === 'compressing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">대화 압축 중...</p>
              <p className="text-sm text-muted-foreground mt-2">
                압축된 메시지로 교체하고 있습니다
              </p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-lg font-medium text-green-600 dark:text-green-400">압축 완료!</p>
              <p className="text-sm text-muted-foreground mt-2">대화가 성공적으로 압축되었습니다</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={step === 'analyzing' || step === 'compressing' || step === 'done'}
          >
            취소
          </Button>
          {step === 'review' && !error && (
            <Button onClick={handleCompress} disabled={compressedMessages.length === 0}>
              <FileArchive className="mr-2 h-4 w-4" />
              압축 적용
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
