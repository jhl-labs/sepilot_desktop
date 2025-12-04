'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useChatStore } from '@/lib/store/chat-store';
import { runPresentationAgent, createInitialState } from '@/lib/presentation/ppt-agent';
import type { PresentationWorkflowStep } from '@/types/presentation';
import { generateId } from '@/lib/utils';
import {
  Loader2,
  Send,
  Sparkles,
  StopCircle,
  CheckCircle2,
  Palette,
  LayoutList,
  FileText,
  Eye,
} from 'lucide-react';

// 단계별 Quick Prompts
const STEP_QUICK_PROMPTS: Record<PresentationWorkflowStep, { label: string; prompt: string }[]> = {
  briefing: [
    {
      label: '논문 요약 발표',
      prompt: '논문 요약 발표 자료를 만들고 싶어요. 슬라이드는 10장 정도로.',
    },
    {
      label: '제품 소개 피치덱',
      prompt: '우리 제품을 소개하는 피치덱을 만들어주세요. 투자자 대상입니다.',
    },
    {
      label: 'AI 기술 세미나',
      prompt: 'AI 기술에 대한 세미나 자료를 만들고 싶습니다. 개발자가 청중이에요.',
    },
  ],
  'design-master': [
    { label: '옵션 1 선택', prompt: '첫 번째 옵션(Option 1)이 좋아요!' },
    { label: '옵션 2 선택', prompt: '두 번째 옵션(Option 2)로 할게요.' },
    {
      label: '커스텀 요청',
      prompt: '조금 다르게 해볼게요. 배경은 화이트로, 강조색은 그린으로 해주세요.',
    },
  ],
  structure: [
    { label: '구조 승인', prompt: '좋아요! 이 구조로 진행해주세요.' },
    {
      label: '슬라이드 수정',
      prompt: '3번 슬라이드를 "기술 스택"에서 "시스템 아키텍처"로 바꿔주세요.',
    },
    { label: '슬라이드 추가', prompt: '5번과 6번 사이에 "경쟁사 비교" 슬라이드 추가해주세요.' },
  ],
  'slide-creation': [
    { label: '자동으로 생성', prompt: '구조에 맞춰 슬라이드를 자동으로 생성해주세요.' },
    { label: '다음 슬라이드', prompt: '다음 슬라이드 만들어주세요.' },
    { label: '전부 자동 생성', prompt: '남은 모든 슬라이드를 자동으로 생성해주세요.' },
  ],
  review: [
    { label: '특정 슬라이드 수정', prompt: '3번 슬라이드 제목을 바꿔주세요.' },
    { label: '색상 변경', prompt: '전체적으로 색상을 더 밝게 해주세요.' },
    { label: '완료', prompt: '완료! 이제 내보내기 할게요.' },
  ],
  complete: [
    { label: 'PPTX 내보내기', prompt: 'PPTX로 내보내기 해주세요.' },
    { label: 'PDF 내보내기', prompt: 'PDF로 저장해주세요.' },
  ],
};

// 단계별 설명
const STEP_DESCRIPTIONS: Record<PresentationWorkflowStep, { title: string; description: string }> =
  {
    briefing: {
      title: '브리핑',
      description: '주제, 목적, 청중을 파악합니다',
    },
    'design-master': {
      title: '디자인',
      description: '색상, 폰트, 분위기를 설정합니다',
    },
    structure: {
      title: '구조',
      description: '슬라이드 목차를 계획합니다',
    },
    'slide-creation': {
      title: '작성',
      description: '슬라이드를 하나씩 만듭니다',
    },
    review: {
      title: '검토',
      description: '수정 및 최종 확인합니다',
    },
    complete: {
      title: '완료',
      description: '프레젠테이션이 완성되었습니다',
    },
  };

// 단계별 아이콘
const STEP_ICONS: Record<PresentationWorkflowStep, React.ReactNode> = {
  briefing: <Sparkles className="h-4 w-4" />,
  'design-master': <Palette className="h-4 w-4" />,
  structure: <LayoutList className="h-4 w-4" />,
  'slide-creation': <FileText className="h-4 w-4" />,
  review: <Eye className="h-4 w-4" />,
  complete: <CheckCircle2 className="h-4 w-4" />,
};

