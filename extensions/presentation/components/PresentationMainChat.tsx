'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useChatStore } from '@/lib/store/chat-store';
import { runPresentationAgent, createInitialState } from '../lib/ppt-agent';
import { generateId } from '@/lib/utils/id-generator';
import { PRESENTATION_TEMPLATES, type TemplateType } from '../lib/templates';
import { Loader2, Send, Sparkles, StopCircle, FileText, Search, ArrowRight } from 'lucide-react';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// Message renderer
function MessageContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const cleanedContent = content.replace(/```json[\s\S]*?```/g, '').trim();

  // If content exists but cleaning removed everything, it means it was a pure action message
  // We should try to show something meaningful or just nothing (if the action effect is visible elsewhere)
  // But empty bubble looks bad. Let's check what action it was if possible, or show a generic "Action executed"

  if (!cleanedContent && content.includes('```json')) {
    // Try to parse action to show better message
    try {
      const match = content.match(/```json\s*([\s\S]*?)```/);
      if (match) {
        const action = JSON.parse(match[1]);
        switch (action.action) {
          case 'create_slide':
            return (
              <div className="text-xs italic opacity-70">
                ✨ 슬라이드 {action.slideIndex + 1}번을 생성했습니다.
              </div>
            );
          case 'modify_slide':
            return (
              <div className="text-xs italic opacity-70">
                ✏️ 슬라이드 {action.slideIndex + 1}번을 수정했습니다.
              </div>
            );
          case 'insert_slide':
            return (
              <div className="text-xs italic opacity-70">
                ➕ 슬라이드 {(action.atIndex || 0) + 1}번 위치에 추가했습니다.
              </div>
            );
          case 'delete_slide':
            return <div className="text-xs italic opacity-70">🗑️ 슬라이드를 삭제했습니다.</div>;
          case 'reorder_slides':
            return <div className="text-xs italic opacity-70">🔄 순서를 변경했습니다.</div>;
          case 'update_design':
            return <div className="text-xs italic opacity-70">🎨 디자인을 업데이트했습니다.</div>;
          case 'complete_all_slides':
          case 'finalize_presentation':
            return <div className="text-xs italic opacity-70">✅ 작업이 완료되었습니다.</div>;
          default:
            return <div className="text-xs italic opacity-70">⚡ 작업을 수행했습니다.</div>;
        }
      }
    } catch (e) {
      // parsing failed, just ignore
    }
    return null; // Don't show empty text bubble if we can't parse
  }

  return (
    <MarkdownRenderer
      content={cleanedContent}
      isStreaming={isStreaming}
      className="text-sm prose dark:prose-invert max-w-none [&_p]:leading-relaxed"
    />
  );
}

