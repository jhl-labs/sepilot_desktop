'use client';

import type { PresentationDesignMaster } from '@/types/presentation';
import { Sparkles } from 'lucide-react';

interface SlideMasterPreviewProps {
  designMaster: PresentationDesignMaster;
}

/**
 * 디자인 마스터 템플릿 미리보기
 * - 제목 슬라이드, 챕터 슬라이드, 본문 슬라이드, 마무리 슬라이드 템플릿을 보여줌
 * - 사용자가 구조 논의 시 디자인을 시각적으로 확인할 수 있음
 */
export function SlideMasterPreview({ designMaster }: SlideMasterPreviewProps) {
  const textColor =
    designMaster.vibe.includes('dark') || designMaster.palette.background.startsWith('#0')
      ? 'text-white'
      : 'text-gray-900';

  const getBackgroundStyle = (variant: 'default' | 'accent' = 'default') => {
    const accent = designMaster.palette.accent;
    const primary = designMaster.palette.primary;
    const bg = designMaster.palette.background;

    if (variant === 'accent') {
      // Accent 강조 배경
      return {
        background: `linear-gradient(135deg, ${accent}20 0%, ${primary}10 100%)`,
      };
    }

    // 기본 배경
    if (designMaster.vibe.includes('dark')) {
      return {
        background: `linear-gradient(135deg, ${bg} 0%, ${accent}15 100%)`,
      };
    }
    if (designMaster.vibe.includes('minimal')) {
      return {
        background: `linear-gradient(135deg, ${bg} 0%, ${accent}08 100%)`,
      };
    }
    return {
      background: `linear-gradient(135deg, ${accent}10 0%, ${accent}02 50%, ${bg} 100%)`,
    };
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        <span>선택된 디자인 템플릿 미리보기</span>
      </div>

      <div className="grid grid-cols-2 gap-6 w-full max-w-5xl">
        {/* 1. Title Slide (Hero) */}
        <div
          className="aspect-video rounded-lg shadow-lg overflow-hidden"
          style={getBackgroundStyle()}
        >
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <h1
              className={`text-3xl font-bold leading-tight mb-2 ${textColor}`}
              style={{
                fontFamily: designMaster.fonts.title,
                color: designMaster.palette.primary,
              }}
            >
              제목 슬라이드
            </h1>
            <p
              className={`text-sm opacity-70 ${textColor}`}
              style={{ fontFamily: designMaster.fonts.body }}
            >
              프레젠테이션 오프닝
            </p>
          </div>
        </div>

        {/* 2. Chapter Slide */}
        <div
          className="aspect-video rounded-lg shadow-lg overflow-hidden"
          style={getBackgroundStyle('accent')}
        >
          <div className="flex h-full flex-col justify-center px-8">
            <div className="border-l-4 pl-4" style={{ borderColor: designMaster.palette.primary }}>
              <h2
                className={`text-2xl font-bold ${textColor}`}
                style={{ fontFamily: designMaster.fonts.title }}
              >
                챕터 제목
              </h2>
              <p
                className={`text-xs mt-1 opacity-60 ${textColor}`}
                style={{ fontFamily: designMaster.fonts.body }}
              >
                섹션 구분용
              </p>
            </div>
          </div>
        </div>

        {/* 3. Content Slide (Title-Body) */}
        <div
          className="aspect-video rounded-lg shadow-lg overflow-hidden"
          style={getBackgroundStyle()}
        >
          <div className="flex h-full flex-col px-8 py-6">
            <div
              className="border-l-4 pl-4 mb-4"
              style={{ borderColor: designMaster.palette.accent }}
            >
              <h3
                className={`text-xl font-bold ${textColor}`}
                style={{ fontFamily: designMaster.fonts.title }}
              >
                본문 슬라이드
              </h3>
            </div>
            <ul className="space-y-2 flex-1">
              {['핵심 포인트 1', '핵심 포인트 2', '핵심 포인트 3'].map((point, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <div
                    className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: designMaster.palette.accent }}
                  />
                  <span
                    className={`text-xs ${textColor}`}
                    style={{ fontFamily: designMaster.fonts.body }}
                  >
                    {point}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 4. Closing Slide */}
        <div
          className="aspect-video rounded-lg shadow-lg overflow-hidden"
          style={getBackgroundStyle()}
        >
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <h2
              className={`text-2xl font-bold mb-2 ${textColor}`}
              style={{
                fontFamily: designMaster.fonts.title,
                color: designMaster.palette.accent,
              }}
            >
              감사합니다
            </h2>
            <p
              className={`text-xs opacity-60 ${textColor}`}
              style={{ fontFamily: designMaster.fonts.body }}
            >
              마무리 슬라이드
            </p>
          </div>
        </div>
      </div>

      {/* Design Info */}
      <div className="mt-4 flex items-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>색상:</span>
          <div className="flex gap-1">
            <div
              className="h-4 w-4 rounded border"
              style={{ backgroundColor: designMaster.palette.primary }}
              title="Primary"
            />
            <div
              className="h-4 w-4 rounded border"
              style={{ backgroundColor: designMaster.palette.accent }}
              title="Accent"
            />
            <div
              className="h-4 w-4 rounded border"
              style={{ backgroundColor: designMaster.palette.background }}
              title="Background"
            />
          </div>
        </div>
        <div>
          <span>
            폰트: {designMaster.fonts.title} / {designMaster.fonts.body}
          </span>
        </div>
        <div>
          <span>분위기: {designMaster.vibe}</span>
        </div>
      </div>
    </div>
  );
}