const STEP_ORDER: PresentationWorkflowStep[] = [
  'briefing',
  'design-master',
  'structure',
  'slide-creation',
  'review',
  'complete',
];

export function PresentationChat() {
  const {
    presentationChatMessages,
    presentationChatStreaming,
    presentationAgentState,
    presentationSlides,
    activePresentationSlideId,
    addPresentationChatMessage,
    updatePresentationChatMessage,
    setPresentationChatStreaming,
    setPresentationSlides,
    setActivePresentationSlide,
    setPresentationAgentState,
  } = useChatStore();

  const [input, setInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // 초기화: presentationAgentState가 없으면 생성
  useEffect(() => {
    if (!presentationAgentState) {
      setPresentationAgentState(createInitialState());
    }
  }, [presentationAgentState, setPresentationAgentState]);

  const currentStep = presentationAgentState?.currentStep || 'briefing';
  const quickPrompts = STEP_QUICK_PROMPTS[currentStep] || [];

  const handleSend = async (message?: string) => {
    const userMessage = message ?? input;
    if (!userMessage.trim() || presentationChatStreaming || !presentationAgentState) {
      return;
    }

    setInput('');
    setPresentationChatStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    // 사용자 메시지를 히스토리에 포함시키기 위해 배열로 구성
    const newUserMessage = {
      id: generateId(),
      role: 'user' as const,
      content: userMessage,
      conversation_id: 'presentation-chat',
      created_at: Date.now(),
    };

    // UI에 사용자 메시지 추가
    addPresentationChatMessage({ role: 'user', content: userMessage });
    // 빈 assistant 메시지 미리 추가 (스트리밍용)
    addPresentationChatMessage({ role: 'assistant', content: '' });

    // 최신 메시지를 포함한 히스토리 구성 (store 상태 업데이트 전에 직접 구성)
    const messagesWithNewUser = [...presentationChatMessages, newUserMessage];

    let buffer = '';
    try {
      const { response, state } = await runPresentationAgent(
        messagesWithNewUser, // 최신 사용자 메시지 포함
        presentationAgentState,
        {
          signal: controller.signal,
          onToken: (chunk) => {
            buffer += chunk;
            const messages = useChatStore.getState().presentationChatMessages;
            const last = messages[messages.length - 1];
            if (last?.role === 'assistant') {
              updatePresentationChatMessage(last.id, { content: buffer });
            }
          },
          onStateUpdate: (newState) => {
            setPresentationAgentState(newState);
          },
          onSlides: (slides) => {
            console.log('[PresentationChat] onSlides called with', slides.length, 'slides');
            setPresentationSlides(slides);
            // 새 슬라이드가 추가되면 마지막 슬라이드를 활성화
            if (slides.length > 0) {
              const lastSlide = slides[slides.length - 1];
              setActivePresentationSlide(lastSlide.id);
            }
          },
        }
      );

      if (!buffer && response) {
        const messages = useChatStore.getState().presentationChatMessages;
        const last = messages[messages.length - 1];
        if (last?.role === 'assistant') {
          updatePresentationChatMessage(last.id, { content: response });
        }
      }

      // 상태 업데이트
      setPresentationAgentState(state);

      // onSlides 콜백이 호출되지 않았다면 state의 slides로 동기화
      if (state.slides.length > 0 && presentationSlides.length !== state.slides.length) {
        setPresentationSlides(state.slides);
        if (state.slides.length > 0 && !activePresentationSlideId) {
          setActivePresentationSlide(state.slides[0].id);
        }
      }
    } catch (error) {
      console.error('[PresentationChat] agent error', error);
      const messages = useChatStore.getState().presentationChatMessages;
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') {
        const errorMessage =
          error instanceof Error
            ? `오류가 발생했습니다: ${error.message}. 다시 시도해주세요.`
            : '알 수 없는 오류가 발생했습니다. 다시 시도해주세요.';
        updatePresentationChatMessage(last.id, {
          content: errorMessage,
        });
      }
    } finally {
      setPresentationChatStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setPresentationChatStreaming(false);
  };

  const currentStepIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <div className="flex h-full flex-col">
      {/* Header with Progress */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">AI Presentation Designer</p>
              <p className="text-xs text-muted-foreground">
                {STEP_DESCRIPTIONS[currentStep].description}
              </p>
            </div>
          </div>
          {presentationChatStreaming && (
            <Button size="sm" variant="destructive" onClick={handleStop}>
              <StopCircle className="h-4 w-4 mr-1" />
              중지
            </Button>
          )}
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-3">
          {STEP_ORDER.map((step, idx) => {
            const isActive = step === currentStep;
            const isCompleted = idx < currentStepIndex;

            return (
              <div
                key={step}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-medium'
                    : isCompleted
                      ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                      : 'bg-muted/40 text-muted-foreground'
                }`}
              >
                {STEP_ICONS[step]}
                <span>{STEP_DESCRIPTIONS[step].title}</span>
              </div>
            );
          })}
        </div>

        {/* Quick Prompts */}
        {quickPrompts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((quick) => (
              <Button
                key={quick.label}
                size="sm"
                variant="outline"
                className="text-xs h-auto py-1.5"
                onClick={() => handleSend(quick.prompt)}
                disabled={presentationChatStreaming}
              >
                {quick.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {presentationChatMessages.length === 0 && (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            <p className="font-medium mb-2">프레젠테이션을 함께 만들어봐요! 👋</p>
            <p className="text-xs">
              {currentStep === 'briefing'
                ? '어떤 주제의 프레젠테이션을 만들고 싶으신가요? 목적과 청중도 알려주세요.'
                : '아래 Quick Actions를 선택하거나 직접 입력해주세요.'}
            </p>
          </div>
        )}
        {presentationChatMessages.map((msg, idx) => {
          const isLastMessage = idx === presentationChatMessages.length - 1;
          const isStreaming =
            isLastMessage && presentationChatStreaming && msg.role === 'assistant';

          return (
            <div
              key={msg.id}
              className={`rounded-lg border p-3 ${
                msg.role === 'user' ? 'bg-primary/5 border-primary/40' : 'bg-background'
              }`}
            >
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground mb-1">
                <span>{msg.role === 'user' ? 'You' : 'Designer'}</span>
                {isStreaming && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {msg.content ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: msg.content
                        .replace(
                          /✅/g,
                          '<span class="text-green-600 dark:text-green-400">✅</span>'
                        )
                        .replace(/❌/g, '<span class="text-red-600 dark:text-red-400">❌</span>')
                        .replace(
                          /```json[\s\S]*?```/g,
                          '<div class="my-2 p-2 bg-muted/50 rounded border border-dashed text-xs font-mono opacity-50">[JSON 데이터 처리됨]</div>'
                        ),
                    }}
                  />
                ) : isStreaming ? (
                  '생성 중...'
                ) : (
                  ''
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Area */}
      <div className="border-t px-4 py-3">
        <div className="flex gap-2">
          <Textarea
            placeholder={`${STEP_DESCRIPTIONS[currentStep].title} 단계입니다. 메시지를 입력하세요... (Enter: 전송, Shift+Enter: 줄바꿈)`}
            value={input}
            disabled={presentationChatStreaming}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 min-h-[80px] resize-none"
          />
          <Button
            onClick={() => handleSend()}
            disabled={presentationChatStreaming || !input.trim()}
            className="h-[80px]"
          >
            {presentationChatStreaming ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Current State Info */}
        {presentationAgentState && currentStep === 'slide-creation' && (
          <div className="mt-2 text-xs text-muted-foreground">
            진행 상황: {presentationAgentState.completedSlideIndices.length} /{' '}
            {presentationAgentState.structure?.totalSlides || 0} 슬라이드 완료
            {presentationAgentState.currentSlideIndex !== undefined &&
              ` (현재: ${presentationAgentState.currentSlideIndex + 1}번)`}
          </div>
        )}
      </div>
    </div>
  );
}
