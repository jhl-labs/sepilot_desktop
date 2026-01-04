'use client';

import { useState } from 'react';
import type { PresentationDesignMaster } from '../types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SlideMasterPreview } from './SlideMasterPreview';

interface DesignOptionsPreviewProps {
  designOptions: PresentationDesignMaster[];
}

/**
 * 디자인 옵션 미리보기 - 여러 디자인 옵션을 Select로 전환하며 비교
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
    <div className="relative flex h-full flex-col">
      {/* 우측 상단 Select */}
      <div className="absolute right-8 top-8 z-10">
        <Select
          value={String(selectedIndex)}
          onValueChange={(value) => setSelectedIndex(Number(value))}
        >
          <SelectTrigger className="w-[200px] bg-background/95 backdrop-blur-sm shadow-lg">
            <SelectValue placeholder="디자인 옵션 선택" />
          </SelectTrigger>
          <SelectContent>
            {designOptions.map((option, idx) => (
              <SelectItem key={idx} value={String(idx)}>
                옵션 {idx + 1}: {option.name || option.vibe}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 현재 선택된 디자인 미리보기 */}
      <div className="flex-1">
        <SlideMasterPreview designMaster={selectedDesign} />
      </div>
    </div>
  );
}
