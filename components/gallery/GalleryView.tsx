'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Download,
  Image as ImageIcon,
  Sparkles,
  Clipboard,
  Copy,
  Link,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { isElectron } from '@/lib/platform';
import type { Message } from '@/types';
import { runPromisesInBatches } from '@/lib/utils/batch';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface GalleryImage {
  id: string;
  base64: string;
  filename: string;
  mimeType: string;
  conversationId?: string;
  conversationTitle?: string;
  messageId?: string;
  createdAt: number;
  type: 'pasted' | 'generated' | 'linked';
  url?: string; // 링크 이미지의 경우 원본 URL
  provider?: 'comfyui' | 'nanobanana'; // 생성 이미지의 경우 생성 출처
}

interface GalleryViewProps {
  onClose: () => void;
}

const DEFAULT_MESSAGE_LOAD_BATCH_SIZE = 8;
const MAX_MESSAGE_LOAD_BATCH_SIZE = 32;

function getMessageLoadBatchSize(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_MESSAGE_LOAD_BATCH_SIZE;
  }

  const raw = window.localStorage.getItem('sepilot_gallery_batch_size');
  if (!raw) {
    return DEFAULT_MESSAGE_LOAD_BATCH_SIZE;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_MESSAGE_LOAD_BATCH_SIZE;
  }

  return Math.min(Math.max(parsed, 1), MAX_MESSAGE_LOAD_BATCH_SIZE);
}

