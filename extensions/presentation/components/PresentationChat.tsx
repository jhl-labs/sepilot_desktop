'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useChatStore } from '@/lib/store/chat-store';
import { runPresentationAgent, createInitialState } from '../lib/ppt-agent';
import type { PresentationWorkflowStep, PresentationDesignMaster } from '../types';
import { generateId } from '@/lib/utils';
import { PRESENTATION_TEMPLATES, type TemplateType } from '../lib/templates';
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
  Settings2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import React from 'react';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';

/**
 * 메시지 콘텐츠 렌더링 컴포넌트 (JSON 코드블록 제거 후 마크다운 렌더링)
 */
function MessageContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  // ppt-agent의 내부 JSON 코드 블록 제거
  const cleanedContent = content.replace(/```json[\s\S]*?```/g, '');

  return (
    <MarkdownRenderer
      content={cleanedContent}
      isStreaming={isStreaming}
      className="text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1"
    />
  );
}

// Quick Prompt 아이템 타입
type QuickPromptItem =
  | { label: string; prompt: string }
  | { label: string; prompt: string; designOption: PresentationDesignMaster };

// 단계별 Quick Prompts (간소화)
const STEP_QUICK_PROMPTS: Record<PresentationWorkflowStep, { label: string; prompt: string }[]> = {
  briefing: [{ label: '다음 단계로', prompt: '이대로 좋습니다. 다음 단계로 진행해주세요.' }],
  'design-master': [],
  structure: [{ label: '구조 승인', prompt: '좋아요! 이 구조로 진행해주세요.' }],
  'slide-creation': [
    { label: '자동으로 생성', prompt: '구조에 맞춰 슬라이드를 자동으로 생성해주세요.' },
  ],
  review: [{ label: '완료', prompt: '완료! 이제 내보내기 할게요.' }],
  complete: [],
};

