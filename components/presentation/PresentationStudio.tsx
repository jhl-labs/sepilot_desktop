'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SlidePreview } from './SlidePreview';
import { useChatStore } from '@/lib/store/chat-store';
import type { PresentationExportFormat } from '@/types/presentation';
import { exportPresentation } from '@/lib/presentation/exporters';
import { generateImagesForSlides } from '@/lib/presentation/image-generation';
import { Download, FileDown, FileType2 } from 'lucide-react';

export function PresentationStudio() {
  const { presentationSlides, presentationExportState, setPresentationExportState } =
    useChatStore();
  const [exporting, setExporting] = useState(false);
  const [lastFormat, setLastFormat] = useState<PresentationExportFormat | null>(null);

  const handleExport = async (format: PresentationExportFormat) => {
    if (!presentationSlides.length || exporting) {
      return;
    }
    setExporting(true);
    setLastFormat(format);
    setPresentationExportState({
      format,
      status: 'preparing',
      progressMessage: '이미지 확인 중...',
    });
    try {
      // Preflight: check missing images/prompts
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
        setPresentationExportState({
          format,
          status: 'working',
          progressMessage: `이미지 경고: ${errors.slice(0, 2).join(' | ')}`,
        });
      }

      // Preflight: chart/table placeholders notice
      const hasStructured = updatedSlides.some(
        (s) => s.slots?.chart || s.slots?.table || s.slots?.timeline
      );
      if (hasStructured) {
        setPresentationExportState({
          format,
          status: 'working',
          progressMessage:
            '차트/타임라인/테이블은 샘플 데이터로 렌더링됩니다. 실제 데이터 연결은 후처리 필요.',
        });
      }

      setPresentationExportState({
        format,
        status: 'working',
        progressMessage: '내보내기 파일 생성 중...',
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

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-lg font-semibold text-foreground">Presentation Mode</p>
          <p className="text-sm text-muted-foreground">
            좌측 대화로 ppt-agent에게 설계를 요청하고, 우측에서 슬라이드를 검토한 뒤 내보내세요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="gap-2"
            onClick={() => handleExport('pptx')}
            disabled={!presentationSlides.length || exporting}
          >
            <FileDown className="h-4 w-4" />
            PPTX
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="gap-2"
            onClick={() => handleExport('pdf')}
            disabled={!presentationSlides.length || exporting}
          >
            <FileType2 className="h-4 w-4" />
            PDF
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => handleExport('html')}
            disabled={!presentationSlides.length || exporting}
          >
            <Download className="h-4 w-4" />
            HTML
          </Button>
        </div>
      </div>

      {presentationExportState?.status === 'preparing' && (
        <div className="mx-4 rounded-lg border border-muted-foreground/40 bg-muted/10 px-4 py-3 text-sm text-foreground">
          {presentationExportState.progressMessage || '내보내기 준비 중입니다...'}
        </div>
      )}
      {presentationExportState?.status === 'working' && (
        <div className="mx-4 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary-foreground">
          {presentationExportState.progressMessage || '이미지 생성 및 파일 빌드 중...'}
        </div>
      )}

      {presentationExportState?.status === 'error' && (
        <div className="mx-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Export 실패: {presentationExportState.error}
          {lastFormat && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-2"
              disabled={exporting}
              onClick={() => handleExport(lastFormat)}
            >
              다시 시도
            </Button>
          )}
        </div>
      )}
      {presentationExportState?.status === 'ready' && presentationExportState.filePath && (
        <div className="mx-4 flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary-foreground">
          <span>내보내기 완료: {presentationExportState.filePath}</span>
          {typeof window !== 'undefined' && window.electronAPI?.fs && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const filePath = presentationExportState.filePath;
                if (filePath) {
                  window.electronAPI.fs.showInFolder(filePath);
                }
              }}
            >
              폴더 열기
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col px-2 pb-2">
        <div className="flex-1 overflow-hidden rounded-lg border bg-card shadow-sm">
          <SlidePreview />
        </div>
      </div>
    </div>
  );
}
