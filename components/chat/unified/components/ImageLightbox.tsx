'use client';

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { X, Download, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface ImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt: string;
}

export function ImageLightbox({ isOpen, onClose, src, alt }: ImageLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = src;
    link.download = alt || 'image';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const reset = () => {
    setZoom(1);
    setRotation(0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-none bg-black/90 overflow-hidden flex flex-col items-center justify-center">
        <DialogTitle className="sr-only">이미지 확대 보기</DialogTitle>
        <DialogDescription className="sr-only">{alt}</DialogDescription>
        
        {/* Controls */}
        <div className="absolute top-4 right-4 z-50 flex gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/20 rounded-full h-10 w-10"
            onClick={() => setZoom(prev => Math.min(prev + 0.5, 4))}
            title="확대"
          >
            <ZoomIn className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/20 rounded-full h-10 w-10"
            onClick={() => setZoom(prev => Math.max(prev - 0.5, 0.5))}
            title="축소"
          >
            <ZoomOut className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/20 rounded-full h-10 w-10"
            onClick={() => setRotation(prev => (prev + 90) % 360)}
            title="회전"
          >
            <RotateCw className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/20 rounded-full h-10 w-10"
            onClick={handleDownload}
            title="다운로드"
          >
            <Download className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/20 rounded-full h-10 w-10"
            onClick={onClose}
            title="닫기"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Image Container */}
        <div 
          className="w-full h-full flex items-center justify-center p-8 overflow-auto cursor-grab active:cursor-grabbing"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-full object-contain transition-transform duration-200 shadow-2xl"
            style={{ 
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
            onDoubleClick={reset}
          />
        </div>
        
        {/* Helper text */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-xs">
          마우스 더블 클릭으로 원래 크기로 복원
        </div>
      </DialogContent>
    </Dialog>
  );
}
