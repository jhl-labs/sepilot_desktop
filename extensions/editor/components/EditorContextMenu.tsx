'use client';

import { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Code,
  FileText,
  Languages,
  Wand2,
  CheckCircle2,
  MessageSquare,
  Zap,
  MoreHorizontal,
  Scissors,
  Copy,
  ClipboardPaste,
  ArrowRight,
  Maximize2,
  Minimize2,
  ListTodo,
  Sparkles,
} from 'lucide-react';

export interface EditorContextMenuProps {
  children: ReactNode;
  onAction: (action: string, data?: any) => void;
  onTranslate: () => void;
  onCustomPrompt: () => void;
  hasSelection: boolean;
}

export function EditorContextMenu({
  children,
  onAction,
  onTranslate,
  onCustomPrompt,
  hasSelection,
}: EditorContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      {/* Increased width to accommodate longer labels and shortcuts */}
      <ContextMenuContent className="w-72 p-0 overflow-hidden border-border bg-popover">
        {/* Group 1: General AI Editing (Writing AI) */}
        {/* Using standard padding from shadcn items (usually p-1 for container) 
            But to get full background, we wrapper with bg color. 
            To avoid checksy look, we apply p-1 to the wrapper for spacing around items, 
            or we make items full width. 
            The user complained about "uneven" background. 
            Likely the gap between items. 
            Let's try removing padding from wrapper and adding py-1 to wrapper.
        */}
        <div className="bg-indigo-500/10 py-1.5">
          <div className="px-2 pb-1.5 text-xs font-semibold text-indigo-500 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Basic AI Editing
          </div>

          <div className="px-1">
            <ContextMenuItem
              onClick={() => onAction('continue')}
              disabled={!hasSelection}
              className="focus:bg-indigo-500/20 focus:text-indigo-700 dark:focus:text-indigo-300"
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              Continue Writing
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onAction('make-shorter')}
              disabled={!hasSelection}
              className="focus:bg-indigo-500/20 focus:text-indigo-700 dark:focus:text-indigo-300"
            >
              <Minimize2 className="mr-2 h-4 w-4" />
              Make Shorter
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onAction('make-longer')}
              disabled={!hasSelection}
              className="focus:bg-indigo-500/20 focus:text-indigo-700 dark:focus:text-indigo-300"
            >
              <Maximize2 className="mr-2 h-4 w-4" />
              Make Longer
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onAction('fix-grammar')}
              disabled={!hasSelection}
              className="focus:bg-indigo-500/20 focus:text-indigo-700 dark:focus:text-indigo-300"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Fix Grammar
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onAction('summarize')}
              disabled={!hasSelection}
              className="focus:bg-indigo-500/20 focus:text-indigo-700 dark:focus:text-indigo-300"
            >
              <FileText className="mr-2 h-4 w-4" />
              Summarize
            </ContextMenuItem>
            <ContextMenuItem
              onClick={onTranslate}
              disabled={!hasSelection}
              className="focus:bg-indigo-500/20 focus:text-indigo-700 dark:focus:text-indigo-300"
            >
              <Languages className="mr-2 h-4 w-4" />
              Translate to...
            </ContextMenuItem>
            <ContextMenuItem
              onClick={onCustomPrompt}
              disabled={!hasSelection}
              className="focus:bg-indigo-500/20 focus:text-indigo-700 dark:focus:text-indigo-300"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Custom Prompt...
            </ContextMenuItem>
          </div>
        </div>

        <ContextMenuSeparator className="my-0" />

        {/* Group 2: Code AI Editing */}
        <div className="bg-emerald-500/10 py-1.5">
          <div className="px-2 pb-1.5 text-xs font-semibold text-emerald-500 flex items-center gap-1.5">
            <Code className="h-3.5 w-3.5" />
            Code AI Editing
          </div>

          <div className="px-1">
            <ContextMenuItem
              onClick={() => onAction('explain')}
              disabled={!hasSelection}
              className="focus:bg-emerald-500/20 focus:text-emerald-700 dark:focus:text-emerald-300"
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Explain Code
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onAction('fix')}
              disabled={!hasSelection}
              className="focus:bg-emerald-500/20 focus:text-emerald-700 dark:focus:text-emerald-300"
            >
              <Wand2 className="mr-2 h-4 w-4" />
              Fix Code
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onAction('improve')}
              disabled={!hasSelection}
              className="focus:bg-emerald-500/20 focus:text-emerald-700 dark:focus:text-emerald-300"
            >
              <Zap className="mr-2 h-4 w-4" />
              Improve Code
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onAction('complete')}
              disabled={!hasSelection}
              className="focus:bg-emerald-500/20 focus:text-emerald-700 dark:focus:text-emerald-300"
            >
              <MoreHorizontal className="mr-2 h-4 w-4" />
              Complete Code
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onAction('add-comments')}
              disabled={!hasSelection}
              className="focus:bg-emerald-500/20 focus:text-emerald-700 dark:focus:text-emerald-300"
            >
              <FileText className="mr-2 h-4 w-4" />
              Add Comments
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onAction('generate-tests')}
              disabled={!hasSelection}
              className="focus:bg-emerald-500/20 focus:text-emerald-700 dark:focus:text-emerald-300"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Generate Tests
            </ContextMenuItem>
          </div>
        </div>

        <ContextMenuSeparator className="my-0" />

        {/* Group 3: Standard Editing Actions (Native look) */}
        <div className="p-1">
          <ContextMenuItem onClick={() => onAction('change-all-occurrences')}>
            <ListTodo className="mr-2 h-4 w-4" />
            Change All Occurrences
            <ContextMenuShortcut>Ctrl+F2</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={() => onAction('format')}>
            Format Document
            <ContextMenuShortcut>Shift+Alt+F</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onAction('format-selection')} disabled={!hasSelection}>
            Format Selection
            <ContextMenuShortcut>Ctrl+K Ctrl+F</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={() => onAction('cut')}>
            <Scissors className="mr-2 h-4 w-4" />
            Cut
            <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onAction('copy')}>
            <Copy className="mr-2 h-4 w-4" />
            Copy
            <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onAction('paste')}>
            <ClipboardPaste className="mr-2 h-4 w-4" />
            Paste
            <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
          </ContextMenuItem>
        </div>
      </ContextMenuContent>
    </ContextMenu>
  );
}
