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
  Plus,
  Maximize2,
  Minimize2,
  Edit3,
  Check,
  X,
  Sparkles,
  Palette,
  LayoutList,
} from 'lucide-react';
import type { PresentationSlide } from '../types';

const ACCENT_COLORS = ['#7c3aed', '#0ea5e9', '#22c55e', '#f97316', '#06b6d4', '#ef4444'];

import { useTranslation } from 'react-i18next';

export function SlidePreview() {
  const { t } = useTranslation();
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

  // Sync currentIndex with activePresentationSlideId
  useEffect(() => {
    if (!isInternalUpdate.current && activePresentationSlideId) {
      const idx = presentationSlides.findIndex((s) => s && s.id === activePresentationSlideId);
      if (idx !== -1 && idx !== currentIndex) {
        setCurrentIndex(idx);
      }
    }
  }, [activePresentationSlideId, presentationSlides]);

  // Update active slide when currentIndex changes
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
      if (isEditMode) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrevious, toggleFullscreen, isFullscreen, isEditMode]);

  const handleAddSlide = () => {
    const accentColor = ACCENT_COLORS[presentationSlides.length % ACCENT_COLORS.length];
    addPresentationSlide({
      id: generateId(),
      title: '새 슬라이드',
      description: '내용을 입력하세요.',
      bullets: ['핵심 메시지', '지원 근거'],
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
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-background">
          <Palette className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium">{t('presentation.preview.designOptionTitle')}</p>
            <p className="text-xs text-muted-foreground">
              {t('presentation.preview.designOptionDesc')}
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
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-background">
          <LayoutList className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium">{t('presentation.preview.templateTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('presentation.preview.templateDesc')}</p>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <SlideMasterPreview designMaster={presentationAgentState.designMaster} />
        </div>
      </div>
    );
  }

  // 빈 상태 화면
  if (presentationSlides.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="max-w-sm space-y-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">{t('presentation.preview.title')}</h3>
            <p className="text-sm text-muted-foreground">
              {presentationAgentState?.currentStep === 'briefing'
                ? t('presentation.preview.emptyBriefing')
                : presentationAgentState?.currentStep === 'design-master'
                  ? t('presentation.preview.emptyDesign')
                  : presentationAgentState?.currentStep === 'structure'
                    ? t('presentation.preview.emptyStructure')
                    : presentationAgentState?.currentStep === 'slide-creation'
                      ? t('presentation.preview.emptyCreation')
                      : t('presentation.preview.emptyDefault')}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleAddSlide} className="gap-2">
            <Plus className="h-4 w-4" />
            {t('presentation.preview.manualAdd')}
          </Button>
        </div>
      </div>
    );
  }

  // Ensure currentIndex is within bounds
  const safeIndex = Math.min(currentIndex, presentationSlides.length - 1);
  const currentSlide = presentationSlides[safeIndex];

  // Fullscreen mode
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* Fullscreen slide */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-7xl">
            <SlideRenderer
              slide={currentSlide}
              isEditable={false}
              onSlideChange={() => { }}
              onAddBullet={() => { }}
              onRemoveBullet={() => { }}
            />
          </div>
        </div>

        {/* Fullscreen controls */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-white hover:bg-white/20"
              onClick={goToPrevious}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <span className="text-sm text-white/80">
              {safeIndex + 1} / {presentationSlides.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-white hover:bg-white/20"
              onClick={goToNext}
              disabled={currentIndex === presentationSlides.length - 1}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        </div>

        {/* Exit hint */}
        <div className="absolute right-4 top-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-white/80 hover:text-white hover:bg-white/20"
            onClick={() => setIsFullscreen(false)}
          >
            <Minimize2 className="h-4 w-4 mr-2" />
            {t('presentation.actions.stop')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Slide Navigation Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goToPrevious}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[60px] text-center">
            {safeIndex + 1} / {presentationSlides.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goToNext}
            disabled={currentIndex === presentationSlides.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          {!isEditMode ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleEditSlide}
              >
                <Edit3 className="h-3 w-3 mr-1" />
                {t('documentsSync.buttons.edit')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleAddSlide}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t('documentsSync.buttons.add')}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleFullscreen}
                title="전체화면 (F)"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleCancelEdit}
              >
                <X className="h-3 w-3 mr-1" />
                {t('documentsSync.buttons.cancel')}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleSaveEdit}
              >
                <Check className="h-3 w-3 mr-1" />
                {t('documentsSync.buttons.save').replace('설정 ', '').replace(' Settings', '')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Slide Display */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        <div className="w-full max-w-5xl">
          <SlideRenderer
            slide={isEditMode && editingSlide ? editingSlide : currentSlide}
            isEditable={isEditMode}
            onSlideChange={setEditingSlide}
            onAddBullet={handleAddBullet}
            onRemoveBullet={handleRemoveBullet}
          />
        </div>
      </div>

      {/* Thumbnail Strip */}
      {presentationSlides.length > 1 && (
        <div className="border-t bg-background px-2 py-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {presentationSlides
              .filter((s) => s)
              .map((slide, idx) => (
                <button
                  key={slide.id}
                  onClick={() => goToSlide(idx)}
                  className={`group relative flex-shrink-0 rounded border transition-all ${idx === currentIndex
                      ? 'border-primary ring-1 ring-primary/30'
                      : 'border-transparent hover:border-muted-foreground/30'
                    }`}
                >
                  <div
                    className={`relative h-12 w-20 overflow-hidden rounded-sm ${idx === currentIndex ? '' : 'opacity-60 group-hover:opacity-100'
                      }`}
                    style={{
                      background: slide.backgroundColor || '#f3f4f6',
                    }}
                  >
                    <div className="absolute inset-0 flex flex-col justify-center px-1.5">
                      <div
                        className="truncate text-[8px] font-semibold"
                        style={{ color: slide.textColor || '#1f2937' }}
                      >
                        {slide.title}
                      </div>
                      <div
                        className="mt-0.5 h-0.5 w-4 rounded-full"
                        style={{ backgroundColor: slide.accentColor }}
                      />
                    </div>
                    <div className="absolute bottom-0.5 right-0.5 rounded-sm bg-black/50 px-1 py-0.5 text-[8px] font-medium text-white">
                      {idx + 1}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
