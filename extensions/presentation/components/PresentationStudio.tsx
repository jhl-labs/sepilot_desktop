'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SlidePreview } from './SlidePreview';
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
    <div className="flex h-full flex-col bg-muted/20">
      {/* Compact Header */}
      <div className="flex items-center justify-between border-b bg-background px-4 py-2">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium text-foreground">슬라이드 미리보기</p>
          {presentationSlides.length > 0 && (
            <span className="text-xs text-muted-foreground">{presentationSlides.length}장</span>
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
              title="PPTX로 내보내기"
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
              title="PDF로 내보내기"
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
              title="HTML로 내보내기"
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
                  ? `오류: ${presentationExportState.error}`
                  : presentationExportState.status === 'ready' && presentationExportState.filePath
                    ? '내보내기 완료'
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
                    열기
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
                  재시도
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={clearExportState}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Preview Area */}
      <div className="flex-1 overflow-hidden">
        <SlidePreview />
      </div>
    </div>
  );
}
