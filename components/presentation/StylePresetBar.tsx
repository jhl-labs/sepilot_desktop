'use client';

import { Button } from '@/components/ui/button';

const PRESETS = [
  {
    name: 'Dark Tech',
    palette: '#0ea5e9,#7c3aed,#0f172a,#e2e8f0',
    typography: 'Sora Bold / Inter Regular',
    visual: 'Dark neon tech with clean grids',
  },
  {
    name: 'Minimal Light',
    palette: '#111827,#2563eb,#d1d5db,#f9fafb',
    typography: 'Work Sans / Inter',
    visual: 'Minimalist light, generous white space',
  },
  {
    name: 'Pastel Product',
    palette: '#0f172a,#f472b6,#22d3ee,#fef3c7',
    typography: 'Space Grotesk / Inter',
    visual: 'Soft pastel, product UI focus',
  },
];

interface StylePresetBarProps {
  onSelect: (preset: { palette: string; typography: string; visual: string }) => void;
}

export function StylePresetBar({ onSelect }: StylePresetBarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESETS.map((preset) => (
        <Button
          key={preset.name}
          size="sm"
          variant="secondary"
          className="text-xs"
          onClick={() => onSelect(preset)}
        >
          {preset.name}
        </Button>
      ))}
    </div>
  );
}
