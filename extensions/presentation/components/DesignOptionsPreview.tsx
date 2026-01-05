'use client';

import { useState } from 'react';
import type { PresentationDesignMaster } from '../types';
import { SlideMasterPreview } from './SlideMasterPreview';
import { Check } from 'lucide-react';

interface DesignOptionsPreviewProps {
  designOptions: PresentationDesignMaster[];
}

/**
 * 디자인 옵션 미리보기 - 카드 형태로 옵션 비교
 */
export function DesignOptionsPreview({ designOptions }: DesignOptionsPreviewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (designOptions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        디자인 옵션이 없습니다.
      </div>
    );
  }

  const selectedDesign = designOptions[selectedIndex];

  return (
    <div className="flex h-full flex-col">
      {/* Option Selector Cards */}
      <div className="flex gap-2 p-4 border-b bg-muted/30 overflow-x-auto">
        {designOptions.map((option, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedIndex(idx)}
            className={`flex-shrink-0 rounded-lg border-2 p-3 transition-all ${
              idx === selectedIndex
                ? 'border-primary bg-background shadow-sm'
                : 'border-transparent bg-background/60 hover:bg-background hover:border-muted-foreground/30'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Color preview */}
              <div className="flex gap-0.5">
                <div
                  className="h-6 w-6 rounded"
                  style={{ backgroundColor: option.palette.primary }}
                />
                <div
                  className="h-6 w-6 rounded"
                  style={{ backgroundColor: option.palette.accent }}
                />
                <div
                  className="h-6 w-6 rounded"
                  style={{ backgroundColor: option.palette.background }}
                />
              </div>
              <div className="text-left">
                <p className="text-xs font-medium">{option.name || `옵션 ${idx + 1}`}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{option.vibe}</p>
              </div>
              {idx === selectedIndex && <Check className="h-4 w-4 text-primary ml-2" />}
            </div>
          </button>
        ))}
      </div>

      {/* Selected Design Preview */}
      <div className="flex-1 overflow-auto">
        <SlideMasterPreview designMaster={selectedDesign} />
      </div>

      {/* Selection hint */}
      <div className="border-t bg-muted/30 px-4 py-2">
        <p className="text-xs text-center text-muted-foreground">
          좌측 채팅에서 원하는 옵션을 선택해주세요
        </p>
      </div>
    </div>
  );
}
