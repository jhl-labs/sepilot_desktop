'use client';

/**
 * FontScalePlugin
 *
 * 폰트 크기 조절 (Main 모드 전용)
 * Floating selector with localStorage persistence
 */

import { useState, useEffect } from 'react';
import { ZoomIn } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PluginProps } from '../types';

const FONT_SCALE_KEY = 'sepilot-chat-font-scale';
const DEFAULT_FONT_SCALE = '100';
const FONT_SCALE_OPTIONS = [
  '50', '60', '70', '80', '90', '100',
  '110', '120', '130', '140', '150',
  '160', '170', '180', '190', '200',
];

interface FontScalePluginProps extends PluginProps {
  onScaleChange?: (scale: string) => void;
}

export function FontScalePlugin({ onScaleChange }: FontScalePluginProps) {
  const [fontScale, setFontScale] = useState<string>(DEFAULT_FONT_SCALE);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(FONT_SCALE_KEY);
    if (saved && FONT_SCALE_OPTIONS.includes(saved)) {
      setFontScale(saved);
    }
  }, []);

  const handleChange = (value: string) => {
    setFontScale(value);
    localStorage.setItem(FONT_SCALE_KEY, value);
    if (onScaleChange) {
      onScaleChange(value);
    }
  };

  return (
    <div className="absolute right-4 bottom-4 z-10">
      <Select value={fontScale} onValueChange={handleChange}>
        <SelectTrigger className="h-8 w-[90px] bg-background/80 backdrop-blur-sm text-xs">
          <ZoomIn className="h-3.5 w-3.5 mr-1 opacity-60" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_SCALE_OPTIONS.map((scale) => (
            <SelectItem key={scale} value={scale} className="text-xs">
              {scale}%
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
