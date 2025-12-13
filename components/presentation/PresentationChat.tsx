'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useChatStore } from '@/lib/store/chat-store';
import { runPresentationAgent, createInitialState } from '@/lib/presentation/ppt-agent';
import type { PresentationWorkflowStep, PresentationDesignMaster } from '@/types/presentation';
import { generateId } from '@/lib/utils';
import { PRESENTATION_TEMPLATES, type TemplateType } from '@/lib/presentation/templates';
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
  Globe,
  BookOpen,
} from 'lucide-react';
import React from 'react';

/**
 * 안전한 메시지 콘텐츠 렌더링 컴포넌트
 * dangerouslySetInnerHTML 대신 React 컴포넌트로 XSS 공격 방지
 */
function SafeMessageContent({ content }: { content: string }) {
  // JSON 코드 블록 제거
  const cleanedContent = content.replace(/```json[\s\S]*?```/g, '');

  // 이모지와 텍스트를 분리하여 안전하게 렌더링
  const parts = cleanedContent.split(/(✅|❌)/);

  return (
    <>
      {parts.map((part, index) => {
        if (part === '✅') {
          return (
            <span key={index} className="text-green-600 dark:text-green-400">
              ✅
            </span>
          );
        }
        if (part === '❌') {
          return (
            <span key={index} className="text-red-600 dark:text-red-400">
              ❌
            </span>
          );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </>
  );
}

// Quick Prompt 아이템 타입
type QuickPromptItem =
  | { label: string; prompt: string }
  | { label: string; prompt: string; designOption: PresentationDesignMaster };

// 단계별 Quick Prompts
const STEP_QUICK_PROMPTS: Record<PresentationWorkflowStep, { label: string; prompt: string }[]> = {
  briefing: [
    {
      label: '주제 변경',
      prompt: '주제를 "[새로운 주제]"로 변경해주세요.',
    },
    {
      label: '슬라이드 수 조정',
      prompt: '슬라이드를 [N]장으로 조정해주세요.',
    },
    {
      label: '다음 단계로',
      prompt: '이대로 좋습니다. 다음 단계로 진행해주세요.',
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
    {
      label: '내용 검증',
      prompt: '모든 슬라이드의 데이터 정확성을 확인하고 틀린 내용이 있으면 수정해주세요.',
    },
    { label: '오류 찾기', prompt: '틀린 내용이나 오래된 정보를 찾아서 수정해주세요.' },
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 초기화: presentationAgentState가 없으면 생성
  useEffect(() => {
    if (!presentationAgentState) {
      setPresentationAgentState(createInitialState());
    }
  }, [presentationAgentState, setPresentationAgentState]);

  // 스트리밍 중 자동 스크롤
  useEffect(() => {
    if (presentationChatStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [presentationChatStreaming, presentationChatMessages]);

  const currentStep = presentationAgentState?.currentStep || 'briefing';

  // design-master 단계에서 designOptions가 있으면 동적으로 버튼 생성
  const quickPrompts: QuickPromptItem[] =
    currentStep === 'design-master' && presentationAgentState?.designOptions
      ? [
          ...presentationAgentState.designOptions.map(
            (option, idx): QuickPromptItem => ({
              label: option.name || `옵션 ${idx + 1}`,
              prompt: `${option.name || `옵션 ${idx + 1}`}으로 선택하겠습니다.`,
              designOption: option, // 선택된 디자인 정보 저장
            })
          ),
          {
            label: '커스텀 요청',
            prompt: '조금 다르게 해볼게요. 배경은 화이트로, 강조색은 그린으로 해주세요.',
          },
        ]
      : STEP_QUICK_PROMPTS[currentStep] || [];

  const handleTemplateSelect = (templateId: TemplateType) => {
    const template = PRESENTATION_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return;
    }

    // 템플릿 상태 생성 (브리핑 단계로 유지)
    const templateState = template.generateState();
    templateState.currentStep = 'briefing'; // 브리핑 단계에 머물기

    // 상태 업데이트
    setPresentationAgentState(templateState);
    setPresentationSlides(templateState.slides);

    // 첫 번째 슬라이드 활성화
    if (templateState.slides.length > 0) {
      setActivePresentationSlide(templateState.slides[0].id);
    }

    // 시스템 메시지 추가
    addPresentationChatMessage({
      role: 'assistant',
      content: `✅ "${template.name}" 템플릿이 적용되었습니다!\n\n**브리핑 내용:**\n- 주제: ${templateState.brief?.topic}\n- 슬라이드: ${templateState.slides.length}장\n- 청중: ${templateState.brief?.audience}\n\n우측에서 미리보기를 확인하시고, 수정이 필요하면 말씀해주세요.\n다음 단계로 진행하시려면 "다음 단계" 또는 상단의 단계 버튼을 클릭하세요.`,
    });
  };

  const handleSend = async (message?: string, bulkCreation: boolean = false) => {
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
            setPresentationSlides(slides);
            // 새 슬라이드가 추가되면 마지막 슬라이드를 활성화
            if (slides.length > 0) {
              const lastSlide = slides[slides.length - 1];
              setActivePresentationSlide(lastSlide.id);
            }
          },
        },
        {
          bulkCreation,
        }
      );

      if (!buffer && response) {
        const messages = useChatStore.getState().presentationChatMessages;
        const last = messages[messages.length - 1];
        if (last?.role === 'assistant') {
          updatePresentationChatMessage(last.id, { content: response });
        }
      }

      // onStateUpdate 콜백에서 이미 상태를 업데이트했으므로 중복 제거
      // 단, onSlides 콜백이 호출되지 않았다면 최종 동기화
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
          <div className="flex items-center gap-3">
            {/* RAG Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="rag-toggle"
                checked={presentationAgentState?.ragEnabled || false}
                onCheckedChange={(checked) => {
                  if (presentationAgentState) {
                    setPresentationAgentState({
                      ...presentationAgentState,
                      ragEnabled: checked,
                    });
                  }
                }}
                disabled={presentationChatStreaming}
              />
              <Label
                htmlFor="rag-toggle"
                className="text-xs cursor-pointer flex items-center gap-1"
              >
                <BookOpen className="h-3 w-3" />
                RAG
              </Label>
            </div>
            {/* Web Search Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="web-search-toggle"
                checked={presentationAgentState?.webSearchEnabled || false}
                onCheckedChange={(checked) => {
                  if (presentationAgentState) {
                    setPresentationAgentState({
                      ...presentationAgentState,
                      webSearchEnabled: checked,
                    });
                  }
                }}
                disabled={presentationChatStreaming}
              />
              <Label
                htmlFor="web-search-toggle"
                className="text-xs cursor-pointer flex items-center gap-1"
              >
                <Globe className="h-3 w-3" />
                웹검색
              </Label>
            </div>
            {presentationChatStreaming && (
              <Button size="sm" variant="destructive" onClick={handleStop}>
                <StopCircle className="h-4 w-4 mr-1" />
                중지
              </Button>
            )}
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-3">
          {STEP_ORDER.map((step, idx) => {
            const isActive = step === currentStep;
            const isCompleted = idx < currentStepIndex;
            // 템플릿 적용 후에는 모든 단계가 접근 가능 (brief, designMaster, structure, slides가 모두 있음)
            const hasTemplateData =
              presentationAgentState?.brief &&
              presentationAgentState?.designMaster &&
              presentationAgentState?.structure &&
              presentationAgentState?.slides &&
              presentationAgentState.slides.length > 0;
            const isAccessible = isActive || isCompleted || hasTemplateData;

            return (
              <button
                key={step}
                onClick={() => {
                  if (isAccessible && presentationAgentState) {
                    // 모든 접근 가능한 단계로 자유롭게 이동
                    setPresentationAgentState({
                      ...presentationAgentState,
                      currentStep: step,
                    });
                  }
                }}
                disabled={!isAccessible || presentationChatStreaming}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-medium'
                    : isCompleted || hasTemplateData
                      ? 'bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30 cursor-pointer'
                      : 'bg-muted/40 text-muted-foreground cursor-not-allowed'
                } ${isAccessible && !presentationChatStreaming ? 'hover:opacity-80' : ''}`}
                title={
                  isAccessible
                    ? isActive
                      ? '현재 단계'
                      : '이 단계로 이동하기'
                    : '아직 진행하지 않은 단계'
                }
              >
                {STEP_ICONS[step]}
                <span>{STEP_DESCRIPTIONS[step].title}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Prompts */}
        {quickPrompts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((quick) => {
              const hasDesignOption = 'designOption' in quick && quick.designOption;
              return (
                <Button
                  key={quick.label}
                  size="sm"
                  variant="outline"
                  className={`text-xs h-auto ${hasDesignOption ? 'py-2 px-3' : 'py-1.5'}`}
                  onClick={() => {
                    // "전부 자동 생성" 또는 "자동으로 생성" 버튼일 때 bulkCreation 모드 활성화
                    const isBulkCreation =
                      quick.label === '전부 자동 생성' || quick.label === '자동으로 생성';
                    handleSend(quick.prompt, isBulkCreation);
                  }}
                  disabled={presentationChatStreaming}
                >
                  {hasDesignOption ? (
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        <div
                          className="h-3 w-3 rounded-sm"
                          style={{ backgroundColor: quick.designOption.palette.primary }}
                        />
                        <div
                          className="h-3 w-3 rounded-sm"
                          style={{ backgroundColor: quick.designOption.palette.accent }}
                        />
                      </div>
                      <span>{quick.label}</span>
                    </div>
                  ) : (
                    quick.label
                  )}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {/* Current State Info */}
      {presentationAgentState && presentationAgentState.structure && (
        <div className="mx-4 mt-3">
          {/* Structure Preview - Collapsible */}
          <details className="group rounded-lg border bg-card">
            <summary className="flex cursor-pointer items-center justify-between p-3 hover:bg-muted/50 transition-colors">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                슬라이드 구조 ({presentationAgentState.structure.totalSlides}장)
              </p>
              <svg
                className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </summary>
            <div className="border-t px-3 py-2 space-y-1 max-h-48 overflow-y-auto text-xs">
              {presentationAgentState.structure.outline.map((slide, idx) => (
                <div key={idx} className="flex items-center gap-2 py-1">
                  <span className="font-mono text-muted-foreground">{idx + 1}.</span>
                  <span className="flex-1">{slide.title}</span>
                  <span className="text-muted-foreground text-[10px] uppercase">
                    {slide.layout}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Template Selection (Briefing 단계에서 표시) */}
      {currentStep === 'briefing' && (
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold mb-3">
            {presentationAgentState?.brief ? '다른 템플릿 선택' : '템플릿으로 빠르게 시작하기'}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {presentationAgentState?.brief
              ? '다른 템플릿을 선택하여 변경할 수 있습니다.'
              : '완성된 템플릿을 선택하거나, 아래에서 직접 입력하여 커스텀 프레젠테이션을 만드세요.'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'profile', name: '자기소개', icon: '👤', desc: '면접, 네트워킹' },
              { id: 'tech-seminar', name: '기술 세미나', icon: '💻', desc: '개발자, 엔지니어' },
              { id: 'paper-summary', name: '논문 요약', icon: '📄', desc: '학생, 연구원' },
              { id: 'project-intro', name: '과제 소개', icon: '📁', desc: '팀원, 이해관계자' },
            ].map((template) => (
              <button
                key={template.id}
                onClick={() => handleTemplateSelect(template.id as TemplateType)}
                className="flex flex-col items-start gap-2 rounded-lg border p-4 hover:bg-muted/50 hover:border-primary transition-all text-left"
                disabled={presentationChatStreaming}
              >
                <div className="text-2xl">{template.icon}</div>
                <div>
                  <p className="text-sm font-semibold">{template.name}</p>
                  <p className="text-xs text-muted-foreground">{template.desc}</p>
                </div>
              </button>
            ))}
          </div>
          {!presentationAgentState?.brief && (
            <div className="mt-4 text-xs text-muted-foreground text-center">
              또는 아래에서 직접 입력하여 커스텀 프레젠테이션을 만드세요
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {presentationChatMessages.length === 0 && currentStep !== 'briefing' && (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            <p className="font-medium mb-2">프레젠테이션을 함께 만들어봐요! 👋</p>
            <p className="text-xs">아래 Quick Actions를 선택하거나 직접 입력해주세요.</p>
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
                  <SafeMessageContent content={msg.content} />
                ) : isStreaming ? (
                  '생성 중...'
                ) : (
                  ''
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
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
