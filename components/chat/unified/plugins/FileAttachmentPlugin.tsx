'use client';

/**
 * FileAttachmentPlugin
 *
 * 텍스트 파일 첨부 기능 플러그인
 * Main Chat에서 사용 (파일 선택, 미리보기, 제거)
 */

import { FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { TextFileAttachment } from '../types';

interface FileAttachmentPluginProps {
  selectedFiles: TextFileAttachment[];
  onFileRemove: (fileId: string) => void;
  isStreaming: boolean;
  mounted?: boolean;
}

export function FileAttachmentPlugin({
  selectedFiles,
  onFileRemove,
  isStreaming,
  mounted = true,
}: FileAttachmentPluginProps) {
  const { t } = useTranslation();

  if (selectedFiles.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {mounted ? (
        <TooltipProvider>
          {selectedFiles.map((file, _index) => (
            <Tooltip key={file.id}>
              <TooltipTrigger asChild>
                <div className="relative inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm group hover:bg-accent/80 transition-colors cursor-default">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="font-medium truncate max-w-[150px]">{file.filename}</span>
                  <button
                    onClick={() => onFileRemove(file.id)}
                    className="ml-1 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                    disabled={isStreaming}
                    title={t('unifiedInput.files.remove', { defaultValue: 'Remove file' })}
                    aria-label={t('unifiedInput.files.remove', { defaultValue: 'Remove file' })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="p-2 border bg-popover text-popover-foreground shadow-lg max-w-sm"
              >
                <div className="text-xs">
                  <div className="font-semibold mb-1">{file.filename}</div>
                  <div className="text-muted-foreground line-clamp-6 whitespace-pre-wrap font-mono text-[10px]">
                    {file.content.slice(0, 300)}
                    {file.content.length > 300 ? '...' : ''}
                  </div>
                  <div className="mt-1 text-[10px] opacity-70">
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      ) : (
        // Fallback for SSR - no tooltip
        selectedFiles.map((file, _index) => (
          <div
            key={file.id}
            className="relative inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm group hover:bg-accent/80 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="font-medium truncate max-w-[150px]">{file.filename}</span>
            <button
              onClick={() => onFileRemove(file.id)}
              className="ml-1 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
              disabled={isStreaming}
              title="Remove file"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
