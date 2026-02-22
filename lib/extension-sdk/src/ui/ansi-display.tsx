import { useMemo } from 'react';
import { cn } from '../utils/cn';

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

    // Match ANSI Code (\x1b[...m), other CSI (\x1b[...L), or Backspace (\x08, \x7f)
    // We categorize tokens:
    // 1. ANSI SGR (Color/Style): \x1b[...m
    // 2. Control CSI (Ignore/Handle): \x1b[...X
    // 3. Backspace: \b, \x7f, \x08
    // 4. Normal Text

    // Regex explanation:
    // \x1b\[[\d;?]*[a-zA-Z]  -> CSI sequences (colors, cursor)
    // [\x08\x7f]             -> Backspace / DEL
    // [^\x1b\x08\x7f]+       -> Normal text run
    // eslint-disable-next-line no-control-regex
    const tokenRegex = /(\x1b\[[\d;?]*[a-zA-Z])|([\x08\x7f])|([^\x1b\x08\x7f]+)/g;

    let match;
    while ((match = tokenRegex.exec(text)) !== null) {
      const ansiCode = match[1];
      const backspace = match[2];
      const textChunk = match[3];

      if (ansiCode) {
        // Handle CSI
        // eslint-disable-next-line no-control-regex
        const csiMatch = ansiCode.match(/^\x1b\[([\d;?]*)?([a-zA-Z])$/);
        if (csiMatch) {
          const params = csiMatch[1] || '';
          const command = csiMatch[2];

          if (command === 'm') {
            // SGR
            const codes =
              params.length === 0 ? [0] : params.split(';').map((n) => parseInt(n) || 0);
            for (const code of codes) {
              if (code === 0) {
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
          } else if (command === 'K') {
            // Erase Line (0: cursor to end, 1: start to cursor, 2: all)
            // Since this is a log view, we can't easily ease "start to cursor".
            // But "cursor to end" (def) typically means "delete pending text on this line"
            // For simplified handling: if param is 0 or missing, remove text from "current line" buffer?
            // Our buffer is segmented. This is hard.
            // For now, ignoring [K is cleaner than mishandling it.
            // Users report artifacts like Squares, [K usually isn't a square.
          }
        }
      } else if (backspace) {
        // Handle Backspace: Remove last character from the last segment
        let remainingToDelete = 1;
        while (remainingToDelete > 0 && result.length > 0) {
          const lastSegment = result[result.length - 1];
          if (lastSegment.text.length > 0) {
            // Remove 1 char
            lastSegment.text = lastSegment.text.slice(0, -1);
            remainingToDelete--;
            // If segment becomes empty, remove it (unless it's stylistically important? No, empty text has no visual)
            if (lastSegment.text.length === 0) {
              result.pop();
            }
          } else {
            // Empty segment, just pop it
            result.pop();
          }
        }
      } else if (textChunk) {
        // Add text
        // Optimize: if last segment has same style, append
        const lastSegment = result[result.length - 1];
        const stylesMatch =
          lastSegment &&
          lastSegment.style.foreground === currentStyle.foreground &&
          lastSegment.style.background === currentStyle.background &&
          lastSegment.style.bold === currentStyle.bold &&
          lastSegment.style.italic === currentStyle.italic &&
          lastSegment.style.underline === currentStyle.underline;

        if (stylesMatch) {
          lastSegment.text += textChunk;
        } else {
          result.push({
            text: textChunk,
            style: { ...currentStyle },
          });
        }
      }
    }

    return result;
  }, [text]);

  return (
    <span className={cn('font-mono', className)}>
      {segments.map((seg: any, i: number) => (
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
