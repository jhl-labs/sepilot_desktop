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

    for (const file of files) {
      // 텍스트 파일인지 확인
      if (isTextFile(file)) {
        try {
          const text = await file.text();
          textContents.push(`📄 **${file.name}**\n\`\`\`\n${text}\n\`\`\``);
        } catch (error) {
          console.error(`Failed to read file ${file.name}:`, error);
        }
      } else if (file.type.startsWith('image/')) {
        // 이미지 파일 처리
        try {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            imageFiles.push({
              filename: file.name,
              mimeType: file.type,
              base64,
            });
          };
          reader.readAsDataURL(file);
        } catch (error) {
          console.error(`Failed to read image ${file.name}:`, error);
        }
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
