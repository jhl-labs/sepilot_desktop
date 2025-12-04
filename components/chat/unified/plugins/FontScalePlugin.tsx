'use client';

/**
 * FontScalePlugin
 *
 * 폰트 크기 조절 플러그인
 * Main Chat에서 사용 (Floating selector)
 */

import { ZoomIn } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const FONT_SCALE_OPTIONS = [
  '50',
  '60',
  '70',
  '80',
  '90',
  '100',
  '110',
  '120',
  '130',
  '140',
  '150',
  '160',
  '170',
  '180',
  '190',
  '200',
];

interface FontScalePluginProps {
  value: string;
  onChange: (value: string) => void;
}

export function FontScalePlugin({ value, onChange }: FontScalePluginProps) {
  return (
    <div className="absolute right-4 bottom-4 z-10">
      <Select value={value} onValueChange={onChange}>
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
