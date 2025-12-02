'use client';

/**
 * ImageAttachmentPlugin
 *
 * 이미지 첨부 기능 (Main 모드 전용)
 * Image selection, preview, drag & drop
 */

import { X, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PluginProps } from '../types';
import type { ImageAttachment } from '@/types';

interface ImageAttachmentPluginProps extends PluginProps {
  images: ImageAttachment[];
  onAddImages: (images: ImageAttachment[]) => void;
  onRemoveImage: (id: string) => void;
}

export function ImageAttachmentPlugin({
  images,
  onAddImages,
  onRemoveImage,
}: ImageAttachmentPluginProps) {
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: ImageAttachment[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;

      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsDataURL(file);
      });

      newImages.push({
        id: `img-${Date.now()}-${Math.random()}`,
        path: '',
        filename: file.name,
        mimeType: file.type,
        base64,
      });
    }

    onAddImages(newImages);
  };

  return (
    <>
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((img) => (
            <div key={img.id} className="relative group">
              <img
                src={img.base64}
                alt={img.filename}
                className="h-20 w-20 object-cover rounded-md border"
              />
              <Button
                onClick={() => onRemoveImage(img.id)}
                size="icon"
                variant="destructive"
                className="absolute -top-2 -right-2 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          id="image-upload"
        />
        <label htmlFor="image-upload">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <span>
              <ImagePlus className="h-4 w-4" />
            </span>
          </Button>
        </label>
      </div>
    </>
  );
}
