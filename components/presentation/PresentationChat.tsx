'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useChatStore } from '@/lib/store/chat-store';
import { runPresentationAgent } from '@/lib/presentation/ppt-agent';
import type { PresentationExportFormat } from '@/types/presentation';
import { Loader2, Sparkles, StopCircle } from 'lucide-react';
import { StylePresetBar } from './StylePresetBar';

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
    setPresentationViewMode,
  } = useChatStore();

  const [input, setInput] = useState('');
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
            setPresentationViewMode('outline');
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
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">대화로 설계</p>
            <p className="text-xs text-muted-foreground">
              비전·이미지 모델을 함께 쓰는 ReAct 플래너. 슬라이드 구조/이미지 프롬프트를 바로
              생성합니다.
            </p>
          </div>
          {presentationChatStreaming ? (
            <Button size="sm" variant="destructive" className="gap-2" onClick={handleStop}>
              <StopCircle className="h-4 w-4" />
              중지
            </Button>
          ) : (
            <div className="text-[11px] text-muted-foreground">
              턴 수 {presentationChatMessages.length}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_BRIEFS.map((brief) => (
            <Button
              key={brief}
              size="sm"
              variant="secondary"
              className="text-xs"
              onClick={() => handleSend(brief)}
              disabled={presentationChatStreaming}
            >
              <Sparkles className="mr-1 h-3 w-3" />
              {brief}
            </Button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Tone & Story</label>
            <input
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="Bold & modern"
            />
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
            <label className="text-[11px] text-muted-foreground">Export Target</label>
            <select
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
              value={targetFormat}
              onChange={(e) => setTargetFormat(e.target.value as PresentationExportFormat)}
            >
              <option value="pptx">pptx</option>
              <option value="pdf">pdf</option>
              <option value="html">html</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Palette (comma)</label>
            <input
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              placeholder="#0ea5e9,#7c3aed,#0f172a,#e2e8f0"
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
        <div className="mt-2">
          <label className="text-[11px] text-muted-foreground">스타일 프리셋</label>
          <StylePresetBar
            onSelect={(preset) => {
              setPalette(preset.palette);
              setTypography(preset.typography);
              setVisualDirection(preset.visual);
            }}
          />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {presentationChatMessages.length === 0 && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            브리핑을 보내면 ppt-agent가 슬라이드 개요와 이미지 프롬프트를 실시간으로 제안합니다.
          </div>
        )}
        {presentationChatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-lg border p-3 ${
              msg.role === 'user' ? 'bg-primary/5 border-primary/40' : 'bg-background'
            }`}
          >
            <div className="text-[11px] font-semibold uppercase text-muted-foreground">
              {msg.role}
            </div>
            <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
          </div>
        ))}
      </div>

      <div className="border-t px-4 py-3">
        <Textarea
          placeholder="주제, 톤, 원하는 시각적 레퍼런스, 필요한 슬라이드 수를 적어주세요."
          value={input}
          disabled={presentationChatStreaming}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="mb-2"
        />
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            비전/이미지 모델을 적극 활용하도록 프롬프트에 장면과 레이아웃을 구체적으로 작성하세요.
            (Enter: 전송, Shift+Enter: 줄바꿈)
          </div>
          <Button
            onClick={() => handleSend()}
            disabled={presentationChatStreaming || !input.trim()}
          >
            {presentationChatStreaming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            전송
          </Button>
        </div>
      </div>
    </div>
  );
}
