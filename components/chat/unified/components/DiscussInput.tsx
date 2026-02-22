'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Send, SkipForward, MessageCircle } from 'lucide-react';
import { isElectron } from '@/lib/platform';

export interface DiscussInputProps {
  conversationId: string;
  stepIndex: number;
  question: string;
}

export function DiscussInput({ conversationId, stepIndex, question }: DiscussInputProps) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedText, setSubmittedText] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async () => {
    if (!value.trim() || submitted) {
      return;
    }

    setError('');
    setSubmitted(true);
    setSubmittedText(value.trim());

    if (isElectron() && window.electronAPI?.langgraph?.submitDiscussInput) {
      try {
        const result = await window.electronAPI.langgraph.submitDiscussInput(
          conversationId,
          value.trim()
        );
        if (result && !result.success) {
          console.warn('[DiscussInput] Submit returned failure:', result.error);
          setSubmitted(false);
          setSubmittedText('');
          setError('이미 처리된 요청입니다. 페이지를 새로고침해주세요.');
        }
      } catch (err) {
        console.error('[DiscussInput] Failed to submit discuss input:', err);
        setSubmitted(false);
        setSubmittedText('');
        setError('전송에 실패했습니다. 다시 시도해주세요.');
      }
    }
  }, [value, submitted, conversationId]);

  const handleSkip = useCallback(async () => {
    if (submitted) {
      return;
    }

    setError('');
    setSubmitted(true);
    setSubmittedText('');

    if (isElectron() && window.electronAPI?.langgraph?.submitDiscussInput) {
      try {
        const result = await window.electronAPI.langgraph.submitDiscussInput(conversationId, '');
        if (result && !result.success) {
          console.warn('[DiscussInput] Skip returned failure:', result.error);
          setSubmitted(false);
          setError('이미 처리된 요청입니다. 페이지를 새로고침해주세요.');
        }
      } catch (err) {
        console.error('[DiscussInput] Failed to skip discuss input:', err);
        setSubmitted(false);
        setError('전송에 실패했습니다. 다시 시도해주세요.');
      }
    }
  }, [submitted, conversationId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="my-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-900/10 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <h4 className="text-sm font-medium text-foreground">
          Step {stepIndex + 1} - 사용자 확인 필요
        </h4>
      </div>

      {/* Question display */}
      {question && (
        <p className="text-sm text-muted-foreground mb-3 whitespace-pre-wrap">{question}</p>
      )}

      {/* Error message */}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>}

      {/* Input area */}
      {!submitted ? (
        <>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="의견이나 피드백을 입력하세요... (Enter로 전송)"
            className="mb-2 resize-none bg-background"
            rows={3}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={handleSkip} className="gap-1">
              <SkipForward className="h-3.5 w-3.5" />
              건너뛰기
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!value.trim()} className="gap-1">
              <Send className="h-3.5 w-3.5" />
              전송
            </Button>
          </div>
        </>
      ) : (
        <div
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            submittedText
              ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
              : 'bg-muted border-muted-foreground/20 text-muted-foreground italic'
          )}
        >
          {submittedText ? `전송됨: ${submittedText}` : '건너뜀 - 계속 진행'}
        </div>
      )}
    </div>
  );
}
