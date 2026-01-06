'use client';

import { useState } from 'react';
import type { PresentationSlide } from '../types';
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
  onAddBullet: onAddBullet,
  onRemoveBullet: onRemoveBullet,
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
      onAddBullet: onAddBullet,
      onRemoveBullet: onRemoveBullet,
    };

    switch (slide.layout) {
      case 'hero':
        return <HeroLayout {...layoutProps} />;
      case 'two-column':
        return <TwoColumnLayout {...layoutProps} />;
      case 'timeline':
        return <TimelineLayout {...layoutProps} />;
      case 'grid':
        return <GridLayout {...layoutProps} />;
      case 'stats':
        return <StatsLayout {...layoutProps} />;
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

// Hero Layout: High impact, centered design
function HeroLayout({
  slide,
  isEditable,
  onSlideChange,
}: {
  slide: PresentationSlide;
  isEditable?: boolean;
  onSlideChange?: (slide: PresentationSlide) => void;
}) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const textColor = slide.textColor || (slide.vibe?.includes('dark') ? '#f8fafc' : '#1e293b');

  // Hero: Use accent for subtitle by default
  const accentColor = slide.accentColor || '#0ea5e9';
  const imageSource = slide.imageData || slide.imageUrl;

  return (
    <div className="flex h-full flex-col items-center justify-center px-24 py-16 text-center relative z-10">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none opacity-30">
        <div
          className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[100px]"
          style={{ background: accentColor }}
        />
        <div
          className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] rounded-full blur-[80px]"
          style={{ background: accentColor }}
        />
      </div>

      {/* Subtitle (Top) */}
      {(slide.subtitle || isEditable) && (
        <div className="mb-6">
          {isEditable && editingField === 'subtitle' ? (
            <Input
              value={slide.subtitle || ''}
              onChange={(e) => onSlideChange?.({ ...slide, subtitle: e.target.value })}
              onBlur={() => setEditingField(null)}
              autoFocus
              className="text-xl font-bold tracking-widest uppercase text-center border-none bg-transparent focus:ring-0 shadow-none px-0 py-0 h-auto"
              style={{ color: accentColor }}
              placeholder="SUBTITLE"
            />
          ) : (
            <p
              className={`text-xl font-bold tracking-widest uppercase ${isEditable ? 'cursor-pointer hover:opacity-70 transition-opacity' : ''}`}
              style={{ color: accentColor }}
              onClick={(e) => {
                if (isEditable) {
                  e.stopPropagation();
                  setEditingField('subtitle');
                }
              }}
            >
              {slide.subtitle || (isEditable ? 'Add Subtitle' : '')}
            </p>
          )}
        </div>
      )}

      {/* Title (Center) */}
      <div className="mb-8 w-full max-w-4xl">
        {isEditable && editingField === 'title' ? (
          <Textarea
            value={slide.title}
            onChange={(e) => onSlideChange?.({ ...slide, title: e.target.value })}
            onBlur={() => setEditingField(null)}
            autoFocus
            // Auto-resize needs external lib or custom ref logic, using simple rows for now
            rows={slide.title.length > 30 ? 3 : 2}
            className="text-6xl font-black leading-tight text-center border-none bg-transparent focus:ring-0 shadow-none px-0 py-0 resize-none overflow-hidden"
            style={{ color: slide.textColor || textColor }}
            placeholder="Enter Title"
          />
        ) : (
          <h1
            className={`text-6xl font-black leading-tight ${isEditable ? 'cursor-pointer hover:scale-[1.01] transition-transform duration-200' : ''}`}
            style={{ color: slide.textColor || textColor }}
            onClick={(e) => {
              if (isEditable) {
                e.stopPropagation();
                setEditingField('title');
              }
            }}
          >
            {slide.title || (isEditable ? 'Enter Title' : '')}
          </h1>
        )}
      </div>

      {/* Description (Bottom) */}
      {(slide.description || isEditable) && (
        <div className="max-w-2xl">
          {isEditable && editingField === 'description' ? (
            <Textarea
              value={slide.description || ''}
              onChange={(e) => onSlideChange?.({ ...slide, description: e.target.value })}
              onBlur={() => setEditingField(null)}
              autoFocus
              className="text-2xl font-light leading-relaxed text-center border-none bg-transparent focus:ring-0 shadow-none px-0 py-0 resize-none"
              style={{ color: textColor, opacity: 0.8 }}
              placeholder="Add a description"
              rows={3}
            />
          ) : (
            <p
              className={`text-2xl font-light leading-relaxed opacity-80 ${isEditable ? 'cursor-pointer hover:opacity-100 transition-opacity' : ''}`}
              style={{ color: textColor }}
              onClick={(e) => {
                if (isEditable) {
                  e.stopPropagation();
                  setEditingField('description');
                }
              }}
            >
              {slide.description || (isEditable ? 'Add a description' : '')}
            </p>
          )}
        </div>
      )}

      {/* Hero Image support if needed (optional overlay or specific placement) */}
      {imageSource && (
        <div className="mt-12 w-full max-w-3xl rounded-xl overflow-hidden shadow-2xl skew-y-1 transform transition-all hover:skew-y-0 duration-500">
          <img src={imageSource} alt={slide.title} className="w-full object-cover max-h-[400px]" />
        </div>
      )}
    </div>
  );
}

