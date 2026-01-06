/**
 * useFileUpload Hook
 *
 * 파일 드래그앤드롭 관리 (텍스트 파일, 이미지 파일)
 */

import { useState, useCallback } from 'react';
import { isTextFile } from '@/lib/utils';
import type { ImageAttachment } from '@/types';
import { generateImageId } from '@/lib/utils/id-generator';
import { fileToDataUrl } from '@/lib/utils/file-utils';

export function useFileUpload() {
  const [isDragging, setIsDragging] = useState(false);

  // Handle file drop
  const handleFileDrop = useCallback(
    async (
      files: File[],
      onTextContent?: (content: string) => void,
      onImageDrop?: (images: ImageAttachment[]) => void
    ) => {
      const textContents: string[] = [];
      const imageFiles: ImageAttachment[] = [];

      for (const file of files) {
        // Handle text files
        if (isTextFile(file)) {
          try {
            const text = await file.text();
            textContents.push(`📄 **${file.name}**\n\`\`\`\n${text}\n\`\`\``);
          } catch (error) {
            console.error(`Failed to read file ${file.name}:`, error);
          }
        }
        // Handle image files
        else if (file.type.startsWith('image/')) {
          try {
            const base64 = await fileToDataUrl(file);
            imageFiles.push({
              id: generateImageId('file'),
              path: '',
              filename: file.name,
              mimeType: file.type,
              base64,
            });
          } catch (error) {
            console.error(`Failed to read image ${file.name}:`, error);
          }
        }
      }

      // Dispatch callbacks
      if (textContents.length > 0 && onTextContent) {
        const combinedText = textContents.join('\n\n');
        onTextContent(combinedText);
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
