'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { generateId } from '@/lib/utils';
import { SlideRenderer } from './SlideRenderer';
import { SlideMasterPreview } from './SlideMasterPreview';
import { DesignOptionsPreview } from './DesignOptionsPreview';
import {
  ChevronLeft,
  ChevronRight,
  LayoutTemplate,
  Maximize2,
  Minimize2,
  Edit3,
  Check,
  X,
} from 'lucide-react';
import type { PresentationSlide } from '@/types/presentation';

const ACCENT_COLORS = ['#7c3aed', '#0ea5e9', '#22c55e', '#f97316', '#06b6d4', '#ef4444'];

export function SlidePreview() {
  const {
    presentationSlides,
    activePresentationSlideId,
    setActivePresentationSlide,
    addPresentationSlide,
    updatePresentationSlide,
    presentationAgentState,
  } = useChatStore();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingSlide, setEditingSlide] = useState<PresentationSlide | null>(null);
  const isInternalUpdate = useRef(false);

  // Reset currentIndex if it's out of bounds
  useEffect(() => {
    if (presentationSlides.length > 0 && currentIndex >= presentationSlides.length) {
      setCurrentIndex(presentationSlides.length - 1);
    }
  }, [presentationSlides.length, currentIndex]);

  // Navigation functions
  const goToNext = useCallback(() => {
    if (currentIndex < presentationSlides.length - 1) {
      isInternalUpdate.current = true;
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, presentationSlides.length]);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      isInternalUpdate.current = true;
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const goToSlide = useCallback((index: number) => {
    isInternalUpdate.current = true;
    setCurrentIndex(index);
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Sync currentIndex with activePresentationSlideId (외부에서 변경된 경우만)
  useEffect(() => {
    if (!isInternalUpdate.current && activePresentationSlideId) {
      // undefined 요소를 필터링하여 안전하게 처리
      const idx = presentationSlides.findIndex((s) => s && s.id === activePresentationSlideId);
      if (idx !== -1 && idx !== currentIndex) {
        setCurrentIndex(idx);
      }
    }
    // currentIndex를 의존성에서 제거하여 무한 루프 방지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePresentationSlideId, presentationSlides]);

  // Update active slide when currentIndex changes (내부에서 변경된 경우만)
  useEffect(() => {
    if (
      isInternalUpdate.current &&
      presentationSlides.length > 0 &&
      presentationSlides[currentIndex]
    ) {
      setActivePresentationSlide(presentationSlides[currentIndex].id);
      isInternalUpdate.current = false;
    }
  }, [currentIndex, presentationSlides, setActivePresentationSlide]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrevious, toggleFullscreen]);

  const handleAddSlide = () => {
    const accentColor = ACCENT_COLORS[presentationSlides.length % ACCENT_COLORS.length];
    addPresentationSlide({
      id: generateId(),
      title: '새 슬라이드',
      description: 'ppt-agent가 채울 내용을 입력하거나 직접 수정하세요.',
      bullets: ['핵심 메시지', '지원 근거', '시각 요소 제안'],
      accentColor,
      layout: 'title-body',
      titleFont: 'Sora Bold',
      bodyFont: 'Inter Regular',
      vibe: 'modern tech',
    });
  };

  const handleEditSlide = () => {
    const slide = presentationSlides[currentIndex];
    if (slide) {
      setEditingSlide({ ...slide });
      setIsEditMode(true);
    }
  };

  const handleSaveEdit = () => {
    if (editingSlide) {
      updatePresentationSlide(editingSlide.id, editingSlide);
      setIsEditMode(false);
      setEditingSlide(null);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditingSlide(null);
  };

  const handleAddBullet = () => {
    if (editingSlide) {
      const newBullets = editingSlide.bullets ? [...editingSlide.bullets, ''] : [''];
      setEditingSlide({ ...editingSlide, bullets: newBullets });
    }
  };

  const handleRemoveBullet = (index: number) => {
    if (editingSlide && editingSlide.bullets) {
      const newBullets = editingSlide.bullets.filter((_, i) => i !== index);
      setEditingSlide({ ...editingSlide, bullets: newBullets });
    }
  };

  // 디자인 단계에서 옵션 미리보기 표시
  if (
    presentationSlides.length === 0 &&
    presentationAgentState?.currentStep === 'design-master' &&
    presentationAgentState?.designOptions &&
    presentationAgentState.designOptions.length > 0
  ) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">디자인 옵션 미리보기</p>
            <p className="text-xs text-muted-foreground">
              우측 상단에서 옵션을 선택하여 비교해보세요.
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <DesignOptionsPreview designOptions={presentationAgentState.designOptions} />
        </div>
      </div>
    );
  }

  // 구조 단계에서 디자인 마스터 미리보기 표시
  if (
    presentationSlides.length === 0 &&
    presentationAgentState?.currentStep === 'structure' &&
    presentationAgentState?.designMaster
  ) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">디자인 템플릿 미리보기</p>
            <p className="text-xs text-muted-foreground">
              선택한 디자인으로 슬라이드가 생성됩니다.
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <SlideMasterPreview designMaster={presentationAgentState.designMaster} />
        </div>
      </div>
    );
  }

  if (presentationSlides.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">슬라이드 미리보기</p>
            <p className="text-xs text-muted-foreground">AI가 제안한 프레젠테이션을 확인하세요.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={handleAddSlide}>
            <LayoutTemplate className="mr-2 h-4 w-4" />
            수동 추가
          </Button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-sm text-muted-foreground">아직 생성된 슬라이드가 없습니다.</div>
          <div className="text-xs text-muted-foreground">
            좌측 Sidebar에서 브리핑을 보내거나 수동으로 추가하세요.
          </div>
        </div>
      </div>
    );
  }

  // Ensure currentIndex is within bounds (safety check)
  const safeIndex = Math.min(currentIndex, presentationSlides.length - 1);
  const currentSlide = presentationSlides[safeIndex];

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
      {/* Header */}
      {!isFullscreen && (
        <div className="flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
          <div>
            <p className="text-sm font-semibold text-foreground">
              슬라이드 {safeIndex + 1} / {presentationSlides.length}
            </p>
            <p className="text-xs text-muted-foreground">화살표 키로 이동 · F키로 전체화면</p>
          </div>
          <div className="flex items-center gap-2">
            {!isEditMode ? (
              <>
                <Button size="sm" variant="ghost" onClick={toggleFullscreen}>
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
                <Button size="sm" variant="outline" onClick={handleEditSlide}>
                  <Edit3 className="mr-2 h-4 w-4" />
                  편집
                </Button>
                <Button size="sm" variant="secondary" onClick={handleAddSlide}>
                  <LayoutTemplate className="mr-2 h-4 w-4" />
                  추가
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                  <X className="mr-2 h-4 w-4" />
                  취소
                </Button>
                <Button size="sm" variant="default" onClick={handleSaveEdit}>
                  <Check className="mr-2 h-4 w-4" />
                  저장
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Slide Display */}
      <div className="relative flex flex-1 items-center justify-center p-8">
        {/* Navigation Buttons */}
        {!isEditMode && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 z-10 h-12 w-12 -translate-y-1/2 rounded-full bg-background/80 shadow-lg backdrop-blur-sm hover:bg-background/95"
              onClick={goToPrevious}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 z-10 h-12 w-12 -translate-y-1/2 rounded-full bg-background/80 shadow-lg backdrop-blur-sm hover:bg-background/95"
              onClick={goToNext}
              disabled={currentIndex === presentationSlides.length - 1}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}

        {/* Current Slide */}
        <div className="max-w-7xl flex-1">
          <SlideRenderer
            slide={isEditMode && editingSlide ? editingSlide : currentSlide}
            isEditable={isEditMode}
            onSlideChange={setEditingSlide}
            onAddBullet={handleAddBullet}
            onRemoveBullet={handleRemoveBullet}
          />
        </div>
      </div>

      {/* Thumbnail Navigation */}
      {!isFullscreen && presentationSlides.length > 1 && (
        <div className="border-t bg-background/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex gap-2 overflow-x-auto">
            {presentationSlides
              .filter((s) => s)
              .map((slide, idx) => (
                <button
                  key={slide.id}
                  onClick={() => goToSlide(idx)}
                  className={`group relative flex-shrink-0 rounded-md border-2 transition-all ${
                    idx === currentIndex
                      ? 'border-primary shadow-md'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                  style={{
                    borderColor: idx === currentIndex ? slide.accentColor : undefined,
                  }}
                >
                  <div className="relative h-16 w-28 overflow-hidden rounded-sm bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
                    {/* Thumbnail mini preview */}
                    <div className="absolute inset-0 flex flex-col justify-center px-2">
                      <div className="truncate text-[10px] font-semibold">{slide.title}</div>
                      <div
                        className="mt-1 h-0.5 w-6 rounded-full"
                        style={{ backgroundColor: slide.accentColor }}
                      />
                    </div>
                    {/* Slide number badge */}
                    <div className="absolute bottom-0.5 right-0.5 rounded-sm bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white">
                      {idx + 1}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Fullscreen Exit Hint */}
      {isFullscreen && (
        <div className="absolute right-4 top-4 rounded-md bg-black/60 px-3 py-2 text-xs text-white backdrop-blur-sm">
          ESC 또는 F키로 전체화면 종료
        </div>
      )}
    </div>
  );
}
