'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Command {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  action: () => void;
}

interface SlashCommandPluginProps {
  input: string;
  onCommandSelect: (command: string) => void;
  onClose: () => void;
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  commands: Command[];
}

export function SlashCommandPlugin({
  input,
  onCommandSelect,
  onClose,
  selectedIndex,
  onIndexChange,
  commands,
}: SlashCommandPluginProps) {
  const show = input.startsWith('/') && !input.includes(' ');
  const filter = input.slice(1).toLowerCase();

  const filteredCommands = commands.filter(
    (cmd) => cmd.id.includes(filter) || cmd.name.toLowerCase().includes(filter)
  );

  useEffect(() => {
    if (!show || filteredCommands.length === 0) {
      onClose();
      return;
    }

    if (selectedIndex > filteredCommands.length - 1) {
      onIndexChange(filteredCommands.length - 1);
      return;
    }

    if (selectedIndex < 0) {
      onIndexChange(0);
    }
  }, [show, filteredCommands.length, onClose, onIndexChange, selectedIndex]);

  if (!show || filteredCommands.length === 0) {
    return null;
  }

  // Ensure selectedIndex is within bounds
  const safeIndex = Math.max(0, Math.min(selectedIndex, filteredCommands.length - 1));

  return (
    <div className="absolute bottom-full mb-2 left-0 w-64 bg-background border shadow-xl rounded-xl overflow-hidden z-[100] animate-in slide-in-from-bottom-2 duration-200">
      <div className="px-3 py-2 border-b bg-muted/30">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          명령어
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {filteredCommands.map((cmd, idx) => (
          <button
            key={cmd.id}
            onClick={() => onCommandSelect(cmd.id)}
            onMouseEnter={() => onIndexChange(idx)}
            className={cn(
              'w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-colors',
              idx === safeIndex ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            )}
          >
            <div
              className={cn(
                'mt-0.5',
                idx === safeIndex ? 'text-primary-foreground' : 'text-primary'
              )}
            >
              {cmd.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium leading-none">{cmd.name}</div>
              <div
                className={cn(
                  'text-[10px] mt-1 line-clamp-1',
                  idx === safeIndex ? 'text-primary-foreground/80' : 'text-muted-foreground'
                )}
              >
                {cmd.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
