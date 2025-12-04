'use client';

/**
 * ImageAttachmentPlugin
 *
 * 이미지 첨부 기능 플러그인
 * Main Chat에서 사용 (이미지 선택, 미리보기, 제거, 붙여넣기)
 */

import { ImagePlus, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import type { ImageAttachment } from '@/types';

interface ImageAttachmentPluginProps {
  selectedImages: ImageAttachment[];
  onImageSelect: () => Promise<void>;
  onImageRemove: (imageId: string) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  isStreaming: boolean;
  mounted?: boolean;
}

export function ImageAttachmentPlugin({
  selectedImages,
  onImageSelect,
  onImageRemove,
  isStreaming,
  mounted = true,
}: ImageAttachmentPluginProps) {
  return (
    <>
      {/* Selected Images Preview */}
      {selectedImages.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {mounted ? (
            <TooltipProvider>
              {selectedImages.map((image, index) => (
                <Tooltip key={image.id}>
                  <TooltipTrigger asChild>
                    <div className="relative inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm group hover:bg-accent/80 transition-colors">
                      <ImagePlus className="h-3.5 w-3.5" />
                      <span className="font-medium">이미지 #{index + 1}</span>
                      <button
                        onClick={() => onImageRemove(image.id)}
                        className="ml-1 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                        disabled={isStreaming}
                        title="이미지 제거"
                        aria-label="이미지 제거"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="p-0 border-0 shadow-lg">
                    <div className="max-w-xs">
                      <img
                        src={image.base64}
                        alt={image.filename}
                        className="rounded-md max-h-48 w-auto"
                      />
                      <div className="p-2 text-xs text-muted-foreground bg-background/95 backdrop-blur">
                        {image.filename}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
          ) : (
            // Fallback for SSR - no tooltip
            selectedImages.map((image, index) => (
              <div
                key={image.id}
                className="relative inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm group hover:bg-accent/80 transition-colors"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                <span className="font-medium">이미지 #{index + 1}</span>
                <button
                  onClick={() => onImageRemove(image.id)}
                  className="ml-1 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                  disabled={isStreaming}
                  title="이미지 제거"
                  aria-label="이미지 제거"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Image Upload Button */}
      <Button
        onClick={onImageSelect}
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-xl shrink-0"
        title="이미지 추가"
        aria-label="이미지 파일 선택"
        disabled={isStreaming}
      >
        <ImagePlus className="h-4 w-4" />
      </Button>
    </>
  );
}
