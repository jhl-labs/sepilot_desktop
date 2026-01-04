'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search } from 'lucide-react';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExecuteCommand: (commandId: string) => void;
}

interface Command {
  id: string;
  title: string;
  category: string;
  keywords?: string[];
  shortcut?: string;
}

export function CommandPalette({ open, onOpenChange, onExecuteCommand }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const isMac =
    typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? '⌘' : 'Ctrl';
  const altKey = isMac ? '⌥' : 'Alt';
  const shiftKey = isMac ? '⇧' : 'Shift';

  const commands: Command[] = useMemo(
    () => [
      // File Management
      {
        id: 'file.save',
        title: t('editor.commands.saveFile'),
        category: t('editor.commands.categories.file'),
        shortcut: `${modKey}+S`,
        keywords: ['save', '저장'],
      },
      {
        id: 'file.close',
        title: t('editor.commands.closeFile'),
        category: t('editor.commands.categories.file'),
        shortcut: `${modKey}+W`,
        keywords: ['close', '닫기'],
      },
      {
        id: 'file.closeAll',
        title: t('editor.commands.closeAllFiles'),
        category: t('editor.commands.categories.file'),
        keywords: ['close', 'all', '닫기', '모두'],
      },
      {
        id: 'file.refresh',
        title: t('editor.commands.refreshFile'),
        category: t('editor.commands.categories.file'),
        keywords: ['refresh', '새로고침'],
      },

      // Edit
      {
        id: 'edit.undo',
        title: t('editor.commands.undo'),
        category: t('editor.commands.categories.edit'),
        shortcut: `${modKey}+Z`,
        keywords: ['undo', '실행취소'],
      },
      {
        id: 'edit.redo',
        title: t('editor.commands.redo'),
        category: t('editor.commands.categories.edit'),
        shortcut: `${modKey}+Y`,
        keywords: ['redo', '다시실행'],
      },
      {
        id: 'edit.formatDocument',
        title: t('editor.commands.formatDocument'),
        category: t('editor.commands.categories.edit'),
        shortcut: `${shiftKey}+${altKey}+F`,
        keywords: ['format', '포맷', '정렬'],
      },
      {
        id: 'edit.toggleComment',
        title: t('editor.commands.toggleComment'),
        category: t('editor.commands.categories.edit'),
        shortcut: `${modKey}+/`,
        keywords: ['comment', '주석'],
      },

      // AI Code
      {
        id: 'ai.code.explain',
        title: t('editor.commands.aiExplainCode'),
        category: t('editor.commands.categories.aiCode'),
        shortcut: `${modKey}+K, E`,
        keywords: ['ai', 'explain', '설명', 'AI'],
      },
      {
        id: 'ai.code.fix',
        title: t('editor.commands.aiFixCode'),
        category: t('editor.commands.categories.aiCode'),
        shortcut: `${modKey}+K, F`,
        keywords: ['ai', 'fix', '수정', 'AI'],
      },
      {
        id: 'ai.code.improve',
        title: t('editor.commands.aiImproveCode'),
        category: t('editor.commands.categories.aiCode'),
        shortcut: `${modKey}+K, I`,
        keywords: ['ai', 'improve', '개선', 'AI'],
      },
      {
        id: 'ai.code.complete',
        title: t('editor.commands.aiCompleteCode'),
        category: t('editor.commands.categories.aiCode'),
        shortcut: `${modKey}+K, P`,
        keywords: ['ai', 'complete', '완성', 'AI'],
      },
      {
        id: 'ai.code.comment',
        title: t('editor.commands.aiAddComments'),
        category: t('editor.commands.categories.aiCode'),
        shortcut: `${modKey}+K, D`,
        keywords: ['ai', 'comment', '주석', 'AI'],
      },
      {
        id: 'ai.code.test',
        title: t('editor.commands.aiGenerateTests'),
        category: t('editor.commands.categories.aiCode'),
        shortcut: `${modKey}+K, T`,
        keywords: ['ai', 'test', '테스트', 'AI'],
      },

      // AI Writing
      {
        id: 'ai.writing.continue',
        title: t('editor.commands.aiContinueWriting'),
        category: t('editor.commands.categories.aiWriting'),
        shortcut: `${modKey}+K, C`,
        keywords: ['ai', 'continue', '계속', 'AI'],
      },
      {
        id: 'ai.writing.shorter',
        title: t('editor.commands.aiMakeShorter'),
        category: t('editor.commands.categories.aiWriting'),
        shortcut: `${modKey}+K, S`,
        keywords: ['ai', 'shorter', '짧게', 'AI'],
      },
      {
        id: 'ai.writing.longer',
        title: t('editor.commands.aiMakeLonger'),
        category: t('editor.commands.categories.aiWriting'),
        shortcut: `${modKey}+K, L`,
        keywords: ['ai', 'longer', '길게', 'AI'],
      },
      {
        id: 'ai.writing.simplify',
        title: t('editor.commands.aiSimplify'),
        category: t('editor.commands.categories.aiWriting'),
        keywords: ['ai', 'simplify', '단순화', 'AI'],
      },
      {
        id: 'ai.writing.grammar',
        title: t('editor.commands.aiFixGrammar'),
        category: t('editor.commands.categories.aiWriting'),
        shortcut: `${modKey}+K, G`,
        keywords: ['ai', 'grammar', '문법', 'AI'],
      },
      {
        id: 'ai.writing.summarize',
        title: t('editor.commands.aiSummarize'),
        category: t('editor.commands.categories.aiWriting'),
        shortcut: `${modKey}+K, M`,
        keywords: ['ai', 'summarize', '요약', 'AI'],
      },

      // View
      {
        id: 'view.showShortcuts',
        title: t('editor.commands.showShortcuts'),
        category: t('editor.commands.categories.view'),
        shortcut: `${modKey}+/`,
        keywords: ['shortcuts', 'help', '단축키', '도움말'],
      },
      {
        id: 'view.toggleTerminal',
        title: t('editor.commands.toggleTerminal'),
        category: t('editor.commands.categories.view'),
        keywords: ['terminal', '터미널'],
      },
      {
        id: 'view.toggleSidebar',
        title: t('editor.commands.toggleSidebar'),
        category: t('editor.commands.categories.view'),
        keywords: ['sidebar', '사이드바'],
      },

      // Navigation
      {
        id: 'nav.find',
        title: t('editor.commands.find'),
        category: t('editor.commands.categories.navigation'),
        shortcut: `${modKey}+F`,
        keywords: ['find', 'search', '찾기', '검색'],
      },
      {
        id: 'nav.replace',
        title: t('editor.commands.replace'),
        category: t('editor.commands.categories.navigation'),
        shortcut: `${modKey}+H`,
        keywords: ['replace', '바꾸기'],
      },
      {
        id: 'nav.goToLine',
        title: t('editor.commands.goToLine'),
        category: t('editor.commands.categories.navigation'),
        shortcut: `${modKey}+G`,
        keywords: ['goto', 'line', '이동', '줄'],
      },
    ],
    [t, modKey, altKey, shiftKey]
  );

  const filteredCommands = useMemo(() => {
    if (!search.trim()) {
      return commands;
    }

    const searchLower = search.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(searchLower) ||
        cmd.category.toLowerCase().includes(searchLower) ||
        cmd.keywords?.some((k) => k.toLowerCase().includes(searchLower))
    );
  }, [search, commands]);

  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          onExecuteCommand(filteredCommands[selectedIndex].id);
          onOpenChange(false);
        }
      }
    },
    [filteredCommands, selectedIndex, onExecuteCommand, onOpenChange]
  );

  const handleCommandClick = (commandId: string) => {
    onExecuteCommand(commandId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('editor.commands.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>
        <ScrollArea className="max-h-[60vh] px-2 pb-2">
          {Object.keys(groupedCommands).length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t('editor.commands.noResults')}
            </div>
          ) : (
            <div className="space-y-4 p-2">
              {Object.entries(groupedCommands).map(([category, cmds]) => (
                <div key={category}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {category}
                  </div>
                  <div className="space-y-1">
                    {cmds.map((cmd) => {
                      const globalIndex = filteredCommands.indexOf(cmd);
                      return (
                        <div
                          key={cmd.id}
                          className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${
                            globalIndex === selectedIndex
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-accent/50'
                          }`}
                          onClick={() => handleCommandClick(cmd.id)}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                        >
                          <span className="text-sm">{cmd.title}</span>
                          {cmd.shortcut && (
                            <kbd className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted border border-border rounded">
                              {cmd.shortcut}
                            </kbd>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