// 단계별 설명
const STEP_DESCRIPTIONS: Record<PresentationWorkflowStep, { title: string; description: string }> =
  {
    briefing: { title: '브리핑', description: '주제, 목적, 청중을 파악합니다' },
    'design-master': { title: '디자인', description: '색상, 폰트, 분위기를 설정합니다' },
    structure: { title: '구조', description: '슬라이드 목차를 계획합니다' },
    'slide-creation': { title: '작성', description: '슬라이드를 하나씩 만듭니다' },
    review: { title: '검토', description: '수정 및 최종 확인합니다' },
    complete: { title: '완료', description: '프레젠테이션이 완성되었습니다' },
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
  const [showSettings, setShowSettings] = useState(false);
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
  const currentStepIndex = STEP_ORDER.indexOf(currentStep);

  // design-master 단계에서 designOptions가 있으면 동적으로 버튼 생성
  const quickPrompts: QuickPromptItem[] =
    currentStep === 'design-master' && presentationAgentState?.designOptions
      ? presentationAgentState.designOptions.map(
          (option, idx): QuickPromptItem => ({
            label: option.name || `옵션 ${idx + 1}`,
            prompt: `${option.name || `옵션 ${idx + 1}`}으로 선택하겠습니다.`,
            designOption: option,
          })
        )
      : STEP_QUICK_PROMPTS[currentStep] || [];

  const handleTemplateSelect = (templateId: TemplateType) => {
    const template = PRESENTATION_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    const templateState = template.generateState();
    templateState.currentStep = 'briefing';

    setPresentationAgentState(templateState);
    setPresentationSlides(templateState.slides);

    if (templateState.slides.length > 0) {
      setActivePresentationSlide(templateState.slides[0].id);
    }

    addPresentationChatMessage({
      role: 'assistant',
      content: `✅ "${template.name}" 템플릿이 적용되었습니다!\n\n**브리핑 내용:**\n- 주제: ${templateState.brief?.topic}\n- 슬라이드: ${templateState.slides.length}장\n- 청중: ${templateState.brief?.audience}\n\n우측에서 미리보기를 확인하시고, 수정이 필요하면 말씀해주세요.`,
    });
  };

  const handleSend = async (message?: string, bulkCreation: boolean = false) => {
    const userMessage = message ?? input;
    if (!userMessage.trim() || presentationChatStreaming || !presentationAgentState) return;

    setInput('');
    setPresentationChatStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const newUserMessage = {
      id: generateId(),
      role: 'user' as const,
      content: userMessage,
      conversation_id: 'presentation-chat',
      created_at: Date.now(),
    };

    addPresentationChatMessage({ role: 'user', content: userMessage });
    addPresentationChatMessage({ role: 'assistant', content: '' });

    const messagesWithNewUser = [...presentationChatMessages, newUserMessage];

    let buffer = '';
    try {
      const { response, state } = await runPresentationAgent(
        messagesWithNewUser,
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
            if (slides.length > 0) {
              const lastSlide = slides[slides.length - 1];
              setActivePresentationSlide(lastSlide.id);
            }
          },
        },
        { bulkCreation }
      );

      if (!buffer && response) {
        const messages = useChatStore.getState().presentationChatMessages;
        const last = messages[messages.length - 1];
        if (last?.role === 'assistant') {
          updatePresentationChatMessage(last.id, { content: response });
        }
      }

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
        updatePresentationChatMessage(last.id, { content: errorMessage });
      }
    } finally {
      setPresentationChatStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortRef.current) abortRef.current.abort();
    setPresentationChatStreaming(false);
  };

  // 온보딩 화면 (메시지가 없고 브리핑 단계일 때)
  const showOnboarding = presentationChatMessages.length === 0 && currentStep === 'briefing';

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Minimal Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">AI Presentation Designer</span>
        </div>
        <div className="flex items-center gap-1">
          {presentationChatStreaming && (
            <Button size="sm" variant="ghost" onClick={handleStop} className="h-7 px-2">
              <StopCircle className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSettings(!showSettings)}
            className="h-7 px-2"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Settings Panel (Collapsible) */}
      {showSettings && (
        <div className="border-b bg-muted/30 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="rag-toggle" className="text-xs">
                RAG (문서 검색)
              </Label>
            </div>
            <Switch
              id="rag-toggle"
              checked={presentationAgentState?.ragEnabled || false}
              onCheckedChange={(checked) => {
                if (presentationAgentState) {
                  setPresentationAgentState({ ...presentationAgentState, ragEnabled: checked });
                }
              }}
              disabled={presentationChatStreaming}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="web-search-toggle" className="text-xs">
                웹 검색
              </Label>
            </div>
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
          </div>
        </div>
      )}

      {/* Progress Indicator (Minimal dots) */}
      <div className="flex items-center justify-center gap-1 py-2 border-b">
        {STEP_ORDER.map((step, idx) => {
          const isActive = step === currentStep;
          const isCompleted = idx < currentStepIndex;
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
                  setPresentationAgentState({ ...presentationAgentState, currentStep: step });
                }
              }}
              disabled={!isAccessible || presentationChatStreaming}
              className={`group relative flex items-center transition-all ${
                idx < STEP_ORDER.length - 1 ? 'pr-4' : ''
              }`}
              title={STEP_DESCRIPTIONS[step].title}
            >
              <div
                className={`h-2 w-2 rounded-full transition-all ${
                  isActive
                    ? 'bg-primary ring-2 ring-primary/30 ring-offset-1 ring-offset-background'
                    : isCompleted || hasTemplateData
                      ? 'bg-green-500'
                      : 'bg-muted-foreground/30'
                } ${isAccessible && !presentationChatStreaming ? 'cursor-pointer hover:scale-125' : 'cursor-not-allowed'}`}
              />
              {idx < STEP_ORDER.length - 1 && (
                <div
                  className={`absolute left-3 h-px w-3 ${
                    isCompleted || hasTemplateData ? 'bg-green-500' : 'bg-muted-foreground/30'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Current Step Label */}
      <div className="flex items-center justify-center py-1.5 text-xs text-muted-foreground">
        {STEP_DESCRIPTIONS[currentStep].title} · {STEP_DESCRIPTIONS[currentStep].description}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {showOnboarding ? (
          /* Onboarding View */
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-md mx-auto space-y-6">
              {/* Welcome */}
              <div className="text-center space-y-2">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">프레젠테이션 디자이너</h2>
                <p className="text-sm text-muted-foreground">
                  AI와 대화하며 전문적인 PPT를 만들어보세요
                </p>
              </div>

              {/* Templates */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  템플릿으로 시작하기
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'profile', name: '자기소개', icon: '👤', desc: '면접, 네트워킹' },
                    { id: 'tech-seminar', name: '기술 세미나', icon: '💻', desc: '개발자' },
                    { id: 'paper-summary', name: '논문 요약', icon: '📄', desc: '학생, 연구원' },
                    { id: 'project-intro', name: '과제 소개', icon: '📁', desc: '팀원' },
                  ].map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateSelect(template.id as TemplateType)}
                      disabled={presentationChatStreaming}
                      className="flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 hover:border-primary/50 transition-all group"
                    >
                      <span className="text-xl group-hover:scale-110 transition-transform">
                        {template.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{template.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{template.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">또는</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Custom Start */}
              <div className="text-center text-sm text-muted-foreground">
                아래에서 원하는 주제를 직접 입력하세요
              </div>
            </div>
          </div>
        ) : (
          /* Chat Messages */
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {presentationChatMessages.map((msg, idx) => {
              const isLastMessage = idx === presentationChatMessages.length - 1;
              const isStreaming =
                isLastMessage && presentationChatStreaming && msg.role === 'assistant';

              return (
                <div
                  key={msg.id}
                  className={`rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'ml-8 bg-primary text-primary-foreground'
                      : 'mr-8 bg-muted/60'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sparkles className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">
                        Designer
                      </span>
                      {isStreaming && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                    </div>
                  )}
                  <div className="text-sm leading-relaxed">
                    {msg.content ? (
                      <MessageContent content={msg.content} isStreaming={isStreaming} />
                    ) : isStreaming ? (
                      <span className="text-muted-foreground">생성 중...</span>
                    ) : (
                      ''
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Structure Preview (Collapsible, shown only when structure exists) */}
        {presentationAgentState?.structure && !showOnboarding && (
          <details className="mx-4 mb-2 group">
            <summary className="flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs hover:bg-muted/50 transition-colors">
              <ChevronRight className="h-3 w-3 text-muted-foreground transition-transform group-open:rotate-90" />
              <LayoutList className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">
                구조 ({presentationAgentState.structure.totalSlides}장)
              </span>
              {currentStep === 'slide-creation' && (
                <span className="ml-auto text-muted-foreground">
                  {presentationAgentState.completedSlideIndices.length} /{' '}
                  {presentationAgentState.structure.totalSlides} 완료
                </span>
              )}
            </summary>
            <div className="mt-1 rounded-lg border bg-card px-3 py-2 space-y-1 max-h-32 overflow-y-auto">
              {presentationAgentState.structure.outline.map((slide, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 text-xs py-0.5 ${
                    presentationAgentState.completedSlideIndices.includes(idx)
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-muted-foreground'
                  }`}
                >
                  {presentationAgentState.completedSlideIndices.includes(idx) ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <span className="w-3 text-center font-mono">{idx + 1}</span>
                  )}
                  <span className="flex-1 truncate">{slide.title}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Quick Actions (shown above input when applicable) */}
      {quickPrompts.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((quick) => {
              const hasDesignOption = 'designOption' in quick && quick.designOption;
              return (
                <Button
                  key={quick.label}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => {
                    const isBulkCreation =
                      quick.label === '전부 자동 생성' || quick.label === '자동으로 생성';
                    handleSend(quick.prompt, isBulkCreation);
                  }}
                  disabled={presentationChatStreaming}
                >
                  {hasDesignOption && (
                    <div className="flex gap-0.5">
                      <div
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: quick.designOption.palette.primary }}
                      />
                      <div
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: quick.designOption.palette.accent }}
                      />
                    </div>
                  )}
                  {quick.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t bg-background px-4 py-3">
        <div className="flex gap-2">
          <Textarea
            placeholder={
              showOnboarding
                ? '프레젠테이션 주제를 입력하세요... (예: AI 기술 동향 발표)'
                : '메시지를 입력하세요...'
            }
            value={input}
            disabled={presentationChatStreaming}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 min-h-[60px] max-h-[120px] resize-none text-sm"
          />
          <Button
            onClick={() => handleSend()}
            disabled={presentationChatStreaming || !input.trim()}
            className="h-[60px] w-[60px] shrink-0"
          >
            {presentationChatStreaming ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
          Enter로 전송 · Shift+Enter로 줄바꿈
        </p>
      </div>
    </div>
  );
}
