/**
 * useImageUpload Hook
 *
 * 이미지 업로드 관리 (선택, 클립보드 붙여넣기, 제거)
 */

import { useState, useCallback } from 'react';
import { isElectron } from '@/lib/platform';
import type { ImageAttachment } from '@/types';
import { generateImageId } from '@/lib/utils/id-generator';
import { fileToDataUrl } from '@/lib/utils/file-utils';

export function useImageUpload() {
  const [selectedImages, setSelectedImages] = useState<ImageAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const buildImageAttachment = useCallback(
    async (file: File, source: 'clipboard' | 'file'): Promise<ImageAttachment> => {
      const base64 = await fileToDataUrl(file);
      const fallbackExt = file.type.split('/')[1] || 'png';
      const fallbackName =
        source === 'clipboard'
          ? `clipboard-image-${Date.now()}.${fallbackExt}`
          : `image-${Date.now()}`;

      return {
        id: generateImageId(source),
        path: '',
        filename: file.name || fallbackName,
        mimeType: file.type,
        base64,
      };
    },
    []
  );

  // Append pre-built image attachments (e.g., from drag&drop or IPC events)
  const addImages = useCallback((images: ImageAttachment[]) => {
    if (!images || images.length === 0) {
      return;
    }
    setSelectedImages((prev) => [...prev, ...images]);
  }, []);

  // Handle image selection via file dialog
  const handleImageSelect = useCallback(async () => {
    if (!isElectron() || !window.electronAPI) {
      setError('Image upload is only available in the desktop app');
      return;
    }

    try {
      const result = await window.electronAPI.file.selectImages();
      if (result.success && result.data && result.data.length > 0) {
        addImages(result.data || []);
      }
    } catch (error) {
      console.error('Failed to select images:', error);
      setError(error instanceof Error ? error.message : String(error) || 'Failed to select images');
    }
  }, [addImages]);

  // Remove selected image
  const handleRemoveImage = useCallback((imageId: string) => {
    setSelectedImages((prev) => prev.filter((img) => img.id !== imageId));
  }, []);

  // Handle clipboard paste
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) {
        return;
      }

      const imageFiles: File[] = [];

      // Find images in clipboard
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length === 0) {
        return;
      }

      // Prevent text paste
      e.preventDefault();

      // Convert images to base64 (parallel) and append once
      const conversionResults = await Promise.allSettled(
        imageFiles.map((file) => buildImageAttachment(file, 'clipboard'))
      );
      const convertedImages = conversionResults
        .filter(
          (result): result is PromiseFulfilledResult<ImageAttachment> =>
            result.status === 'fulfilled'
        )
        .map((result) => result.value);

      if (convertedImages.length > 0) {
        addImages(convertedImages);
      }

      const failedResult = conversionResults.find((result) => result.status === 'rejected');
      if (failedResult) {
        const reason =
          failedResult.reason instanceof Error
            ? failedResult.reason.message
            : String(failedResult.reason) || '클립보드 이미지를 처리하는 중 오류가 발생했습니다';
        console.error('Failed to read clipboard image:', failedResult.reason);
        setError(reason);
      }
    },
    [addImages, buildImageAttachment]
  );

  // Handle file drop (images)
  const handleImageDrop = useCallback(
    async (imageFiles: File[]) => {
      const conversionResults = await Promise.allSettled(
        imageFiles.map((file) => buildImageAttachment(file, 'file'))
      );

      const convertedImages = conversionResults
        .filter(
          (result): result is PromiseFulfilledResult<ImageAttachment> =>
            result.status === 'fulfilled'
        )
        .map((result) => result.value);

      if (convertedImages.length > 0) {
        addImages(convertedImages);
      }

      for (const result of conversionResults) {
        if (result.status === 'rejected') {
          console.error('Failed to read dropped image:', result.reason);
        }
      }
    },
    [addImages, buildImageAttachment]
  );

  // Clear all selected images
  const clearImages = useCallback(() => {
    setSelectedImages([]);
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    selectedImages,
    error,
    addImages,
    handleImageSelect,
    handleRemoveImage,
    handlePaste,
    handleImageDrop,
    clearImages,
    clearError,
  };
}
