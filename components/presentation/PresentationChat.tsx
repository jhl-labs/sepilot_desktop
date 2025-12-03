'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useChatStore } from '@/lib/store/chat-store';
import { runPresentationAgent } from '@/lib/presentation/ppt-agent';
import type { PresentationExportFormat } from '@/types/presentation';
import { ChevronDown, ChevronUp, Loader2, Send, Sparkles, StopCircle } from 'lucide-react';

const QUICK_BRIEFS = [
  'AI/Edge 전략 브리핑, 8 슬라이드, 하이테크 무드',
  '피치덱: 문제-해결-제품-트랙션-로드맵, 6 슬라이드',
  '워크숍 아젠다 + 페르소나/저니/아키텍처 개요, 10 슬라이드',
];

export function PresentationChat() {
  const {
    presentationChatMessages,
    presentationChatStreaming,
    addPresentationChatMessage,
    updatePresentationChatMessage,
    setPresentationChatStreaming,
    setPresentationSlides,
    setActivePresentationSlide,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tone, setTone] = useState('Bold & modern');
  const [targetFormat, setTargetFormat] = useState<PresentationExportFormat>('pptx');
  const [visualDirection, setVisualDirection] = useState('Dark neon tech with clean grids');
  const [palette, setPalette] = useState('#0ea5e9,#7c3aed,#0f172a,#e2e8f0');
  const [typography, setTypography] = useState('Sora Bold / Inter Regular');
  const abortRef = useRef<AbortController | null>(null);

  const handleSend = async (message?: string) => {
    const userMessage = message ?? input;
    if (!userMessage.trim() || presentationChatStreaming) {
      return;
    }

    setInput('');
    setPresentationChatStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    // Persist history + streaming slot
    addPresentationChatMessage({ role: 'user', content: userMessage });
    addPresentationChatMessage({ role: 'assistant', content: '' });

    let buffer = '';
    try {
      // runPresentationAgent는 이제 전체 Message 객체를 받으므로 그대로 전달
      const { response } = await runPresentationAgent(
        presentationChatMessages,
        {
          tone,
          targetFormat,
          visualDirection,
          theme: {
            palette: palette.split(',').map((c) => c.trim()),
            typography,
            layoutGuidelines: '16:9 grid, 32px margin, max 8 lines per slide, avoid dense text',
          },
        },
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
          onSlides: (slides) => {
            setPresentationSlides(slides);
            setActivePresentationSlide(slides[0]?.id ?? null);
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
    } catch (error) {
      console.error('[PresentationChat] agent error', error);
      const messages = useChatStore.getState().presentationChatMessages;
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') {
        updatePresentationChatMessage(last.id, {
          content:
            '슬라이드 제안 중 오류가 발생했습니다. 다시 시도하거나 간단히 브리핑을 보내주세요.',
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">AI Presentation Designer</p>
              <p className="text-xs text-muted-foreground">대화로 슬라이드를 생성하세요</p>
            </div>
          </div>
          {presentationChatStreaming && (
            <Button size="sm" variant="destructive" onClick={handleStop}>
              <StopCircle className="h-4 w-4 mr-1" />
              중지
            </Button>
          )}
        </div>

        {/* Quick Briefs */}
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK_BRIEFS.map((brief) => (
            <Button
              key={brief}
              size="sm"
              variant="outline"
              className="text-xs h-auto py-1.5"
              onClick={() => handleSend(brief)}
              disabled={presentationChatStreaming}
            >
              {brief}
            </Button>
          ))}
        </div>

        {/* Advanced Settings Toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-xs h-7"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <span className="text-muted-foreground">고급 설정</span>
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>

        {/* Advanced Settings (Collapsible) */}
        {showAdvanced && (
          <div className="mt-2 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Tone</label>
                <input
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="Bold & modern"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Format</label>
                <select
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                  value={targetFormat}
                  onChange={(e) => setTargetFormat(e.target.value as PresentationExportFormat)}
                >
                  <option value="pptx">PPTX</option>
                  <option value="pdf">PDF</option>
                  <option value="html">HTML</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Visual Direction</label>
              <input
                className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                value={visualDirection}
                onChange={(e) => setVisualDirection(e.target.value)}
                placeholder="Dark neon tech with clean grids"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Color Palette</label>
              <input
                className="w-full rounded-md border bg-background px-2 py-1 text-xs font-mono"
                value={palette}
                onChange={(e) => setPalette(e.target.value)}
                placeholder="#0ea5e9,#7c3aed,..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Typography</label>
              <input
                className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                value={typography}
                onChange={(e) => setTypography(e.target.value)}
                placeholder="Sora Bold / Inter Regular"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {presentationChatMessages.length === 0 && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            브리핑을 보내면 ppt-agent가 슬라이드 개요와 이미지 프롬프트를 실시간으로 제안합니다.
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
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
                <span>{msg.role}</span>
                {isStreaming && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                {msg.content || (isStreaming ? '생성 중...' : '')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Area */}
      <div className="border-t px-4 py-3">
        <div className="flex gap-2">
          <Textarea
            placeholder="프레젠테이션 주제와 원하는 스타일을 입력하세요... (Enter: 전송, Shift+Enter: 줄바꿈)"
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
      </div>
    </div>
  );
}
