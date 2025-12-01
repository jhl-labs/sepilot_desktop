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
import { Loader2, BookOpen, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Conversation, Message } from '@/types';

interface SaveKnowledgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation | null;
  messages: Message[];
  onSave: (doc: { title: string; content: string; metadata: Record<string, any> }) => Promise<void>;
}

export function SaveKnowledgeDialog({
  open,
  onOpenChange,
  conversation,
  messages,
  onSave,
}: SaveKnowledgeDialogProps) {
  const [step, setStep] = useState<'analyzing' | 'review' | 'saving' | 'done'>('analyzing');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && conversation && messages.length > 0) {
      analyzeConversation();
    }
  }, [open, conversation, messages]);

  const analyzeConversation = async () => {
    setStep('analyzing');
    setError(null);

    try {
      // 대화 내용을 텍스트로 변환
      const conversationText = messages
        .filter((msg) => msg.role !== 'system')
        .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n');

      // LLM에게 대화 분석 및 지식 추출 요청
      const result = await window.electronAPI.llm.chat([
        {
          id: 'system',
          role: 'system',
          content: `당신은 대화 내용을 분석하여 확실한 사실 기반의 지식을 추출하는 전문가입니다.

다음 기준에 따라 대화를 분석하세요:
1. **확실한 사실만 추출**: 추측, 의견, 불확실한 정보는 제외
2. **검증 가능한 정보**: 객관적으로 확인 가능한 정보만 포함
3. **구조화된 형식**: 주제별로 분류하고 마크다운 형식으로 작성
4. **핵심 내용 중심**: 중요한 정보만 간결하게 정리
5. **메타데이터 제공**: 주제, 키워드, 카테고리 등 추출

출력 형식:
# 제목
[대화에서 추출한 핵심 주제를 제목으로]

# 분석 결과
[이 지식을 저장할 가치가 있는지, 어떤 사실 기반 정보가 포함되어 있는지 간단히 설명]

# 추출된 지식
[확실한 사실 기반의 정보를 구조화하여 마크다운 형식으로 작성]

# 메타데이터
- 주제: [주요 주제]
- 키워드: [관련 키워드들]
- 신뢰도: [높음/중간/낮음]

만약 대화에서 확실한 사실 기반의 지식을 추출할 수 없다면, "이 대화에는 저장할 만한 확실한 지식이 부족합니다"라고 명시하세요.`,
          created_at: Date.now(),
        },
        {
          id: 'user',
          role: 'user',
          content: `다음 대화 내용을 분석하여 지식을 추출해주세요:\n\n${conversationText}`,
          created_at: Date.now(),
        },
      ]);

      if (!result.success || !result.data) {
        throw new Error(result.error || '대화 분석에 실패했습니다.');
      }

      const analysisText = result.data.content;

      // 제목 추출 (첫 번째 # 제목)
      const titleMatch = analysisText.match(/^#\s+(.+)$/m);
      const extractedTitle = titleMatch ? titleMatch[1].trim() : conversation?.title || '지식';

      // "이 대화에는 저장할 만한 확실한 지식이 부족합니다" 체크
      if (
        analysisText.includes('저장할 만한 확실한 지식이 부족') ||
        analysisText.includes('확실한 지식을 추출할 수 없')
      ) {
        setError(
          '이 대화에는 저장할 만한 확실한 사실 기반의 지식이 부족합니다. 더 구체적이고 객관적인 정보가 필요합니다.'
        );
        setStep('review');
        return;
      }

      setTitle(extractedTitle);
      setContent(analysisText);
      setStep('review');
    } catch (err: any) {
      console.error('Failed to analyze conversation:', err);
      setError(err.message || '대화 분석에 실패했습니다.');
      setStep('review');
    }
  };

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
          source: 'conversation',
          conversationId: conversation?.id,
          conversationTitle: conversation?.title,
          extractedAt: Date.now(),
          messageCount: messages.length,
        },
      });

      setStep('done');
      setTimeout(() => {
        onOpenChange(false);
        // Reset state
        setStep('analyzing');
        setTitle('');
        setContent('');
        setError(null);
      }, 1500);
    } catch (err: any) {
      console.error('Failed to save knowledge:', err);
      setError(err.message || '지식 저장에 실패했습니다.');
      setStep('review');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[90vw] !max-w-[1000px] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              대화 내용을 지식으로 저장
            </div>
          </DialogTitle>
          <DialogDescription>
            LLM이 대화 내용을 분석하여 확실한 사실 기반의 지식을 추출하고 RAG 문서로 저장합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 overflow-y-auto">
          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">대화 내용 분석 중...</p>
              <p className="text-sm text-muted-foreground mt-2">
                LLM이 확실한 사실 기반의 지식을 추출하고 있습니다
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
                      <p className="font-medium text-yellow-600 dark:text-yellow-400">
                        지식 추출 실패
                      </p>
                      <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {!error && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="knowledge-title">제목</Label>
                    <Input
                      id="knowledge-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="지식 제목"
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-2 flex-1 flex flex-col">
                    <Label htmlFor="knowledge-content">추출된 지식</Label>
                    <Textarea
                      id="knowledge-content"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="LLM이 추출한 지식 내용"
                      className="flex-1 min-h-[400px] font-mono text-sm resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      LLM이 분석한 내용을 확인하고 필요시 수정할 수 있습니다
                    </p>
                  </div>

                  <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        <strong>팁:</strong> LLM이 추출한 지식은 확실한 사실 기반으로 구성되어
                        있습니다. 내용을 확인하고 필요시 수정한 후 저장하세요.
                      </p>
                    </div>
                  </div>
                </>
              )}
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
            disabled={step === 'analyzing' || step === 'saving' || step === 'done'}
          >
            취소
          </Button>
          {step === 'review' && !error && (
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
