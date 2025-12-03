'use client';

import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { generateId } from '@/lib/utils';
import { Image as ImageIcon, LayoutTemplate, Palette } from 'lucide-react';

const ACCENT_COLORS = ['#7c3aed', '#0ea5e9', '#22c55e', '#f97316', '#06b6d4', '#ef4444'];

export function SlidePreview() {
  const {
    presentationSlides,
    activePresentationSlideId,
    setActivePresentationSlide,
    addPresentationSlide,
  } = useChatStore();

  const handleAddSlide = () => {
    const accentColor = ACCENT_COLORS[presentationSlides.length % ACCENT_COLORS.length];
    addPresentationSlide({
      id: generateId(),
      title: '새 슬라이드',
      description: 'ppt-agent가 채울 내용을 입력하거나 직접 수정하세요.',
      bullets: ['핵심 메시지', '지원 근거', '시각 요소 제안'],
      accentColor,
      layout: 'title-body',
      typography: 'Sora / Inter',
      vibe: 'modern tech',
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">슬라이드 미리보기</p>
          <p className="text-xs text-muted-foreground">
            AI가 제안한 개요와 이미지 프롬프트를 한눈에 확인하세요.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={handleAddSlide}>
          <LayoutTemplate className="mr-2 h-4 w-4" />
          수동 추가
        </Button>
      </div>

      {presentationSlides.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-sm text-muted-foreground">아직 생성된 슬라이드가 없습니다.</div>
          <div className="text-xs text-muted-foreground">
            좌측 Sidebar에서 브리핑을 보내거나 수동으로 추가하세요.
          </div>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-3">
          {presentationSlides.map((slide) => (
            <button
              key={slide.id}
              onClick={() => setActivePresentationSlide(slide.id)}
              className={`flex flex-col rounded-lg border p-3 text-left transition hover:shadow-sm ${
                activePresentationSlideId === slide.id ? 'border-primary shadow-sm' : ''
              }`}
            >
              <div
                className="mb-2 aspect-video w-full rounded-md border bg-gradient-to-br from-background to-muted relative overflow-hidden"
                style={{
                  borderColor: slide.accentColor || undefined,
                  boxShadow: slide.accentColor
                    ? `0 0 0 2px ${slide.accentColor}30 inset`
                    : undefined,
                }}
              >
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-[11px] font-semibold">
                  <Palette className="h-3 w-3" />
                  {slide.accentColor || 'palette'}
                </div>
                {slide.imageUrl ? (
                  <img
                    src={slide.imageUrl}
                    alt={slide.title}
                    className="h-full w-full rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                    <ImageIcon className="mr-1 h-4 w-4" />
                    이미지 프롬프트: {slide.imagePrompt || 'AI가 제안 예정'}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{slide.title}</p>
                  {slide.accentColor && (
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: slide.accentColor }}
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  {slide.layout && (
                    <span className="rounded-full border px-2 py-0.5">{slide.layout}</span>
                  )}
                  {slide.vibe && (
                    <span className="rounded-full border px-2 py-0.5">{slide.vibe}</span>
                  )}
                  {slide.typography && (
                    <span className="rounded-full border px-2 py-0.5">{slide.typography}</span>
                  )}
                  {slide.slots?.chart && (
                    <span className="rounded-full border px-2 py-0.5">
                      chart:{slide.slots.chart.type}
                    </span>
                  )}
                  {slide.slots?.timeline && (
                    <span className="rounded-full border px-2 py-0.5">
                      timeline:{slide.slots.timeline.steps}
                    </span>
                  )}
                </div>
                {slide.description && (
                  <p className="text-xs text-muted-foreground">{slide.description}</p>
                )}
                {slide.bullets && (
                  <ul className="list-disc space-y-1 pl-4 text-xs text-foreground">
                    {slide.bullets.slice(0, 4).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
