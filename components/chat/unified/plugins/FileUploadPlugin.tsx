'use client';

/**
 * FileUploadPlugin
 *
 * 파일 업로드 기능 플러그인 (드래그앤드롭)
 * Main Chat에서 사용
 */

import { useState, useRef } from 'react';

interface FileUploadPluginProps {
  onFileDrop: (files: {
    textContents: string[];
    imageFiles: { filename: string; mimeType: string; base64: string }[];
  }) => void;
  isTextFile: (file: File) => boolean;
  children: React.ReactNode;
}

export function FileUploadPlugin({ onFileDrop, isTextFile, children }: FileUploadPluginProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const readImageAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result;
        if (typeof base64 === 'string') {
          resolve(base64);
          return;
        }
        reject(new Error('Failed to convert dropped image to base64'));
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read dropped image'));
      reader.readAsDataURL(file);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // dropZone 바깥으로 나갈 때만 isDragging을 false로 설정
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) {
      return;
    }

    const textContents: string[] = [];
    const imageFiles: { filename: string; mimeType: string; base64: string }[] = [];

    const parsedResults = await Promise.allSettled(
      files.map(async (file) => {
        if (isTextFile(file)) {
          const text = await file.text();
          return {
            type: 'text' as const,
            payload: `📄 **${file.name}**\n\`\`\`\n${text}\n\`\`\``,
          };
        }

        if (file.type.startsWith('image/')) {
          const base64 = await readImageAsDataUrl(file);
          return {
            type: 'image' as const,
            payload: {
              filename: file.name,
              mimeType: file.type,
              base64,
            },
          };
        }

        return null;
      })
    );

    for (const result of parsedResults) {
      if (result.status === 'rejected') {
        console.error('Failed to process dropped file:', result.reason);
        continue;
      }

      if (!result.value) {
        continue;
      }

      if (result.value.type === 'text') {
        textContents.push(result.value.payload);
      } else {
        imageFiles.push(result.value.payload);
      }
    }

    if (textContents.length > 0 || imageFiles.length > 0) {
      onFileDrop({ textContents, imageFiles });
    }
  };

  return (
    <div
      ref={dropZoneRef}
      className={`transition-colors ${isDragging ? 'bg-primary/10 border-primary' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-lg z-10 pointer-events-none">
          <div className="text-center">
            <p className="text-sm font-medium text-primary">텍스트 파일을 여기에 드롭하세요</p>
            <p className="text-xs text-muted-foreground mt-1">.txt, .md, .json, .js, .ts 등</p>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
