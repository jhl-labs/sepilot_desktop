'use client';

import { cn } from '@/lib/utils';

interface FileReferencePluginProps {
  suggestions: string[];
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  onSelect: (path: string) => void;
}

export function FileReferencePlugin({
  suggestions,
  selectedIndex,
  onIndexChange,
  onSelect,
}: FileReferencePluginProps) {
  if (suggestions.length === 0) {
    return null;
  }

  const safeIndex = Math.max(0, Math.min(selectedIndex, suggestions.length - 1));

  return (
    <div className="absolute bottom-full mb-2 left-0 right-0 max-h-64 overflow-y-auto rounded-lg border border-input bg-popover shadow-lg z-50">
      <div className="px-3 py-2 border-b bg-muted/30">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          파일 참조 (@)
        </span>
      </div>
      <div className="p-1">
        {suggestions.map((path, idx) => (
          <button
            key={path}
            type="button"
            onClick={() => onSelect(path)}
            onMouseEnter={() => onIndexChange(idx)}
            className={cn(
              'w-full rounded-md px-3 py-2 text-left text-sm font-mono transition-colors',
              idx === safeIndex ? 'bg-accent' : 'hover:bg-accent/60'
            )}
          >
            {path}
          </button>
        ))}
      </div>
    </div>
  );
}
