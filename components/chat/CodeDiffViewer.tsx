'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X, ChevronDown, ChevronRight } from 'lucide-react';

interface CodeDiffViewerProps {
  filePath: string;
  oldContent: string;
  newContent: string;
  onAccept?: () => void;
  onReject?: () => void;
}

/**
 * Simple Diff Viewer Component
 *
 * TODO: Upgrade to react-diff-view for better UX:
 * - Side-by-side view
 * - Syntax highlighting
 * - Line-by-line changes
 *
 * Install: pnpm add react-diff-view diff
 */
export function CodeDiffViewer({
  filePath,
  oldContent,
  newContent,
  onAccept,
  onReject,
}: CodeDiffViewerProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Simple line-by-line diff (basic implementation)
  const diffLines = useMemo(() => {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);

    const lines: Array<{
      lineNum: number;
      old: string | null;
      new: string | null;
      type: 'unchanged' | 'added' | 'removed' | 'modified';
    }> = [];

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === newLine) {
        lines.push({ lineNum: i + 1, old: oldLine, new: newLine, type: 'unchanged' });
      } else if (oldLine === undefined) {
        lines.push({ lineNum: i + 1, old: null, new: newLine, type: 'added' });
      } else if (newLine === undefined) {
        lines.push({ lineNum: i + 1, old: oldLine, new: null, type: 'removed' });
      } else {
        lines.push({ lineNum: i + 1, old: oldLine, new: newLine, type: 'modified' });
      }
    }

    return lines;
  }, [oldContent, newContent]);

  const stats = useMemo(() => {
    const added = diffLines.filter((l) => l.type === 'added').length;
    const removed = diffLines.filter((l) => l.type === 'removed').length;
    const modified = diffLines.filter((l) => l.type === 'modified').length;
    return { added, removed, modified };
  }, [diffLines]);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="border-b bg-muted/50">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted/70 transition-colors"
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-mono text-sm font-medium">{filePath}</span>
          <div className="ml-auto flex items-center gap-3 text-xs">
            {stats.added > 0 && <span className="text-green-600">+{stats.added}</span>}
            {stats.removed > 0 && <span className="text-red-600">-{stats.removed}</span>}
            {stats.modified > 0 && <span className="text-orange-600">~{stats.modified}</span>}
          </div>
        </button>
      </div>

      {/* Diff Content */}
      {isExpanded && (
        <>
          <div className="bg-muted/20 p-3 max-h-[400px] overflow-auto font-mono text-xs">
            {diffLines.map((line, idx) => {
              let bgClass = '';
              let textClass = '';
              let prefix = ' ';

              switch (line.type) {
                case 'added':
                  bgClass = 'bg-green-500/10';
                  textClass = 'text-green-600';
                  prefix = '+';
                  break;
                case 'removed':
                  bgClass = 'bg-red-500/10';
                  textClass = 'text-red-600';
                  prefix = '-';
                  break;
                case 'modified':
                  bgClass = 'bg-orange-500/10';
                  textClass = 'text-orange-600';
                  prefix = '~';
                  break;
                default:
                  bgClass = '';
                  textClass = 'text-muted-foreground';
              }

              const displayLine = line.new !== null ? line.new : line.old;

              return (
                <div key={idx} className={`flex gap-2 px-2 py-0.5 ${bgClass}`}>
                  <span className="text-muted-foreground w-8 text-right select-none">
                    {line.lineNum}
                  </span>
                  <span className={`${textClass} select-none`}>{prefix}</span>
                  <span className={textClass}>{displayLine}</span>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          {(onAccept || onReject) && (
            <div className="flex items-center justify-end gap-2 border-t px-3 py-2 bg-muted/30">
              {onReject && (
                <Button size="sm" variant="outline" onClick={onReject} className="gap-1">
                  <X className="h-3 w-3" />
                  Reject
                </Button>
              )}
              {onAccept && (
                <Button
                  size="sm"
                  onClick={onAccept}
                  className="gap-1 bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-3 w-3" />
                  Accept
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
