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

  // Handle image selection via file dialog
  const handleImageSelect = useCallback(async () => {
    if (!isElectron() || !window.electronAPI) {
      setError('Image upload is only available in the desktop app');
      return;
    }

    try {
      const result = await window.electronAPI.file.selectImages();
      if (result.success && result.data && result.data.length > 0) {
        setSelectedImages((prev) => [...prev, ...(result.data || [])]);
      }
    } catch (error) {
      console.error('Failed to select images:', error);
      setError(error instanceof Error ? error.message : String(error) || 'Failed to select images');
    }
  }, []);

  // Remove selected image
  const handleRemoveImage = useCallback((imageId: string) => {
    setSelectedImages((prev) => prev.filter((img) => img.id !== imageId));
  }, []);

  // Handle clipboard paste
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
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

    // Convert images to base64
    for (const file of imageFiles) {
      try {
        const base64 = await fileToDataUrl(file);
        const newImage: ImageAttachment = {
          id: generateImageId('clipboard'),
          path: '',
          filename: file.name || `clipboard-image-${Date.now()}.${file.type.split('/')[1]}`,
          mimeType: file.type,
          base64,
        };
        setSelectedImages((prev) => [...prev, newImage]);
      } catch (error) {
        console.error('Failed to read clipboard image:', error);
        setError(
          error instanceof Error
            ? error.message
            : String(error) || '클립보드 이미지를 처리하는 중 오류가 발생했습니다'
        );
      }
    }
  }, []);

  // Handle file drop (images)
  const handleImageDrop = useCallback(async (imageFiles: File[]) => {
    for (const file of imageFiles) {
      try {
        const base64 = await fileToDataUrl(file);
        const newImage: ImageAttachment = {
          id: generateImageId('file'),
          path: '',
          filename: file.name,
          mimeType: file.type,
          base64,
        };
        setSelectedImages((prev) => [...prev, newImage]);
      } catch (error) {
        console.error(`Failed to read image ${file.name}:`, error);
      }
    }
  }, []);

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
    handleImageSelect,
    handleRemoveImage,
    handlePaste,
    handleImageDrop,
    clearImages,
    clearError,
  };
}
