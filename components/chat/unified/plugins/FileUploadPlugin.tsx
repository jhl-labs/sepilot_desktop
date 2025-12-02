'use client';

/**
 * FileUploadPlugin
 *
 * 파일 업로드 기능 (Main 모드 전용)
 * Text file upload, drag & drop
 */

import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isTextFile } from '@/lib/utils';
import type { PluginProps } from '../types';

interface FileUploadPluginProps extends PluginProps {
  onFileContent: (content: string) => void;
}

export function FileUploadPlugin({ onFileContent }: FileUploadPluginProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = async (files: FileList) => {
    const textContents: string[] = [];

    for (const file of Array.from(files)) {
      if (isTextFile(file)) {
        try {
          const text = await file.text();
          textContents.push(`📄 **${file.name}**\n\`\`\`\n${text}\n\`\`\``);
        } catch (error) {
          console.error(`Failed to read file ${file.name}:`, error);
        }
      }
    }

    if (textContents.length > 0) {
      onFileContent(textContents.join('\n\n'));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await handleFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={isDragging ? 'opacity-50' : ''}
    >
      <input
        type="file"
        accept=".txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.html,.css,.xml,.yaml,.yml"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <span>
            <Paperclip className="h-4 w-4" />
          </span>
        </Button>
      </label>
    </div>
  );
}
