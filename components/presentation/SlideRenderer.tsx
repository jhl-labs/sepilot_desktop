'use client';

import type { PresentationSlide } from '@/types/presentation';
import { CheckCircle2, TrendingUp, Calendar, Grid3x3 } from 'lucide-react';

interface SlideRendererProps {
  slide: PresentationSlide | undefined;
  className?: string;
}

export function SlideRenderer({ slide, className = '' }: SlideRendererProps) {
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

    // Gradient backgrounds based on vibe
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
    switch (slide.layout) {
      case 'hero':
        return <HeroLayout slide={slide} />;
      case 'two-column':
        return <TwoColumnLayout slide={slide} />;
      case 'timeline':
        return <TimelineLayout slide={slide} />;
      case 'grid':
        return <GridLayout slide={slide} />;
      default:
        return <TitleBodyLayout slide={slide} />;
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
  const textColor = slide.vibe?.includes('dark') ? 'text-white' : 'text-gray-900';

  return (
    <div className="flex h-full flex-col items-center justify-center px-16 text-center">
      <h1
        className={`mb-6 text-6xl font-bold leading-tight ${textColor}`}
        style={{ color: slide.accentColor }}
      >
        {slide.title}
      </h1>
      {slide.description && (
        <p className={`max-w-3xl text-2xl font-light ${textColor} opacity-80`}>
          {slide.description}
        </p>
      )}
      {slide.imageUrl && (
        <div className="mt-8 max-w-2xl">
          <img src={slide.imageUrl} alt={slide.title} className="rounded-lg shadow-lg" />
        </div>
      )}
    </div>
  );
}

// Title-Body Layout: Classic slide with title and bullet points
function TitleBodyLayout({ slide }: { slide: PresentationSlide }) {
  const textColor = slide.vibe?.includes('dark') ? 'text-white' : 'text-gray-900';
  const accentColor = slide.accentColor || '#0ea5e9';

  return (
    <div className="flex h-full flex-col px-16 py-12">
      {/* Title Section */}
      <div className="mb-8 border-l-4 pl-6" style={{ borderColor: accentColor }}>
        <h2 className={`text-5xl font-bold ${textColor}`}>{slide.title}</h2>
        {slide.description && (
          <p className={`mt-3 text-xl ${textColor} opacity-70`}>{slide.description}</p>
        )}
      </div>

      {/* Content Section */}
      <div className="flex flex-1 gap-8">
        <div className="flex-1">
          {slide.bullets && slide.bullets.length > 0 && (
            <ul className="space-y-4">
              {slide.bullets.map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-4">
                  <CheckCircle2
                    className="mt-1 h-6 w-6 flex-shrink-0"
                    style={{ color: accentColor }}
                  />
                  <span className={`text-xl leading-relaxed ${textColor}`}>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Image Section */}
        {slide.imageUrl && (
          <div className="w-96 flex-shrink-0">
            <img
              src={slide.imageUrl}
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
  const textColor = slide.vibe?.includes('dark') ? 'text-white' : 'text-gray-900';
  const accentColor = slide.accentColor || '#0ea5e9';

  return (
    <div className="flex h-full flex-col px-16 py-12">
      {/* Title */}
      <div className="mb-8 text-center">
        <h2 className={`text-5xl font-bold ${textColor}`}>{slide.title}</h2>
        {slide.description && (
          <p className={`mt-3 text-xl ${textColor} opacity-70`}>{slide.description}</p>
        )}
      </div>

      {/* Two Columns */}
      <div className="flex flex-1 gap-8">
        {/* Left Column */}
        <div className="flex-1 rounded-xl bg-white/50 p-8 backdrop-blur-sm dark:bg-black/20">
          {slide.bullets &&
            slide.bullets.slice(0, Math.ceil(slide.bullets.length / 2)).map((bullet, idx) => (
              <div key={idx} className="mb-4 flex items-start gap-3">
                <div
                  className="mt-1 h-2 w-2 rounded-full"
                  style={{ backgroundColor: accentColor }}
                />
                <span className={`text-lg leading-relaxed ${textColor}`}>{bullet}</span>
              </div>
            ))}
        </div>

        {/* Right Column */}
        <div className="flex-1 rounded-xl bg-white/50 p-8 backdrop-blur-sm dark:bg-black/20">
          {slide.bullets &&
            slide.bullets.slice(Math.ceil(slide.bullets.length / 2)).map((bullet, idx) => (
              <div key={idx} className="mb-4 flex items-start gap-3">
                <div
                  className="mt-1 h-2 w-2 rounded-full"
                  style={{ backgroundColor: accentColor }}
                />
                <span className={`text-lg leading-relaxed ${textColor}`}>{bullet}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Timeline Layout: Process or roadmap visualization
function TimelineLayout({ slide }: { slide: PresentationSlide }) {
  const textColor = slide.vibe?.includes('dark') ? 'text-white' : 'text-gray-900';
  const accentColor = slide.accentColor || '#0ea5e9';
  const steps = slide.bullets || [];

  return (
    <div className="flex h-full flex-col px-16 py-12">
      {/* Title */}
      <div className="mb-8 text-center">
        <h2 className={`text-5xl font-bold ${textColor}`}>{slide.title}</h2>
        {slide.description && (
          <p className={`mt-3 text-xl ${textColor} opacity-70`}>{slide.description}</p>
        )}
      </div>

      {/* Timeline Steps */}
      <div className="relative flex flex-1 items-center justify-center">
        <div className="flex w-full items-start justify-between gap-4">
          {steps.map((step, idx) => (
            <div key={idx} className="flex flex-1 flex-col items-center">
              {/* Step Number */}
              <div
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white shadow-lg"
                style={{ backgroundColor: accentColor }}
              >
                {idx + 1}
              </div>

              {/* Step Content */}
              <div className="text-center">
                <p className={`text-lg font-semibold ${textColor}`}>{step}</p>
              </div>

              {/* Connector Line */}
              {idx < steps.length - 1 && (
                <div
                  className="absolute top-8 h-1"
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

      {/* Calendar Icon */}
      <div className="mt-6 flex justify-center">
        <Calendar className="h-8 w-8 opacity-30" style={{ color: accentColor }} />
      </div>
    </div>
  );
}

// Grid Layout: Data or feature showcase
function GridLayout({ slide }: { slide: PresentationSlide }) {
  const textColor = slide.vibe?.includes('dark') ? 'text-white' : 'text-gray-900';
  const accentColor = slide.accentColor || '#0ea5e9';
  const items = slide.bullets || [];

  return (
    <div className="flex h-full flex-col px-16 py-12">
      {/* Title */}
      <div className="mb-8 text-center">
        <h2 className={`text-5xl font-bold ${textColor}`}>{slide.title}</h2>
        {slide.description && (
          <p className={`mt-3 text-xl ${textColor} opacity-70`}>{slide.description}</p>
        )}
      </div>

      {/* Grid Items */}
      <div className="grid flex-1 grid-cols-2 gap-6">
        {items.slice(0, 4).map((item, idx) => (
          <div
            key={idx}
            className="flex flex-col items-center justify-center rounded-xl bg-white/60 p-8 text-center backdrop-blur-sm dark:bg-black/30"
          >
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              <TrendingUp className="h-8 w-8" style={{ color: accentColor }} />
            </div>
            <p className={`text-lg font-medium ${textColor}`}>{item}</p>
          </div>
        ))}
      </div>

      {/* Grid Icon */}
      <div className="mt-6 flex justify-center">
        <Grid3x3 className="h-8 w-8 opacity-30" style={{ color: accentColor }} />
      </div>
    </div>
  );
}
