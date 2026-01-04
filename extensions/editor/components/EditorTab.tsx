'use client';

import { memo, useCallback } from 'react';
import { X, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditorTabContextMenu } from './EditorTabContextMenu';

interface EditorTabProps {
  file: {
    path: string;
    filename: string;
    isDirty: boolean;
  };
  isActive: boolean;
  index: number;
  totalFiles: number;
  hasSavedFiles: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onTabClick: (path: string) => void;
  onTabClose: (path: string, e: React.MouseEvent) => void;
  onCloseOthers: (path: string) => void;
  onCloseToRight: (path: string) => void;
  onCloseSaved: () => void;
  onCloseAll: () => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
}

export const EditorTab = memo(function EditorTab({
  file,
  isActive,
  index,
  totalFiles,
  hasSavedFiles,
  isDragging,
  isDragOver,
  onTabClick,
  onTabClose,
  onCloseOthers,
  onCloseToRight,
  onCloseSaved,
  onCloseAll,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: EditorTabProps) {
  const handleClose = useCallback(() => {
    if (file.isDirty) {
      if (window.confirm('파일에 저장되지 않은 변경사항이 있습니다. 닫으시겠습니까?')) {
        // Use a synthetic event since we're calling from context menu
        onTabClose(file.path, { stopPropagation: () => {} } as React.MouseEvent);
      }
    } else {
      onTabClose(file.path, { stopPropagation: () => {} } as React.MouseEvent);
    }
  }, [file.path, file.isDirty, onTabClose]);

  const handleCloseOthers = useCallback(() => {
    onCloseOthers(file.path);
  }, [file.path, onCloseOthers]);

  const handleCloseToRight = useCallback(() => {
    onCloseToRight(file.path);
  }, [file.path, onCloseToRight]);

  return (
    <EditorTabContextMenu
      filePath={file.path}
      filename={file.filename}
      isDirty={file.isDirty}
      onClose={handleClose}
      onCloseOthers={totalFiles > 1 ? handleCloseOthers : undefined}
      onCloseToRight={index < totalFiles - 1 ? handleCloseToRight : undefined}
      onCloseSaved={hasSavedFiles ? onCloseSaved : undefined}
      onCloseAll={onCloseAll}
    >
      <div
        draggable
        onDragStart={(e) => onDragStart(e, index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, index)}
        onDragEnd={onDragEnd}
        onClick={() => onTabClick(file.path)}
        className={cn(
          'group flex items-center gap-1 px-3 py-2 text-sm border-r hover:bg-accent transition-colors shrink-0 cursor-pointer select-none',
          isActive && 'bg-background font-medium',
          isDragging && 'opacity-50',
          isDragOver && 'border-l-2 border-l-primary'
        )}
      >
        {/* Drag handle - visible on hover */}
        <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-50 cursor-grab shrink-0" />
        <span className="truncate max-w-[130px]" title={file.filename}>
          {file.filename}
        </span>
        {file.isDirty && <span className="text-xs text-orange-500">●</span>}
        <span
          onClick={(e) => onTabClose(file.path, e)}
          className="ml-1 hover:bg-muted rounded p-0.5 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
          title="닫기"
        >
          <X className="h-3 w-3" />
        </span>
      </div>
    </EditorTabContextMenu>
  );
});