export function PresentationMainChat() {
  const {
    presentationChatMessages,
    presentationChatStreaming,
    presentationAgentState,
    presentationSlides,
    activePresentationSlideId,
    presentationSources,
    addPresentationChatMessage,
    updatePresentationChatMessage,
    setPresentationChatStreaming,
    setPresentationSlides,
    setActivePresentationSlide,
    setPresentationAgentState,
  } = useChatStore();

  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize state
  useEffect(() => {
    if (!presentationAgentState) {
      setPresentationAgentState(createInitialState());
    }
  }, [presentationAgentState, setPresentationAgentState]);

  // Auto-scroll
  useEffect(() => {
    if (presentationChatStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [presentationChatStreaming, presentationChatMessages]);

  const handleTemplateSelect = (templateId: TemplateType) => {
    const template = PRESENTATION_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    const templateState = template.generateState();

    setPresentationAgentState(templateState);
    setPresentationSlides(templateState.slides);

    if (templateState.slides.length > 0) {
      setActivePresentationSlide(templateState.slides[0].id);
    }

    addPresentationChatMessage({
      role: 'assistant',
      content: `✅ "${template.name}" 템플릿이 적용되었습니다!\n\n**브리핑 내용:**\n- 주제: ${templateState.brief?.topic}\n- 슬라이드: ${templateState.slides.length}장\n- 청중: ${templateState.brief?.audience}`,
    });
  };

  const handleSend = async (message?: string) => {
    const userMessage = message ?? input;
    if (!userMessage.trim() || presentationChatStreaming || !presentationAgentState) return;

    setInput('');
    setPresentationChatStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    // Check for active sources
    const activeSources = presentationSources.filter((s) => s.isActive);
    let contextMessage = userMessage;

    // Inject source context if available (naive implementation for now)
    // In a real RAG system, this would happen in the backend/agent layer
    if (activeSources.length > 0) {
      // Just for demo purposes, we don't actually inject the full text here to avoid bloat
      // The agent should be aware of 'sources' in its state if we updated the agent logic
      // For now, we assume the agent tool will pick it up or we pass it via prompt augmentation
    }

    const newUserMessage = {
      id: generateId(),
      role: 'user' as const,
      content: userMessage, // pure user message for UI
      conversation_id: 'presentation-chat',
      created_at: Date.now(),
    };

    addPresentationChatMessage({ role: 'user', content: userMessage });
    addPresentationChatMessage({ role: 'assistant', content: '' });

    const messagesWithNewUser = [...presentationChatMessages, newUserMessage];

    let buffer = '';
    try {
      // Sync active slide context to agent state
      const currentState = { ...presentationAgentState };
      if (activePresentationSlideId) {
        const activeIndex = presentationSlides.findIndex((s) => s.id === activePresentationSlideId);
        if (activeIndex !== -1) {
          currentState.currentSlideIndex = activeIndex;
        }
      }

      const { response, state } = await runPresentationAgent(messagesWithNewUser, currentState, {
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
            // Determine if we should switch focus or just update background
            // For now, let's keep it simple
          }
        },
      });

      if (!buffer && response) {
        const messages = useChatStore.getState().presentationChatMessages;
        const last = messages[messages.length - 1];
        if (last?.role === 'assistant') {
          updatePresentationChatMessage(last.id, { content: response });
        }
      }

      // Sync slides one last time
      if (state.slides.length > 0 && presentationSlides.length !== state.slides.length) {
        setPresentationSlides(state.slides);
        if (!activePresentationSlideId) {
          setActivePresentationSlide(state.slides[0].id);
        }
      }
    } catch (error) {
      console.error('[PresentationChat] agent error', error);
      const messages = useChatStore.getState().presentationChatMessages;
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') {
        updatePresentationChatMessage(last.id, {
          content: error instanceof Error ? `Error: ${error.message}` : 'Unknown error',
        });
      }
    } finally {
      setPresentationChatStreaming(false);
      abortRef.current = null;
    }
  };

  const hasMessages = presentationChatMessages.length > 0;

  return (
    <div className="flex h-full flex-col bg-background relative">
      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Onboarding / Empty State */}
          {!hasMessages && (
            <div className="text-center space-y-8 mt-12">
              <div className="space-y-4">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 shadow-sm">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {t('presentation.onboarding.title') || 'What would you like to create?'}
                </h1>
                <p className="text-muted-foreground text-sm max-w-[400px] mx-auto">
                  Use the sidebar to add sources, or start from a template below.
                </p>
              </div>

              {/* Templates Grid */}
              <div className="grid grid-cols-2 gap-3 text-left">
                {[
                  {
                    id: 'profile',
                    name: 'Self Introduction',
                    icon: '👤',
                    desc: 'Interview, Networking',
                  },
                  { id: 'tech-seminar', name: 'Tech Seminar', icon: '💻', desc: 'For Developers' },
                  {
                    id: 'paper-summary',
                    name: 'Paper Summary',
                    icon: '📄',
                    desc: 'Research & Study',
                  },
                  {
                    id: 'project-intro',
                    name: 'Project Kickoff',
                    icon: '🚀',
                    desc: 'Team Alignment',
                  },
                ].map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateSelect(template.id as TemplateType)}
                    className="p-4 rounded-xl border bg-card hover:bg-muted/50 hover:border-primary/30 transition-all group relative overflow-hidden"
                  >
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-2xl mb-2">{template.icon}</div>
                    <div className="font-medium text-sm">{template.name}</div>
                    <div className="text-xs text-muted-foreground">{template.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message List */}
          {presentationChatMessages.map((msg, idx) => {
            const isLast = idx === presentationChatMessages.length - 1;
            const isBot = msg.role === 'assistant';
            const isStreaming = isLast && isBot && presentationChatStreaming;

            return (
              <div
                key={msg.id}
                className={cn('flex flex-col gap-2', isBot ? 'items-start' : 'items-end')}
              >
                {isBot && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground ml-1">
                    <Sparkles className="h-3 w-3" />
                    <span>AI Assistant</span>
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl p-4 text-sm shadow-sm',
                    isBot ? 'bg-card border' : 'bg-primary text-primary-foreground'
                  )}
                >
                  {msg.content ? (
                    <MessageContent content={msg.content} isStreaming={isStreaming} />
                  ) : isStreaming ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Designing...</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic text-xs">No content</span>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} className="h-10" />
        </div>
      </div>

      {/* Input Dock */}
      <div className="p-4 bg-background/80 backdrop-blur-sm border-t absolute bottom-0 left-0 right-0 z-10">
        <div className="max-w-2xl mx-auto relative group">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              hasMessages
                ? 'Ask for changes or new slides...'
                : 'Describe your presentation topic...'
            }
            className="min-h-[56px] max-h-[200px] resize-none pr-12 rounded-xl shadow-sm border-muted-foreground/20 focus-visible:ring-primary/30"
          />
          <Button
            size="icon"
            className="absolute right-2 bottom-2 h-8 w-8 rounded-lg shadow-none"
            disabled={!input.trim() || presentationChatStreaming}
            onClick={() => handleSend()}
          >
            {presentationChatStreaming ? (
              <StopCircle className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {presentationSources.filter((s) => s.isActive).length > 0 && (
          <div className="max-w-2xl mx-auto mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" />
            <span>{presentationSources.filter((s) => s.isActive).length} sources active</span>
          </div>
        )}
      </div>
    </div>
  );
}
