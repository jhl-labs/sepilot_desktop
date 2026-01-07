import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface AnsiDisplayProps {
  text: string;
  className?: string;
}

interface StyleState {
  foreground?: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

// ANSI colors mapping
const ANSI_COLORS: Record<number, string> = {
  30: 'text-black',
  31: 'text-red-500',
  32: 'text-green-500',
  33: 'text-yellow-500',
  34: 'text-blue-500',
  35: 'text-magenta-500',
  36: 'text-cyan-500',
  37: 'text-white',
  90: 'text-gray-500', // Bright Black
  91: 'text-red-400',
  92: 'text-green-400',
  93: 'text-yellow-400',
  94: 'text-blue-400',
  95: 'text-magenta-400',
  96: 'text-cyan-400',
  97: 'text-white',
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: 'bg-black',
  41: 'bg-red-500',
  42: 'bg-green-500',
  43: 'bg-yellow-500',
  44: 'bg-blue-500',
  45: 'bg-magenta-500',
  46: 'bg-cyan-500',
  47: 'bg-white',
};

export function AnsiDisplay({ text, className }: AnsiDisplayProps) {
  const segments = useMemo(() => {
    if (!text) {
      return [];
    }

    const result: { text: string; style: StyleState }[] = [];
    let currentStyle: StyleState = {};

    // Split by ANSI escape code: \x1b[...m or other codes
    // Updated Regex to match CSI sequences including parameters like ? (e.g. \x1b[?25l)
    // eslint-disable-next-line no-control-regex
    const regex = /\x1b\[([\d;?]*)([a-zA-Z])/g;

    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const [, params, command] = match;
      const index = match.index;

      // Push preceding text with current style
      if (index > lastIndex) {
        result.push({
          text: text.slice(lastIndex, index),
          style: { ...currentStyle },
        });
      }

      // Process ANSI code
      if (command === 'm') {
        // SGR (Select Graphic Rendition) - Colors and Styles
        const codes = params.length === 0 ? [0] : params.split(';').map(Number);

        for (const code of codes) {
          if (code === 0) {
            // Reset
            currentStyle = {};
          } else if (code === 1) {
            currentStyle.bold = true;
          } else if (code === 3) {
            currentStyle.italic = true;
          } else if (code === 4) {
            currentStyle.underline = true;
          } else if (code >= 30 && code <= 37) {
            currentStyle.foreground = ANSI_COLORS[code];
          } else if (code >= 90 && code <= 97) {
            currentStyle.foreground = ANSI_COLORS[code];
          } else if (code >= 40 && code <= 47) {
            currentStyle.background = ANSI_BG_COLORS[code];
          } else if (code === 39) {
            delete currentStyle.foreground;
          } else if (code === 49) {
            delete currentStyle.background;
          }
        }
      }
      // Other commands (like A, B, C, D, K, etc.) are cursor/screen controls.
      // We generally want to ignore them for a history block view,
      // effectively stripping them.

      lastIndex = regex.lastIndex;
    }

    // Push remaining text
    if (lastIndex < text.length) {
      result.push({
        text: text.slice(lastIndex),
        style: { ...currentStyle },
      });
    }

    return result;
  }, [text]);

  return (
    <span className={cn('font-mono', className)}>
      {segments.map((seg, i) => (
        <span
          key={i}
          className={cn(
            seg.style.foreground,
            seg.style.background,
            seg.style.bold && 'font-bold',
            seg.style.italic && 'italic',
            seg.style.underline && 'underline'
          )}
        >
          {seg.text}
        </span>
      ))}
    </span>
  );
}
