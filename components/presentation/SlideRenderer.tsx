'use client';

import { useState } from 'react';
import type { PresentationSlide } from '@/types/presentation';
import { CheckCircle2, TrendingUp, Calendar, Grid3x3, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface SlideRendererProps {
  slide: PresentationSlide | undefined;
  className?: string;
  isEditable?: boolean;
  onSlideChange?: (slide: PresentationSlide) => void;
  onAddBullet?: () => void;
  onRemoveBullet?: (index: number) => void;
}

export function SlideRenderer({
  slide,
  className = '',
  isEditable = false,
  onSlideChange,
  onAddBullet,
  onRemoveBullet,
}: SlideRendererProps) {
  // Early return if slide is undefined
  if (!slide) {
    return (
      <div
        className={`flex h-full items-center justify-center rounded-lg border bg-muted/20 ${className}`}
      >
        <p className="text-sm text-muted-foreground">슬라이드를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const getBackgroundStyle = () => {
    const accent = slide.accentColor || '#0ea5e9';

    // Use backgroundColor if provided (for template-specific designs)
    if (slide.backgroundColor) {
      return {
        background: slide.backgroundColor,
      };
    }

    // Fallback: Gradient backgrounds based on vibe
    if (slide.vibe?.includes('dark')) {
      return {
        background: `linear-gradient(135deg, #0f172a 0%, ${accent}15 100%)`,
      };
    }
    if (slide.vibe?.includes('minimal')) {
      return {
        background: `linear-gradient(135deg, #ffffff 0%, ${accent}08 100%)`,
      };
    }
    // Default: modern gradient
    return {
      background: `linear-gradient(135deg, ${accent}10 0%, ${accent}02 50%, #ffffff 100%)`,
    };
  };

  const renderLayout = () => {
    const layoutProps = {
      slide,
      isEditable,
      onSlideChange,
      onAddBullet,
      onRemoveBullet,
    };

    console.log('SlideRenderer - renderLayout called', {
      layout: slide.layout,
      isEditable,
      slideTitle: slide.title,
    });

    switch (slide.layout) {
      case 'hero':
        return <HeroLayout {...layoutProps} />;
      case 'two-column':
        return <TwoColumnLayout {...layoutProps} />;
      case 'timeline':
        return <TimelineLayout {...layoutProps} />;
      case 'grid':
        return <GridLayout {...layoutProps} />;
      default:
        return <TitleBodyLayout {...layoutProps} />;
    }
  };

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-lg shadow-2xl ${className}`}
      style={getBackgroundStyle()}
    >
      {renderLayout()}

      {/* Slide number indicator */}
      <div className="absolute bottom-6 right-8 text-sm font-medium opacity-40">
        {slide.accentColor && (
          <div className="h-1 w-12 rounded-full" style={{ backgroundColor: slide.accentColor }} />
        )}
      </div>
    </div>
  );
}

// Hero Layout: Full-screen title with large typography
function HeroLayout({ slide }: { slide: PresentationSlide }) {
  const textColor = slide.textColor || (slide.vibe?.includes('dark') ? '#f8fafc' : '#1e293b');
  const imageSource = slide.imageData || slide.imageUrl;

  return (
    <div className="flex h-full flex-col items-center justify-center px-16 text-center">
      <h1
        className="mb-4 text-4xl font-bold leading-tight"
        style={{ color: slide.accentColor || textColor }}
      >
        {slide.title}
      </h1>
      {slide.subtitle && (
        <p className="mb-6 text-lg font-medium opacity-70" style={{ color: textColor }}>
          {slide.subtitle}
        </p>
      )}
      {slide.description && (
        <p className="max-w-3xl text-base font-normal opacity-80" style={{ color: textColor }}>
          {slide.description}
        </p>
      )}
      {imageSource && (
        <div className="mt-8 max-w-2xl">
          <img src={imageSource} alt={slide.title} className="rounded-lg shadow-lg" />
        </div>
      )}
    </div>
  );
}

// Title-Body Layout: Classic slide with title and bullet points
function TitleBodyLayout({
  slide,
  isEditable,
  onSlideChange,
  onAddBullet,
  onRemoveBullet,
}: {
  slide: PresentationSlide;
  isEditable?: boolean;
  onSlideChange?: (slide: PresentationSlide) => void;
  onAddBullet?: () => void;
  onRemoveBullet?: (index: number) => void;
}) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const textColor = slide.textColor || (slide.vibe?.includes('dark') ? '#f8fafc' : '#1e293b');
  const accentColor = slide.accentColor || '#0ea5e9';
  const imageSource = slide.imageData || slide.imageUrl;

  console.log('TitleBodyLayout rendered', {
    isEditable,
    editingField,
    slideTitle: slide.title,
  });

  return (
    <div className="flex h-full flex-col px-12 py-10">
      {/* Title Section */}
      <div className="mb-6 border-l-4 pl-4" style={{ borderColor: accentColor }}>
        {/* Title */}
        {isEditable && editingField === 'title' ? (
          <Input
            value={slide.title}
            onChange={(e) => onSlideChange?.({ ...slide, title: e.target.value })}
            onBlur={() => setEditingField(null)}
            autoFocus
            className="text-3xl font-bold border-2 border-primary bg-white/20 p-2"
            style={{ color: textColor }}
            placeholder="제목을 입력하세요"
          />
        ) : (
          <h2
            className={`text-3xl font-bold ${isEditable ? 'cursor-pointer hover:bg-yellow-100/30 rounded px-2 py-1 transition-colors border-2 border-dashed border-transparent hover:border-yellow-400' : ''}`}
            style={{ color: textColor }}
            onClick={(e) => {
              e.stopPropagation();
              if (isEditable) {
                console.log('Title clicked, setting editingField to title');
                setEditingField('title');
              }
            }}
          >
            {slide.title || (isEditable ? '제목을 입력하세요' : '')}
          </h2>
        )}

        {/* Subtitle */}
        {(slide.subtitle || isEditable) && (
          <>
            {isEditable && editingField === 'subtitle' ? (
              <Input
                value={slide.subtitle || ''}
                onChange={(e) => onSlideChange?.({ ...slide, subtitle: e.target.value })}
                onBlur={() => setEditingField(null)}
                autoFocus
                className="mt-2 text-base font-medium opacity-70 border-2 border-primary bg-white/20 p-2"
                style={{ color: textColor }}
                placeholder="부제목 (선택사항)"
              />
            ) : (
              <p
                className={`mt-2 text-base font-medium opacity-70 ${isEditable ? 'cursor-pointer hover:bg-yellow-100/30 rounded px-2 py-1 transition-colors border-2 border-dashed border-transparent hover:border-yellow-400' : ''}`}
                style={{ color: textColor }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isEditable) {
                    console.log('Subtitle clicked');
                    setEditingField('subtitle');
                  }
                }}
              >
                {slide.subtitle || (isEditable ? '부제목 (선택사항)' : '')}
              </p>
            )}
          </>
        )}

        {/* Description */}
        {(slide.description || isEditable) && (
          <>
            {isEditable && editingField === 'description' ? (
              <Textarea
                value={slide.description || ''}
                onChange={(e) => onSlideChange?.({ ...slide, description: e.target.value })}
                onBlur={() => setEditingField(null)}
                autoFocus
                className="mt-2 text-sm opacity-60 border-2 border-primary bg-white/20 p-2 resize-none"
                style={{ color: textColor }}
                placeholder="설명 (선택사항)"
                rows={2}
              />
            ) : (
              <p
                className={`mt-2 text-sm opacity-60 ${isEditable ? 'cursor-pointer hover:bg-yellow-100/30 rounded px-2 py-1 transition-colors border-2 border-dashed border-transparent hover:border-yellow-400' : ''}`}
                style={{ color: textColor }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isEditable) {
                    console.log('Description clicked');
                    setEditingField('description');
                  }
                }}
              >
                {slide.description || (isEditable ? '설명 (선택사항)' : '')}
              </p>
            )}
          </>
        )}
      </div>

      {/* Content Section */}
      <div className="flex flex-1 gap-6">
        <div className="flex-1">
          {slide.bullets && slide.bullets.length > 0 && (
            <ul className="space-y-3">
              {slide.bullets.map((bullet, idx) => {
                const bulletField = `bullet-${idx}`;
                const isEditingBullet = isEditable && editingField === bulletField;

                return (
                  <li key={idx} className="flex items-start gap-3">
                    <CheckCircle2
                      className="mt-0.5 h-5 w-5 flex-shrink-0"
                      style={{ color: accentColor }}
                    />
                    {isEditingBullet ? (
                      <div className="flex-1 flex items-center gap-2">
                        <Input
                          value={bullet}
                          onChange={(e) => {
                            const newBullets = [...(slide.bullets || [])];
                            newBullets[idx] = e.target.value;
                            onSlideChange?.({ ...slide, bullets: newBullets });
                          }}
                          onBlur={() => setEditingField(null)}
                          autoFocus
                          className="text-sm border-2 border-primary bg-white/20 p-2"
                          style={{ color: textColor }}
                          placeholder={`불릿 포인트 ${idx + 1}`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 opacity-50 hover:opacity-100"
                          onClick={() => onRemoveBullet?.(idx)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <span
                        className={`text-sm leading-relaxed flex-1 ${isEditable ? 'cursor-pointer hover:bg-yellow-100/30 rounded px-2 py-1 transition-colors border-2 border-dashed border-transparent hover:border-yellow-400' : ''}`}
                        style={{ color: textColor }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isEditable) {
                            console.log('Bullet clicked:', bulletField);
                            setEditingField(bulletField);
                          }
                        }}
                      >
                        {bullet || (isEditable ? '불릿 포인트를 입력하세요' : '')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {isEditable && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAddBullet}
              className="mt-3"
              style={{ borderColor: accentColor, color: accentColor }}
            >
              + 불릿 추가
            </Button>
          )}
        </div>

        {/* Image Section */}
        {imageSource && (
          <div className="w-80 flex-shrink-0">
            <img
              src={imageSource}
              alt={slide.title}
              className="h-full w-full rounded-lg object-cover shadow-lg"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Two-Column Layout: Split content design
function TwoColumnLayout({ slide }: { slide: PresentationSlide }) {
  const textColor = slide.textColor || (slide.vibe?.includes('dark') ? '#f8fafc' : '#1e293b');
  const accentColor = slide.accentColor || '#0ea5e9';
  const imageSource = slide.imageData || slide.imageUrl;

  return (
    <div className="flex h-full flex-col px-12 py-10">
      {/* Title */}
      <div className="mb-6 text-center">
        <h2 className="text-3xl font-bold" style={{ color: textColor }}>
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p className="mt-2 text-base font-medium opacity-70" style={{ color: textColor }}>
            {slide.subtitle}
          </p>
        )}
        {slide.description && (
          <p className="mt-2 text-sm opacity-60" style={{ color: textColor }}>
            {slide.description}
          </p>
        )}
      </div>

      {/* Two Columns */}
      <div className="flex flex-1 gap-6">
        {/* Left Column */}
        <div className="flex-1 rounded-xl bg-white/50 p-6 backdrop-blur-sm dark:bg-black/20">
          {slide.bullets &&
            slide.bullets.slice(0, Math.ceil(slide.bullets.length / 2)).map((bullet, idx) => (
              <div key={idx} className="mb-3 flex items-start gap-2">
                <div
                  className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="text-sm leading-relaxed" style={{ color: textColor }}>
                  {bullet}
                </span>
              </div>
            ))}
        </div>

        {/* Right Column */}
        <div className="flex-1 rounded-xl bg-white/50 p-6 backdrop-blur-sm dark:bg-black/20">
          {slide.bullets &&
            slide.bullets.slice(Math.ceil(slide.bullets.length / 2)).map((bullet, idx) => (
              <div key={idx} className="mb-3 flex items-start gap-2">
                <div
                  className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="text-sm leading-relaxed" style={{ color: textColor }}>
                  {bullet}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Image Section (if exists) */}
      {imageSource && (
        <div className="mt-4">
          <img
            src={imageSource}
            alt={slide.title}
            className="mx-auto max-h-40 rounded-lg object-cover shadow-lg"
          />
        </div>
      )}
    </div>
  );
}

// Timeline Layout: Process or roadmap visualization
function TimelineLayout({ slide }: { slide: PresentationSlide }) {
  const textColor = slide.textColor || (slide.vibe?.includes('dark') ? '#f8fafc' : '#1e293b');
  const accentColor = slide.accentColor || '#0ea5e9';
  const steps = slide.bullets || [];
  const imageSource = slide.imageData || slide.imageUrl;

  return (
    <div className="flex h-full flex-col px-12 py-10">
      {/* Title */}
      <div className="mb-6 text-center">
        <h2 className="text-3xl font-bold" style={{ color: textColor }}>
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p className="mt-2 text-base font-medium opacity-70" style={{ color: textColor }}>
            {slide.subtitle}
          </p>
        )}
        {slide.description && (
          <p className="mt-2 text-sm opacity-60" style={{ color: textColor }}>
            {slide.description}
          </p>
        )}
      </div>

      {/* Timeline Steps */}
      <div className="relative flex flex-1 items-center justify-center">
        <div className="flex w-full items-start justify-between gap-3">
          {steps.map((step, idx) => (
            <div key={idx} className="flex flex-1 flex-col items-center">
              {/* Step Number */}
              <div
                className="mb-3 flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg"
                style={{ backgroundColor: accentColor }}
              >
                {idx + 1}
              </div>

              {/* Step Content */}
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: textColor }}>
                  {step}
                </p>
              </div>

              {/* Connector Line */}
              {idx < steps.length - 1 && (
                <div
                  className="absolute top-6 h-0.5"
                  style={{
                    left: `${(idx + 0.5) * (100 / steps.length)}%`,
                    width: `${100 / steps.length}%`,
                    backgroundColor: `${accentColor}40`,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Image Section (if exists) */}
      {imageSource && (
        <div className="mt-4">
          <img
            src={imageSource}
            alt={slide.title}
            className="mx-auto max-h-32 rounded-lg object-cover shadow-lg"
          />
        </div>
      )}

      {/* Calendar Icon */}
      {!imageSource && (
        <div className="mt-4 flex justify-center">
          <Calendar className="h-6 w-6 opacity-30" style={{ color: accentColor }} />
        </div>
      )}
    </div>
  );
}

// Grid Layout: Data or feature showcase
function GridLayout({ slide }: { slide: PresentationSlide }) {
  const textColor = slide.textColor || (slide.vibe?.includes('dark') ? '#f8fafc' : '#1e293b');
  const accentColor = slide.accentColor || '#0ea5e9';
  const items = slide.bullets || [];
  const imageSource = slide.imageData || slide.imageUrl;

  return (
    <div className="flex h-full flex-col px-12 py-10">
      {/* Title */}
      <div className="mb-6 text-center">
        <h2 className="text-3xl font-bold" style={{ color: textColor }}>
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p className="mt-2 text-base font-medium opacity-70" style={{ color: textColor }}>
            {slide.subtitle}
          </p>
        )}
        {slide.description && (
          <p className="mt-2 text-sm opacity-60" style={{ color: textColor }}>
            {slide.description}
          </p>
        )}
      </div>

      {/* Grid Items */}
      <div className="grid flex-1 grid-cols-2 gap-4">
        {items.slice(0, 4).map((item, idx) => (
          <div
            key={idx}
            className="flex flex-col items-center justify-center rounded-xl bg-white/60 p-6 text-center backdrop-blur-sm dark:bg-black/30"
          >
            <div
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              <TrendingUp className="h-6 w-6" style={{ color: accentColor }} />
            </div>
            <p className="text-sm font-medium" style={{ color: textColor }}>
              {item}
            </p>
          </div>
        ))}
      </div>

      {/* Image Section (if exists) */}
      {imageSource && (
        <div className="mt-4">
          <img
            src={imageSource}
            alt={slide.title}
            className="mx-auto max-h-32 rounded-lg object-cover shadow-lg"
          />
        </div>
      )}

      {/* Grid Icon */}
      {!imageSource && (
        <div className="mt-4 flex justify-center">
          <Grid3x3 className="h-6 w-6 opacity-30" style={{ color: accentColor }} />
        </div>
      )}
    </div>
  );
}
