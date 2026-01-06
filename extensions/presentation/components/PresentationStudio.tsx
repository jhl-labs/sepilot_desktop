'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { SlidePreview } from './SlidePreview';
import { PresentationMainChat } from './PresentationMainChat';
import { useChatStore } from '@/lib/store/chat-store';
import type { PresentationExportFormat } from '../types';
import { exportPresentation } from '../lib/exporters';
import { generateImagesForSlides } from '../lib/image-generation';
import { Download, FileDown, FileType2, FolderOpen, RefreshCw, X } from 'lucide-react';

export function PresentationStudio() {
  const {
    presentationSlides,
    presentationAgentState,
    presentationExportState,
    setPresentationExportState,
  } = useChatStore();
  const [exporting, setExporting] = useState(false);
  const [lastFormat, setLastFormat] = useState<PresentationExportFormat | null>(null);

  // Split View State
  const [chatWidth, setChatWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = chatWidth;
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      setChatWidth(Math.max(300, Math.min(800, startWidthRef.current + delta)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleExport = async (format: PresentationExportFormat) => {
    if (!presentationSlides.length || exporting) return;

    setExporting(true);
    setLastFormat(format);
    setPresentationExportState({
      format,
      status: 'preparing',
      progressMessage: '이미지 확인 중...',
    });

    try {
      const missingImageSlides = presentationSlides.filter(
        (s) => !s.imageData && !s.imageUrl && !s.imagePrompt
      );
      if (missingImageSlides.length) {
        setPresentationExportState({
          format,
          status: 'preparing',
          progressMessage: `이미지 프롬프트가 없는 슬라이드 ${missingImageSlides.length}개가 있습니다.`,
        });
      }

      const { updatedSlides, errors } = await generateImagesForSlides(
        presentationSlides,
        {},
        (msg) => setPresentationExportState({ format, status: 'working', progressMessage: msg })
      );

      if (errors.length) {
        console.warn('[PresentationStudio] image generation warnings', errors);
      }

      const hasStructured = updatedSlides.some(
        (s) => s.slots?.chart || s.slots?.table || s.slots?.timeline
      );
      if (hasStructured) {
        setPresentationExportState({
          format,
          status: 'working',
          progressMessage: '차트/테이블 렌더링 중...',
        });
      }

      setPresentationExportState({
        format,
        status: 'working',
        progressMessage: '파일 생성 중...',
      });

      const filePath = await exportPresentation(updatedSlides, format);
      setPresentationExportState({
        format,
        status: 'ready',
        filePath,
        progressMessage: '완료',
      });
    } catch (error) {
      console.error('[PresentationStudio] export failed', error);
      setPresentationExportState({
        format,
        status: 'error',
        error: error instanceof Error ? error.message : 'Export failed',
      });
    } finally {
      setExporting(false);
    }
  };

  const clearExportState = () => {
    setPresentationExportState(null);
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-muted/20">
      {/* Left Panel: Chat */}
      <div
        style={{ width: chatWidth }}
        className="flex-shrink-0 h-full border-r bg-background relative flex flex-col"
      >
        <PresentationMainChat />

        {/* Resize Handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors z-20"
          onMouseDown={handleMouseDown}
        />
      </div>

      {/* Right Panel: Preview */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Compact Header */}
        <div className="flex items-center justify-between border-b bg-background px-4 py-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-foreground">Slide Preview</p>
            {presentationSlides.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {presentationSlides.length} pages
              </span>
            )}
          </div>

          {/* Export Buttons */}
          {presentationSlides.length > 0 && (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => handleExport('pptx')}
                disabled={exporting}
                title="Export as PPTX"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">PPTX</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => handleExport('pdf')}
                disabled={exporting}
                title="Export as PDF"
              >
                <FileType2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
              <Button
                size="sm"
                variant="default"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => handleExport('html')}
                disabled={exporting}
                title="Export as HTML"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">HTML</span>
              </Button>
            </div>
          )}
        </div>

        {/* Export Status Toast */}
        {presentationExportState && (
          <div className="mx-4 mt-3">
            <div
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                presentationExportState.status === 'error'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : presentationExportState.status === 'ready'
                    ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400'
                    : 'border-primary/40 bg-primary/5 text-foreground'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {(presentationExportState.status === 'preparing' ||
                  presentationExportState.status === 'working') && (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                )}
                <span className="truncate">
                  {presentationExportState.status === 'error'
                    ? `Error: ${presentationExportState.error}`
                    : presentationExportState.status === 'ready' && presentationExportState.filePath
                      ? 'Export Complete'
                      : presentationExportState.progressMessage}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {presentationExportState.status === 'ready' &&
                  presentationExportState.filePath &&
                  typeof window !== 'undefined' &&
                  window.electronAPI?.fs && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        if (presentationExportState.filePath) {
                          window.electronAPI.fs.showInFolder(presentationExportState.filePath);
                        }
                      }}
                    >
                      <FolderOpen className="h-3 w-3 mr-1" />
                      Open
                    </Button>
                  )}
                {presentationExportState.status === 'error' && lastFormat && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleExport(lastFormat)}
                    disabled={exporting}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={clearExportState}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Preview Area */}
        <div className="flex-1 overflow-hidden relative">
          <SlidePreview />
        </div>
      </div>
    </div>
  );
}
