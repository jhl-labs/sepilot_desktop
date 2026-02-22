/**
 * useFileDragDrop Hook
 *
 * 파일 드래그앤드롭 관리 (텍스트 파일, 이미지 파일)
 */

import { useState, useCallback } from 'react';
import { isTextFile } from '@/lib/utils';
import type { ImageAttachment } from '@/types';
import type { TextFileAttachment } from '../types';
import { generateImageId } from '@/lib/utils/id-generator';
import { fileToDataUrl } from '@/lib/utils/file-utils';

export function useFileDragDrop() {
  const [isDragging, setIsDragging] = useState(false);

  // Handle file drop
  const handleFileDrop = useCallback(
    async (
      files: File[],
      onTextAttachments?: (attachments: TextFileAttachment[]) => void,
      onImageDrop?: (images: ImageAttachment[]) => void
    ) => {
      const textAttachments: TextFileAttachment[] = [];
      const imageFiles: ImageAttachment[] = [];

      const processingResults = await Promise.allSettled(
        files.map(async (file) => {
          if (isTextFile(file)) {
            const text = await file.text();
            return {
              type: 'text' as const,
              payload: {
                id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                filename: file.name,
                content: text,
                size: file.size,
              } satisfies TextFileAttachment,
            };
          }

          if (file.type.startsWith('image/')) {
            const base64 = await fileToDataUrl(file);
            return {
              type: 'image' as const,
              payload: {
                id: generateImageId('file'),
                path: '',
                filename: file.name,
                mimeType: file.type,
                base64,
              } satisfies ImageAttachment,
            };
          }

          return null;
        })
      );

      for (const result of processingResults) {
        if (result.status === 'rejected') {
          console.error('Failed to process dropped file:', result.reason);
          continue;
        }

        if (!result.value) {
          continue;
        }

        if (result.value.type === 'text') {
          textAttachments.push(result.value.payload);
          continue;
        }

        imageFiles.push(result.value.payload);
      }

      // Dispatch callbacks
      if (textAttachments.length > 0 && onTextAttachments) {
        onTextAttachments(textAttachments);
      }

      if (imageFiles.length > 0 && onImageDrop) {
        onImageDrop(imageFiles);
      }
    },
    []
  );

  return {
    isDragging,
    setIsDragging,
    handleFileDrop,
  };
}
