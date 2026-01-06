'use client';

import { useState } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { isElectron } from '@/lib/platform';
import { Folder, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { useTranslation } from 'react-i18next';

export function WorkingDirectoryIndicator() {
  const { t } = useTranslation();
  const { workingDirectory, setWorkingDirectory, thinkingMode } = useChatStore();
  const [isSelecting, setIsSelecting] = useState(false);

  // Only show in coding mode
  if (thinkingMode !== 'coding') {
    return null;
  }

  const handleSelectDirectory = async () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    setIsSelecting(true);
    try {
      const result = await window.electronAPI.file.selectDirectory();
      if (result.success && result.data) {
        setWorkingDirectory(result.data);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    } finally {
      setIsSelecting(false);
    }
  };

  const handleClearDirectory = () => {
    setWorkingDirectory(null);
  };

  // Get short path (show only last 2 segments)
  const getShortPath = (path: string) => {
    const segments = path.split(/[/\\]/);
    if (segments.length <= 2) {
      return path;
    }
    return `.../${segments.slice(-2).join('/')}`;
  };

  // Show warning if no working directory in coding mode
  if (thinkingMode === 'coding' && !workingDirectory) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-2 border-t border-orange-500/50 bg-orange-500/10">
        <div className="flex items-center gap-2 text-xs">
          <AlertCircle className="h-4 w-4 text-orange-600 flex-shrink-0" />
          <span className="font-medium text-orange-700 dark:text-orange-400">
            {t('chat.workingDirectory.warning') ||
              'Warning: Working directory not set. File operations will fail.'}
          </span>
          <Button
            variant="default"
            size="sm"
            className="h-6 px-3 text-xs ml-auto bg-orange-600 hover:bg-orange-700 text-white"
            onClick={handleSelectDirectory}
            disabled={isSelecting}
          >
            {isSelecting
              ? t('chat.workingDirectory.selecting')
              : t('chat.workingDirectory.selectNow') || 'Set Working Directory'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-1 border-t border-border/50">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Folder className="h-3 w-3" />
        <span className="text-[10px] font-medium">{t('chat.workingDirectory.label')}</span>
        {workingDirectory ? (
          <>
            <span
              className="font-mono text-[10px] text-foreground/80 cursor-pointer hover:text-foreground transition-colors"
              onClick={handleSelectDirectory}
              title={workingDirectory}
            >
              {getShortPath(workingDirectory)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0 hover:bg-destructive/10"
              onClick={handleClearDirectory}
              title={t('chat.workingDirectory.remove')}
            >
              <X className="h-3 w-3 text-destructive" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-[10px]"
            onClick={handleSelectDirectory}
            disabled={isSelecting}
          >
            {isSelecting ? t('chat.workingDirectory.selecting') : t('chat.workingDirectory.select')}
          </Button>
        )}
      </div>
    </div>
  );
}
