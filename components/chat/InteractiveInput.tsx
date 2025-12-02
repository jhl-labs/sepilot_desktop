'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Send, Keyboard } from 'lucide-react';

export interface InteractiveInputProps {
  title?: string;
  placeholder?: string;
  multiline?: boolean;
  onSubmit?: (value: string) => void;
  disabled?: boolean;
}

export function InteractiveInput({
  title,
  placeholder,
  multiline = false,
  onSubmit,
  disabled = false,
}: InteractiveInputProps) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!value.trim() || disabled) {return;}

    setSubmitted(true);

    // Dispatch custom event to InputBox with input value
    window.dispatchEvent(
      new CustomEvent('sepilot:interactive-input', {
        detail: { value: value.trim() },
      })
    );

    // Call optional callback
    if (onSubmit) {
      onSubmit(value.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Enter (Shift+Enter for new line in multiline mode)
    if (e.key === 'Enter' && !e.shiftKey && !multiline) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="my-4 rounded-lg border bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/10 p-4">
      {/* Title */}
      {title && (
        <div className="flex items-center gap-2 mb-3">
          <Keyboard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h4 className="text-sm font-medium text-foreground">{title}</h4>
        </div>
      )}

      {/* Input Field */}
      <div className="flex gap-2">
        {multiline ? (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || '여기에 입력하세요...'}
            disabled={disabled || submitted}
            className={cn(
              'flex-1 resize-none bg-background',
              submitted && 'opacity-60 cursor-not-allowed'
            )}
            rows={3}
          />
        ) : (
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || '여기에 입력하세요...'}
            disabled={disabled || submitted}
            className={cn(
              'flex-1 bg-background',
              submitted && 'opacity-60 cursor-not-allowed'
            )}
          />
        )}

        <Button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled || submitted}
          size="icon"
          className="shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Submitted Indicator */}
      {submitted && (
        <p className="text-xs text-muted-foreground mt-2 italic">전송됨: {value}</p>
      )}
    </div>
  );
}