export function GalleryView({ onClose }: GalleryViewProps) {
  const { t } = useTranslation();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [filter, setFilter] = useState<'all' | 'pasted' | 'generated' | 'linked'>('all');

  // Load all images from conversations
  useEffect(() => {
    loadImages();
  }, []);

  // Extract image URLs from markdown content
  const extractMarkdownImages = (content: string): string[] => {
    const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
    const matches = content.matchAll(imageRegex);
    return Array.from(matches, (match) => match[1]);
  };

  const collectImagesFromMessage = (
    message: Message,
    conversationId: string,
    conversationTitle?: string
  ): GalleryImage[] => {
    const extracted: GalleryImage[] = [];

    if (message.images && message.images.length > 0) {
      for (const img of message.images) {
        if (!img.base64) {
          continue;
        }

        extracted.push({
          id: img.id,
          base64: img.base64,
          filename: img.filename,
          mimeType: img.mimeType,
          conversationId,
          conversationTitle,
          messageId: message.id,
          createdAt: message.created_at,
          type: message.role === 'assistant' ? 'generated' : 'pasted',
          provider: message.role === 'assistant' ? img.provider : undefined,
        });
      }
    }

    if (message.content) {
      const imageUrls = extractMarkdownImages(message.content);
      for (const url of imageUrls) {
        extracted.push({
          id: `${message.id}-${url}`,
          base64: url, // URL을 base64 필드에 저장 (표시용)
          filename: url.split('/').pop() || 'linked-image',
          mimeType: 'image/png', // 기본값
          conversationId,
          conversationTitle,
          messageId: message.id,
          createdAt: message.created_at,
          type: 'linked',
          url,
        });
      }
    }

    return extracted;
  };

  const loadImages = async () => {
    setLoading(true);
    try {
      const allImages: GalleryImage[] = [];

      if (isElectron() && window.electronAPI) {
        // Electron: Load from database
        const conversationsResult = await window.electronAPI.chat.loadConversations();
        if (conversationsResult.success && conversationsResult.data) {
          const messageLoadResults = await runPromisesInBatches(
            conversationsResult.data,
            getMessageLoadBatchSize(),
            async (conversation) => {
              const messagesResult = await window.electronAPI.chat.loadMessages(conversation.id);
              if (!messagesResult.success || !messagesResult.data) {
                return [];
              }
              return messagesResult.data.flatMap((message) =>
                collectImagesFromMessage(message, conversation.id, conversation.title)
              );
            }
          );

          for (const result of messageLoadResults) {
            if (result.status === 'fulfilled') {
              allImages.push(...result.value);
            }
          }
        }
      } else {
        // Web: Load from localStorage
        const savedMessages = localStorage.getItem('sepilot_messages');
        if (savedMessages) {
          const messagesMap = JSON.parse(savedMessages) as Record<string, Message[]>;
          for (const [convId, messages] of Object.entries(messagesMap)) {
            allImages.push(
              ...messages.flatMap((message) => collectImagesFromMessage(message, convId))
            );
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

  const handleCopyImage = async (image: GalleryImage) => {
    try {
      // base64 데이터를 Blob으로 변환
      const base64Data = image.base64.split(',')[1];
      const byteCharacters = window.atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: image.mimeType });

      // ClipboardItem으로 클립보드에 복사
      const clipboardItem = new ClipboardItem({ [image.mimeType]: blob });
      await navigator.clipboard.write([clipboardItem]);
    } catch (error) {
      console.error('이미지 복사 실패:', error);
    }
  };

  const handleSaveAsFile = (image: GalleryImage) => {
    // 브라우저 다운로드 기능 사용 (Electron과 Web 모두 동일)
    handleDownload(image);
  };

  const imageCounts = useMemo(() => {
    const counts = {
      all: images.length,
      pasted: 0,
      generated: 0,
      linked: 0,
    };

    for (const image of images) {
      if (image.type === 'pasted') {
        counts.pasted += 1;
      } else if (image.type === 'generated') {
        counts.generated += 1;
      } else {
        counts.linked += 1;
      }
    }

    return counts;
  }, [images]);

  const filteredImages = useMemo(() => {
    if (filter === 'all') {
      return images;
    }
    return images.filter((img) => img.type === filter);
  }, [filter, images]);

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
          <h2 className="text-xl font-semibold">{t('gallery.title')}</h2>
          <span className="text-sm text-muted-foreground">
            {t('gallery.count', { count: filteredImages.length })}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close Gallery">
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
            {t('gallery.filters.all', { count: imageCounts.all })}
          </Button>
          <Button
            variant={filter === 'pasted' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('pasted')}
            className="gap-1"
          >
            <Clipboard className="h-4 w-4" />
            {t('gallery.filters.pasted', { count: imageCounts.pasted })}
          </Button>
          <Button
            variant={filter === 'generated' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('generated')}
            className="gap-1"
          >
            <Sparkles className="h-4 w-4" />
            {t('gallery.filters.generated', { count: imageCounts.generated })}
          </Button>
          <Button
            variant={filter === 'linked' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('linked')}
            className="gap-1"
          >
            <Link className="h-4 w-4" />
            {t('gallery.filters.linked', { count: imageCounts.linked })}
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
            <p className="text-lg font-medium">{t('gallery.noImages')}</p>
            <p className="mt-2 text-sm">
              {filter === 'all'
                ? t('gallery.noImagesHint.all')
                : filter === 'pasted'
                  ? t('gallery.noImagesHint.pasted')
                  : filter === 'generated'
                    ? t('gallery.noImagesHint.generated')
                    : t('gallery.noImagesHint.linked')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredImages.map((image) => (
              <ContextMenu key={image.id}>
                <ContextMenuTrigger>
                  <div
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
                          ) : image.type === 'linked' ? (
                            <Link className="h-3 w-3" />
                          ) : (
                            <Clipboard className="h-3 w-3" />
                          )}
                          <span>
                            {image.type === 'generated'
                              ? t('gallery.type.generated')
                              : image.type === 'linked'
                                ? t('gallery.type.linked')
                                : t('gallery.type.pasted')}
                          </span>
                        </div>
                        <p className="text-white text-xs mt-1 line-clamp-1">
                          {image.conversationTitle || '대화'}
                        </p>
                      </div>
                    </div>
                    {/* Type badge */}
                    <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                      <div
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          image.type === 'generated'
                            ? 'bg-purple-500/80 text-white'
                            : image.type === 'linked'
                              ? 'bg-green-500/80 text-white'
                              : 'bg-blue-500/80 text-white'
                        }`}
                      >
                        {image.type === 'generated'
                          ? 'AI'
                          : image.type === 'linked'
                            ? 'Link'
                            : 'User'}
                      </div>
                      {/* Provider badge for generated images */}
                      {image.type === 'generated' && image.provider && (
                        <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/60 text-white">
                          {image.provider === 'comfyui' ? 'ComfyUI' : 'NanoBanana'}
                        </div>
                      )}
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onClick={() => handleCopyImage(image)}
                    className="cursor-pointer"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t('gallery.copyImage')}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => handleSaveAsFile(image)}
                    className="cursor-pointer"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {t('gallery.saveAsFile')}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleDownload(image)} className="cursor-pointer">
                    <Download className="mr-2 h-4 w-4" />
                    {t('gallery.download')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
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
                ) : selectedImage.type === 'linked' ? (
                  <Link className="h-4 w-4 text-green-500" />
                ) : (
                  <Clipboard className="h-4 w-4 text-blue-500" />
                )}
                <span className="font-medium">
                  {selectedImage.type === 'generated'
                    ? t('gallery.typeLabel.generated')
                    : selectedImage.type === 'linked'
                      ? t('gallery.typeLabel.linked')
                      : t('gallery.typeLabel.pasted')}
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
                  title={t('gallery.download')}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedImage(null)}
                  aria-label="Close Image Preview"
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
                <span className="font-medium">{t('gallery.conversationLabel')}:</span>{' '}
                {selectedImage.conversationTitle || t('gallery.unknown')}
              </p>
              {selectedImage.type === 'linked' && selectedImage.url ? (
                <p className="line-clamp-1">
                  <span className="font-medium">URL:</span>{' '}
                  <a
                    href={selectedImage.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {selectedImage.url}
                  </a>
                </p>
              ) : (
                <p className="line-clamp-1">
                  <span className="font-medium">{t('gallery.filename')}:</span>{' '}
                  {selectedImage.filename}
                </p>
              )}
              {selectedImage.type === 'generated' && selectedImage.provider && (
                <p>
                  <span className="font-medium">{t('gallery.provider')}:</span>{' '}
                  {selectedImage.provider === 'comfyui' ? 'ComfyUI' : 'NanoBanana (Google Imagen)'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