// Title-Body Layout: Classic slide with title and bullet points
// Title-Body Layout: Modern, clean, and balanced
function TitleBodyLayout({
  slide,
  isEditable,
  onSlideChange,
  onAddBullet: onAddBullet,
  onRemoveBullet: onRemoveBullet,
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

  return (
    <div className="flex h-full flex-col px-16 py-12">
      {/* Header Section */}
      <div className="mb-10 w-full relative">
        {/* Accent Line */}
        <div
          className="absolute left-[-2rem] top-1 w-1.5 h-full rounded-full opacity-80"
          style={{ background: accentColor }}
        />

        <div className="flex flex-col gap-2">
          {/* Subtitle (above title for browline effect) */}
          {(slide.subtitle || isEditable) && (
            <div className="mb-1">
              {isEditable && editingField === 'subtitle' ? (
                <Input
                  value={slide.subtitle || ''}
                  onChange={(e) => onSlideChange?.({ ...slide, subtitle: e.target.value })}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                  className="text-sm font-bold tracking-wider uppercase border-none bg-transparent focus:ring-0 p-0 h-auto w-full"
                  style={{ color: accentColor }}
                  placeholder="SUBTITLE"
                />
              ) : (
                <p
                  className={`text-sm font-bold tracking-wider uppercase ${isEditable ? 'cursor-pointer hover:opacity-70' : ''}`}
                  style={{ color: accentColor }}
                  onClick={(e) => {
                    if (isEditable) {
                      e.stopPropagation();
                      setEditingField('subtitle');
                    }
                  }}
                >
                  {slide.subtitle || (isEditable ? 'SUBTITLE' : '')}
                </p>
              )}
            </div>
          )}

          {/* Title */}
          {isEditable && editingField === 'title' ? (
            <Input
              value={slide.title}
              onChange={(e) => onSlideChange?.({ ...slide, title: e.target.value })}
              onBlur={() => setEditingField(null)}
              autoFocus
              className="text-5xl font-extrabold leading-tight border-none bg-transparent focus:ring-0 p-0 h-auto"
              style={{ color: textColor }}
              placeholder="Slide Title"
            />
          ) : (
            <h2
              className={`text-5xl font-extrabold leading-tight ${isEditable ? 'cursor-pointer hover:opacity-80' : ''}`}
              style={{ color: textColor }}
              onClick={(e) => {
                if (isEditable) {
                  e.stopPropagation();
                  setEditingField('title');
                }
              }}
            >
              {slide.title || (isEditable ? 'Slide Title' : '')}
            </h2>
          )}
        </div>

        {/* Description underneath title */}
        {(slide.description || isEditable) && (
          <div className="mt-4 max-w-4xl">
            {isEditable && editingField === 'description' ? (
              <Textarea
                value={slide.description || ''}
                onChange={(e) => onSlideChange?.({ ...slide, description: e.target.value })}
                onBlur={() => setEditingField(null)}
                autoFocus
                className="text-xl opacity-80 font-normal border-none bg-transparent focus:ring-0 resize-none p-0"
                style={{ color: textColor }}
                placeholder="Add a brief description or summary"
                rows={2}
              />
            ) : (
              <p
                className={`text-xl opacity-80 font-normal leading-relaxed ${isEditable ? 'cursor-pointer hover:opacity-100' : ''}`}
                style={{ color: textColor }}
                onClick={(e) => {
                  if (isEditable) {
                    e.stopPropagation();
                    setEditingField('description');
                  }
                }}
              >
                {slide.description || (isEditable ? 'Add a brief description or summary' : '')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Content Body */}
      <div className="flex flex-1 gap-12 min-h-0">
        {' '}
        {/* min-h-0 ensures flex child scrolling works if needed */}
        {/* Bullet Points Area */}
        <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
          {slide.bullets && slide.bullets.length > 0 && (
            <ul className="space-y-6">
              {slide.bullets.map((bullet, idx) => {
                const bulletField = `bullet-${idx}`;
                const isEditingBullet = isEditable && editingField === bulletField;

                return (
                  <li key={idx} className="flex items-start gap-4 group">
                    {/* Custom Bullet Point */}
                    <div
                      className="mt-2.5 h-2 w-2 rounded-full flex-shrink-0 transition-transform group-hover:scale-125"
                      style={{ backgroundColor: accentColor }}
                    />

                    {isEditingBullet ? (
                      <div className="flex-1 flex items-start gap-2">
                        <Textarea
                          value={bullet}
                          onChange={(e) => {
                            const newBullets = [...(slide.bullets || [])];
                            newBullets[idx] = e.target.value;
                            onSlideChange?.({ ...slide, bullets: newBullets });
                          }}
                          onBlur={() => setEditingField(null)}
                          autoFocus
                          className="text-2xl leading-relaxed border-none bg-transparent focus:ring-0 resize-none p-0 min-h-[60px]"
                          style={{ color: textColor }}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 opacity-50 hover:opacity-100 hover:bg-red-500/10 hover:text-red-500"
                          onClick={() => onRemoveBullet?.(idx)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <span
                        className={`text-2xl leading-relaxed flex-1 ${isEditable ? 'cursor-pointer hover:opacity-80' : ''}`}
                        style={{ color: textColor }}
                        onClick={(e) => {
                          if (isEditable) {
                            e.stopPropagation();
                            setEditingField(bulletField);
                          }
                        }}
                      >
                        {bullet}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {isEditable && (
            <Button
              variant="ghost"
              onClick={onAddBullet}
              className="mt-6 text-lg font-medium opacity-50 hover:opacity-100"
              style={{ color: textColor }}
            >
              <span className="mr-2 text-xl">+</span> Add Point
            </Button>
          )}
        </div>
        {/* Image Area - Right Side for TitleBody if image exists */}
        {imageSource && (
          <div className="w-[40%] flex-shrink-0 flex flex-col justify-center">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl transition-transform hover:scale-[1.02] duration-500">
              <div className="absolute inset-0 bg-black/10 mix-blend-overlay z-10" />
              <img
                src={imageSource}
                alt={slide.title}
                className="w-full h-auto object-cover max-h-[500px]"
              />
            </div>
            {slide.imagePrompt && isEditable && (
              <p className="mt-2 text-xs opacity-40 text-center truncate">{slide.imagePrompt}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Two-Column Layout: Split content design
function TwoColumnLayout({
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

  return (
    <div className="flex h-full flex-col px-12 py-10">
      {/* Title */}
      <div className="mb-6 text-center">
        {isEditable && editingField === 'title' ? (
          <Input
            value={slide.title}
            onChange={(e) => onSlideChange?.({ ...slide, title: e.target.value })}
            onBlur={() => setEditingField(null)}
            autoFocus
            className="text-3xl font-bold text-center border-2 border-primary bg-white/20 h-auto py-1 px-2 shadow-sm"
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
                setEditingField('title');
              }
            }}
          >
            {slide.title || (isEditable ? '제목을 입력하세요' : '')}
          </h2>
        )}

        {(slide.subtitle || isEditable) && (
          <>
            {isEditable && editingField === 'subtitle' ? (
              <Input
                value={slide.subtitle || ''}
                onChange={(e) => onSlideChange?.({ ...slide, subtitle: e.target.value })}
                onBlur={() => setEditingField(null)}
                autoFocus
                className="mt-2 text-base font-medium opacity-70 text-center border-2 border-primary bg-white/20 h-auto py-1 px-2 shadow-sm"
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
                    setEditingField('subtitle');
                  }
                }}
              >
                {slide.subtitle || (isEditable ? '부제목 (선택사항)' : '')}
              </p>
            )}
          </>
        )}

        {(slide.description || isEditable) && (
          <>
            {isEditable && editingField === 'description' ? (
              <Textarea
                value={slide.description || ''}
                onChange={(e) => onSlideChange?.({ ...slide, description: e.target.value })}
                onBlur={() => setEditingField(null)}
                autoFocus
                className="mt-2 text-sm opacity-60 text-center border-2 border-primary bg-white/20 py-1 px-2 resize-none shadow-sm"
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

      {/* Two Columns */}
      <div className="flex flex-1 gap-6">
        {/* Left Column */}
        <div className="flex-1 rounded-xl bg-white/50 p-6 backdrop-blur-sm dark:bg-black/20">
          {slide.bullets &&
            slide.bullets.slice(0, Math.ceil(slide.bullets.length / 2)).map((bullet, idx) => {
              const bulletField = `bullet-${idx}`;
              const isEditingBullet = isEditable && editingField === bulletField;

              return (
                <div key={idx} className="mb-3 flex items-start gap-2">
                  <div
                    className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: accentColor }}
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
                        className="text-sm leading-relaxed border-2 border-primary bg-white/20 h-auto py-1 px-2 shadow-sm"
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
                          setEditingField(bulletField);
                        }
                      }}
                    >
                      {bullet}
                    </span>
                  )}
                </div>
              );
            })}
        </div>

        {/* Right Column */}
        <div className="flex-1 rounded-xl bg-white/50 p-6 backdrop-blur-sm dark:bg-black/20">
          {slide.bullets &&
            slide.bullets.slice(Math.ceil(slide.bullets.length / 2)).map((bullet, idx) => {
              const actualIdx = idx + Math.ceil(slide.bullets!.length / 2);
              const bulletField = `bullet-${actualIdx}`;
              const isEditingBullet = isEditable && editingField === bulletField;

              return (
                <div key={idx} className="mb-3 flex items-start gap-2">
                  <div
                    className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: accentColor }}
                  />
                  {isEditingBullet ? (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        value={bullet}
                        onChange={(e) => {
                          const newBullets = [...(slide.bullets || [])];
                          newBullets[actualIdx] = e.target.value;
                          onSlideChange?.({ ...slide, bullets: newBullets });
                        }}
                        onBlur={() => setEditingField(null)}
                        autoFocus
                        className="text-sm leading-relaxed border-2 border-primary bg-white/20 h-auto py-1 px-2 shadow-sm"
                        style={{ color: textColor }}
                        placeholder={`불릿 포인트 ${actualIdx + 1}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-50 hover:opacity-100"
                        onClick={() => onRemoveBullet?.(actualIdx)}
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
                          setEditingField(bulletField);
                        }
                      }}
                    >
                      {bullet}
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {isEditable && (
        <div className="mt-4 text-center">
          <Button
            size="sm"
            variant="outline"
            onClick={onAddBullet}
            style={{ borderColor: accentColor, color: accentColor }}
          >
            + 불릿 추가
          </Button>
        </div>
      )}

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
function TimelineLayout({
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
  const steps = slide.bullets || [];
  const imageSource = slide.imageData || slide.imageUrl;

  return (
    <div className="flex h-full flex-col px-12 py-10">
      {/* Title */}
      <div className="mb-6 text-center">
        {isEditable && editingField === 'title' ? (
          <Input
            value={slide.title}
            onChange={(e) => onSlideChange?.({ ...slide, title: e.target.value })}
            onBlur={() => setEditingField(null)}
            autoFocus
            className="text-3xl font-bold text-center border-2 border-primary bg-white/20 h-auto py-1 px-2 shadow-sm"
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
                setEditingField('title');
              }
            }}
          >
            {slide.title || (isEditable ? '제목을 입력하세요' : '')}
          </h2>
        )}

        {(slide.subtitle || isEditable) && (
          <>
            {isEditable && editingField === 'subtitle' ? (
              <Input
                value={slide.subtitle || ''}
                onChange={(e) => onSlideChange?.({ ...slide, subtitle: e.target.value })}
                onBlur={() => setEditingField(null)}
                autoFocus
                className="mt-2 text-base font-medium opacity-70 text-center border-2 border-primary bg-white/20 h-auto py-1 px-2 shadow-sm"
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
                    setEditingField('subtitle');
                  }
                }}
              >
                {slide.subtitle || (isEditable ? '부제목 (선택사항)' : '')}
              </p>
            )}
          </>
        )}

        {(slide.description || isEditable) && (
          <>
            {isEditable && editingField === 'description' ? (
              <Textarea
                value={slide.description || ''}
                onChange={(e) => onSlideChange?.({ ...slide, description: e.target.value })}
                onBlur={() => setEditingField(null)}
                autoFocus
                className="mt-2 text-sm opacity-60 text-center border-2 border-primary bg-white/20 py-1 px-2 resize-none shadow-sm"
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

      {/* Timeline Steps */}
      <div className="relative flex flex-1 items-center justify-center">
        <div className="flex w-full items-start justify-between gap-3">
          {steps.map((step, idx) => {
            const stepField = `step-${idx}`;
            const isEditingStep = isEditable && editingField === stepField;

            return (
              <div key={idx} className="flex flex-1 flex-col items-center">
                {/* Step Number */}
                <div
                  className="mb-3 flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg relative"
                  style={{ backgroundColor: accentColor }}
                >
                  {idx + 1}
                  {isEditable && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white hover:bg-red-600 p-0"
                      onClick={() => onRemoveBullet?.(idx)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {/* Step Content */}
                <div className="text-center w-full">
                  {isEditingStep ? (
                    <Input
                      value={step}
                      onChange={(e) => {
                        const newSteps = [...steps];
                        newSteps[idx] = e.target.value;
                        onSlideChange?.({ ...slide, bullets: newSteps });
                      }}
                      onBlur={() => setEditingField(null)}
                      autoFocus
                      className="text-sm font-semibold text-center border-2 border-primary bg-white/20 h-auto py-1 px-2 shadow-sm"
                      style={{ color: textColor }}
                      placeholder={`스텝 ${idx + 1}`}
                    />
                  ) : (
                    <p
                      className={`text-sm font-semibold ${isEditable ? 'cursor-pointer hover:bg-yellow-100/30 rounded px-2 py-1 transition-colors border-2 border-dashed border-transparent hover:border-yellow-400' : ''}`}
                      style={{ color: textColor }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEditable) {
                          setEditingField(stepField);
                        }
                      }}
                    >
                      {step}
                    </p>
                  )}
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
            );
          })}
        </div>
      </div>

      {/* Add Step Button */}
      {isEditable && (
        <div className="mt-4 text-center">
          <Button
            size="sm"
            variant="outline"
            onClick={onAddBullet}
            style={{ borderColor: accentColor, color: accentColor }}
          >
            + 스텝 추가
          </Button>
        </div>
      )}

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
function GridLayout({
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
  const items = slide.bullets || [];
  const imageSource = slide.imageData || slide.imageUrl;

  return (
    <div className="flex h-full flex-col px-12 py-10">
      {/* Title */}
      <div className="mb-6 text-center">
        {isEditable && editingField === 'title' ? (
          <Input
            value={slide.title}
            onChange={(e) => onSlideChange?.({ ...slide, title: e.target.value })}
            onBlur={() => setEditingField(null)}
            autoFocus
            className="text-3xl font-bold text-center border-2 border-primary bg-white/20 h-auto py-1 px-2 shadow-sm"
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
                setEditingField('title');
              }
            }}
          >
            {slide.title || (isEditable ? '제목을 입력하세요' : '')}
          </h2>
        )}

        {(slide.subtitle || isEditable) && (
          <>
            {isEditable && editingField === 'subtitle' ? (
              <Input
                value={slide.subtitle || ''}
                onChange={(e) => onSlideChange?.({ ...slide, subtitle: e.target.value })}
                onBlur={() => setEditingField(null)}
                autoFocus
                className="mt-2 text-base font-medium opacity-70 text-center border-2 border-primary bg-white/20 h-auto py-1 px-2 shadow-sm"
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
                    setEditingField('subtitle');
                  }
                }}
              >
                {slide.subtitle || (isEditable ? '부제목 (선택사항)' : '')}
              </p>
            )}
          </>
        )}

        {(slide.description || isEditable) && (
          <>
            {isEditable && editingField === 'description' ? (
              <Textarea
                value={slide.description || ''}
                onChange={(e) => onSlideChange?.({ ...slide, description: e.target.value })}
                onBlur={() => setEditingField(null)}
                autoFocus
                className="mt-2 text-sm opacity-60 text-center border-2 border-primary bg-white/20 py-1 px-2 resize-none shadow-sm"
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

      {/* Grid Items */}
      <div className="grid flex-1 grid-cols-2 gap-4">
        {items.slice(0, 4).map((item, idx) => {
          const itemField = `item-${idx}`;
          const isEditingItem = isEditable && editingField === itemField;

          return (
            <div
              key={idx}
              className="flex flex-col items-center justify-center rounded-xl bg-white/60 p-6 text-center backdrop-blur-sm dark:bg-black/30 relative"
            >
              {isEditable && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2 h-6 w-6 rounded-full bg-red-500 text-white hover:bg-red-600 p-0"
                  onClick={() => onRemoveBullet?.(idx)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
              <div
                className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${accentColor}20` }}
              >
                <TrendingUp className="h-6 w-6" style={{ color: accentColor }} />
              </div>
              {isEditingItem ? (
                <Input
                  value={item}
                  onChange={(e) => {
                    const newItems = [...items];
                    newItems[idx] = e.target.value;
                    onSlideChange?.({ ...slide, bullets: newItems });
                  }}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                  className="text-sm font-medium text-center border-2 border-primary bg-white/20 h-auto py-1 px-2 shadow-sm"
                  style={{ color: textColor }}
                  placeholder={`항목 ${idx + 1}`}
                />
              ) : (
                <p
                  className={`text-sm font-medium ${isEditable ? 'cursor-pointer hover:bg-yellow-100/30 rounded px-2 py-1 transition-colors border-2 border-dashed border-transparent hover:border-yellow-400' : ''}`}
                  style={{ color: textColor }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isEditable) {
                      setEditingField(itemField);
                    }
                  }}
                >
                  {item}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Item Button */}
      {isEditable && items.length < 4 && (
        <div className="mt-4 text-center">
          <Button
            size="sm"
            variant="outline"
            onClick={onAddBullet}
            style={{ borderColor: accentColor, color: accentColor }}
          >
            + 항목 추가 ({items.length}/4)
          </Button>
        </div>
      )}

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

// Stats Layout: Metrics and statistics showcase
function StatsLayout({
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
  const stats = slide.bullets || [];
  const imageSource = slide.imageData || slide.imageUrl;

  return (
    <div className="flex h-full flex-col px-12 py-10">
      {/* Title */}
      <div className="mb-8 text-center">
        {isEditable && editingField === 'title' ? (
          <Input
            value={slide.title}
            onChange={(e) => onSlideChange?.({ ...slide, title: e.target.value })}
            onBlur={() => setEditingField(null)}
            autoFocus
            className="text-3xl font-bold text-center border-2 border-primary bg-white/20 h-auto py-1 px-2 shadow-sm"
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
                setEditingField('title');
              }
            }}
          >
            {slide.title || (isEditable ? '제목을 입력하세요' : '')}
          </h2>
        )}

        {(slide.subtitle || isEditable) && (
          <>
            {isEditable && editingField === 'subtitle' ? (
              <Input
                value={slide.subtitle || ''}
                onChange={(e) => onSlideChange?.({ ...slide, subtitle: e.target.value })}
                onBlur={() => setEditingField(null)}
                autoFocus
                className="mt-2 text-base font-medium opacity-70 text-center border-2 border-primary bg-white/20 h-auto py-1 px-2 shadow-sm"
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
                    setEditingField('subtitle');
                  }
                }}
              >
                {slide.subtitle || (isEditable ? '부제목 (선택사항)' : '')}
              </p>
            )}
          </>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid flex-1 grid-cols-3 gap-8">
        {stats.slice(0, 6).map((stat, idx) => {
          const statField = `stat-${idx}`;
          const isEditingStat = isEditable && editingField === statField;

          return (
            <div
              key={idx}
              className="flex flex-col items-center justify-center text-center relative"
            >
              {isEditable && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white hover:bg-red-600 p-0 z-10"
                  onClick={() => onRemoveBullet?.(idx)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
              <div className="mb-2">
                <div
                  className="inline-flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${accentColor}20` }}
                >
                  <TrendingUp className="h-8 w-8" style={{ color: accentColor }} />
                </div>
              </div>
              {isEditingStat ? (
                <Input
                  value={stat}
                  onChange={(e) => {
                    const newStats = [...stats];
                    newStats[idx] = e.target.value;
                    onSlideChange?.({ ...slide, bullets: newStats });
                  }}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                  className="text-base font-semibold text-center border-2 border-primary bg-white/20 h-auto py-1 px-2 shadow-sm"
                  style={{ color: textColor }}
                  placeholder={`통계 ${idx + 1}`}
                />
              ) : (
                <p
                  className={`text-base font-semibold ${isEditable ? 'cursor-pointer hover:bg-yellow-100/30 rounded px-2 py-1 transition-colors border-2 border-dashed border-transparent hover:border-yellow-400' : ''}`}
                  style={{ color: textColor }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isEditable) {
                      setEditingField(statField);
                    }
                  }}
                >
                  {stat}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Stat Button */}
      {isEditable && stats.length < 6 && (
        <div className="mt-4 text-center">
          <Button
            size="sm"
            variant="outline"
            onClick={onAddBullet}
            style={{ borderColor: accentColor, color: accentColor }}
          >
            + 통계 추가 ({stats.length}/6)
          </Button>
        </div>
      )}

      {/* Image Section (if exists) */}
      {imageSource && (
        <div className="mt-4">
          <img
            src={imageSource}
            alt={slide.title}
            className="mx-auto max-h-24 rounded-lg object-cover shadow-lg"
          />
        </div>
      )}

      {/* Description */}
      {(slide.description || isEditable) && (
        <div className="mt-4 text-center">
          {isEditable && editingField === 'description' ? (
            <Textarea
              value={slide.description || ''}
              onChange={(e) => onSlideChange?.({ ...slide, description: e.target.value })}
              onBlur={() => setEditingField(null)}
              autoFocus
              className="text-sm opacity-60 text-center border-2 border-primary bg-white/20 py-1 px-2 resize-none shadow-sm"
              style={{ color: textColor }}
              placeholder="설명 (선택사항)"
              rows={2}
            />
          ) : (
            <p
              className={`text-sm opacity-60 ${isEditable ? 'cursor-pointer hover:bg-yellow-100/30 rounded px-2 py-1 transition-colors border-2 border-dashed border-transparent hover:border-yellow-400' : ''}`}
              style={{ color: textColor }}
              onClick={(e) => {
                e.stopPropagation();
                if (isEditable) {
                  setEditingField('description');
                }
              }}
            >
              {slide.description || (isEditable ? '설명 (선택사항)' : '')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
