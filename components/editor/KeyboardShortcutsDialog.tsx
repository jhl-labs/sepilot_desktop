'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutItem {
  key: string;
  description: string;
}

interface ShortcutCategory {
  title: string;
  shortcuts: ShortcutItem[];
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const { t } = useTranslation();

  const isMac =
    typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? '⌘' : 'Ctrl';
  const altKey = isMac ? '⌥' : 'Alt';
  const shiftKey = isMac ? '⇧' : 'Shift';

  const categories: ShortcutCategory[] = [
    {
      title: t('editor.shortcuts.categories.basicEditing'),
      shortcuts: [
        { key: `${modKey}+S`, description: t('editor.shortcuts.save') },
        { key: `${modKey}+Z`, description: t('editor.shortcuts.undo') },
        { key: `${modKey}+Y`, description: t('editor.shortcuts.redo') },
        { key: `${modKey}+X`, description: t('editor.shortcuts.cut') },
        { key: `${modKey}+C`, description: t('editor.shortcuts.copy') },
        { key: `${modKey}+V`, description: t('editor.shortcuts.paste') },
        { key: `${modKey}+A`, description: t('editor.shortcuts.selectAll') },
        { key: `${modKey}+/`, description: t('editor.shortcuts.toggleComment') },
        {
          key: `${shiftKey}+${altKey}+F`,
          description: t('editor.shortcuts.formatDocument'),
        },
      ],
    },
    {
      title: t('editor.shortcuts.categories.navigation'),
      shortcuts: [
        { key: `${modKey}+F`, description: t('editor.shortcuts.find') },
        { key: `${modKey}+H`, description: t('editor.shortcuts.replace') },
        { key: `${modKey}+G`, description: t('editor.shortcuts.goToLine') },
        { key: `${modKey}+P`, description: t('editor.shortcuts.quickOpen') },
        { key: 'F3', description: t('editor.shortcuts.findNext') },
        {
          key: `${shiftKey}+F3`,
          description: t('editor.shortcuts.findPrevious'),
        },
      ],
    },
    {
      title: t('editor.shortcuts.categories.selection'),
      shortcuts: [
        {
          key: `${modKey}+L`,
          description: t('editor.shortcuts.selectLine'),
        },
        {
          key: `${modKey}+D`,
          description: t('editor.shortcuts.selectNextOccurrence'),
        },
        {
          key: `${modKey}+${shiftKey}+L`,
          description: t('editor.shortcuts.selectAllOccurrences'),
        },
        {
          key: `${altKey}+Click`,
          description: t('editor.shortcuts.multiCursor'),
        },
      ],
    },
    {
      title: t('editor.shortcuts.categories.aiFeatures'),
      shortcuts: [
        {
          key: `${modKey}+K, C`,
          description: t('editor.shortcuts.aiContinueWriting'),
        },
        {
          key: `${modKey}+K, S`,
          description: t('editor.shortcuts.aiMakeShorter'),
        },
        {
          key: `${modKey}+K, L`,
          description: t('editor.shortcuts.aiMakeLonger'),
        },
        {
          key: `${modKey}+K, G`,
          description: t('editor.shortcuts.aiFixGrammar'),
        },
        {
          key: `${modKey}+K, M`,
          description: t('editor.shortcuts.aiSummarize'),
        },
        {
          key: `${modKey}+K, E`,
          description: t('editor.shortcuts.aiExplainCode'),
        },
        { key: `${modKey}+K, F`, description: t('editor.shortcuts.aiFixCode') },
        {
          key: `${modKey}+K, I`,
          description: t('editor.shortcuts.aiImproveCode'),
        },
        {
          key: `${modKey}+K, P`,
          description: t('editor.shortcuts.aiCompleteCode'),
        },
        {
          key: `${modKey}+K, D`,
          description: t('editor.shortcuts.aiAddComments'),
        },
        {
          key: `${modKey}+K, T`,
          description: t('editor.shortcuts.aiGenerateTests'),
        },
      ],
    },
    {
      title: t('editor.shortcuts.categories.advanced'),
      shortcuts: [
        {
          key: `${shiftKey}+${altKey}+↓`,
          description: t('editor.shortcuts.duplicateLine'),
        },
        {
          key: `${modKey}+${shiftKey}+K`,
          description: t('editor.shortcuts.deleteLine'),
        },
        {
          key: `${modKey}+K, ${modKey}+F`,
          description: t('editor.shortcuts.formatSelection'),
        },
      ],
    },
    {
      title: t('editor.shortcuts.categories.fileManagement'),
      shortcuts: [
        {
          key: `${modKey}+W`,
          description: t('editor.shortcuts.closeFile'),
        },
        {
          key: `${modKey}+Tab`,
          description: t('editor.shortcuts.nextFile'),
        },
        {
          key: `${modKey}+${shiftKey}+Tab`,
          description: t('editor.shortcuts.previousFile'),
        },
      ],
    },
    {
      title: t('editor.shortcuts.categories.general'),
      shortcuts: [
        {
          key: `${modKey}+${shiftKey}+P`,
          description: t('editor.shortcuts.commandPalette'),
        },
        { key: `${modKey}+/`, description: t('editor.shortcuts.showShortcuts') },
        { key: 'Esc', description: t('editor.shortcuts.closeDialog') },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-2xl">{t('editor.shortcuts.title')}</span>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            {categories.map((category, idx) => (
              <div key={idx}>
                <h3 className="text-lg font-semibold mb-3 text-primary">{category.title}</h3>
                <div className="space-y-2">
                  {category.shortcuts.map((shortcut, sidx) => (
                    <div
                      key={sidx}
                      className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent/50 transition-colors"
                    >
                      <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                      <kbd className="px-3 py-1.5 text-xs font-semibold text-foreground bg-muted border border-border rounded-md shadow-sm">
                        {shortcut.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
