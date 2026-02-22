'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MousePointer2 } from 'lucide-react';

export interface InteractiveSelectProps {
  title?: string;
  options: string[];
  onSelect?: (option: string) => void;
  disabled?: boolean;
}

export function InteractiveSelect({
  title,
  options,
  onSelect,
  disabled = false,
}: InteractiveSelectProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const handleSelect = (option: string) => {
    if (disabled) {
      return;
    }

    setSelectedOption(option);

    // Dispatch custom event to InputBox with selected option
    window.dispatchEvent(
      new CustomEvent('sepilot:interactive-select', {
        detail: { value: option },
      })
    );

    // Call optional callback
    if (onSelect) {
      onSelect(option);
    }
  };

  return (
    <div className="my-4 rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/5 p-4">
      {/* Title */}
      {title && (
        <div className="flex items-center gap-2 mb-3">
          <MousePointer2 className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-medium text-foreground">{title}</h4>
        </div>
      )}

      {/* Options */}
      <div className="flex flex-col gap-2">
        {options.map((option, index) => {
          const isSelected = selectedOption === option;

          return (
            <Button
              key={index}
              variant={isSelected ? 'default' : 'outline'}
              onClick={() => handleSelect(option)}
              disabled={disabled}
              className={cn(
                'justify-start text-left h-auto py-3 px-4 whitespace-normal transition-all',
                isSelected && 'ring-2 ring-primary ring-offset-2',
                !disabled && !isSelected && 'hover:bg-primary/10 hover:border-primary/50'
              )}
            >
              <span className="text-sm">{option}</span>
            </Button>
          );
        })}
      </div>

      {/* Selected Indicator */}
      {selectedOption && (
        <p className="text-xs text-muted-foreground mt-3 italic">선택됨: {selectedOption}</p>
      )}
    </div>
  );
}
