'use client';

import { useState, useEffect } from 'react';
import { X, Download, Image as ImageIcon, Sparkles, Clipboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { isElectron } from '@/lib/platform';
import type { Message } from '@/types';

interface GalleryImage {
  id: string;
  base64: string;
  filename: string;
  mimeType: string;
  conversationId?: string;
  conversationTitle?: string;
  messageId?: string;
  createdAt: number;
  type: 'pasted' | 'generated';
}

interface GalleryViewProps {
  onClose: () => void;
}

export function GalleryView({ onClose }: GalleryViewProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [filter, setFilter] = useState<'all' | 'pasted' | 'generated'>('all');

  // Load all images from conversations
  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    setLoading(true);
    try {
      const allImages: GalleryImage[] = [];

      if (isElectron() && window.electronAPI) {
        // Electron: Load from database
        const conversationsResult = await window.electronAPI.chat.loadConversations();
        if (conversationsResult.success && conversationsResult.data) {
          for (const conversation of conversationsResult.data) {
            const messagesResult = await window.electronAPI.chat.loadMessages(conversation.id);
            if (messagesResult.success && messagesResult.data) {
              for (const message of messagesResult.data) {
                // User messages with pasted images
                if (message.role === 'user' && message.images && message.images.length > 0) {
                  for (const img of message.images) {
                    if (img.base64) {
                      allImages.push({
                        id: img.id,
                        base64: img.base64,
                        filename: img.filename,
                        mimeType: img.mimeType,
                        conversationId: conversation.id,
                        conversationTitle: conversation.title,
                        messageId: message.id,
                        createdAt: message.created_at,
                        type: 'pasted',
                      });
                    }
                  }
                }
                // Assistant messages with generated images
                if (message.role === 'assistant' && message.images && message.images.length > 0) {
                  for (const img of message.images) {
                    if (img.base64) {
                      allImages.push({
                        id: img.id,
                        base64: img.base64,
                        filename: img.filename,
                        mimeType: img.mimeType,
                        conversationId: conversation.id,
                        conversationTitle: conversation.title,
                        messageId: message.id,
                        createdAt: message.created_at,
                        type: 'generated',
                      });
                    }
                  }
                }
              }
            }
          }
        }
      } else {
        // Web: Load from localStorage
        const savedMessages = localStorage.getItem('sepilot_messages');
        if (savedMessages) {
          const messagesMap = JSON.parse(savedMessages) as Record<string, Message[]>;
          for (const [convId, messages] of Object.entries(messagesMap)) {
            for (const message of messages) {
              if (message.images && message.images.length > 0) {
                for (const img of message.images) {
                  if (img.base64) {
                    allImages.push({
                      id: img.id,
                      base64: img.base64,
                      filename: img.filename,
                      mimeType: img.mimeType,
                      conversationId: convId,
                      messageId: message.id,
                      createdAt: message.created_at,
                      type: message.role === 'user' ? 'pasted' : 'generated',
                    });
                  }
                }
              }
            }
          }
        }
      }

      // Sort by date (newest first)
      allImages.sort((a, b) => b.createdAt - a.createdAt);
      setImages(allImages);
    } catch (error) {
      console.error('Failed to load images:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (image: GalleryImage) => {
    const link = document.createElement('a');
    link.href = image.base64;
    link.download = image.filename || `image-${image.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredImages = images.filter((img) => {
    if (filter === 'all') {return true;}
    return img.type === filter;
  });

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <ImageIcon className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-semibold">이미지 갤러리</h2>
          <span className="text-sm text-muted-foreground">
            ({filteredImages.length}개)
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="border-b px-6 py-2">
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            전체 ({images.length})
          </Button>
          <Button
            variant={filter === 'pasted' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('pasted')}
            className="gap-1"
          >
            <Clipboard className="h-4 w-4" />
            붙여넣기 ({images.filter((i) => i.type === 'pasted').length})
          </Button>
          <Button
            variant={filter === 'generated' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('generated')}
            className="gap-1"
          >
            <Sparkles className="h-4 w-4" />
            생성됨 ({images.filter((i) => i.type === 'generated').length})
          </Button>
        </div>
      </div>

      {/* Gallery Grid */}
      <ScrollArea className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <ImageIcon className="mb-4 h-16 w-16 opacity-30" />
            <p className="text-lg font-medium">이미지가 없습니다</p>
            <p className="mt-2 text-sm">
              {filter === 'all'
                ? '채팅에서 이미지를 붙여넣거나 생성하면 여기에 표시됩니다'
                : filter === 'pasted'
                  ? '아직 붙여넣기한 이미지가 없습니다'
                  : '아직 생성한 이미지가 없습니다'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredImages.map((image) => (
              <div
                key={image.id}
                className="group relative aspect-square overflow-hidden rounded-lg border bg-muted cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                onClick={() => setSelectedImage(image)}
              >
                <img
                  src={image.base64}
                  alt={image.filename}
                  className="h-full w-full object-cover"
                />
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <div className="flex items-center gap-1 text-white text-xs">
                      {image.type === 'generated' ? (
                        <Sparkles className="h-3 w-3" />
                      ) : (
                        <Clipboard className="h-3 w-3" />
                      )}
                      <span>{image.type === 'generated' ? '생성됨' : '붙여넣기'}</span>
                    </div>
                    <p className="text-white text-xs mt-1 line-clamp-1">
                      {image.conversationTitle || '대화'}
                    </p>
                  </div>
                </div>
                {/* Type badge */}
                <div
                  className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                    image.type === 'generated'
                      ? 'bg-purple-500/80 text-white'
                      : 'bg-blue-500/80 text-white'
                  }`}
                >
                  {image.type === 'generated' ? 'AI' : 'User'}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Image Preview Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-background rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                {selectedImage.type === 'generated' ? (
                  <Sparkles className="h-4 w-4 text-purple-500" />
                ) : (
                  <Clipboard className="h-4 w-4 text-blue-500" />
                )}
                <span className="font-medium">
                  {selectedImage.type === 'generated' ? 'AI 생성 이미지' : '붙여넣기 이미지'}
                </span>
                <span className="text-sm text-muted-foreground">
                  • {formatDate(selectedImage.createdAt)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDownload(selectedImage)}
                  title="다운로드"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedImage(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {/* Image */}
            <div className="p-4 flex items-center justify-center bg-muted/30">
              <img
                src={selectedImage.base64}
                alt={selectedImage.filename}
                className="max-h-[70vh] max-w-full object-contain rounded"
              />
            </div>
            {/* Modal Footer */}
            <div className="border-t px-4 py-3 text-sm text-muted-foreground">
              <p>
                <span className="font-medium">대화:</span>{' '}
                {selectedImage.conversationTitle || '알 수 없음'}
              </p>
              <p className="line-clamp-1">
                <span className="font-medium">파일명:</span> {selectedImage.filename}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
